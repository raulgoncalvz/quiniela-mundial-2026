const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

const prisma = new PrismaClient();

function calculatePoints(actualHome, actualAway, predHome, predAway, exactScore = 3, correctResult = 1) {
  if (predHome === actualHome && predAway === actualAway) return exactScore;
  const actual = actualHome > actualAway ? 'H' : actualHome < actualAway ? 'A' : 'D';
  const pred = predHome > predAway ? 'H' : predHome < predAway ? 'A' : 'D';
  return actual === pred ? correctResult : 0;
}

async function getScoringConfig(phase) {
  try {
    const cfg = await prisma.scoringConfig.findUnique({ where: { phase } });
    return cfg || { exactScore: 3, correctResult: 1 };
  } catch {
    return { exactScore: 3, correctResult: 1 };
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
  try {
    const match = await prisma.match.update({
      where: { id: matchId },
      data: {
        homeScore: parseInt(homeScore),
        awayScore: parseInt(awayScore),
        status: status || 'finished',
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

    res.json({ match, updated: predictions.length });
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

// Helper: calculates group standings from finished match results
async function calculateGroupStandings(group) {
  const teams = await prisma.team.findMany({ where: { group } });
  const matches = await prisma.match.findMany({
    where: { group, phase: 'groups', status: 'finished' },
  });

  const stats = {};
  for (const team of teams) {
    stats[team.id] = { team, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
  }

  for (const match of matches) {
    if (match.homeScore === null || match.awayScore === null) continue;
    const home = stats[match.homeTeamId];
    const away = stats[match.awayTeamId];
    if (!home || !away) continue;

    home.mp++; away.mp++;
    home.gf += match.homeScore; home.ga += match.awayScore;
    away.gf += match.awayScore; away.ga += match.homeScore;

    if (match.homeScore > match.awayScore) {
      home.w++; home.pts += 3; away.l++;
    } else if (match.homeScore < match.awayScore) {
      away.w++; away.pts += 3; home.l++;
    } else {
      home.d++; home.pts++;
      away.d++; away.pts++;
    }
  }

  return Object.values(stats).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    const gdDiff = (b.gf - b.ga) - (a.gf - a.ga);
    if (gdDiff !== 0) return gdDiff;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.team.name.localeCompare(b.team.name);
  });
}

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

// POST /api/matches/groups/:group/standings — auto-calculates standings and awards points
router.post('/groups/:group/standings', auth, admin, async (req, res) => {
  const group = req.params.group.toUpperCase();
  try {
    const standings = await calculateGroupStandings(group);
    if (standings.length < 4)
      return res.status(400).json({ error: 'No hay suficientes equipos en el grupo' });

    const finishedCount = standings.reduce((sum, s) => sum + s.mp, 0) / 2;
    const totalMatches = 6; // 4 teams × 3 matchdays / 2
    if (finishedCount < totalMatches)
      return res.status(400).json({
        error: `El grupo aún no terminó (${finishedCount}/${totalMatches} partidos jugados)`,
        finishedCount,
        totalMatches,
      });

    const [pos1, pos2, pos3, pos4] = standings.map(s => s.team.name);

    const preds = await prisma.groupPrediction.findMany({ where: { group } });
    for (const pred of preds) {
      const points = (pred.pos1 === pos1 ? 2 : 0) + (pred.pos2 === pos2 ? 2 : 0)
                   + (pred.pos3 === pos3 ? 2 : 0) + (pred.pos4 === pos4 ? 2 : 0);
      await prisma.groupPrediction.update({ where: { id: pred.id }, data: { points } });
    }

    res.json({
      group, pos1, pos2, pos3, pos4,
      standings: standings.map((s, i) => ({
        position: i + 1, teamName: s.team.name, teamFlag: s.team.flag,
        mp: s.mp, w: s.w, d: s.d, l: s.l,
        gf: s.gf, ga: s.ga, gd: s.gf - s.ga, pts: s.pts,
      })),
      updated: preds.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
