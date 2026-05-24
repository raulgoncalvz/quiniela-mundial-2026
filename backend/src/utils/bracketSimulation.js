const THIRD_PLACE_COMBINATIONS = require('../combinaciones.json');
const { sortByFifaRules } = require('./groupScoring');

async function getUserPredictedAdvancement(userId, prisma) {
  const groups = ['A','B','C','D','E','F','G','H','I','J','K','L'];

  const groupMatches = await prisma.match.findMany({
    where: { phase: 'groups' },
    include: { homeTeam: true, awayTeam: true, predictions: { where: { userId } } },
    orderBy: { matchNumber: 'asc' },
  });

  const gs = {};
  for (const group of groups) {
    const gMatches = groupMatches.filter(m => m.group === group);
    const ts = {};
    let predictedCount = 0;
    const scoredMatches = [];

    for (const m of gMatches) {
      if (!m.homeTeam || !m.awayTeam) continue;
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
      else if (pred.homeScore === pred.awayScore) { h.pts++; a.pts++; }
      else                                        { a.pts += 3; }

      scoredMatches.push({
        homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId,
        homeScore: pred.homeScore, awayScore: pred.awayScore,
      });
    }

    gs[group] = {
      teams: sortByFifaRules(Object.values(ts), scoredMatches),
      predictedCount,
      totalMatches: gMatches.length,
    };
  }

  const pos = (g, p) => {
    const s = gs[g];
    if (!s || s.predictedCount < s.totalMatches) return null;
    return s.teams[p] ? { name: s.teams[p].name, flag: s.teams[p].flag } : null;
  };

  const allGroupsComplete = groups.every(g => gs[g]?.predictedCount === gs[g]?.totalMatches && gs[g]?.totalMatches > 0);
  const best3rdSlot = {};

  if (allGroupsComplete) {
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

    const qualifyingKey = thirdsRanked.slice(0, 8).map(t => t.group).sort().join('');
    const assignment = THIRD_PLACE_COMBINATIONS[qualifyingKey];
    if (assignment) {
      for (const [slot, groupRef] of Object.entries(assignment)) {
        const grp = groupRef[1];
        const team = gs[grp]?.teams?.[2];
        if (team) best3rdSlot[slot] = { name: team.name, flag: team.flag };
      }
    }
  }

  const third = (slot) => best3rdSlot[slot] || null;

  const knockoutMatches = await prisma.match.findMany({
    where: { phase: { in: ['round32','round16','quarters','semis','third','final'] } },
    include: { predictions: { where: { userId } } },
    orderBy: { matchNumber: 'asc' },
  });

  const matchByNumber = {};
  for (const m of knockoutMatches) matchByNumber[m.matchNumber] = m;

  const bbn = {};
  bbn[73] = { home: pos('A',1), away: pos('B',1) };
  bbn[74] = { home: pos('E',0), away: third('1E') };
  bbn[75] = { home: pos('F',0), away: pos('C',1) };
  bbn[76] = { home: pos('C',0), away: pos('F',1) };
  bbn[77] = { home: pos('I',0), away: third('1I') };
  bbn[78] = { home: pos('E',1), away: pos('I',1) };
  bbn[79] = { home: pos('A',0), away: third('1A') };
  bbn[80] = { home: pos('L',0), away: third('1L') };
  bbn[81] = { home: pos('D',0), away: third('1D') };
  bbn[82] = { home: pos('G',0), away: third('1G') };
  bbn[83] = { home: pos('K',1), away: pos('L',1) };
  bbn[84] = { home: pos('H',0), away: pos('J',1) };
  bbn[85] = { home: pos('B',0), away: third('1B') };
  bbn[86] = { home: pos('J',0), away: pos('H',1) };
  bbn[87] = { home: pos('K',0), away: third('1K') };
  bbn[88] = { home: pos('D',1), away: pos('G',1) };

  const winner = (mn) => {
    const m = matchByNumber[mn];
    const pred = m?.predictions?.[0];
    if (!pred || !bbn[mn]?.home || !bbn[mn]?.away) return null;
    if (pred.homeScore > pred.awayScore) return bbn[mn].home;
    if (pred.homeScore < pred.awayScore) return bbn[mn].away;
    // Draw in regulation: use penaltyWinner if set, default to home
    return pred.penaltyWinner === 'away' ? bbn[mn].away : bbn[mn].home;
  };

  bbn[89]  = { home: winner(74), away: winner(77) };
  bbn[90]  = { home: winner(73), away: winner(75) };
  bbn[91]  = { home: winner(76), away: winner(78) };
  bbn[92]  = { home: winner(79), away: winner(80) };
  bbn[93]  = { home: winner(83), away: winner(84) };
  bbn[94]  = { home: winner(81), away: winner(82) };
  bbn[95]  = { home: winner(86), away: winner(88) };
  bbn[96]  = { home: winner(85), away: winner(87) };

  bbn[97]  = { home: winner(89), away: winner(90) };
  bbn[98]  = { home: winner(93), away: winner(94) };
  bbn[99]  = { home: winner(91), away: winner(92) };
  bbn[100] = { home: winner(95), away: winner(96) };

  bbn[101] = { home: winner(97),  away: winner(98)  };
  bbn[102] = { home: winner(99),  away: winner(100) };

  const loser = (mn) => {
    const m = matchByNumber[mn];
    const pred = m?.predictions?.[0];
    if (!pred || !bbn[mn]?.home || !bbn[mn]?.away) return null;
    if (pred.homeScore > pred.awayScore) return bbn[mn].away;
    if (pred.homeScore < pred.awayScore) return bbn[mn].home;
    return pred.penaltyWinner === 'away' ? bbn[mn].home : bbn[mn].away;
  };

  bbn[103] = { home: loser(101),   away: loser(102)   };
  bbn[104] = { home: winner(101),  away: winner(102)  };

  const round16 = new Set();
  for (let mn = 73; mn <= 88; mn++) { const w = winner(mn); if (w?.name) round16.add(w.name); }

  const quarters = new Set();
  for (let mn = 89; mn <= 96; mn++) { const w = winner(mn); if (w?.name) quarters.add(w.name); }

  const semis = new Set();
  for (let mn = 97; mn <= 100; mn++) { const w = winner(mn); if (w?.name) semis.add(w.name); }

  const final = new Set();
  for (const mn of [101, 102]) { const w = winner(mn); if (w?.name) final.add(w.name); }

  return { round16, quarters, semis, final, matchTeams: bbn };
}

module.exports = { getUserPredictedAdvancement };
