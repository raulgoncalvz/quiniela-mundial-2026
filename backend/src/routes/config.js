const router = require('express').Router();
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const { calculateGroupStandings, awardGroupPositionPoints } = require('../utils/groupScoring');
const { getUserPredictedAdvancement } = require('../utils/bracketSimulation');
const prisma = require('../lib/prisma');

const DEFAULT_CONFIGS = [
  { phase: 'groups',         label: 'Fase de Grupos',      exactScore: 3,  correctResult: 1 },
  { phase: 'round32',        label: 'Ronda de 32',          exactScore: 4,  correctResult: 2 },
  { phase: 'round16',        label: 'Octavos de Final',     exactScore: 5,  correctResult: 2 },
  { phase: 'quarters',       label: 'Cuartos de Final',     exactScore: 6,  correctResult: 3 },
  { phase: 'semis',          label: 'Semifinales',           exactScore: 7,  correctResult: 3 },
  { phase: 'third',          label: 'Tercer Lugar',          exactScore: 6,  correctResult: 3 },
  { phase: 'final',          label: 'Final',                 exactScore: 10, correctResult: 5 },
  { phase: 'bet_champion',   label: '🏆 Campeón',            exactScore: 15, correctResult: 0 },
  { phase: 'bet_runnerUp',   label: '🥈 Finalista',          exactScore: 10, correctResult: 0 },
  { phase: 'bet_third',      label: '🥉 3er Lugar Apuesta',  exactScore: 5,  correctResult: 0 },
  { phase: 'bet_topScorer',  label: '⚽ Bota de Oro',        exactScore: 5,  correctResult: 0 },
  { phase: 'bet_bestPlayer', label: '🌟 Balón de Oro',       exactScore: 5,  correctResult: 0 },
  { phase: 'bet_goalkeeper', label: '🧤 Mejor Portero',      exactScore: 5,  correctResult: 0 },
  { phase: 'bet_round16',    label: '🚀 Avance a Octavos',   exactScore: 0,  correctResult: 3 },
  { phase: 'bet_quarters',   label: '🚀 Avance a Cuartos',   exactScore: 0,  correctResult: 3 },
  { phase: 'bet_semis',      label: '🚀 Avance a Semis',     exactScore: 0,  correctResult: 4 },
  { phase: 'bet_final',      label: '🚀 Avance a Final',     exactScore: 0,  correctResult: 5 },
];

