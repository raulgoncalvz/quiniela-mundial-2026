const router = require('express').Router();
const { computeRanking } = require('../utils/computeRanking');
const { getActiveSnapshot } = require('../utils/rankingSnapshot');

// GET /api/ranking
router.get('/', async (req, res) => {
  try {
    const ranking = await computeRanking();
    const snap = getActiveSnapshot();

    // delta > 0 = subió, < 0 = bajó, 0 = se mantiene, null = sin flechita
    // (ventana de movimiento inactiva). isNew = participante que no estaba en la foto.
    const withMovement = ranking.map(u => {
      let delta = null;
      let isNew = false;
      if (snap) {
        const prev = snap.positions[u.id];
        if (prev == null) isNew = true;
        else delta = prev - u.position;
      }
      return { ...u, delta, isNew };
    });

    res.json(withMovement);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
