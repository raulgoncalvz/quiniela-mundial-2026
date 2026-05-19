const router = require('express').Router();
const prisma = require('../lib/prisma');

// GET /api/teams
router.get('/', async (req, res) => {
  try {
    const teams = await prisma.team.findMany({
      orderBy: [{ group: 'asc' }, { id: 'asc' }],
    });
    res.json(teams);
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// GET /api/teams/groups
router.get('/groups', async (req, res) => {
  try {
    const teams = await prisma.team.findMany({
      orderBy: [{ group: 'asc' }, { id: 'asc' }],
    });

    const groups = {};
    for (const team of teams) {
      if (!groups[team.group]) groups[team.group] = [];
      groups[team.group].push(team);
    }

    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