// GET /api/config/scoring/current — public, returns active phase scoring
router.get('/scoring/current', async (req, res) => {
  try {
    // 1. Live match?
    let activeMatch = await prisma.match.findFirst({ where: { status: 'live' }, orderBy: { date: 'asc' } });
    // 2. Next pending match?
    if (!activeMatch)
      activeMatch = await prisma.match.findFirst({ where: { status: 'pending' }, orderBy: { date: 'asc' } });
    // 3. Last finished match?
    if (!activeMatch)
      activeMatch = await prisma.match.findFirst({ where: { status: 'finished' }, orderBy: { date: 'desc' } });

    const phase = activeMatch?.phase || 'groups';

    const PHASE_LABELS = {
      groups: 'Fase de Grupos', round32: 'Ronda de 32', round16: 'Octavos de Final',
      quarters: 'Cuartos de Final', semis: 'Semifinales', third: 'Tercer Lugar', final: 'Final',
    };

    // Phase → which advancement bet is earned by winning matches in this phase
    const ADVANCEMENT_BET = {
      round32: 'bet_round16',
      round16: 'bet_quarters',
      quarters: 'bet_semis',
      semis:    'bet_final',
    };

    let cfg = await prisma.scoringConfig.findUnique({ where: { phase } });
    if (!cfg) cfg = { phase, label: PHASE_LABELS[phase] || phase, exactScore: 3, correctResult: 1 };

    let advancementLabel = null;
    let advancementPoints = null;
    const advPhaseKey = ADVANCEMENT_BET[phase];
    if (advPhaseKey) {
      let advCfg = await prisma.scoringConfig.findUnique({ where: { phase: advPhaseKey } });
      if (!advCfg) advCfg = DEFAULT_CONFIGS.find(c => c.phase === advPhaseKey);
      if (advCfg) {
        advancementPoints = advCfg.correctResult;
        advancementLabel = advCfg.label.replace(/^🚀 /, '');
      }
    }

    res.json({
      phase,
      label: PHASE_LABELS[phase] || cfg.label,
      exactScore: cfg.exactScore,
      correctResult: cfg.correctResult,
      advancementLabel,
      advancementPoints,
      groupPositionPoints: phase === 'groups' ? 2 : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

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

const PHASE_DEFAULTS = {
  groups:   { exactScore: 3,  correctResult: 1 },
  round32:  { exactScore: 4,  correctResult: 2 },
  round16:  { exactScore: 5,  correctResult: 2 },
  quarters: { exactScore: 6,  correctResult: 3 },
  semis:    { exactScore: 7,  correctResult: 3 },
  third:    { exactScore: 6,  correctResult: 3 },
  final:    { exactScore: 10, correctResult: 5 },
  bet_round16:  { exactScore: 0, correctResult: 3 },
  bet_quarters: { exactScore: 0, correctResult: 3 },
  bet_semis:    { exactScore: 0, correctResult: 4 },
  bet_final:    { exactScore: 0, correctResult: 5 },
};

const NEXT_ROUND_MAP = {
  round32: 'round16',
  round16: 'quarters',
  quarters: 'semis',
  semis: 'final',
};
const ADV_BET_PHASE = {
  round16: 'bet_round16',
  quarters: 'bet_quarters',
  semis: 'bet_semis',
  final: 'bet_final',
};

// POST /api/config/scoring/recalculate — recalculate all finished match predictions + group positions
router.post('/scoring/recalculate', auth, admin, async (req, res) => {
  try {
    const scoringMap = { ...PHASE_DEFAULTS };
    const configs = await prisma.scoringConfig.findMany();
    for (const cfg of configs) scoringMap[cfg.phase] = cfg;

    const KNOCKOUT_PHASES = new Set(['round32', 'round16', 'quarters', 'semis', 'third', 'final']);

    const ROUND_MATCH_RANGES = { round32: [73,88], round16: [89,96], quarters: [97,100], semis: [101,102] };

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

    // 1. Recalculate match prediction points
    const matches = await prisma.match.findMany({
      where: { status: 'finished' },
      include: { predictions: true, homeTeam: true, awayTeam: true },
    });

    // Precompute bracket simulation for each user (used for team matching in knockout phases)
    const allUsers = await prisma.user.findMany({ select: { id: true } });
    const userSimulations = {};
    for (const user of allUsers) {
      userSimulations[user.id] = await getUserPredictedAdvancement(user.id, prisma);
    }

    let totalUpdated = 0;
    for (const match of matches) {
      if (match.homeScore === null || match.awayScore === null) continue;
      const cfg = scoringMap[match.phase] || { exactScore: 3, correctResult: 1 };
      const isKnockout = KNOCKOUT_PHASES.has(match.phase);

      for (const pred of match.predictions) {
        let points = 0;
        const canScore = !isKnockout || teamsMatchSimulation(userSimulations[pred.userId] || {}, match);
        if (canScore) {
          if (pred.homeScore === match.homeScore && pred.awayScore === match.awayScore) {
            points = cfg.exactScore;
          } else {
            const actualResult = match.homeScore > match.awayScore ? 'H' : match.homeScore < match.awayScore ? 'A' : 'D';
            const predResult = pred.homeScore > pred.awayScore ? 'H' : pred.homeScore < pred.awayScore ? 'A' : 'D';
            if (actualResult === predResult) points = cfg.correctResult;
          }
        }
        await prisma.prediction.update({ where: { id: pred.id }, data: { points } });
        totalUpdated++;
      }
    }

    // 2. Recalculate group position points for every completed group
    const groups = ['A','B','C','D','E','F','G','H','I','J','K','L'];
    let groupsRecalculated = 0;

    for (const group of groups) {
      const groupMatches = await prisma.match.findMany({
        where: { group, phase: 'groups' },
        select: { status: true },
      });
      if (groupMatches.length === 0 || !groupMatches.every(m => m.status === 'finished')) continue;
      const realStandings = await calculateGroupStandings(group);
      if (realStandings.length < 4) continue;
      await awardGroupPositionPoints(group);
      groupsRecalculated++;
    }

    // 3. Recalculate advancement points via bracket simulation
    // Delete only rounds where we have actual match data (not future rounds)
    let advancementUpdated = 0;

    // Build sets of teams that actually advanced to each round
    const actualAdvanced = { round16: new Set(), quarters: new Set(), semis: new Set(), final: new Set() };
    for (const [phase, nextRound] of Object.entries(NEXT_ROUND_MAP)) {
      const finishedMatches = await prisma.match.findMany({
        where: { status: 'finished', phase },
        include: { homeTeam: true, awayTeam: true },
      });
      for (const m of finishedMatches) {
        if (!m.homeTeam || !m.awayTeam || m.homeScore === null || m.awayScore === null) continue;
        let winnerName;
        if (m.homeScore > m.awayScore) winnerName = m.homeTeam.name;
        else if (m.homeScore < m.awayScore) winnerName = m.awayTeam.name;
        else winnerName = m.penaltyWinner === 'away' ? m.awayTeam.name : m.homeTeam.name;
        actualAdvanced[nextRound].add(winnerName);
      }
    }

    // Delete only rounds where actual teams advanced (leaves future rounds untouched)
    for (const [round, teams] of Object.entries(actualAdvanced)) {
      if (teams.size > 0) {
        await prisma.advancementPrediction.deleteMany({ where: { round } });
      }
    }

    // Use precomputed simulations (already fetched above for team matching)
    for (const user of allUsers) {
      try {
        const predicted = userSimulations[user.id] || {};
        for (const [round, actualTeams] of Object.entries(actualAdvanced)) {
          if (actualTeams.size === 0) continue;
          const betPhase = ADV_BET_PHASE[round];
          const advCfg = scoringMap[betPhase] || { correctResult: 0 };
          if (!advCfg.correctResult) continue;
          for (const teamName of actualTeams) {
            if (predicted[round]?.has(teamName)) {
              await prisma.advancementPrediction.upsert({
                where: { userId_round_teamName: { userId: user.id, round, teamName } },
                update: { points: advCfg.correctResult },
                create: { userId: user.id, round, teamName, points: advCfg.correctResult },
              });
              advancementUpdated++;
            }
          }
        }
      } catch (userErr) {
        console.error(`Error recalculando avance para usuario ${user.id}:`, userErr);
      }
    }

    res.json({ success: true, predictionsRecalculated: totalUpdated, groupsRecalculated, advancementUpdated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// POST /api/config/champion/calculate — assign points for special bets
router.post('/champion/calculate', auth, admin, async (req, res) => {
  const { champion, runnerUp, third, topScorer, bestPlayer, bestGoalkeeper } = req.body;

  try {
    // Load scoring config for special bets
    const cfgList = await prisma.scoringConfig.findMany({
      where: { phase: { in: ['bet_champion','bet_runnerUp','bet_third','bet_topScorer','bet_bestPlayer','bet_goalkeeper'] } },
    });
    const cfg = {};
    for (const c of cfgList) cfg[c.phase] = c.exactScore;

    const users = await prisma.championPrediction.findMany();
    let updated = 0;

    for (const pred of users) {
      const points =
        (champion       && pred.champion       === champion       ? (cfg.bet_champion   || 15) : 0) +
        (runnerUp       && pred.runnerUp        === runnerUp       ? (cfg.bet_runnerUp   || 10) : 0) +
        (third          && pred.third           === third          ? (cfg.bet_third      ||  5) : 0) +
        (topScorer      && pred.topScorer       === topScorer      ? (cfg.bet_topScorer  ||  5) : 0) +
        (bestPlayer     && pred.bestPlayer      === bestPlayer     ? (cfg.bet_bestPlayer ||  5) : 0) +
        (bestGoalkeeper && pred.bestGoalkeeper  === bestGoalkeeper ? (cfg.bet_goalkeeper ||  5) : 0);

      await prisma.championPrediction.update({
        where: { id: pred.id },
        data: { points },
      });
      updated++;
    }

    res.json({ success: true, updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
