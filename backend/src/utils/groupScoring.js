const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function calculateGroupStandings(group) {
  const teams = await prisma.team.findMany({ where: { group } });
  const matches = await prisma.match.findMany({
    where: { group, phase: 'groups', status: 'finished' },
  });

  const stats = {};
  for (const team of teams) {
    stats[team.id] = { team, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
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
  return Object.values(stats).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    const gd = (b.gf - b.ga) - (a.gf - a.ga);
    if (gd !== 0) return gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.team.name.localeCompare(b.team.name);
  });
}

async function calculatePredictedStandings(group, userId) {
  const teams = await prisma.team.findMany({ where: { group } });
  const matches = await prisma.match.findMany({ where: { group, phase: 'groups' } });
  const preds = await prisma.prediction.findMany({
    where: { userId, matchId: { in: matches.map(m => m.id) } },
  });
  const predMap = {};
  for (const p of preds) predMap[p.matchId] = p;

  const stats = {};
  for (const team of teams) {
    stats[team.id] = { team, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
  }
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
  }
  return Object.values(stats).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    const gd = (b.gf - b.ga) - (a.gf - a.ga);
    if (gd !== 0) return gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.team.name.localeCompare(b.team.name);
  });
}

// Award group position points (2 pts per exact position) for a completed group
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
      where: { userId_group: { userId: user.id, group } },
      update: { pos1: pPos1||'', pos2: pPos2||'', pos3: pPos3||'', pos4: pPos4||'', points: pts },
      create: { userId: user.id, group, pos1: pPos1||'', pos2: pPos2||'', pos3: pPos3||'', pos4: pPos4||'', points: pts },
    });
  }
  return users.length;
}

module.exports = { calculateGroupStandings, calculatePredictedStandings, awardGroupPositionPoints };
