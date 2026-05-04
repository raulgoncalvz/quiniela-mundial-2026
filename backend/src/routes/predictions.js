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
  const {
    champion, runnerUp, third,
    topScorer1, topScorer2, topScorer3,
    bestPlayer1, bestPlayer2, bestPlayer3,
  } = req.body;

  try {
    const data = {
      champion: champion || '',
      runnerUp: runnerUp || '',
      third: third || '',
      topScorer1: topScorer1 || '',
      topScorer2: topScorer2 || '',
      topScorer3: topScorer3 || '',
      bestPlayer1: bestPlayer1 || '',
      bestPlayer2: bestPlayer2 || '',
      bestPlayer3: bestPlayer3 || '',
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
      include: { match: true },
    });

    const total = predictions.length;
    const finished = predictions.filter(p => p.match.status === 'finished');
    const exact = finished.filter(p => p.points === 3).length;
    const correct = finished.filter(p => p.points >= 1).length;
    const totalPoints = finished.reduce((sum, p) => sum + p.points, 0);

    const championPred = await prisma.championPrediction.findUnique({
      where: { userId: req.user.id },
    });

    const champPoints = championPred?.points || 0;

    res.json({
      totalPredictions: total,
      finishedMatches: finished.length,
      exactScores: exact,
      correctResults: correct,
      accuracy: finished.length > 0 ? Math.round((correct / finished.length) * 100) : 0,
      matchPoints: totalPoints,
      championPoints: champPoints,
      totalPoints: totalPoints + champPoints,
    });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
