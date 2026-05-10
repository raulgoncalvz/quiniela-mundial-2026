'use strict';
const { PrismaClient } = require('@prisma/client');
const { awardGroupPositionPoints } = require('../utils/groupScoring');
const { getUserPredictedAdvancement } = require('../utils/bracketSimulation');

const prisma = new PrismaClient();

const KNOCKOUT_PHASES = new Set(['round32', 'round16', 'quarters', 'semis', 'third', 'final']);

const PHASE_DEFAULTS = {
  groups:   { exactScore: 3,  correctResult: 1 },
  round32:  { exactScore: 4,  correctResult: 2 },
  round16:  { exactScore: 5,  correctResult: 2 },
  quarters: { exactScore: 6,  correctResult: 3 },
  semis:    { exactScore: 7,  correctResult: 3 },
  third:    { exactScore: 6,  correctResult: 3 },
  final:    { exactScore: 10, correctResult: 5 },
};

const NEXT_ROUND_MAP = { round32: 'round16', round16: 'quarters', quarters: 'semis', semis: 'final' };
const ADV_BET_PHASE  = { round16: 'bet_round16', quarters: 'bet_quarters', semis: 'bet_semis', final: 'bet_final' };

const ROUND_MATCH_RANGES = {
  round32:  [73, 88],
  round16:  [89, 96],
  quarters: [97, 100],
  semis:    [101, 102],
};

function calcPoints(ah, aa, ph, pa, exact = 3, correct = 1) {
  if (ph === ah && pa === aa) return exact;
  const actual = ah > aa ? 'H' : ah < aa ? 'A' : 'D';
  const pred   = ph > pa  ? 'H' : ph < pa  ? 'A' : 'D';
  return actual === pred ? correct : 0;
}

async function getScoringConfig(phase) {
  try {
    const cfg = await prisma.scoringConfig.findUnique({ where: { phase } });
    return cfg || PHASE_DEFAULTS[phase] || { exactScore: 3, correctResult: 1 };
  } catch {
    return PHASE_DEFAULTS[phase] || { exactScore: 3, correctResult: 1 };
  }
}

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

// Called automatically when the live service detects a match finished.
// Replicates the scoring logic from PUT /api/matches/:id/result.
async function finalizeMatch(matchId) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { homeTeam: true, awayTeam: true },
  });
  if (!match || match.status !== 'finished' || match.homeScore === null) return;

  const homeScore    = match.homeScore;
  const awayScore    = match.awayScore;
  const penaltyWinner = match.penaltyWinner;
  const isKnockout   = KNOCKOUT_PHASES.has(match.phase);

  console.log(`⚽ Auto-finalizando partido ${match.matchNumber} (${match.homeTeam?.name} ${homeScore}-${awayScore} ${match.awayTeam?.name})`);

  const cfg         = await getScoringConfig(match.phase);
  const predictions = await prisma.prediction.findMany({ where: { matchId } });

  // ── Grupo: cálculo directo ────────────────────────────────────────
  if (!isKnockout) {
    for (const pred of predictions) {
      const points = calcPoints(homeScore, awayScore, pred.homeScore, pred.awayScore, cfg.exactScore, cfg.correctResult);
      await prisma.prediction.update({ where: { id: pred.id }, data: { points } });
    }

    // Premiar posiciones de grupo si todos los partidos del grupo terminaron
    if (match.group) {
      const groupMatches = await prisma.match.findMany({
        where: { group: match.group, phase: 'groups' },
        select: { status: true },
      });
      if (groupMatches.every(m => m.status === 'finished')) {
        const n = await awardGroupPositionPoints(match.group);
        if (n > 0) console.log(`✅ Grupo ${match.group} completo — posiciones calculadas (${n} usuarios)`);
      }
    }
    return;
  }

  // ── Knockout: bracket simulation por usuario ──────────────────────
  let winnerName = null, loserName = null;
  if (match.homeTeam && match.awayTeam) {
    if (homeScore > awayScore) {
      winnerName = match.homeTeam.name; loserName = match.awayTeam.name;
    } else if (homeScore < awayScore) {
      winnerName = match.awayTeam.name; loserName = match.homeTeam.name;
    } else {
      winnerName = penaltyWinner === 'away' ? match.awayTeam.name : match.homeTeam.name;
      loserName  = penaltyWinner === 'away' ? match.homeTeam.name : match.awayTeam.name;
    }
  }

  const nextRound = NEXT_ROUND_MAP[match.phase];
  const advCfg    = nextRound ? await getScoringConfig(ADV_BET_PHASE[nextRound]) : null;

  if (nextRound && winnerName && loserName) {
    await prisma.advancementPrediction.deleteMany({
      where: { round: nextRound, teamName: { in: [winnerName, loserName] } },
    });
  }

  const predByUser = {};
  for (const pred of predictions) predByUser[pred.userId] = pred;

  const users = await prisma.user.findMany({ select: { id: true } });
  let advancementUpdated = 0;
  const failedUsers = [];

  for (const user of users) {
    try {
      const simulation = await getUserPredictedAdvancement(user.id, prisma);
      const pred = predByUser[user.id];
      if (pred) {
        let points = 0;
        if (teamsMatchSimulation(simulation, match)) {
          points = calcPoints(homeScore, awayScore, pred.homeScore, pred.awayScore, cfg.exactScore, cfg.correctResult);
        }
        await prisma.prediction.update({ where: { id: pred.id }, data: { points } });
      }
      if (nextRound && winnerName && advCfg?.correctResult && simulation[nextRound].has(winnerName)) {
        await prisma.advancementPrediction.upsert({
          where: { userId_round_teamName: { userId: user.id, round: nextRound, teamName: winnerName } },
          update: { points: advCfg.correctResult },
          create: { userId: user.id, round: nextRound, teamName: winnerName, points: advCfg.correctResult },
        });
        advancementUpdated++;
      }
    } catch (err) {
      failedUsers.push(user.id);
      console.error(`Error scoring user ${user.id}:`, err.message);
    }
  }

  if (failedUsers.length > 0)
    console.warn(`⚠️ ${failedUsers.length} usuarios sin puntuar: ${failedUsers.join(', ')}`);
  if (advancementUpdated > 0)
    console.log(`🚀 ${winnerName} → ${nextRound}: ${advancementUpdated} usuarios premiados`);

  // ── Podio: Final (104) y 3er Lugar (103) ─────────────────────────
  if ([103, 104].includes(match.matchNumber)) {
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
        const podioConfig = {};
        for (const c of cfgList) podioConfig[c.phase] = c.exactScore;

        const champPreds = await prisma.championPrediction.findMany();
        for (const pred of champPreds) {
          const points =
            (pred.champion === champion   ? (podioConfig.bet_champion || 15) : 0) +
            (pred.runnerUp === runnerUp   ? (podioConfig.bet_runnerUp || 10) : 0) +
            (third && pred.third === third ? (podioConfig.bet_third    ||  5) : 0);
          await prisma.championPrediction.update({ where: { id: pred.id }, data: { points } });
        }
        console.log(`🏆 Podio calculado — ${champion} campeón, ${runnerUp} finalista, ${third || '?'} 3ro`);
      }
    } catch (err) {
      console.error('Error calculando puntos de podio:', err.message);
    }
  }
}

module.exports = { finalizeMatch };
