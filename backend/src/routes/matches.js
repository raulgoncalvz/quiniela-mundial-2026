const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const { calculateGroupStandings, calculatePredictedStandings, awardGroupPositionPoints } = require('../utils/groupScoring');
const { getUserPredictedAdvancement } = require('../utils/bracketSimulation');
const liveService = require('../services/liveMatchService');

const prisma = new PrismaClient();

// ── SSE: live match updates ────────────────────────────────────────
router.get('/live/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  const heartbeat = setInterval(() => {
    try { res.write(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`); }
    catch { clearInterval(heartbeat); }
  }, 30_000);

  liveService.addClient(res);

  req.on('close', () => {
    clearInterval(heartbeat);
    liveService.removeClient(res);
  });
});
// ──────────────────────────────────────────────────────────────────

function calculatePoints(actualHome, actualAway, predHome, predAway, exactScore = 3, correctResult = 1) {
  if (predHome === actualHome && predAway === actualAway) return exactScore;
  const actual = actualHome > actualAway ? 'H' : actualHome < actualAway ? 'A' : 'D';
  const pred = predHome > predAway ? 'H' : predHome < predAway ? 'A' : 'D';
  return actual === pred ? correctResult : 0;
}

const KNOCKOUT_PHASES = new Set(['round32', 'round16', 'quarters', 'semis', 'third', 'final']);

// Match number ranges per knockout round (FIFA 2026 official numbering)
const ROUND_MATCH_RANGES = {
  round32:  [73, 88],
  round16:  [89, 96],
  quarters: [97, 100],
  semis:    [101, 102],
};

function teamsMatchSimulation(simulation, match) {
  const actualHome = match.homeTeam?.name;
  const actualAway = match.awayTeam?.name;
  if (!actualHome || !actualAway) return false;

  if (match.phase === 'final') {
    return simulation.final.has(actualHome) && simulation.final.has(actualAway);
  }
  if (match.phase === 'third') {
    const thirdTeams = new Set([...simulation.semis].filter(t => !simulation.final.has(t)));
    return thirdTeams.has(actualHome) && thirdTeams.has(actualAway);
  }
  // Search across ALL predicted slots in the round (same as Excel COUNTIF across all round matches)
  const range = ROUND_MATCH_RANGES[match.phase];
  if (!range || !simulation.matchTeams) return false;
  for (let mn = range[0]; mn <= range[1]; mn++) {
    const slot = simulation.matchTeams[mn];
    if (!slot?.home?.name || !slot?.away?.name) continue;
    if ((actualHome === slot.home.name && actualAway === slot.away.name) ||
        (actualHome === slot.away.name  && actualAway === slot.home.name)) return true;
  }
  return false;
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
  const { homeScore, awayScore, status, penaltyWinner } = req.body;
  if (homeScore === undefined || awayScore === undefined)
    return res.status(400).json({ error: 'homeScore y awayScore son requeridos' });

  if (penaltyWinner !== undefined && penaltyWinner !== null && !['home','away'].includes(penaltyWinner))
    return res.status(400).json({ error: 'penaltyWinner debe ser "home" o "away"' });

  const matchId = parseInt(req.params.id);
  const finalStatus = status || 'finished';
  const pw = (penaltyWinner && ['home','away'].includes(penaltyWinner)) ? penaltyWinner : null;

  try {
    const match = await prisma.match.update({
      where: { id: matchId },
      data: {
        homeScore: parseInt(homeScore),
        awayScore: parseInt(awayScore),
        penaltyWinner: pw,
        status: finalStatus,
      },
      include: { homeTeam: true, awayTeam: true },
    });

    const cfg = await getScoringConfig(match.phase);
    const predictions = await prisma.prediction.findMany({ where: { matchId } });
    const isKnockout = KNOCKOUT_PHASES.has(match.phase);

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

    // For knockout phases: need bracket simulation per user for team matching + advancement
    const NEXT_ROUND_MAP = { round32: 'round16', round16: 'quarters', quarters: 'semis', semis: 'final' };
    const ADV_BET_PHASE = { round16: 'bet_round16', quarters: 'bet_quarters', semis: 'bet_semis', final: 'bet_final' };
    let advancementUpdated = 0;

    if (isKnockout && finalStatus === 'finished') {
      const hScore = parseInt(homeScore);
      const aScore = parseInt(awayScore);
      let winnerName = null, loserName = null;
      if (match.homeTeam && match.awayTeam) {
        if (hScore > aScore) {
          winnerName = match.homeTeam.name; loserName = match.awayTeam.name;
        } else if (hScore < aScore) {
          winnerName = match.awayTeam.name; loserName = match.homeTeam.name;
        } else {
          // Draw in regulation — penaltyWinner decides who advances
          winnerName = pw === 'away' ? match.awayTeam.name : match.homeTeam.name;
          loserName  = pw === 'away' ? match.homeTeam.name : match.awayTeam.name;
        }
      }
      const nextRound  = NEXT_ROUND_MAP[match.phase];
      const advCfg     = nextRound ? await getScoringConfig(ADV_BET_PHASE[nextRound]) : null;

      // Clear advancement records for both teams of this match
      if (nextRound && winnerName && loserName) {
        await prisma.advancementPrediction.deleteMany({
          where: { round: nextRound, teamName: { in: [winnerName, loserName] } },
        });
      }

      // Build prediction map for quick lookup
      const predByUser = {};
      for (const pred of predictions) predByUser[pred.userId] = pred;

      // Run simulation once per user — used for both team matching AND advancement
      const users = await prisma.user.findMany({ select: { id: true } });
      const failedUsers = [];
      for (const user of users) {
        try {
          const simulation = await getUserPredictedAdvancement(user.id, prisma);

          // Match prediction points: only if both teams match user's predicted bracket slot
          const pred = predByUser[user.id];
          if (pred) {
            let points = 0;
            if (teamsMatchSimulation(simulation, match)) {
              points = calculatePoints(hScore, aScore, pred.homeScore, pred.awayScore, cfg.exactScore, cfg.correctResult);
            }
            await prisma.prediction.update({ where: { id: pred.id }, data: { points } });
          }

          // Advancement points: award if user predicted the winner to advance to next round
          if (nextRound && winnerName && advCfg?.correctResult && simulation[nextRound].has(winnerName)) {
            await prisma.advancementPrediction.upsert({
              where: { userId_round_teamName: { userId: user.id, round: nextRound, teamName: winnerName } },
              update: { points: advCfg.correctResult },
              create: { userId: user.id, round: nextRound, teamName: winnerName, points: advCfg.correctResult },
            });
            advancementUpdated++;
          }
        } catch (userErr) {
          failedUsers.push(user.id);
          console.error(`Error scoring user ${user.id}:`, userErr);
        }
      }
      if (failedUsers.length > 0)
        console.warn(`⚠️ ${failedUsers.length} usuarios no pudieron ser puntuados: ${failedUsers.join(', ')}`);


      if (advancementUpdated > 0)
        console.log(`🚀 ${winnerName} → ${nextRound}: ${advancementUpdated} usuarios premiados (${advCfg?.correctResult}pts)`);
    } else {
      // Group stage: score predictions without team matching (teams are fixed)
      for (const pred of predictions) {
        const points = calculatePoints(
          parseInt(homeScore), parseInt(awayScore),
          pred.homeScore, pred.awayScore,
          cfg.exactScore, cfg.correctResult
        );
        await prisma.prediction.update({ where: { id: pred.id }, data: { points } });
      }
    }

    // ── Auto-calcular puntos especiales del podio cuando Final (104) o 3er Lugar (103) terminan ──
    if (finalStatus === 'finished' && [103, 104].includes(match.matchNumber)) {
      try {
        const [finalM, thirdM] = await Promise.all([
          prisma.match.findFirst({ where: { matchNumber: 104, status: 'finished' }, include: { homeTeam: true, awayTeam: true } }),
          prisma.match.findFirst({ where: { matchNumber: 103, status: 'finished' }, include: { homeTeam: true, awayTeam: true } }),
        ]);

        const deriveResult = (m) => {
          if (!m || m.homeScore === null || !m.homeTeam || !m.awayTeam) return { winner: '', loser: '' };
          if (m.homeScore > m.awayScore) return { winner: m.homeTeam.name, loser: m.awayTeam.name };
          if (m.homeScore < m.awayScore) return { winner: m.awayTeam.name, loser: m.homeTeam.name };
          return m.penaltyWinner === 'away'
            ? { winner: m.awayTeam.name, loser: m.homeTeam.name }
            : { winner: m.homeTeam.name, loser: m.awayTeam.name };
        };

        const { winner: champion, loser: runnerUp } = deriveResult(finalM);
        const { winner: third } = deriveResult(thirdM);

        if (champion) {
          const cfgList = await prisma.scoringConfig.findMany({
            where: { phase: { in: ['bet_champion', 'bet_runnerUp', 'bet_third'] } },
          });
          const cfg = {};
          for (const c of cfgList) cfg[c.phase] = c.exactScore;

          const champPreds = await prisma.championPrediction.findMany();
          for (const pred of champPreds) {
            const podioPoints =
              (pred.champion && pred.champion === champion ? (cfg.bet_champion || 15) : 0) +
              (pred.runnerUp && pred.runnerUp === runnerUp ? (cfg.bet_runnerUp || 10) : 0) +
              (third && pred.third === third            ? (cfg.bet_third    ||  5) : 0);
            await prisma.championPrediction.update({ where: { id: pred.id }, data: { points: podioPoints } });
          }
          console.log(`🏆 Puntos del podio calculados — Campeón: ${champion}, Finalista: ${runnerUp}, 3ro: ${third || 'pendiente'}`);
        }
      } catch (champErr) {
        console.error('Error auto-calculando puntos especiales:', champErr);
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

  const matchId = parseInt(req.params.id);

  try {
    const current = await prisma.match.findUnique({
      where: { id: matchId },
      include: { homeTeam: true, awayTeam: true },
    });
    if (!current) return res.status(404).json({ error: 'Partido no encontrado' });

    const reverting = current.status === 'finished' && status !== 'finished';

    const updateData = { status };
    if (status === 'pending') {
      updateData.homeScore = null;
      updateData.awayScore = null;
      updateData.penaltyWinner = null;
    }

    const match = await prisma.match.update({ where: { id: matchId }, data: updateData });

    if (reverting) {
      // Clear prediction points for this match
      await prisma.prediction.updateMany({ where: { matchId }, data: { points: 0 } });

      // Clear group position points when a group match is reverted (group no longer complete)
      if (current.phase === 'groups' && current.group) {
        await prisma.groupPrediction.updateMany({ where: { group: current.group }, data: { points: 0 } });
      }

      // Clear advancement predictions for next round based on both teams of this match
      const NEXT_ROUND_MAP = { round32: 'round16', round16: 'quarters', quarters: 'semis', semis: 'final' };
      const nextRound = NEXT_ROUND_MAP[current.phase];
      if (nextRound && current.homeTeam && current.awayTeam) {
        await prisma.advancementPrediction.deleteMany({
          where: { round: nextRound, teamName: { in: [current.homeTeam.name, current.awayTeam.name] } },
        });
      }
    }

    res.json(match);
  } catch (err) {
    console.error(err);
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
