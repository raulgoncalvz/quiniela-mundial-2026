// Migration: set all 104 match dates to the official FIFA 2026 schedule.
// Dates are stored as UTC. Source: Excel-Mundial-2026.xlsx column A (Venezuela
// time, UTC-4), converted to UTC by adding 4 hours.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// All times in UTC (Venezuela time + 4 h)
// Group matches: seed assigns matchNumbers 1-72 sequentially (A=1-6, ... L=67-72)
//   seed order within each group: J1m1, J1m2, J2m1, J2m2, J3m1, J3m2
// Knockout matchNumbers match the official FIFA bracket numbering.
const CORRECT_DATES = [
  // --- Grupo A (M1-M6): México, Sudáfrica, Corea del Sur, Rep. Checa ---
  { matchNumber: 1,  date: '2026-06-11T19:00:00Z' }, // J1  México vs Sudáfrica     (15:00 VET)
  { matchNumber: 2,  date: '2026-06-12T02:00:00Z' }, // J1  Corea vs Rep. Checa     (22:00 VET)
  { matchNumber: 3,  date: '2026-06-19T01:00:00Z' }, // J2  México vs Corea         (21:00 VET)
  { matchNumber: 4,  date: '2026-06-18T16:00:00Z' }, // J2  Sudáfrica vs Rep. Checa (12:00 VET)
  { matchNumber: 5,  date: '2026-06-25T01:00:00Z' }, // J3  México vs Rep. Checa    (21:00 VET)
  { matchNumber: 6,  date: '2026-06-25T01:00:00Z' }, // J3  Sudáfrica vs Corea      (21:00 VET)

  // --- Grupo B (M7-M12): Canadá, Bosnia-Herz., Catar, Suiza ---
  { matchNumber: 7,  date: '2026-06-12T19:00:00Z' }, // J1  Canadá vs Bosnia        (15:00 VET)
  { matchNumber: 8,  date: '2026-06-13T19:00:00Z' }, // J1  Catar vs Suiza          (15:00 VET)
  { matchNumber: 9,  date: '2026-06-18T22:00:00Z' }, // J2  Canadá vs Catar         (18:00 VET)
  { matchNumber: 10, date: '2026-06-18T19:00:00Z' }, // J2  Bosnia vs Suiza         (15:00 VET)
  { matchNumber: 11, date: '2026-06-24T19:00:00Z' }, // J3  Canadá vs Suiza         (15:00 VET)
  { matchNumber: 12, date: '2026-06-24T19:00:00Z' }, // J3  Bosnia vs Catar         (15:00 VET)

  // --- Grupo C (M13-M18): Brasil, Marruecos, Haití, Escocia ---
  { matchNumber: 13, date: '2026-06-13T22:00:00Z' }, // J1  Brasil vs Marruecos     (18:00 VET)
  { matchNumber: 14, date: '2026-06-14T01:00:00Z' }, // J1  Haití vs Escocia        (21:00 VET)
  { matchNumber: 15, date: '2026-06-20T01:00:00Z' }, // J2  Brasil vs Haití         (21:00 VET)
  { matchNumber: 16, date: '2026-06-19T22:00:00Z' }, // J2  Marruecos vs Escocia    (18:00 VET)
  { matchNumber: 17, date: '2026-06-24T22:00:00Z' }, // J3  Brasil vs Escocia       (18:00 VET)
  { matchNumber: 18, date: '2026-06-24T22:00:00Z' }, // J3  Marruecos vs Haití      (18:00 VET)

  // --- Grupo D (M19-M24): Estados Unidos, Paraguay, Australia, Turquía ---
  { matchNumber: 19, date: '2026-06-13T01:00:00Z' }, // J1  EE.UU. vs Paraguay      (21:00 VET)
  { matchNumber: 20, date: '2026-06-14T04:00:00Z' }, // J1  Australia vs Turquía    (00:00 VET)
  { matchNumber: 21, date: '2026-06-19T19:00:00Z' }, // J2  EE.UU. vs Australia     (15:00 VET)
  { matchNumber: 22, date: '2026-06-20T04:00:00Z' }, // J2  Paraguay vs Turquía     (00:00 VET)
  { matchNumber: 23, date: '2026-06-26T02:00:00Z' }, // J3  EE.UU. vs Turquía       (22:00 VET)
  { matchNumber: 24, date: '2026-06-26T02:00:00Z' }, // J3  Paraguay vs Australia   (22:00 VET)

  // --- Grupo E (M25-M30): Alemania, Curazao, Costa de Marfil, Ecuador ---
  { matchNumber: 25, date: '2026-06-14T17:00:00Z' }, // J1  Alemania vs Curazao     (13:00 VET)
  { matchNumber: 26, date: '2026-06-14T23:00:00Z' }, // J1  Costa Marfil vs Ecuador (19:00 VET)
  { matchNumber: 27, date: '2026-06-20T20:00:00Z' }, // J2  Alemania vs Costa Marfil(16:00 VET)
  { matchNumber: 28, date: '2026-06-21T00:00:00Z' }, // J2  Curazao vs Ecuador      (20:00 VET)
  { matchNumber: 29, date: '2026-06-25T20:00:00Z' }, // J3  Alemania vs Ecuador     (16:00 VET)
  { matchNumber: 30, date: '2026-06-25T20:00:00Z' }, // J3  Curazao vs Costa Marfil (16:00 VET)

  // --- Grupo F (M31-M36): Países Bajos, Japón, Suecia, Túnez ---
  { matchNumber: 31, date: '2026-06-14T20:00:00Z' }, // J1  Países Bajos vs Japón   (16:00 VET)
  { matchNumber: 32, date: '2026-06-15T02:00:00Z' }, // J1  Suecia vs Túnez         (22:00 VET)
  { matchNumber: 33, date: '2026-06-20T17:00:00Z' }, // J2  Países Bajos vs Suecia  (13:00 VET)
  { matchNumber: 34, date: '2026-06-21T04:00:00Z' }, // J2  Japón vs Túnez          (00:00 VET)
  { matchNumber: 35, date: '2026-06-25T23:00:00Z' }, // J3  Países Bajos vs Túnez   (19:00 VET)
  { matchNumber: 36, date: '2026-06-25T23:00:00Z' }, // J3  Japón vs Suecia         (19:00 VET)

  // --- Grupo G (M37-M42): Bélgica, Egipto, Irán, Nueva Zelanda ---
  { matchNumber: 37, date: '2026-06-15T19:00:00Z' }, // J1  Bélgica vs Egipto       (15:00 VET)
  { matchNumber: 38, date: '2026-06-16T01:00:00Z' }, // J1  Irán vs Nueva Zelanda   (21:00 VET)
  { matchNumber: 39, date: '2026-06-21T19:00:00Z' }, // J2  Bélgica vs Irán         (15:00 VET)
  { matchNumber: 40, date: '2026-06-22T01:00:00Z' }, // J2  Egipto vs Nueva Zelanda (21:00 VET)
  { matchNumber: 41, date: '2026-06-27T03:00:00Z' }, // J3  Bélgica vs Nueva Zelanda(23:00 VET)
  { matchNumber: 42, date: '2026-06-27T03:00:00Z' }, // J3  Egipto vs Irán          (23:00 VET)

  // --- Grupo H (M43-M48): España, Cabo Verde, Arabia Saudita, Uruguay ---
  { matchNumber: 43, date: '2026-06-15T16:00:00Z' }, // J1  España vs Cabo Verde    (12:00 VET)
  { matchNumber: 44, date: '2026-06-15T22:00:00Z' }, // J1  Arabia Saudita vs Uruguay(18:00 VET)
  { matchNumber: 45, date: '2026-06-21T16:00:00Z' }, // J2  España vs Arabia Saudita(12:00 VET)
  { matchNumber: 46, date: '2026-06-21T22:00:00Z' }, // J2  Cabo Verde vs Uruguay   (18:00 VET)
  { matchNumber: 47, date: '2026-06-27T00:00:00Z' }, // J3  España vs Uruguay       (20:00 VET)
  { matchNumber: 48, date: '2026-06-27T00:00:00Z' }, // J3  Cabo Verde vs Arabia Saudita(20:00 VET)

  // --- Grupo I (M49-M54): Francia, Senegal, Irak, Noruega ---
  { matchNumber: 49, date: '2026-06-16T19:00:00Z' }, // J1  Francia vs Senegal      (15:00 VET)
  { matchNumber: 50, date: '2026-06-16T22:00:00Z' }, // J1  Irak vs Noruega         (18:00 VET)
  { matchNumber: 51, date: '2026-06-22T21:00:00Z' }, // J2  Francia vs Irak         (17:00 VET)
  { matchNumber: 52, date: '2026-06-23T00:00:00Z' }, // J2  Senegal vs Noruega      (20:00 VET)
  { matchNumber: 53, date: '2026-06-26T19:00:00Z' }, // J3  Francia vs Noruega      (15:00 VET)
  { matchNumber: 54, date: '2026-06-26T19:00:00Z' }, // J3  Senegal vs Irak         (15:00 VET)

  // --- Grupo J (M55-M60): Argentina, Argelia, Austria, Jordania ---
  { matchNumber: 55, date: '2026-06-17T01:00:00Z' }, // J1  Argentina vs Argelia    (21:00 VET)
  { matchNumber: 56, date: '2026-06-17T04:00:00Z' }, // J1  Austria vs Jordania     (00:00 VET)
  { matchNumber: 57, date: '2026-06-22T17:00:00Z' }, // J2  Argentina vs Austria    (13:00 VET)
  { matchNumber: 58, date: '2026-06-23T03:00:00Z' }, // J2  Argelia vs Jordania     (23:00 VET)
  { matchNumber: 59, date: '2026-06-28T02:00:00Z' }, // J3  Argentina vs Jordania   (22:00 VET)
  { matchNumber: 60, date: '2026-06-28T02:00:00Z' }, // J3  Argelia vs Austria      (22:00 VET)

  // --- Grupo K (M61-M66): Portugal, RD Congo, Uzbekistán, Colombia ---
  { matchNumber: 61, date: '2026-06-17T17:00:00Z' }, // J1  Portugal vs RD Congo    (13:00 VET)
  { matchNumber: 62, date: '2026-06-18T02:00:00Z' }, // J1  Uzbekistán vs Colombia  (22:00 VET)
  { matchNumber: 63, date: '2026-06-23T17:00:00Z' }, // J2  Portugal vs Uzbekistán  (13:00 VET)
  { matchNumber: 64, date: '2026-06-24T02:00:00Z' }, // J2  RD Congo vs Colombia    (22:00 VET)
  { matchNumber: 65, date: '2026-06-27T23:30:00Z' }, // J3  Portugal vs Colombia    (19:30 VET)
  { matchNumber: 66, date: '2026-06-27T23:30:00Z' }, // J3  RD Congo vs Uzbekistán  (19:30 VET)

  // --- Grupo L (M67-M72): Inglaterra, Croacia, Ghana, Panamá ---
  { matchNumber: 67, date: '2026-06-17T20:00:00Z' }, // J1  Inglaterra vs Croacia   (16:00 VET)
  { matchNumber: 68, date: '2026-06-17T23:00:00Z' }, // J1  Ghana vs Panamá         (19:00 VET)
  { matchNumber: 69, date: '2026-06-23T20:00:00Z' }, // J2  Inglaterra vs Ghana     (16:00 VET)
  { matchNumber: 70, date: '2026-06-23T23:00:00Z' }, // J2  Croacia vs Panamá       (19:00 VET)
  { matchNumber: 71, date: '2026-06-27T21:00:00Z' }, // J3  Inglaterra vs Panamá    (17:00 VET)
  { matchNumber: 72, date: '2026-06-27T21:00:00Z' }, // J3  Croacia vs Ghana        (17:00 VET)

  // --- Ronda de 32 (M73-M88) ---
  { matchNumber: 73, date: '2026-06-28T19:00:00Z' }, // 2A vs 2B      (15:00 VET)
  { matchNumber: 76, date: '2026-06-29T17:00:00Z' }, // 1C vs 2F      (13:00 VET)
  { matchNumber: 74, date: '2026-06-29T20:30:00Z' }, // 1E vs Mejor3° (16:30 VET)
  { matchNumber: 75, date: '2026-06-30T01:00:00Z' }, // 1F vs 2C      (21:00 VET)
  { matchNumber: 78, date: '2026-06-30T17:00:00Z' }, // 2E vs 2I      (13:00 VET)
  { matchNumber: 77, date: '2026-06-30T21:00:00Z' }, // 1I vs Mejor3° (17:00 VET)
  { matchNumber: 79, date: '2026-07-01T01:00:00Z' }, // 1A vs Mejor3° (21:00 VET)
  { matchNumber: 80, date: '2026-07-01T16:00:00Z' }, // 1L vs Mejor3° (12:00 VET)
  { matchNumber: 82, date: '2026-07-01T20:00:00Z' }, // 1G vs Mejor3° (16:00 VET)
  { matchNumber: 81, date: '2026-07-02T00:00:00Z' }, // 1D vs Mejor3° (20:00 VET)
  { matchNumber: 84, date: '2026-07-02T19:00:00Z' }, // 1H vs 2J      (15:00 VET)
  { matchNumber: 83, date: '2026-07-02T23:00:00Z' }, // 2K vs 2L      (19:00 VET)
  { matchNumber: 85, date: '2026-07-03T03:00:00Z' }, // 1B vs Mejor3° (23:00 VET)
  { matchNumber: 88, date: '2026-07-03T18:00:00Z' }, // 2D vs 2G      (14:00 VET)
  { matchNumber: 86, date: '2026-07-03T22:00:00Z' }, // 1J vs 2H      (18:00 VET)
  { matchNumber: 87, date: '2026-07-04T01:30:00Z' }, // 1K vs Mejor3° (21:30 VET)

  // --- Octavos de Final (M89-M96) ---
  { matchNumber: 90, date: '2026-07-04T17:00:00Z' }, // W73 vs W75    (13:00 VET)
  { matchNumber: 89, date: '2026-07-04T21:00:00Z' }, // W74 vs W77    (17:00 VET)
  { matchNumber: 91, date: '2026-07-05T20:00:00Z' }, // W76 vs W78    (16:00 VET)
  { matchNumber: 92, date: '2026-07-06T00:00:00Z' }, // W79 vs W80    (20:00 VET)
  { matchNumber: 93, date: '2026-07-06T19:00:00Z' }, // W83 vs W84    (15:00 VET)
  { matchNumber: 94, date: '2026-07-07T00:00:00Z' }, // W81 vs W82    (20:00 VET)
  { matchNumber: 95, date: '2026-07-07T16:00:00Z' }, // W86 vs W88    (12:00 VET)
  { matchNumber: 96, date: '2026-07-07T20:00:00Z' }, // W85 vs W87    (16:00 VET)

  // --- Cuartos de Final (M97-M100) ---
  { matchNumber: 97,  date: '2026-07-09T20:00:00Z' }, // W89 vs W90   (16:00 VET)
  { matchNumber: 98,  date: '2026-07-10T19:00:00Z' }, // W93 vs W94   (15:00 VET)
  { matchNumber: 99,  date: '2026-07-11T21:00:00Z' }, // W91 vs W92   (17:00 VET)
  { matchNumber: 100, date: '2026-07-12T01:00:00Z' }, // W95 vs W96   (21:00 VET)

  // --- Semifinales (M101-M102) ---
  { matchNumber: 101, date: '2026-07-14T19:00:00Z' }, // W97 vs W98   (15:00 VET)
  { matchNumber: 102, date: '2026-07-15T19:00:00Z' }, // W99 vs W100  (15:00 VET)

  // --- 3er Puesto + Final ---
  { matchNumber: 103, date: '2026-07-18T21:00:00Z' }, // L101 vs L102 (17:00 VET)
  { matchNumber: 104, date: '2026-07-19T19:00:00Z' }, // W101 vs W102 (15:00 VET)
];

async function main() {
  console.log('📅 Corrigiendo fechas de todos los partidos (grupos + eliminatorios)...');
  let updated = 0;
  let skipped = 0;

  for (const { matchNumber, date } of CORRECT_DATES) {
    const match = await prisma.match.findFirst({ where: { matchNumber } });
    if (!match) { skipped++; continue; }

    const correctDate = new Date(date);
    if (match.date.getTime() === correctDate.getTime()) { skipped++; continue; }

    await prisma.match.update({
      where: { id: match.id },
      data: { date: correctDate },
    });
    updated++;
  }

  console.log(`✅ Actualizados: ${updated} | Sin cambios: ${skipped} | Total: ${CORRECT_DATES.length}`);
}

main()
  .catch(e => { console.error('❌ Error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
