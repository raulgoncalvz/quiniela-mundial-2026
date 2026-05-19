const prisma = require('../lib/prisma');

/**
 * Sort a group's teams using FIFA 2026 tiebreaker rules:
 * 1. Points
 * 2. H2H points (only among tied teams)
 * 3. H2H goal difference
 * 4. H2H goals scored
 * 5. Overall goal difference
 * 6. Overall goals scored
 * 7. Alphabetical (deterministic fallback)
 *
 * @param {Array} teams    - Array of { id, pts, gf, ga, name } (id is teamId)
 * @param {Array} matches  - Array of { homeTeamId, awayTeamId, homeScore, awayScore }
 *                           homeScore/awayScore are the scores to use (actual or predicted)
 * @returns {Array} sorted teams (new array, input not mutated)
 */
function sortByFifaRules(teams, matches) {
  const arr = [...teams].sort((a, b) => b.pts - a.pts);
  const result = [];

  let i = 0;
  while (i < arr.length) {
    let j = i + 1;
    while (j < arr.length && arr[j].pts === arr[i].pts) j++;
    const group = arr.slice(i, j);
    result.push(...(group.length === 1 ? group : _sortTiedGroup(group, matches)));
    i = j;
  }

  return result;
}

function _sortTiedGroup(group, matches) {
  const ids = new Set(group.map(t => t.id));
  const h2h = {};
  for (const t of group) h2h[t.id] = { pts: 0, gd: 0, gf: 0 };

  for (const m of matches) {
    if (!ids.has(m.homeTeamId) || !ids.has(m.awayTeamId)) continue;
    const hs = m.homeScore, as = m.awayScore;
    if (hs == null || as == null) continue;
    h2h[m.homeTeamId].gf += hs;
    h2h[m.homeTeamId].gd += hs - as;
    h2h[m.awayTeamId].gf += as;
    h2h[m.awayTeamId].gd += as - hs;
    if (hs > as)      h2h[m.homeTeamId].pts += 3;
    else if (hs < as) h2h[m.awayTeamId].pts += 3;
    else { h2h[m.homeTeamId].pts += 1; h2h[m.awayTeamId].pts += 1; }
  }

  return [...group].sort((a, b) => {
    const ah = h2h[a.id], bh = h2h[b.id];
    if (bh.pts !== ah.pts) return bh.pts - ah.pts;
    if (bh.gd  !== ah.gd)  return bh.gd  - ah.gd;
    if (bh.gf  !== ah.gf)  return bh.gf  - ah.gf;
    const aGd = a.gf - a.ga, bGd = b.gf - b.ga;
    if (bGd !== aGd) return bGd - aGd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return (a.name || '').localeCompare(b.name || '');
  });
}

async function calculateGroupStandings(group) {
  const teams   = await prisma.team.findMany({ where: { group } });
  const matches = await prisma.match.findMany({
    where: { group, phase: 'groups', status: 'finished' },
  });

  const stats = {};
  for (const team of teams) {
    stats[team.id] = { id: team.id, name: team.name, team, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
  }
  for (const match of matches) {
    if (match.homeScore === null || match.awayScore === null) continue;
    const home = stats[match.homeTeamId], away = stats[match.awayTeamId];
    if (!home || !away) continue;
    home.mp++; away.mp++;
    home.gf += match.homeScore; home.ga += match.awayScore;
    away.gf += match.awayScore; away.ga += match.homeScore;
    if (match.homeScore > match.awayScore)       { home.w++; home.pts += 3; away.l++; }
    else if (match.homeScore < match.awayScore)  { away.w++; away.pts += 3; home.l++; }
    else { home.d++; home.pts++; away.d++; away.pts++; }
  }

  const scoredMatches = matches.map(m => ({
    homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId,
    homeScore: m.homeScore,   awayScore: m.awayScore,
  }));

  return sortByFifaRules(Object.values(stats), scoredMatches);
}

async function calculatePredictedStandings(group, userId) {
  const teams   = await prisma.team.findMany({ where: { group } });
  const matches = await prisma.match.findMany({ where: { group, phase: 'groups' } });
  const preds   = await prisma.prediction.findMany({
    where: { userId, matchId: { in: matches.map(m => m.id) } },
  });
  const predMap = {};
  for (const p of preds) predMap[p.matchId] = p;

  const stats = {};
  for (const team of teams) {
    stats[team.id] = { id: team.id, name: team.name, team, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
  }
  const scoredMatches = [];
  for (const match of matches) {
    const pred = predMap[match.id];
    if (!pred) continue;
    const home = stats[match.homeTeamId], away = stats[match.awayTeamId];
    if (!home || !away) continue;
    home.mp++; away.mp++;
    home.gf += pred.homeScore; home.ga += pred.awayScore;
    away.gf += pred.awayScore; away.ga += pred.homeScore;
    if (pred.homeScore > pred.awayScore)       { home.w++; home.pts += 3; away.l++; }
    else if (pred.homeScore < pred.awayScore)  { away.w++; away.pts += 3; home.l++; }
    else { home.d++; home.pts++; away.d++; away.pts++; }
    scoredMatches.push({
      homeTeamId: match.homeTeamId, awayTeamId: match.awayTeamId,
      homeScore: pred.homeScore,    awayScore: pred.awayScore,
    });
  }

  return sortByFifaRules(Object.values(stats), scoredMatches);
}

async function awardGroupPositionPoints(group) {
  const realStandings = await calculateGroupStandings(group);
  if (realStandings.length < 4) return 0;
  const [rPos1, rPos2, rPos3, rPos4] = realStandings.map(s => s.team.name);
  const users = await prisma.user.findMany();
  for (const user of users) {
    const predStandings = await calculatePredictedStandings(group, user.id);
    const [pPos1, pPos2, pPos3, pPos4] = predStandings.map(s => s.team.name);
    const pts = (pPos1 === rPos1 ? 2 : 0) + (pPos2 === rPos2 ? 2 : 0)
              + (pPos3 === rPos3 ? 2 : 0) + (pPos4 === rPos4 ? 2 : 0);
    await prisma.groupPrediction.upsert({
      where:  { userId_group: { userId: user.id, group } },
      update: { pos1: pPos1||'', pos2: pPos2||'', pos3: pPos3||'', pos4: pPos4||'', points: pts },
      create: { userId: user.id, group, pos1: pPos1||'', pos2: pPos2||'', pos3: pPos3||'', pos4: pPos4||'', points: pts },
    });
  }
  return users.length;
}

module.exports = { calculateGroupStandings, calculatePredictedStandings, awardGroupPositionPoints, sortByFifaRules };
