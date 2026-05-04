const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

const prisma = new PrismaClient();

const DEFAULT_CONFIGS = [
  { phase: 'groups',    label: 'Fase de Grupos',  exactScore: 3,  correctResult: 1 },
  { phase: 'round32',   label: 'Ronda de 32',      exactScore: 4,  correctResult: 2 },
  { phase: 'round16',   label: 'Octavos de Final', exactScore: 5,  correctResult: 2 },
  { phase: 'quarters',  label: 'Cuartos de Final', exactScore: 6,  correctResult: 3 },
  { phase: 'semis',     label: 'Semifinales',       exactScore: 7,  correctResult: 3 },
  { phase: 'third',     label: 'Tercer Lugar',      exactScore: 6,  correctResult: 3 },
  { phase: 'final',     label: 'Final',             exactScore: 10, correctResult: 5 },
];

// GET /api/config/scoring
router.get('/scoring', auth, admin, async (req, res) => {
  try {
    let configs = await prisma.scoringConfig.findMany({ orderBy: { id: 'asc' } });

    if (configs.length === 0) {
      for (const cfg of DEFAULT_CONFIGS) {
        await prisma.scoringConfig.upsert({
          where: { phase: cfg.phase },
          update: {},
          create: cfg,
        });
      }
      configs = await prisma.scoringConfig.findMany({ orderBy: { id: 'asc' } });
    }

    res.json(configs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// PUT /api/config/scoring — update all phases at once
router.put('/scoring', auth, admin, async (req, res) => {
  const { configs } = req.body;
  if (!Array.isArray(configs) || configs.length === 0)
    return res.status(400).json({ error: 'Se requiere un array de configuraciones' });

  try {
    for (const cfg of configs) {
      if (!cfg.phase) continue;
      await prisma.scoringConfig.upsert({
        where: { phase: cfg.phase },
        update: {
          exactScore: parseInt(cfg.exactScore),
          correctResult: parseInt(cfg.correctResult),
        },
        create: {
          phase: cfg.phase,
          label: cfg.label || cfg.phase,
          exactScore: parseInt(cfg.exactScore),
          correctResult: parseInt(cfg.correctResult),
        },
      });
    }
    const updated = await prisma.scoringConfig.findMany({ orderBy: { id: 'asc' } });
    res.json({ success: true, configs: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// POST /api/config/scoring/recalculate — recalculate all finished match predictions
router.post('/scoring/recalculate', auth, admin, async (req, res) => {
  try {
    const scoringMap = {};
    const configs = await prisma.scoringConfig.findMany();
    for (const cfg of configs) scoringMap[cfg.phase] = cfg;

    const matches = await prisma.match.findMany({
      where: { status: 'finished' },
      include: { predictions: true },
    });

    let totalUpdated = 0;
    for (const match of matches) {
      if (match.homeScore === null || match.awayScore === null) continue;
      const cfg = scoringMap[match.phase] || { exactScore: 3, correctResult: 1 };

      for (const pred of match.predictions) {
        let points = 0;
        if (pred.homeScore === match.homeScore && pred.awayScore === match.awayScore) {
          points = cfg.exactScore;
        } else {
          const actualResult = match.homeScore > match.awayScore ? 'H' : match.homeScore < match.awayScore ? 'A' : 'D';
          const predResult = pred.homeScore > pred.awayScore ? 'H' : pred.homeScore < pred.awayScore ? 'A' : 'D';
          if (actualResult === predResult) points = cfg.correctResult;
        }
        await prisma.prediction.update({ where: { id: pred.id }, data: { points } });
        totalUpdated++;
      }
    }

    res.json({ success: true, predictionsRecalculated: totalUpdated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
