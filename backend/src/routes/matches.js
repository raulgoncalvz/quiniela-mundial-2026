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

// Helper: calculate a user's predicted standings from their match predictions
async function calculatePredictedStandings(group, userId) {
  const teams = await prisma.team.findMany({ where: { group } });
  const matches = await prisma.match.findMany({ where: { group, phase: 'groups' } });
  const matchIds = matches.map(m => m.id);

  const preds = await prisma.prediction.findMany({ where: { userId, matchId: { in: matchIds } } });
  const predMap = {};
  for (const p of preds) predMap[p.matchId] = p;

  const stats = {};
  for (const team of teams) {
    stats[team.id] = { team, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
  }

  for (const match of matches) {
    const pred = predMap[match.id];
    if (!pred) continue;
    const home = stats[match.homeTeamId];
    const away = stats[match.awayTeamId];
    if (!home || !away) continue;

    home.mp++; away.mp++;
    home.gf += pred.homeScore; home.ga += pred.awayScore;
    away.gf += pred.awayScore; away.ga += pred.homeScore;

    if (pred.homeScore > pred.awayScore) {
      home.w++; home.pts += 3; away.l++;
    } else if (pred.homeScore < pred.awayScore) {
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

// POST /api/matches/groups/:group/standings — auto-calculates standings and awards points
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

    const [rPos1, rPos2, rPos3, rPos4] = realStandings.map(s => s.team.name);

    // For each user, calculate their predicted standings from match predictions
    const users = await prisma.user.findMany({ where: { role: 'user' } });
    let updated = 0;

    for (const user of users) {
      const predStandings = await calculatePredictedStandings(group, user.id);
      const [pPos1, pPos2, pPos3, pPos4] = predStandings.map(s => s.team.name);

      const points = (pPos1 === rPos1 ? 2 : 0) + (pPos2 === rPos2 ? 2 : 0)
                   + (pPos3 === rPos3 ? 2 : 0) + (pPos4 === rPos4 ? 2 : 0);

      await prisma.groupPrediction.upsert({
        where: { userId_group: { userId: user.id, group } },
        update: { pos1: pPos1 || '', pos2: pPos2 || '', pos3: pPos3 || '', pos4: pPos4 || '', points },
        create: { userId: user.id, group, pos1: pPos1 || '', pos2: pPos2 || '', pos3: pPos3 || '', pos4: pPos4 || '', points },
      });
      updated++;
    }

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
