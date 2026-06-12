const router = require('express').Router();
const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');
const THIRD_PLACE_COMBINATIONS = require('../combinaciones.json');
const { sortByFifaRules } = require('../utils/groupScoring');
const prisma = require('../lib/prisma');

async function isLocked() {
  try {
    const firstMatch = await prisma.match.findFirst({ orderBy: { date: 'asc' } });
    if (!firstMatch) return false;
    const lockTime = new Date(firstMatch.date.getTime() - 60 * 60 * 1000);
    return new Date() >= lockTime;
  } catch {
    return false;
  }
}

// Excepción por usuario: un participante con predictionsUnlocked puede guardar
// SOLO predicciones faltantes — el partido sigue pending y no tiene predicción
// previa. Así puede completar su bracket sin poder modificar lo ya cargado.
async function canBypassLock(userId, matchId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { predictionsUnlocked: true },
  });
  if (!user?.predictionsUnlocked) return false;
  const existing = await prisma.prediction.findUnique({
    where: { userId_matchId: { userId, matchId } },
  });
  return !existing;
}

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

// GET /api/predictions/lock — estado de bloqueo. Auth opcional: si viene un token
// válido, agrega unlockedForMe para que ese usuario pueda editar sus faltantes.
router.get('/lock', async (req, res) => {
  try {
    const firstMatch = await prisma.match.findFirst({ orderBy: { date: 'asc' } });
    const lockTime = firstMatch ? new Date(firstMatch.date.getTime() - 60 * 60 * 1000) : null;
    const locked = lockTime ? new Date() >= lockTime : false;

    let unlockedForMe = false;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
        const u = await prisma.user.findUnique({
          where: { id: decoded.id },
          select: { predictionsUnlocked: true },
        });
        unlockedForMe = !!u?.predictionsUnlocked;
      } catch { /* token inválido → sin excepción */ }
    }

    res.json({ locked, lockTime, unlockedForMe });
  } catch {
    res.json({ locked: false, lockTime: null, unlockedForMe: false });
  }
});

