const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

const prisma = new PrismaClient();

function calculatePoints(actualHome, actualAway, predHome, predAway) {
  if (predHome === actualHome && predAway === actualAway) return 3;
  const actual = actualHome > actualAway ? 'H' : actualHome < actualAway ? 'A' : 'D';
  const pred = predHome > predAway ? 'H' : predHome < predAway ? 'A' : 'D';
  return actual === pred ? 1 : 0;
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
    const predictions = await prisma.prediction.findMany({ where: { matchId } });
    for (const pred of predictions) {
      const points = calculatePoints(
        parseInt(homeScore),
        parseInt(awayScore),
        pred.homeScore,
        pred.awayScore
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

module.exports = router;
