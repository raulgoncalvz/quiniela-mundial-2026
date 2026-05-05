const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');

const prisma = new PrismaClient();

// GET /api/predictions — all user predictions
router.get('/', auth, async (req, res) => {
  try {
    const predictions = await prisma.prediction.findMany({
      where: { userId: req.user.id },
      include: {
        match: { include: { homeTeam: true, awayTeam: true } },
      },
      orderBy: { match: { date: 'asc' } },
    });
    res.json(predictions);
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// POST /api/predictions — save or update prediction
router.post('/', auth, async (req, res) => {
  const { matchId, homeScore, awayScore } = req.body;
  if (matchId === undefined || homeScore === undefined || awayScore === undefined)
    return res.status(400).json({ error: 'matchId, homeScore y awayScore son requeridos' });

  if (homeScore < 0 || awayScore < 0 || homeScore > 20 || awayScore > 20)
    return res.status(400).json({ error: 'Puntuación inválida' });

  try {
    const match = await prisma.match.findUnique({ where: { id: parseInt(matchId) } });
    if (!match) return res.status(404).json({ error: 'Partido no encontrado' });
    if (match.status !== 'pending')
      return res.status(400).json({ error: 'El partido ya comenzó, no puedes modificar tu predicción' });

    const prediction = await prisma.prediction.upsert({
      where: { userId_matchId: { userId: req.user.id, matchId: parseInt(matchId) } },
      update: { homeScore: parseInt(homeScore), awayScore: parseInt(awayScore) },
      create: {
        userId: req.user.id,
        matchId: parseInt(matchId),
        homeScore: parseInt(homeScore),
        awayScore: parseInt(awayScore),
      },
    });

    res.json(prediction);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// POST /api/predictions/batch — save multiple predictions at once
router.post('/batch', auth, async (req, res) => {
  const { predictions } = req.body;
  if (!Array.isArray(predictions) || predictions.length === 0)
    return res.status(400).json({ error: 'Se requiere un array de predicciones' });

  try {
    const results = [];
    const errors = [];

    for (const pred of predictions) {
      const { matchId, homeScore, awayScore } = pred;
      try {
        const match = await prisma.match.findUnique({ where: { id: parseInt(matchId) } });
        if (!match || match.status !== 'pending') {
          errors.push({ matchId, error: 'Partido no disponible' });
          continue;
        }

        const saved = await prisma.prediction.upsert({
          where: { userId_matchId: { userId: req.user.id, matchId: parseInt(matchId) } },
          update: { homeScore: parseInt(homeScore), awayScore: parseInt(awayScore) },
          create: {
            userId: req.user.id,
            matchId: parseInt(matchId),
            homeScore: parseInt(homeScore),
            awayScore: parseInt(awayScore),
          },
        });
        results.push(saved);
      } catch {
        errors.push({ matchId, error: 'Error al guardar' });
      }
    }

    res.json({ saved: results.length, errors });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// GET /api/predictions/groups
router.get('/groups', auth, async (req, res) => {
  try {
    const preds = await prisma.groupPrediction.findMany({ where: { userId: req.user.id } });
    res.json(preds);
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// GET /api/predictions/groups/:group/standings — standings calculated from user's own match predictions
router.get('/groups/:group/standings', auth, async (req, res) => {
  const group = req.params.group.toUpperCase();
  try {
    const teams = await prisma.team.findMany({ where: { group } });
    const groupMatches = await prisma.match.findMany({ where: { group, phase: 'groups' } });
    const matchIds = groupMatches.map(m => m.id);

    const userPreds = await prisma.prediction.findMany({
      where: { userId: req.user.id, matchId: { in: matchIds } },
    });
    const predMap = {};
    for (const p of userPreds) predMap[p.matchId] = p;

    const stats = {};
    for (const team of teams) {
      stats[team.id] = { team, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
    }

    for (const match of groupMatches) {
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

    const sorted = Object.values(stats).sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      const gdDiff = (b.gf - b.ga) - (a.gf - a.ga);
      if (gdDiff !== 0) return gdDiff;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.team.name.localeCompare(b.team.name);
    });

    res.json({
      standings: sorted.map((s, i) => ({
        position: i + 1,
        teamId: s.team.id,
        teamName: s.team.name,
        teamFlag: s.team.flag,
        mp: s.mp, w: s.w, d: s.d, l: s.l,
        gf: s.gf, ga: s.ga, gd: s.gf - s.ga, pts: s.pts,
      })),
      predictedMatches: Object.keys(predMap).length,
      totalMatches: groupMatches.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// POST /api/predictions/groups/:group
router.post('/groups/:group', auth, async (req, res) => {
  const group = req.params.group.toUpperCase();
  const { pos1, pos2, pos3, pos4 } = req.body;
  if (!['A','B','C','D','E','F','G','H','I','J','K','L'].includes(group))
    return res.status(400).json({ error: 'Grupo inválido' });

  try {
    const started = await prisma.match.findFirst({
      where: { group, phase: 'groups', status: { not: 'pending' } },
    });
    if (started)
      return res.status(400).json({ error: 'El grupo ya comenzó, no puedes modificar la predicción' });

    const pred = await prisma.groupPrediction.upsert({
      where: { userId_group: { userId: req.user.id, group } },
      update: { pos1: pos1 || '', pos2: pos2 || '', pos3: pos3 || '', pos4: pos4 || '' },
      create: { userId: req.user.id, group, pos1: pos1 || '', pos2: pos2 || '', pos3: pos3 || '', pos4: pos4 || '' },
    });
    res.json(pred);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// GET /api/predictions/champion
router.get('/champion', auth, async (req, res) => {
  try {
    const pred = await prisma.championPrediction.findUnique({ where: { userId: req.user.id } });
    res.json(pred || null);
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// POST /api/predictions/champion
router.post('/champion', auth, async (req, res) => {
  const { champion, runnerUp, third, topScorer, bestPlayer, bestGoalkeeper } = req.body;

  try {
    const data = {
      champion:       champion       || '',
      runnerUp:       runnerUp       || '',
      third:          third          || '',
      topScorer:      topScorer      || '',
      bestPlayer:     bestPlayer     || '',
      bestGoalkeeper: bestGoalkeeper || '',
    };

    const pred = await prisma.championPrediction.upsert({
      where: { userId: req.user.id },
      update: data,
      create: { userId: req.user.id, ...data },
    });

    res.json(pred);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// GET /api/predictions/stats — user stats
router.get('/stats', auth, async (req, res) => {
  try {
    const predictions = await prisma.prediction.findMany({
      where: { userId: req.user.id },
      include: { match: { select: { homeScore: true, awayScore: true, status: true } } },
    });

    const total = predictions.length;
    const finished = predictions.filter(p => p.match.status === 'finished');

    // Exact = predicted scores match actual scores (works regardless of scoring config)
    const exact = finished.filter(p =>
      p.match.homeScore !== null &&
      p.homeScore === p.match.homeScore &&
      p.awayScore === p.match.awayScore
    ).length;
    const correct = finished.filter(p => p.points >= 1).length;
    const matchPoints = finished.reduce((sum, p) => sum + p.points, 0);

    const [championPred, groupPredictions] = await Promise.all([
      prisma.championPrediction.findUnique({ where: { userId: req.user.id } }),
      prisma.groupPrediction.findMany({ where: { userId: req.user.id } }),
    ]);

    const champPoints = championPred?.points || 0;
    const groupPoints = groupPredictions.reduce((sum, p) => sum + p.points, 0);

    res.json({
      totalPredictions: total,
      finishedMatches: finished.length,
      exactScores: exact,
      correctResults: correct,
      accuracy: finished.length > 0 ? Math.round((correct / finished.length) * 100) : 0,
      matchPoints,
      championPoints: champPoints,
      groupPoints,
      totalPoints: matchPoints + champPoints + groupPoints,
    });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
