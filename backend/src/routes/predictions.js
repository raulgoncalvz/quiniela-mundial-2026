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

// GET /api/predictions/bracket — returns predicted team names for each knockout match
router.get('/bracket', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Group matches with teams + user predictions
    const groupMatches = await prisma.match.findMany({
      where: { phase: 'groups' },
      include: {
        homeTeam: true,
        awayTeam: true,
        predictions: { where: { userId } },
      },
      orderBy: { matchNumber: 'asc' },
    });

    // 2. Calculate predicted standings per group
    const groups = ['A','B','C','D','E','F','G','H','I','J','K','L'];
    const groupStandings = {};

    for (const group of groups) {
      const gMatches = groupMatches.filter(m => m.group === group);
      const ts = {};

      for (const m of gMatches) {
        if (!ts[m.homeTeamId]) ts[m.homeTeamId] = { id: m.homeTeamId, name: m.homeTeam.name, flag: m.homeTeam.flag, pts: 0, gf: 0, ga: 0, mp: 0 };
        if (!ts[m.awayTeamId]) ts[m.awayTeamId] = { id: m.awayTeamId, name: m.awayTeam.name, flag: m.awayTeam.flag, pts: 0, gf: 0, ga: 0, mp: 0 };

        const pred = m.predictions[0];
        if (!pred) continue;

        const h = ts[m.homeTeamId], a = ts[m.awayTeamId];
        h.mp++; a.mp++;
        h.gf += pred.homeScore; h.ga += pred.awayScore;
        a.gf += pred.awayScore; a.ga += pred.homeScore;

        if (pred.homeScore > pred.awayScore)       { h.pts += 3; }
        else if (pred.homeScore === pred.awayScore) { h.pts += 1; a.pts += 1; }
        else                                        { a.pts += 3; }
      }

      groupStandings[group] = Object.values(ts).sort((a, b) => {
        if (b.pts !== a.pts) return b.pts - a.pts;
        const gd = (b.gf - b.ga) - (a.gf - a.ga);
        if (gd !== 0) return gd;
        if (b.gf !== a.gf) return b.gf - a.gf;
        return a.name.localeCompare(b.name);
      });
    }

    // 3. Knockout matches + user predictions
    const knockoutMatches = await prisma.match.findMany({
      where: { phase: { in: ['round32','round16','quarters','semis','third','final'] } },
      include: { predictions: { where: { userId } } },
      orderBy: { matchNumber: 'asc' },
    });

    const matchByNumber = {};
    for (const m of knockoutMatches) matchByNumber[m.matchNumber] = m;

    // bracketByNumber: matchNumber → { home, away }
    const bbn = {};

    // Sort all 12 predicted 3rd-place teams by pts → GD → GF → alpha; best 8 qualify
    const thirdPlaceTeams = groups
      .map(g => groupStandings[g]?.[2] ? { ...groupStandings[g][2] } : null)
      .filter(Boolean)
      .sort((a, b) => {
        if (b.pts !== a.pts) return b.pts - a.pts;
        const gd = (b.gf - b.ga) - (a.gf - a.ga);
        if (gd !== 0) return gd;
        if (b.gf !== a.gf) return b.gf - a.gf;
        return a.name.localeCompare(b.name);
      });
    const best3rd = thirdPlaceTeams.slice(0, 8).map(t => ({ name: t.name, flag: t.flag }));
    let t3i = 0; // index into best3rd for the 8 "3rd slot" matches
    const next3rd = () => best3rd[t3i++] || null;

    const gs = groupStandings; // shorthand
    const pos = (g, p) => gs[g]?.[p] ? { name: gs[g][p].name, flag: gs[g][p].flag } : null;

    // 4. Round of 32 — FIFA 2026 bracket (confirmed from official template)
    // Matches with "3rd" slots consume best3rd in order: 74, 77, 79, 80, 81, 82, 85, 87
    bbn[73] = { home: pos('A',1), away: pos('B',1) };            // 2A vs 2B
    bbn[74] = { home: pos('E',0), away: next3rd() };              // 1E vs best3rd
    bbn[75] = { home: pos('F',0), away: pos('C',1) };             // 1F vs 2C
    bbn[76] = { home: pos('C',0), away: pos('F',1) };             // 1C vs 2F
    bbn[77] = { home: pos('I',0), away: next3rd() };              // 1I vs best3rd
    bbn[78] = { home: pos('E',1), away: pos('I',1) };             // 2E vs 2I
    bbn[79] = { home: pos('A',0), away: next3rd() };              // 1A vs best3rd
    bbn[80] = { home: pos('L',0), away: next3rd() };              // 1L vs best3rd
    bbn[81] = { home: pos('D',0), away: next3rd() };              // 1D vs best3rd
    bbn[82] = { home: pos('G',0), away: next3rd() };              // 1G vs best3rd
    bbn[83] = { home: pos('K',1), away: pos('L',1) };             // 2K vs 2L
    bbn[84] = { home: pos('H',0), away: pos('J',1) };             // 1H vs 2J
    bbn[85] = { home: pos('B',0), away: next3rd() };              // 1B vs best3rd
    bbn[86] = { home: pos('J',0), away: pos('H',1) };             // 1J vs 2H
    bbn[87] = { home: pos('K',0), away: next3rd() };              // 1K vs best3rd
    bbn[88] = { home: pos('D',1), away: pos('G',1) };             // 2D vs 2G

    // Helper: predicted winner/loser of a match (draw = home advances)
    const winner = (mn) => {
      const m = matchByNumber[mn];
      const pred = m?.predictions?.[0];
      if (!pred || !bbn[mn]?.home || !bbn[mn]?.away) return null;
      return pred.homeScore >= pred.awayScore ? bbn[mn].home : bbn[mn].away;
    };
    const loser = (mn) => {
      const m = matchByNumber[mn];
      const pred = m?.predictions?.[0];
      if (!pred || !bbn[mn]?.home || !bbn[mn]?.away) return null;
      return pred.homeScore >= pred.awayScore ? bbn[mn].away : bbn[mn].home;
    };

    // 5. Round of 16 — cross-bracket FIFA 2026 pairings
    bbn[89] = { home: winner(74), away: winner(77) };
    bbn[90] = { home: winner(73), away: winner(75) };
    bbn[91] = { home: winner(76), away: winner(78) };
    bbn[92] = { home: winner(79), away: winner(80) };
    bbn[93] = { home: winner(83), away: winner(84) };
    bbn[94] = { home: winner(81), away: winner(82) };
    bbn[95] = { home: winner(86), away: winner(88) };
    bbn[96] = { home: winner(85), away: winner(87) };

    // 6. Quarters
    bbn[97]  = { home: winner(89), away: winner(90) };
    bbn[98]  = { home: winner(93), away: winner(94) };
    bbn[99]  = { home: winner(91), away: winner(92) };
    bbn[100] = { home: winner(95), away: winner(96) };

    // 7. Semis
    bbn[101] = { home: winner(97),  away: winner(98)  };
    bbn[102] = { home: winner(99),  away: winner(100) };

    // 8. 3rd place + Final
    bbn[103] = { home: loser(101),  away: loser(102)  };
    bbn[104] = { home: winner(101), away: winner(102) };

    // Convert to matchId-keyed map for frontend
    const result = {};
    for (const m of knockoutMatches) {
      if (bbn[m.matchNumber]) result[m.id] = bbn[m.matchNumber];
    }

    res.json(result);
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
