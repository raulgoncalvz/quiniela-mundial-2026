'use strict';
const prisma = require('../lib/prisma');

// Calcula el ranking completo ordenado, con la posición de cada participante.
// Lógica compartida entre la ruta GET /api/ranking y la "foto" de posiciones
// que se usa para mostrar las flechitas de subida/bajada.
async function computeRanking() {
  const users = await prisma.user.findMany({
    where: { role: { not: 'admin' } },
    include: {
      predictions: {
        select: {
          points: true,
          matchId: true,
          homeScore: true,
          awayScore: true,
          match: { select: { status: true, homeScore: true, awayScore: true } },
        },
      },
      championPrediction: { select: { points: true } },
      groupPredictions: { select: { points: true } },
      advancementPredictions: { select: { points: true } },
    },
  });

  return users
    .map(user => {
      const finishedPreds = user.predictions.filter(p => p.match.status === 'finished');
      const matchPoints = finishedPreds.reduce((sum, p) => sum + p.points, 0);
      const champPoints = user.championPrediction?.points || 0;
      const groupPoints = user.groupPredictions.reduce((sum, p) => sum + p.points, 0);
      const advPoints = user.advancementPredictions.reduce((sum, p) => sum + p.points, 0);

      // Compara marcadores directamente — funciona con cualquier config de puntos
      const exactScores = finishedPreds.filter(p =>
        p.match.homeScore !== null &&
        p.homeScore === p.match.homeScore &&
        p.awayScore === p.match.awayScore
      ).length;
      const correctResults = finishedPreds.filter(p => p.points >= 1).length;

      return {
        id: user.id,
        name: user.name,
        role: user.role,
        totalPoints: matchPoints + champPoints + groupPoints + advPoints,
        matchPoints,
        championPoints: champPoints,
        groupPoints,
        advancementPoints: advPoints,
        totalPredictions: user.predictions.length,
        exactScores,
        correctResults,
        accuracy:
          finishedPreds.length > 0
            ? Math.round((correctResults / finishedPreds.length) * 100)
            : 0,
      };
    })
    .sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.exactScores !== a.exactScores) return b.exactScores - a.exactScores;
      return b.correctResults - a.correctResults;
    })
    .map((u, i) => ({ ...u, position: i + 1 }));
}

module.exports = { computeRanking };
