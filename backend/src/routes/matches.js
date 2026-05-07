const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const { calculateGroupStandings, calculatePredictedStandings, awardGroupPositionPoints } = require('../utils/groupScoring');

const prisma = new PrismaClient();

function calculatePoints(actualHome, actualAway, predHome, predAway, exactScore = 3, correctResult = 1) {
  if (predHome === actualHome && predAway === actualAway) return exactScore;
  const actual = actualHome > actualAway ? 'H' : actualHome < actualAway ? 'A' : 'D';
  const pred = predHome > predAway ? 'H' : predHome < predAway ? 'A' : 'D';
  return actual === pred ? correctResult : 0;
}

const PHASE_DEFAULTS = {
  groups:   { exactScore: 3,  correctResult: 1 },
  round32:  { exactScore: 4,  correctResult: 2 },
  round16:  { exactScore: 5,  correctResult: 2 },
  quarters: { exactScore: 6,  correctResult: 3 },
  semis:    { exactScore: 7,  correctResult: 3 },
  third:    { exactScore: 6,  correctResult: 3 },
  final:    { exactScore: 10, correctResult: 5 },
};

async function getScoringConfig(phase) {
  try {
    const cfg = await prisma.scoringConfig.findUnique({ where: { phase } });
    return cfg || PHASE_DEFAULTS[phase] || { exactScore: 3, correctResult: 1 };
  } catch {
    return PHASE_DEFAULTS[phase] || { exactScore: 3, correctResult: 1 };
  }
}

