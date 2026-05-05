// Migration: fix knockout match dates to match the official FIFA 2026 schedule
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Dates taken directly from the official Excel schedule (Excel-Mundial-2026.xlsx)
// Times treated as UTC for consistent ordering across all phases
const CORRECT_DATES = [
  // Round of 32 — order matches FIFA 2026 official bracket (from image)
  { matchNumber: 73, date: '2026-06-28T21:00:00Z' }, // 2A vs 2B
  { matchNumber: 76, date: '2026-06-29T19:00:00Z' }, // 1C vs 2F
  { matchNumber: 74, date: '2026-06-29T22:30:00Z' }, // 1E vs 3er
  { matchNumber: 75, date: '2026-06-30T03:00:00Z' }, // 1F vs 2C
  { matchNumber: 78, date: '2026-06-30T19:00:00Z' }, // 2E vs 2I
  { matchNumber: 77, date: '2026-06-30T23:00:00Z' }, // 1I vs 3er
  { matchNumber: 79, date: '2026-07-01T03:00:00Z' }, // 1A vs 3er
  { matchNumber: 80, date: '2026-07-01T18:00:00Z' }, // 1L vs 3er
  { matchNumber: 82, date: '2026-07-01T22:00:00Z' }, // 1G vs 3er
  { matchNumber: 81, date: '2026-07-02T02:00:00Z' }, // 1D vs 3er
  { matchNumber: 84, date: '2026-07-02T21:00:00Z' }, // 1H vs 2J
  { matchNumber: 83, date: '2026-07-03T01:00:00Z' }, // 2K vs 2L
  { matchNumber: 85, date: '2026-07-03T05:00:00Z' }, // 1B vs 3er
  { matchNumber: 88, date: '2026-07-03T20:00:00Z' }, // 2D vs 2G
  { matchNumber: 86, date: '2026-07-04T00:00:00Z' }, // 1J vs 2H
  { matchNumber: 87, date: '2026-07-04T03:30:00Z' }, // 1K vs 3er
  // Round of 16 (Octavos)
  { matchNumber: 90, date: '2026-07-04T18:00:00Z' },
  { matchNumber: 89, date: '2026-07-04T21:00:00Z' },
  { matchNumber: 91, date: '2026-07-05T18:00:00Z' },
  { matchNumber: 92, date: '2026-07-05T21:00:00Z' },
  { matchNumber: 93, date: '2026-07-06T18:00:00Z' },
  { matchNumber: 94, date: '2026-07-06T21:00:00Z' },
  { matchNumber: 95, date: '2026-07-07T18:00:00Z' },
  { matchNumber: 96, date: '2026-07-07T21:00:00Z' },
  // Quarters
  { matchNumber: 97,  date: '2026-07-09T18:00:00Z' },
  { matchNumber: 98,  date: '2026-07-10T21:00:00Z' },
  { matchNumber: 99,  date: '2026-07-11T18:00:00Z' },
  { matchNumber: 100, date: '2026-07-11T21:00:00Z' },
  // Semis
  { matchNumber: 101, date: '2026-07-14T21:00:00Z' },
  { matchNumber: 102, date: '2026-07-15T21:00:00Z' },
  // 3rd place + Final
  { matchNumber: 103, date: '2026-07-18T21:00:00Z' },
  { matchNumber: 104, date: '2026-07-19T21:00:00Z' },
];

async function main() {
  console.log('📅 Corrigiendo fechas de partidos eliminatorios...');
  let updated = 0;

  for (const { matchNumber, date } of CORRECT_DATES) {
    const match = await prisma.match.findFirst({ where: { matchNumber } });
    if (!match) continue;

    const correctDate = new Date(date);
    if (match.date.getTime() === correctDate.getTime()) continue;

    await prisma.match.update({
      where: { id: match.id },
      data: { date: correctDate },
    });
    updated++;
  }

  console.log(`✅ Fechas actualizadas: ${updated}/${CORRECT_DATES.length} partidos`);
}

main()
  .catch(e => { console.error('❌ Error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
