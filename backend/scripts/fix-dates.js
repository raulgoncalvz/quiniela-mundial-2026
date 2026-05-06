// Migration: set all 104 match dates to the official FIFA 2026 schedule from Excel
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// All dates in UTC, extracted directly from Excel-Mundial-2026.xlsx (WORLDCUP sheet)
// Group matches: seed assigns matchNumbers 1-72 sequentially (A=1-6, B=7-12, ... L=67-72)
//   within each group order: [J1 t1vt2, J1 t3vt4, J2 t1vt3, J2 t2vt4, J3 t1vt4, J3 t2vt3]
const CORRECT_DATES = [
  // --- Grupo A (M1-M6): México, Sudáfrica, Corea del Sur, Rep. Checa ---
  { matchNumber: 1,  date: '2026-06-11T21:00:00Z' }, // J1  México vs Sudáfrica
  { matchNumber: 2,  date: '2026-06-12T04:00:00Z' }, // J1  Corea vs Rep. Checa
  { matchNumber: 3,  date: '2026-06-19T03:00:00Z' }, // J2  México vs Corea
  { matchNumber: 4,  date: '2026-06-18T18:00:00Z' }, // J2  Sudáfrica vs Rep. Checa
  { matchNumber: 5,  date: '2026-06-25T03:00:00Z' }, // J3  México vs Rep. Checa
  { matchNumber: 6,  date: '2026-06-25T03:00:00Z' }, // J3  Sudáfrica vs Corea

  // --- Grupo B (M7-M12): Canadá, Bosnia-Herz., Catar, Suiza ---
  { matchNumber: 7,  date: '2026-06-12T21:00:00Z' }, // J1  Canadá vs Bosnia
  { matchNumber: 8,  date: '2026-06-13T21:00:00Z' }, // J1  Catar vs Suiza
  { matchNumber: 9,  date: '2026-06-19T00:00:00Z' }, // J2  Canadá vs Catar
  { matchNumber: 10, date: '2026-06-18T21:00:00Z' }, // J2  Bosnia vs Suiza
  { matchNumber: 11, date: '2026-06-24T21:00:00Z' }, // J3  Canadá vs Suiza
  { matchNumber: 12, date: '2026-06-24T21:00:00Z' }, // J3  Bosnia vs Catar

  // --- Grupo C (M13-M18): Brasil, Marruecos, Haití, Escocia ---
  { matchNumber: 13, date: '2026-06-14T00:00:00Z' }, // J1  Brasil vs Marruecos
  { matchNumber: 14, date: '2026-06-14T03:00:00Z' }, // J1  Haití vs Escocia
  { matchNumber: 15, date: '2026-06-20T03:00:00Z' }, // J2  Brasil vs Haití
  { matchNumber: 16, date: '2026-06-20T00:00:00Z' }, // J2  Marruecos vs Escocia
  { matchNumber: 17, date: '2026-06-25T00:00:00Z' }, // J3  Brasil vs Escocia
  { matchNumber: 18, date: '2026-06-25T00:00:00Z' }, // J3  Marruecos vs Haití

  // --- Grupo D (M19-M24): Estados Unidos, Paraguay, Australia, Turquía ---
  { matchNumber: 19, date: '2026-06-13T03:00:00Z' }, // J1  EE.UU. vs Paraguay
  { matchNumber: 20, date: '2026-06-14T06:00:00Z' }, // J1  Australia vs Turquía
  { matchNumber: 21, date: '2026-06-19T21:00:00Z' }, // J2  EE.UU. vs Australia
  { matchNumber: 22, date: '2026-06-20T06:00:00Z' }, // J2  Paraguay vs Turquía
  { matchNumber: 23, date: '2026-06-26T04:00:00Z' }, // J3  EE.UU. vs Turquía
  { matchNumber: 24, date: '2026-06-26T04:00:00Z' }, // J3  Paraguay vs Australia

  // --- Grupo E (M25-M30): Alemania, Curazao, Costa de Marfil, Ecuador ---
  { matchNumber: 25, date: '2026-06-14T19:00:00Z' }, // J1  Alemania vs Curazao
  { matchNumber: 26, date: '2026-06-15T01:00:00Z' }, // J1  Costa Marfil vs Ecuador
  { matchNumber: 27, date: '2026-06-20T22:00:00Z' }, // J2  Alemania vs Costa Marfil
  { matchNumber: 28, date: '2026-06-21T02:00:00Z' }, // J2  Curazao vs Ecuador
  { matchNumber: 29, date: '2026-06-25T22:00:00Z' }, // J3  Alemania vs Ecuador
  { matchNumber: 30, date: '2026-06-25T22:00:00Z' }, // J3  Curazao vs Costa Marfil

  // --- Grupo F (M31-M36): Países Bajos, Japón, Suecia, Túnez ---
  { matchNumber: 31, date: '2026-06-14T22:00:00Z' }, // J1  Países Bajos vs Japón
  { matchNumber: 32, date: '2026-06-15T04:00:00Z' }, // J1  Suecia vs Túnez
  { matchNumber: 33, date: '2026-06-20T19:00:00Z' }, // J2  Países Bajos vs Suecia
  { matchNumber: 34, date: '2026-06-21T06:00:00Z' }, // J2  Japón vs Túnez
  { matchNumber: 35, date: '2026-06-26T01:00:00Z' }, // J3  Países Bajos vs Túnez
  { matchNumber: 36, date: '2026-06-26T01:00:00Z' }, // J3  Japón vs Suecia

  // --- Grupo G (M37-M42): Bélgica, Egipto, Irán, Nueva Zelanda ---
  { matchNumber: 37, date: '2026-06-15T21:00:00Z' }, // J1  Bélgica vs Egipto
  { matchNumber: 38, date: '2026-06-16T03:00:00Z' }, // J1  Irán vs Nueva Zelanda
  { matchNumber: 39, date: '2026-06-21T21:00:00Z' }, // J2  Bélgica vs Irán
  { matchNumber: 40, date: '2026-06-22T03:00:00Z' }, // J2  Egipto vs Nueva Zelanda
  { matchNumber: 41, date: '2026-06-27T05:00:00Z' }, // J3  Bélgica vs Nueva Zelanda
  { matchNumber: 42, date: '2026-06-27T05:00:00Z' }, // J3  Egipto vs Irán

  // --- Grupo H (M43-M48): España, Cabo Verde, Arabia Saudita, Uruguay ---
  { matchNumber: 43, date: '2026-06-15T18:00:00Z' }, // J1  España vs Cabo Verde
  { matchNumber: 44, date: '2026-06-16T00:00:00Z' }, // J1  Arabia Saudita vs Uruguay
  { matchNumber: 45, date: '2026-06-21T18:00:00Z' }, // J2  España vs Arabia Saudita
  { matchNumber: 46, date: '2026-06-22T00:00:00Z' }, // J2  Cabo Verde vs Uruguay
  { matchNumber: 47, date: '2026-06-27T02:00:00Z' }, // J3  España vs Uruguay
  { matchNumber: 48, date: '2026-06-27T02:00:00Z' }, // J3  Cabo Verde vs Arabia Saudita

  // --- Grupo I (M49-M54): Francia, Senegal, Irak, Noruega ---
  { matchNumber: 49, date: '2026-06-16T21:00:00Z' }, // J1  Francia vs Senegal
  { matchNumber: 50, date: '2026-06-17T00:00:00Z' }, // J1  Irak vs Noruega
  { matchNumber: 51, date: '2026-06-22T23:00:00Z' }, // J2  Francia vs Irak
  { matchNumber: 52, date: '2026-06-23T02:00:00Z' }, // J2  Senegal vs Noruega
  { matchNumber: 53, date: '2026-06-26T21:00:00Z' }, // J3  Francia vs Noruega
  { matchNumber: 54, date: '2026-06-26T21:00:00Z' }, // J3  Senegal vs Irak

  // --- Grupo J (M55-M60): Argentina, Argelia, Austria, Jordania ---
  { matchNumber: 55, date: '2026-06-17T03:00:00Z' }, // J1  Argentina vs Argelia
  { matchNumber: 56, date: '2026-06-17T06:00:00Z' }, // J1  Austria vs Jordania
  { matchNumber: 57, date: '2026-06-22T19:00:00Z' }, // J2  Argentina vs Austria
  { matchNumber: 58, date: '2026-06-23T05:00:00Z' }, // J2  Argelia vs Jordania
  { matchNumber: 59, date: '2026-06-28T04:00:00Z' }, // J3  Argentina vs Jordania
  { matchNumber: 60, date: '2026-06-28T04:00:00Z' }, // J3  Argelia vs Austria

  // --- Grupo K (M61-M66): Portugal, RD Congo, Uzbekistán, Colombia ---
  { matchNumber: 61, date: '2026-06-17T19:00:00Z' }, // J1  Portugal vs RD Congo
  { matchNumber: 62, date: '2026-06-18T04:00:00Z' }, // J1  Uzbekistán vs Colombia
  { matchNumber: 63, date: '2026-06-23T19:00:00Z' }, // J2  Portugal vs Uzbekistán
  { matchNumber: 64, date: '2026-06-24T04:00:00Z' }, // J2  RD Congo vs Colombia
  { matchNumber: 65, date: '2026-06-28T01:30:00Z' }, // J3  Portugal vs Colombia
  { matchNumber: 66, date: '2026-06-28T01:30:00Z' }, // J3  RD Congo vs Uzbekistán

  // --- Grupo L (M67-M72): Inglaterra, Croacia, Ghana, Panamá ---
  { matchNumber: 67, date: '2026-06-17T22:00:00Z' }, // J1  Inglaterra vs Croacia
  { matchNumber: 68, date: '2026-06-18T01:00:00Z' }, // J1  Ghana vs Panamá
  { matchNumber: 69, date: '2026-06-23T22:00:00Z' }, // J2  Inglaterra vs Ghana
  { matchNumber: 70, date: '2026-06-24T01:00:00Z' }, // J2  Croacia vs Panamá
  { matchNumber: 71, date: '2026-06-27T23:00:00Z' }, // J3  Inglaterra vs Panamá
  { matchNumber: 72, date: '2026-06-27T23:00:00Z' }, // J3  Croacia vs Ghana

  // --- Ronda de 32 (M73-M88) ---
  { matchNumber: 73, date: '2026-06-28T21:00:00Z' }, // 2A vs 2B
  { matchNumber: 76, date: '2026-06-29T19:00:00Z' }, // 1C vs 2F
  { matchNumber: 74, date: '2026-06-29T22:30:00Z' }, // 1E vs Mejor3°
  { matchNumber: 75, date: '2026-06-30T03:00:00Z' }, // 1F vs 2C
  { matchNumber: 78, date: '2026-06-30T19:00:00Z' }, // 2E vs 2I
  { matchNumber: 77, date: '2026-06-30T23:00:00Z' }, // 1I vs Mejor3°
  { matchNumber: 79, date: '2026-07-01T03:00:00Z' }, // 1A vs Mejor3°
  { matchNumber: 80, date: '2026-07-01T18:00:00Z' }, // 1L vs Mejor3°
  { matchNumber: 82, date: '2026-07-01T22:00:00Z' }, // 1G vs Mejor3°
  { matchNumber: 81, date: '2026-07-02T02:00:00Z' }, // 1D vs Mejor3°
  { matchNumber: 84, date: '2026-07-02T21:00:00Z' }, // 1H vs 2J
  { matchNumber: 83, date: '2026-07-03T01:00:00Z' }, // 2K vs 2L
  { matchNumber: 85, date: '2026-07-03T05:00:00Z' }, // 1B vs Mejor3°
  { matchNumber: 88, date: '2026-07-03T20:00:00Z' }, // 2D vs 2G
  { matchNumber: 86, date: '2026-07-04T00:00:00Z' }, // 1J vs 2H
  { matchNumber: 87, date: '2026-07-04T03:30:00Z' }, // 1K vs Mejor3°

  // --- Octavos de Final (M89-M96) ---
  { matchNumber: 90, date: '2026-07-04T19:00:00Z' }, // W73 vs W75
  { matchNumber: 89, date: '2026-07-04T23:00:00Z' }, // W74 vs W77
  { matchNumber: 91, date: '2026-07-05T22:00:00Z' }, // W76 vs W78
  { matchNumber: 92, date: '2026-07-06T02:00:00Z' }, // W79 vs W80
  { matchNumber: 93, date: '2026-07-06T21:00:00Z' }, // W83 vs W84
  { matchNumber: 94, date: '2026-07-07T02:00:00Z' }, // W81 vs W82
  { matchNumber: 95, date: '2026-07-07T18:00:00Z' }, // W86 vs W88
  { matchNumber: 96, date: '2026-07-07T22:00:00Z' }, // W85 vs W87

  // --- Cuartos de Final (M97-M100) ---
  { matchNumber: 97,  date: '2026-07-09T22:00:00Z' }, // W89 vs W90
  { matchNumber: 98,  date: '2026-07-10T21:00:00Z' }, // W93 vs W94
  { matchNumber: 99,  date: '2026-07-11T23:00:00Z' }, // W91 vs W92
  { matchNumber: 100, date: '2026-07-12T03:00:00Z' }, // W95 vs W96

  // --- Semifinales (M101-M102) ---
  { matchNumber: 101, date: '2026-07-14T21:00:00Z' }, // W97 vs W98
  { matchNumber: 102, date: '2026-07-15T21:00:00Z' }, // W99 vs W100

  // --- 3er Puesto + Final ---
  { matchNumber: 103, date: '2026-07-18T23:00:00Z' }, // L101 vs L102
  { matchNumber: 104, date: '2026-07-19T21:00:00Z' }, // W101 vs W102
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