// GET /api/matches
router.get('/', async (req, res) => {
  const { phase, group, status } = req.query;
  const where = {};
  if (phase) where.phase = phase;
  if (group) where.group = group;
  if (status) where.status = status;

  try {
    const matches = await prisma.match.findMany({
      where,
      include: { homeTeam: true, awayTeam: true },
      orderBy: [{ date: 'asc' }, { matchNumber: 'asc' }],
    });
    res.json(matches);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// GET /api/matches/today
router.get('/today', async (req, res) => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  try {
    const matches = await prisma.match.findMany({
      where: { date: { gte: startOfDay, lt: endOfDay } },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { date: 'asc' },
    });
    res.json(matches);
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// GET /api/matches/upcoming
router.get('/upcoming', async (req, res) => {
  const limit = parseInt(req.query.limit) || 5;
  try {
    const matches = await prisma.match.findMany({
      where: { status: 'pending', date: { gte: new Date() } },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { date: 'asc' },
      take: limit,
    });
    res.json(matches);
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// GET /api/matches/recent
router.get('/recent', async (req, res) => {
  const limit = parseInt(req.query.limit) || 5;
  try {
    const matches = await prisma.match.findMany({
      where: { status: 'finished' },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { date: 'desc' },
      take: limit,
    });
    res.json(matches);
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// GET /api/matches/:id
router.get('/:id', async (req, res) => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { homeTeam: true, awayTeam: true },
    });
    if (!match) return res.status(404).json({ error: 'Partido no encontrado' });
    res.json(match);
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// PUT /api/matches/:id/result — Admin only
router.put('/:id/result', auth, admin, async (req, res) => {
  const { homeScore, awayScore, status } = req.body;
  if (homeScore === undefined || awayScore === undefined)
    return res.status(400).json({ error: 'homeScore y awayScore son requeridos' });

  const matchId = parseInt(req.params.id);
  const finalStatus = status || 'finished';

  try {
    const match = await prisma.match.update({
      where: { id: matchId },
      data: {
        homeScore: parseInt(homeScore),
        awayScore: parseInt(awayScore),
        status: finalStatus,
      },
      include: { homeTeam: true, awayTeam: true },
    });

    // Recalculate points for all predictions of this match
    const cfg = await getScoringConfig(match.phase);
    const predictions = await prisma.prediction.findMany({ where: { matchId } });
    for (const pred of predictions) {
      const points = calculatePoints(
        parseInt(homeScore),
        parseInt(awayScore),
        pred.homeScore,
        pred.awayScore,
        cfg.exactScore,
        cfg.correctResult
      );
      await prisma.prediction.update({ where: { id: pred.id }, data: { points } });
    }

    // Auto-calculate group position points when all 6 matches of a group finish
    let groupPointsUpdated = 0;
    if (match.phase === 'groups' && match.group && finalStatus === 'finished') {
      const groupMatches = await prisma.match.findMany({
        where: { group: match.group, phase: 'groups' },
        select: { status: true },
      });
      if (groupMatches.every(m => m.status === 'finished')) {
        groupPointsUpdated = await awardGroupPositionPoints(match.group);
        console.log(`✅ Grupo ${match.group} completo — posiciones calculadas (${groupPointsUpdated} usuarios)`);
      }
    }

    // Award advancement points for knockout winners
    const NEXT_ROUND_MAP = { round32: 'round16', round16: 'quarters', quarters: 'semis', semis: 'final' };
    const ADV_BET_PHASE = { round16: 'bet_round16', quarters: 'bet_quarters', semis: 'bet_semis', final: 'bet_final' };
    let advancementUpdated = 0;

    if (NEXT_ROUND_MAP[match.phase] && finalStatus === 'finished') {
      const hScore = parseInt(homeScore);
      const aScore = parseInt(awayScore);
      const winnerTeam = hScore >= aScore ? match.homeTeam : match.awayTeam;

      if (winnerTeam) {
        const nextRound = NEXT_ROUND_MAP[match.phase];
        const advCfg = await getScoringConfig(ADV_BET_PHASE[nextRound]);
        const advPreds = await prisma.advancementPrediction.findMany({
          where: { round: nextRound, teamName: winnerTeam.name },
        });
        for (const pred of advPreds) {
          await prisma.advancementPrediction.update({ where: { id: pred.id }, data: { points: advCfg.correctResult } });
        }
        advancementUpdated = advPreds.length;
        if (advPreds.length > 0)
          console.log(`🚀 ${winnerTeam.name} → ${nextRound}: ${advPreds.length} usuarios premiados (${advCfg.correctResult}pts)`);
      }
    }

    res.json({ match, updated: predictions.length, groupPointsUpdated, advancementUpdated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// PUT /api/matches/:id/status — Admin only
router.put('/:id/status', auth, admin, async (req, res) => {
  const { status } = req.body;
  if (!['pending', 'live', 'finished'].includes(status))
    return res.status(400).json({ error: 'Estado inválido' });

  try {
    const match = await prisma.match.update({
      where: { id: parseInt(req.params.id) },
      data: { status },
    });
    res.json(match);
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});


// GET /api/matches/groups/:group/standings — current auto-calculated standings
router.get('/groups/:group/standings', async (req, res) => {
  const group = req.params.group.toUpperCase();
  try {
    const standings = await calculateGroupStandings(group);
    res.json(standings.map((s, i) => ({
      position: i + 1,
      teamId: s.team.id,
      teamName: s.team.name,
      teamFlag: s.team.flag,
      mp: s.mp, w: s.w, d: s.d, l: s.l,
      gf: s.gf, ga: s.ga, gd: s.gf - s.ga, pts: s.pts,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// POST /api/matches/groups/:group/standings — manually award group position points (admin)
router.post('/groups/:group/standings', auth, admin, async (req, res) => {
  const group = req.params.group.toUpperCase();
  try {
    const realStandings = await calculateGroupStandings(group);
    if (realStandings.length < 4)
      return res.status(400).json({ error: 'No hay suficientes equipos en el grupo' });

    const finishedCount = realStandings.reduce((sum, s) => sum + s.mp, 0) / 2;
    if (finishedCount < 6)
      return res.status(400).json({
        error: `El grupo aún no terminó (${finishedCount}/6 partidos jugados)`,
        finishedCount, totalMatches: 6,
      });

    const updated = await awardGroupPositionPoints(group);
    const [rPos1, rPos2, rPos3, rPos4] = realStandings.map(s => s.team.name);

    res.json({
      group, pos1: rPos1, pos2: rPos2, pos3: rPos3, pos4: rPos4,
      standings: realStandings.map((s, i) => ({
        position: i + 1, teamName: s.team.name, teamFlag: s.team.flag,
        mp: s.mp, w: s.w, d: s.d, l: s.l,
        gf: s.gf, ga: s.ga, gd: s.gf - s.ga, pts: s.pts,
      })),
      updated,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