// POST /api/predictions — save or update prediction
router.post('/', auth, async (req, res) => {
  const { matchId, homeScore, awayScore, penaltyWinner } = req.body;
  if (matchId === undefined || homeScore === undefined || awayScore === undefined)
    return res.status(400).json({ error: 'matchId, homeScore y awayScore son requeridos' });

  if (homeScore < 0 || awayScore < 0 || homeScore > 20 || awayScore > 20)
    return res.status(400).json({ error: 'Puntuación inválida' });

  if (penaltyWinner !== undefined && penaltyWinner !== null && !['home','away'].includes(penaltyWinner))
    return res.status(400).json({ error: 'penaltyWinner debe ser "home" o "away"' });

  if (await isLocked() && !(await canBypassLock(req.user.id, parseInt(matchId))))
    return res.status(423).json({ error: 'Las predicciones están bloqueadas. El torneo ya comenzó.' });

  try {
    const match = await prisma.match.findUnique({ where: { id: parseInt(matchId) } });
    if (!match) return res.status(404).json({ error: 'Partido no encontrado' });
    if (match.status !== 'pending')
      return res.status(400).json({ error: 'El partido ya comenzó, no puedes modificar tu predicción' });

    // penaltyWinner only relevant for knockout draws
    const pw = (penaltyWinner && ['home','away'].includes(penaltyWinner)) ? penaltyWinner : null;

    const prediction = await prisma.prediction.upsert({
      where:  { userId_matchId: { userId: req.user.id, matchId: parseInt(matchId) } },
      update: { homeScore: parseInt(homeScore), awayScore: parseInt(awayScore), penaltyWinner: pw },
      create: { userId: req.user.id, matchId: parseInt(matchId), homeScore: parseInt(homeScore), awayScore: parseInt(awayScore), penaltyWinner: pw },
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

  const locked = await isLocked();

  try {
    const results = [];
    const errors = [];

    for (const pred of predictions) {
      const { matchId, homeScore, awayScore, penaltyWinner } = pred;
      const pw = (penaltyWinner && ['home','away'].includes(penaltyWinner)) ? penaltyWinner : null;
      try {
        if (locked && !(await canBypassLock(req.user.id, parseInt(matchId)))) {
          errors.push({ matchId, error: 'Predicción bloqueada' });
          continue;
        }
        const match = await prisma.match.findUnique({ where: { id: parseInt(matchId) } });
        if (!match || match.status !== 'pending') {
          errors.push({ matchId, error: 'Partido no disponible' });
          continue;
        }

        const saved = await prisma.prediction.upsert({
          where:  { userId_matchId: { userId: req.user.id, matchId: parseInt(matchId) } },
          update: { homeScore: parseInt(homeScore), awayScore: parseInt(awayScore), penaltyWinner: pw },
          create: { userId: req.user.id, matchId: parseInt(matchId), homeScore: parseInt(homeScore), awayScore: parseInt(awayScore), penaltyWinner: pw },
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
      let predictedCount = 0;
      const scoredMatches = [];

      for (const m of gMatches) {
        if (!ts[m.homeTeamId]) ts[m.homeTeamId] = { id: m.homeTeamId, name: m.homeTeam.name, flag: m.homeTeam.flag, pts: 0, gf: 0, ga: 0, mp: 0 };
        if (!ts[m.awayTeamId]) ts[m.awayTeamId] = { id: m.awayTeamId, name: m.awayTeam.name, flag: m.awayTeam.flag, pts: 0, gf: 0, ga: 0, mp: 0 };

        const pred = m.predictions[0];
        if (!pred) continue;

        predictedCount++;
        const h = ts[m.homeTeamId], a = ts[m.awayTeamId];
        h.mp++; a.mp++;
        h.gf += pred.homeScore; h.ga += pred.awayScore;
        a.gf += pred.awayScore; a.ga += pred.homeScore;

        if (pred.homeScore > pred.awayScore)       { h.pts += 3; }
        else if (pred.homeScore === pred.awayScore) { h.pts += 1; a.pts += 1; }
        else                                        { a.pts += 3; }

        scoredMatches.push({
          homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId,
          homeScore: pred.homeScore, awayScore: pred.awayScore,
        });
      }

      groupStandings[group] = {
        teams: sortByFifaRules(Object.values(ts), scoredMatches),
        predictedCount,
        totalMatches: gMatches.length,
      };
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

    const gs = groupStandings;

    // pos returns null if user hasn't predicted all matches in that group yet
    const pos = (g, p) => {
      const s = gs[g];
      if (!s || s.predictedCount < s.totalMatches) return null;
      return s.teams[p] ? { name: s.teams[p].name, flag: s.teams[p].flag } : null;
    };

    // Los 8 mejores terceros solo se determinan cuando los 12 grupos están completos.
    // Cada slot tiene una asignación específica según qué grupos clasificaron
    // (tabla oficial FIFA 2026 con 495 combinaciones).
    const allGroupsComplete = groups.every(
      g => gs[g]?.predictedCount === gs[g]?.totalMatches && gs[g]?.totalMatches > 0
    );

    // best3rdSlot: { '1A': {name,flag}, '1B': {name,flag}, ... } — qué 3° va a cada slot
    const best3rdSlot = {};
    if (allGroupsComplete) {
      // Ordenar los 12 terceros: los mejores 8 clasifican
      const thirdsRanked = groups
        .map(g => gs[g]?.teams?.[2] ? { group: g, ...gs[g].teams[2] } : null)
        .filter(Boolean)
        .sort((a, b) => {
          if (b.pts !== a.pts) return b.pts - a.pts;
          const gd = (b.gf - b.ga) - (a.gf - a.ga);
          if (gd !== 0) return gd;
          if (b.gf !== a.gf) return b.gf - a.gf;
          return a.name.localeCompare(b.name);
        });

      // Clave = letras de grupos clasificados ordenadas alfabéticamente
      const qualifyingKey = thirdsRanked.slice(0, 8).map(t => t.group).sort().join('');
      const assignment = THIRD_PLACE_COMBINATIONS[qualifyingKey];

      if (assignment) {
        // assignment: { '1A': '3X', '1B': '3Y', ... }  — '3X' = 3° del grupo X
        for (const [slot, groupRef] of Object.entries(assignment)) {
          const grp = groupRef[1]; // '3E' → 'E'
          const team = gs[grp]?.teams?.[2];
          if (team) best3rdSlot[slot] = { name: team.name, flag: team.flag };
        }
      }
    }

    // Helper: devuelve el 3° asignado a un slot específico (null si aún no se conoce)
    const third = (slot) => best3rdSlot[slot] || null;

    // 4. Round of 32 — FIFA 2026 bracket oficial
    bbn[73] = { home: pos('A',1), away: pos('B',1) };            // 2A vs 2B
    bbn[74] = { home: pos('E',0), away: third('1E') };            // 1E vs 3er(ABCDF)
    bbn[75] = { home: pos('F',0), away: pos('C',1) };             // 1F vs 2C
    bbn[76] = { home: pos('C',0), away: pos('F',1) };             // 1C vs 2F
    bbn[77] = { home: pos('I',0), away: third('1I') };            // 1I vs 3er(CDFGH)
    bbn[78] = { home: pos('E',1), away: pos('I',1) };             // 2E vs 2I
    bbn[79] = { home: pos('A',0), away: third('1A') };            // 1A vs 3er(CEFHI)
    bbn[80] = { home: pos('L',0), away: third('1L') };            // 1L vs 3er(EHIJK)
    bbn[81] = { home: pos('D',0), away: third('1D') };            // 1D vs 3er(BEFIJ)
    bbn[82] = { home: pos('G',0), away: third('1G') };            // 1G vs 3er(AEHIJ)
    bbn[83] = { home: pos('K',1), away: pos('L',1) };             // 2K vs 2L
    bbn[84] = { home: pos('H',0), away: pos('J',1) };             // 1H vs 2J
    bbn[85] = { home: pos('B',0), away: third('1B') };            // 1B vs 3er(EFGIJ)
    bbn[86] = { home: pos('J',0), away: pos('H',1) };             // 1J vs 2H
    bbn[87] = { home: pos('K',0), away: third('1K') };            // 1K vs 3er(DEIJL)
    bbn[88] = { home: pos('D',1), away: pos('G',1) };             // 2D vs 2G

    // Helper: predicted winner/loser (draw → use penaltyWinner, default home)
    const winner = (mn) => {
      const m = matchByNumber[mn];
      const pred = m?.predictions?.[0];
      if (!pred || !bbn[mn]?.home || !bbn[mn]?.away) return null;
      if (pred.homeScore > pred.awayScore) return bbn[mn].home;
      if (pred.homeScore < pred.awayScore) return bbn[mn].away;
      return pred.penaltyWinner === 'away' ? bbn[mn].away : bbn[mn].home;
    };
    const loser = (mn) => {
      const m = matchByNumber[mn];
      const pred = m?.predictions?.[0];
      if (!pred || !bbn[mn]?.home || !bbn[mn]?.away) return null;
      if (pred.homeScore > pred.awayScore) return bbn[mn].away;
      if (pred.homeScore < pred.awayScore) return bbn[mn].home;
      return pred.penaltyWinner === 'away' ? bbn[mn].home : bbn[mn].away;
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

    // Podio derivado del bracket — única fuente de verdad.
    // Final (104): ganador = campeón, perdedor = finalista. 3er Lugar (103): ganador = 3°.
    // Si el bracket no determina aún a un equipo, devolvemos '' para limpiar valores obsoletos.
    const podium = {
      champion: winner(104)?.name || '',
      runnerUp: loser(104)?.name || '',
      third:    winner(103)?.name || '',
    };

    res.json({ teams: result, podium });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// GET /api/predictions/thirds — mejores terceros de los 12 grupos y sus llaves en R32
router.get('/thirds', auth, async (req, res) => {
  try {
    const groups = ['A','B','C','D','E','F','G','H','I','J','K','L'];
    const userId = req.user.id;

    const allGroupMatches = await prisma.match.findMany({
      where: { phase: 'groups' },
      include: { homeTeam: true, awayTeam: true },
    });

    const allPreds = await prisma.prediction.findMany({
      where: { userId, match: { phase: 'groups' } },
    });
    const predMap = {};
    for (const p of allPreds) predMap[p.matchId] = p;

    let completedGroups = 0;
    const thirdsRaw = [];

    for (const group of groups) {
      const gMatches = allGroupMatches.filter(m => m.group === group);
      const predictedCount = gMatches.filter(m => predMap[m.id]).length;
      if (predictedCount < gMatches.length) continue;

      completedGroups++;
      const stats = {};
      const scoredMatchesForGroup = [];
      for (const m of gMatches) {
        if (!stats[m.homeTeamId]) stats[m.homeTeamId] = { id: m.homeTeamId, name: m.homeTeam.name, team: m.homeTeam, mp:0,w:0,d:0,l:0,gf:0,ga:0,pts:0 };
        if (!stats[m.awayTeamId]) stats[m.awayTeamId] = { id: m.awayTeamId, name: m.awayTeam.name, team: m.awayTeam, mp:0,w:0,d:0,l:0,gf:0,ga:0,pts:0 };
        const pred = predMap[m.id];
        const home = stats[m.homeTeamId], away = stats[m.awayTeamId];
        home.mp++; away.mp++;
        home.gf += pred.homeScore; home.ga += pred.awayScore;
        away.gf += pred.awayScore; away.ga += pred.homeScore;
        if (pred.homeScore > pred.awayScore)       { home.w++; home.pts += 3; away.l++; }
        else if (pred.homeScore < pred.awayScore)  { away.w++; away.pts += 3; home.l++; }
        else { home.d++; home.pts++; away.d++; away.pts++; }
        scoredMatchesForGroup.push({
          homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId,
          homeScore: pred.homeScore, awayScore: pred.awayScore,
        });
      }
      const sorted = sortByFifaRules(Object.values(stats), scoredMatchesForGroup);
      if (sorted[2]) thirdsRaw.push({ group, ...sorted[2] });
    }

    // Sort all thirds by pts, GD, GF, alphabetical
    thirdsRaw.sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      const gd = (b.gf - b.ga) - (a.gf - a.ga);
      if (gd !== 0) return gd;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.team.name.localeCompare(b.team.name);
    });

    const allGroupsComplete = completedGroups === 12;

    // Slot assignments only when all 12 groups are predicted
    let slotAssignments = {};
    if (allGroupsComplete) {
      const qualifyingKey = thirdsRaw.slice(0, 8).map(t => t.group).sort().join('');
      slotAssignments = THIRD_PLACE_COMBINATIONS[qualifyingKey] || {};
    }

    const thirds = thirdsRaw.map((t, idx) => {
      let slot = null;
      if (allGroupsComplete && idx < 8) {
        for (const [s, groupRef] of Object.entries(slotAssignments)) {
          if (groupRef === `3${t.group}`) { slot = s; break; }
        }
      }
      return {
        rank: idx + 1,
        group: t.group,
        name: t.team.name,
        flag: t.team.flag,
        mp: t.mp, w: t.w, d: t.d, l: t.l,
        gf: t.gf, ga: t.ga,
        gd: t.gf - t.ga,
        pts: t.pts,
        qualifies: allGroupsComplete ? idx < 8 : null,
        slot,
      };
    });

    res.json({ thirds, completedGroups, allGroupsComplete });
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

// GET /api/predictions/groups/all/standings — all 12 groups in one shot
router.get('/groups/all/standings', auth, async (req, res) => {
  const GROUP_LETTERS = ['A','B','C','D','E','F','G','H','I','J','K','L'];
  try {
    const [allTeams, allGroupMatches] = await Promise.all([
      prisma.team.findMany({ where: { group: { in: GROUP_LETTERS } } }),
      prisma.match.findMany({
        where: { phase: 'groups' },
        include: { predictions: { where: { userId: req.user.id } } },
        orderBy: { matchNumber: 'asc' },
      }),
    ]);

    const result = {};
    for (const group of GROUP_LETTERS) {
      const groupMatches = allGroupMatches.filter(m => m.group === group);
      const teams = allTeams.filter(t => t.group === group);

      const stats = {};
      for (const team of teams) {
        stats[team.id] = { id: team.id, name: team.name, team, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
      }

      const scoredMatches = [];
      let predicted = 0;
      for (const match of groupMatches) {
        const pred = match.predictions[0];
        if (!pred) continue;
        predicted++;
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
        scoredMatches.push({
          homeTeamId: match.homeTeamId, awayTeamId: match.awayTeamId,
          homeScore: pred.homeScore, awayScore: pred.awayScore,
        });
      }

      const sorted = sortByFifaRules(Object.values(stats), scoredMatches);
      result[group] = {
        standings: sorted.map((s, i) => ({
          position: i + 1,
          teamId: s.team.id,
          teamName: s.team.name,
          teamFlag: s.team.flag,
          mp: s.mp, w: s.w, d: s.d, l: s.l,
          gf: s.gf, ga: s.ga, gd: s.gf - s.ga, pts: s.pts,
        })),
        predictedMatches: predicted,
        totalMatches: groupMatches.length,
      };
    }

    res.json(result);
  } catch (err) {
    console.error(err);
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
      stats[team.id] = { id: team.id, name: team.name, team, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
    }

    const scoredMatchesForStandings = [];
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
      scoredMatchesForStandings.push({
        homeTeamId: match.homeTeamId, awayTeamId: match.awayTeamId,
        homeScore: pred.homeScore, awayScore: pred.awayScore,
      });
    }

    const sorted = sortByFifaRules(Object.values(stats), scoredMatchesForStandings);

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

  if (await isLocked())
    return res.status(423).json({ error: 'Las predicciones están bloqueadas. El torneo ya comenzó.' });

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

  if (await isLocked())
    return res.status(423).json({ error: 'Las predicciones están bloqueadas. El torneo ya comenzó.' });

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

const KNOCKOUT_PHASES = ['round32', 'round16', 'quarters', 'semis', 'third', 'final'];
const PHASE_LABELS_STATS = {
  groups: 'Fase de Grupos', round32: 'Ronda de 32', round16: 'Octavos',
  quarters: 'Cuartos', semis: 'Semifinales', third: '3er Lugar', final: 'Final',
};

// GET /api/predictions/stats — user stats
router.get('/stats', auth, async (req, res) => {
  try {
    const predictions = await prisma.prediction.findMany({
      where: { userId: req.user.id },
      include: { match: { select: { phase: true, homeScore: true, awayScore: true, status: true } } },
    });

    const total = predictions.length;
    const finished = predictions.filter(p => p.match.status === 'finished');

    const exact = finished.filter(p =>
      p.match.homeScore !== null &&
      p.homeScore === p.match.homeScore &&
      p.awayScore === p.match.awayScore
    ).length;
    const correct = finished.filter(p => p.points >= 1).length;
    const matchPoints = finished.reduce((sum, p) => sum + p.points, 0);

    // Per-phase breakdown
    const phaseBreakdown = {};
    for (const p of finished) {
      const ph = p.match.phase;
      if (!phaseBreakdown[ph]) phaseBreakdown[ph] = { points: 0, correct: 0, exact: 0, played: 0, label: PHASE_LABELS_STATS[ph] || ph };
      phaseBreakdown[ph].played++;
      phaseBreakdown[ph].points += p.points;
      if (p.points > 0) phaseBreakdown[ph].correct++;
      if (p.match.homeScore !== null && p.homeScore === p.match.homeScore && p.awayScore === p.match.awayScore)
        phaseBreakdown[ph].exact++;
    }

    // Knockout advancement: correct winner predictions per round
    const knockoutAdv = {};
    for (const ph of KNOCKOUT_PHASES) {
      const phPreds = finished.filter(p => p.match.phase === ph);
      knockoutAdv[ph] = {
        label: PHASE_LABELS_STATS[ph] || ph,
        correct: phPreds.filter(p => p.points > 0).length,
        total: phPreds.length,
        points: phPreds.reduce((s, p) => s + p.points, 0),
      };
    }

    const [championPred, groupPredictions, advancementPredictions] = await Promise.all([
      prisma.championPrediction.findUnique({ where: { userId: req.user.id } }),
      prisma.groupPrediction.findMany({ where: { userId: req.user.id } }),
      prisma.advancementPrediction.findMany({ where: { userId: req.user.id } }),
    ]);

    const champPoints = championPred?.points || 0;
    const groupPoints = groupPredictions.reduce((sum, p) => sum + p.points, 0);
    const advPoints = advancementPredictions.reduce((sum, p) => sum + p.points, 0);

    const advBreakdown = { round16: {}, quarters: {}, semis: {}, final: {} };
    for (const p of advancementPredictions) {
      if (!advBreakdown[p.round]) continue;
      if (!advBreakdown[p.round].total) advBreakdown[p.round] = { total: 0, correct: 0, points: 0 };
      advBreakdown[p.round].total++;
      if (p.points > 0) { advBreakdown[p.round].correct++; advBreakdown[p.round].points += p.points; }
    }

    res.json({
      totalPredictions: total,
      finishedMatches: finished.length,
      exactScores: exact,
      correctResults: correct,
      accuracy: finished.length > 0 ? Math.round((correct / finished.length) * 100) : 0,
      matchPoints,
      championPoints: champPoints,
      groupPoints,
      advancementPoints: advPoints,
      totalPoints: matchPoints + champPoints + groupPoints + advPoints,
      phaseBreakdown,
      knockoutAdv,
      advBreakdown,
    });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
