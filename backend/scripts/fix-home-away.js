// Migration: fix home/away swap for 24 group matches seeded in wrong order.
// The seed pattern for J2 (t2vt4) and J3 (t1vt4) slots doesn't match
// the official Excel-Mundial-2026.xlsx home/away assignments.
// This script is idempotent: checks the current home team before swapping.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// matchNumber → team name that should be HOME (per Excel, using seed.js team names)
const EXPECTED_HOME = {
  // Grupo A: t4=Rep. Checa should be home in J2 and J3
  4:  'Rep. Checa',   // J2: Rep. Checa vs Sudáfrica
  5:  'Rep. Checa',   // J3: Rep. Checa vs México
  // Grupo B: t4=Suiza should be home
  10: 'Suiza',        // J2: Suiza vs Bosnia-Herz.
  11: 'Suiza',        // J3: Suiza vs Canadá
  // Grupo C: t4=Escocia should be home
  16: 'Escocia',      // J2: Escocia vs Marruecos
  17: 'Escocia',      // J3: Escocia vs Brasil
  // Grupo D: t4=Turquía should be home
  22: 'Turquía',      // J2: Turquía vs Paraguay
  23: 'Turquía',      // J3: Turquía vs Estados Unidos
  // Grupo E: t4=Ecuador should be home
  28: 'Ecuador',      // J2: Ecuador vs Curazao
  29: 'Ecuador',      // J3: Ecuador vs Alemania
  // Grupo F: t4=Túnez should be home
  34: 'Túnez',        // J2: Túnez vs Japón
  35: 'Túnez',        // J3: Túnez vs Países Bajos
  // Grupo G: t4=Nueva Zelanda should be home
  40: 'Nueva Zelanda',// J2: Nueva Zelanda vs Egipto
  41: 'Nueva Zelanda',// J3: Nueva Zelanda vs Bélgica
  // Grupo H: t4=Uruguay should be home
  46: 'Uruguay',      // J2: Uruguay vs Cabo Verde
  47: 'Uruguay',      // J3: Uruguay vs España
  // Grupo I: t4=Noruega should be home
  52: 'Noruega',      // J2: Noruega vs Senegal
  53: 'Noruega',      // J3: Noruega vs Francia
  // Grupo J: t4=Jordania should be home
  58: 'Jordania',     // J2: Jordania vs Argelia
  59: 'Jordania',     // J3: Jordania vs Argentina
  // Grupo K: t4=Colombia should be home
  64: 'Colombia',     // J2: Colombia vs RD Congo
  65: 'Colombia',     // J3: Colombia vs Portugal
  // Grupo L: t4=Panamá should be home
  70: 'Panamá',       // J2: Panamá vs Croacia
  71: 'Panamá',       // J3: Panamá vs Inglaterra
};

async function main() {
  console.log('🔄 Corrigiendo asignaciones casa/fuera (24 partidos de grupos)...');
  let swapped = 0;
  let skipped = 0;

  for (const [mnStr, expectedHomeName] of Object.entries(EXPECTED_HOME)) {
    const matchNumber = parseInt(mnStr);

    const match = await prisma.match.findFirst({
      where: { matchNumber },
      include: { homeTeam: true, awayTeam: true },
    });

    if (!match) { skipped++; continue; }

    if (match.homeTeam?.name === expectedHomeName) {
      skipped++;
      continue;
    }

    console.log(`  ↔ M${matchNumber}: ${match.homeTeam?.name} ↔ ${match.awayTeam?.name}`);

    // Swap teams on the match
    await prisma.match.update({
      where: { id: match.id },
      data: {
        homeTeamId: match.awayTeamId,
        awayTeamId: match.homeTeamId,
        // Swap actual result scores only if a result has been entered
        ...(match.homeScore !== null && match.awayScore !== null
          ? { homeScore: match.awayScore, awayScore: match.homeScore }
          : {}),
      },
    });

    // Swap homeScore/awayScore in every prediction for this match so
    // the user's intent (who they think wins by how much) is preserved.
    const predictions = await prisma.prediction.findMany({ where: { matchId: match.id } });
    for (const pred of predictions) {
      await prisma.prediction.update({
        where: { id: pred.id },
        data: { homeScore: pred.awayScore, awayScore: pred.homeScore },
      });
    }

    swapped++;
  }

  console.log(`✅ Corregidos: ${swapped} | Sin cambios: ${skipped}`);
}

main()
  .catch(e => { console.error('❌ Error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
