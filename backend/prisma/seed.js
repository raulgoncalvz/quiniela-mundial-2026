const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// =============================================
// EQUIPOS — 48 equipos en 12 grupos (A-L)
// =============================================
const TEAMS = [
  // Grupo A
  { name: 'México',           group: 'A', flag: '🇲🇽' },
  { name: 'Sudáfrica',        group: 'A', flag: '🇿🇦' },
  { name: 'Corea del Sur',    group: 'A', flag: '🇰🇷' },
  { name: 'Rep. Checa',       group: 'A', flag: '🇨🇿' },
  // Grupo B
  { name: 'Canadá',           group: 'B', flag: '🇨🇦' },
  { name: 'Bosnia-Herz.',     group: 'B', flag: '🇧🇦' },
  { name: 'Catar',            group: 'B', flag: '🇶🇦' },
  { name: 'Suiza',            group: 'B', flag: '🇨🇭' },
  // Grupo C
  { name: 'Brasil',           group: 'C', flag: '🇧🇷' },
  { name: 'Marruecos',        group: 'C', flag: '🇲🇦' },
  { name: 'Haití',            group: 'C', flag: '🇭🇹' },
  { name: 'Escocia',          group: 'C', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
  // Grupo D
  { name: 'Estados Unidos',   group: 'D', flag: '🇺🇸' },
  { name: 'Paraguay',         group: 'D', flag: '🇵🇾' },
  { name: 'Australia',        group: 'D', flag: '🇦🇺' },
  { name: 'Turquía',          group: 'D', flag: '🇹🇷' },
  // Grupo E
  { name: 'Alemania',         group: 'E', flag: '🇩🇪' },
  { name: 'Curazao',          group: 'E', flag: '🇨🇼' },
  { name: 'Costa de Marfil',  group: 'E', flag: '🇨🇮' },
  { name: 'Ecuador',          group: 'E', flag: '🇪🇨' },
  // Grupo F
  { name: 'Países Bajos',     group: 'F', flag: '🇳🇱' },
  { name: 'Japón',            group: 'F', flag: '🇯🇵' },
  { name: 'Suecia',           group: 'F', flag: '🇸🇪' },
  { name: 'Túnez',            group: 'F', flag: '🇹🇳' },
  // Grupo G
  { name: 'Bélgica',          group: 'G', flag: '🇧🇪' },
  { name: 'Egipto',           group: 'G', flag: '🇪🇬' },
  { name: 'Irán',             group: 'G', flag: '🇮🇷' },
  { name: 'Nueva Zelanda',    group: 'G', flag: '🇳🇿' },
  // Grupo H
  { name: 'España',           group: 'H', flag: '🇪🇸' },
  { name: 'Cabo Verde',       group: 'H', flag: '🇨🇻' },
  { name: 'Arabia Saudita',   group: 'H', flag: '🇸🇦' },
  { name: 'Uruguay',          group: 'H', flag: '🇺🇾' },
  // Grupo I
  { name: 'Francia',          group: 'I', flag: '🇫🇷' },
  { name: 'Senegal',          group: 'I', flag: '🇸🇳' },
  { name: 'Irak',             group: 'I', flag: '🇮🇶' },
  { name: 'Noruega',          group: 'I', flag: '🇳🇴' },
  // Grupo J
  { name: 'Argentina',        group: 'J', flag: '🇦🇷' },
  { name: 'Argelia',          group: 'J', flag: '🇩🇿' },
  { name: 'Austria',          group: 'J', flag: '🇦🇹' },
  { name: 'Jordania',         group: 'J', flag: '🇯🇴' },
  // Grupo K
  { name: 'Portugal',         group: 'K', flag: '🇵🇹' },
  { name: 'RD Congo',         group: 'K', flag: '🇨🇩' },
  { name: 'Uzbekistán',       group: 'K', flag: '🇺🇿' },
  { name: 'Colombia',         group: 'K', flag: '🇨🇴' },
  // Grupo L
  { name: 'Inglaterra',       group: 'L', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { name: 'Croacia',          group: 'L', flag: '🇭🇷' },
  { name: 'Ghana',            group: 'L', flag: '🇬🇭' },
  { name: 'Panamá',           group: 'L', flag: '🇵🇦' },
];

// =============================================
// CIUDADES sede Mundial 2026
// =============================================
const VENUES = {
  'A': { city: 'Ciudad de México', venue: 'Estadio Azteca' },
  'B': { city: 'Toronto',         venue: 'BMO Field' },
  'C': { city: 'Los Ángeles',     venue: 'SoFi Stadium' },
  'D': { city: 'Dallas',          venue: 'AT&T Stadium' },
  'E': { city: 'Nueva York',      venue: 'MetLife Stadium' },
  'F': { city: 'San Francisco',   venue: 'Levi\'s Stadium' },
  'G': { city: 'Miami',           venue: 'Hard Rock Stadium' },
  'H': { city: 'Guadalajara',     venue: 'Estadio Akron' },
  'I': { city: 'Boston',          venue: 'Gillette Stadium' },
  'J': { city: 'Chicago',         venue: 'Soldier Field' },
  'K': { city: 'Seattle',         venue: 'Lumen Field' },
  'L': { city: 'Vancouver',       venue: 'BC Place' },
};

// =============================================
// Generar horario de fase de grupos
// Matchday 1: T[0] vs T[1], T[2] vs T[3]
// Matchday 2: T[0] vs T[2], T[1] vs T[3]
// Matchday 3: T[0] vs T[3], T[1] vs T[2] (simultáneo)
// =============================================
function getGroupDates(groupIndex) {
  // Base: Grupo A empieza el 11 de junio, cada grupo con 1 día de diferencia en MD1
  const offsetDays = groupIndex % 6;  // 0-5 para distribuir en 6 días
  const offsetHours = groupIndex >= 6 ? 3 : 0; // tarde o noche

  const base = new Date('2026-06-11T20:00:00Z');

  function addDays(date, days, hours = 0) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    d.setHours(d.getHours() + hours);
    return d;
  }

  // MD1: días 0-5 desde el 11-jun
  const md1a = addDays(base, offsetDays, offsetHours);
  const md1b = addDays(base, offsetDays, offsetHours + 3);

  // MD2: ~8 días después del MD1
  const md2a = addDays(md1a, 8);
  const md2b = addDays(md1a, 8, 3);

  // MD3: ~16 días después del MD1 (simultáneo)
  const md3a = addDays(md1a, 16);
  const md3b = addDays(md1a, 16); // misma hora = simultáneo

  return [md1a, md1b, md2a, md2b, md3a, md3b];
}

// =============================================
// Partidos fase eliminatoria (placeholder)
// =============================================
const KNOCKOUT_MATCHES = [
  // Ronda de 32 (Round of 32) — 16 partidos
  { matchNumber: 73,  phase: 'round32', label: '1A vs 2B', date: '2026-07-04T20:00:00Z', city: 'Dallas',         venue: 'AT&T Stadium' },
  { matchNumber: 74,  phase: 'round32', label: '1C vs 2D', date: '2026-07-04T23:00:00Z', city: 'Nueva York',     venue: 'MetLife Stadium' },
  { matchNumber: 75,  phase: 'round32', label: '1E vs 2F', date: '2026-07-05T20:00:00Z', city: 'Los Ángeles',    venue: 'SoFi Stadium' },
  { matchNumber: 76,  phase: 'round32', label: '1G vs 2H', date: '2026-07-05T23:00:00Z', city: 'Miami',          venue: 'Hard Rock Stadium' },
  { matchNumber: 77,  phase: 'round32', label: '1I vs 2J', date: '2026-07-06T20:00:00Z', city: 'Boston',         venue: 'Gillette Stadium' },
  { matchNumber: 78,  phase: 'round32', label: '1K vs 2L', date: '2026-07-06T23:00:00Z', city: 'Seattle',        venue: 'Lumen Field' },
  { matchNumber: 79,  phase: 'round32', label: '1B vs 2A', date: '2026-07-07T20:00:00Z', city: 'Toronto',        venue: 'BMO Field' },
  { matchNumber: 80,  phase: 'round32', label: '1D vs 2C', date: '2026-07-07T23:00:00Z', city: 'Chicago',        venue: 'Soldier Field' },
  { matchNumber: 81,  phase: 'round32', label: '1F vs 2E', date: '2026-07-08T20:00:00Z', city: 'San Francisco',  venue: 'Levi\'s Stadium' },
  { matchNumber: 82,  phase: 'round32', label: '1H vs 2G', date: '2026-07-08T23:00:00Z', city: 'Guadalajara',    venue: 'Estadio Akron' },
  { matchNumber: 83,  phase: 'round32', label: '1J vs 2I', date: '2026-07-09T20:00:00Z', city: 'Nueva York',     venue: 'MetLife Stadium' },
  { matchNumber: 84,  phase: 'round32', label: '1L vs 2K', date: '2026-07-09T23:00:00Z', city: 'Vancouver',      venue: 'BC Place' },
  { matchNumber: 85,  phase: 'round32', label: '3er mejor 1', date: '2026-07-10T20:00:00Z', city: 'Dallas',      venue: 'AT&T Stadium' },
  { matchNumber: 86,  phase: 'round32', label: '3er mejor 2', date: '2026-07-10T23:00:00Z', city: 'Los Ángeles', venue: 'SoFi Stadium' },
  { matchNumber: 87,  phase: 'round32', label: '3er mejor 3', date: '2026-07-11T20:00:00Z', city: 'Miami',       venue: 'Hard Rock Stadium' },
  { matchNumber: 88,  phase: 'round32', label: '3er mejor 4', date: '2026-07-11T23:00:00Z', city: 'Ciudad de México', venue: 'Estadio Azteca' },

  // Octavos de final — 8 partidos
  { matchNumber: 89,  phase: 'round16', label: 'Octavos 1', date: '2026-07-13T20:00:00Z', city: 'Nueva York',      venue: 'MetLife Stadium' },
  { matchNumber: 90,  phase: 'round16', label: 'Octavos 2', date: '2026-07-13T23:00:00Z', city: 'Los Ángeles',     venue: 'SoFi Stadium' },
  { matchNumber: 91,  phase: 'round16', label: 'Octavos 3', date: '2026-07-14T20:00:00Z', city: 'Dallas',          venue: 'AT&T Stadium' },
  { matchNumber: 92,  phase: 'round16', label: 'Octavos 4', date: '2026-07-14T23:00:00Z', city: 'Ciudad de México', venue: 'Estadio Azteca' },
  { matchNumber: 93,  phase: 'round16', label: 'Octavos 5', date: '2026-07-15T20:00:00Z', city: 'Miami',           venue: 'Hard Rock Stadium' },
  { matchNumber: 94,  phase: 'round16', label: 'Octavos 6', date: '2026-07-15T23:00:00Z', city: 'Toronto',         venue: 'BMO Field' },
  { matchNumber: 95,  phase: 'round16', label: 'Octavos 7', date: '2026-07-16T20:00:00Z', city: 'Boston',          venue: 'Gillette Stadium' },
  { matchNumber: 96,  phase: 'round16', label: 'Octavos 8', date: '2026-07-16T23:00:00Z', city: 'Seattle',         venue: 'Lumen Field' },

  // Cuartos de final — 4 partidos
  { matchNumber: 97,  phase: 'quarters', label: 'Cuartos 1', date: '2026-07-17T20:00:00Z', city: 'Nueva York',     venue: 'MetLife Stadium' },
  { matchNumber: 98,  phase: 'quarters', label: 'Cuartos 2', date: '2026-07-17T23:00:00Z', city: 'Los Ángeles',    venue: 'SoFi Stadium' },
  { matchNumber: 99,  phase: 'quarters', label: 'Cuartos 3', date: '2026-07-18T20:00:00Z', city: 'Dallas',         venue: 'AT&T Stadium' },
  { matchNumber: 100, phase: 'quarters', label: 'Cuartos 4', date: '2026-07-18T23:00:00Z', city: 'Miami',          venue: 'Hard Rock Stadium' },

  // Semifinales — 2 partidos
  { matchNumber: 101, phase: 'semis', label: 'Semifinal 1', date: '2026-07-14T20:00:00Z', city: 'Dallas',          venue: 'AT&T Stadium' },
  { matchNumber: 102, phase: 'semis', label: 'Semifinal 2', date: '2026-07-15T20:00:00Z', city: 'Nueva York',      venue: 'MetLife Stadium' },

  // Tercer puesto
  { matchNumber: 103, phase: 'third', label: '3er y 4to puesto', date: '2026-07-18T20:00:00Z', city: 'Miami',      venue: 'Hard Rock Stadium' },

  // Final
  { matchNumber: 104, phase: 'final', label: 'FINAL', date: '2026-07-19T20:00:00Z', city: 'Nueva York',            venue: 'MetLife Stadium' },
];

// =============================================
// MAIN SEED
// =============================================
async function main() {
  // Si ya hay equipos, no volvemos a sembrar (idempotente)
  const existing = await prisma.team.count();
  if (existing > 0) {
    console.log(`✅ Base de datos ya tiene datos (${existing} equipos). Seed omitido.`);
    return;
  }

  console.log('🌱 Sembrando base de datos por primera vez...');

  // -------- Usuarios --------
  console.log('👤 Creando usuarios...');
  const adminPass = await bcrypt.hash('admin123', 12);
  const demoPass  = await bcrypt.hash('demo123', 12);

  await prisma.user.createMany({
    data: [
      { name: 'Administrador', email: 'admin@quiniela.com', password: adminPass, role: 'admin' },
      { name: 'Demo User',     email: 'demo@quiniela.com',  password: demoPass,  role: 'user'  },
    ],
  });

  // -------- Equipos --------
  console.log('⚽ Creando equipos...');
  const createdTeams = [];
  for (const team of TEAMS) {
    const t = await prisma.team.create({ data: team });
    createdTeams.push(t);
  }

  // Helper: buscar equipo por nombre
  const getTeam = (name) => createdTeams.find(t => t.name === name);

  // -------- Fase de grupos --------
  console.log('📅 Creando partidos de fase de grupos...');
  const groupLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  let matchNumber = 1;

  for (let gi = 0; gi < groupLetters.length; gi++) {
    const group = groupLetters[gi];
    const groupTeams = createdTeams.filter(t => t.group === group);
    // [0]=seed1, [1]=seed2, [2]=seed3, [3]=seed4
    const [t1, t2, t3, t4] = groupTeams;
    const dates = getGroupDates(gi);
    const { city, venue } = VENUES[group];

    const groupMatches = [
      // Matchday 1
      { homeTeamId: t1.id, awayTeamId: t2.id, matchday: 1, date: dates[0] },
      { homeTeamId: t3.id, awayTeamId: t4.id, matchday: 1, date: dates[1] },
      // Matchday 2
      { homeTeamId: t1.id, awayTeamId: t3.id, matchday: 2, date: dates[2] },
      { homeTeamId: t2.id, awayTeamId: t4.id, matchday: 2, date: dates[3] },
      // Matchday 3 (simultáneo)
      { homeTeamId: t1.id, awayTeamId: t4.id, matchday: 3, date: dates[4] },
      { homeTeamId: t2.id, awayTeamId: t3.id, matchday: 3, date: dates[5] },
    ];

    for (const m of groupMatches) {
      await prisma.match.create({
        data: {
          matchNumber: matchNumber++,
          phase: 'groups',
          group,
          city,
          venue,
          status: 'pending',
          ...m,
        },
      });
    }
  }

  // -------- Fase eliminatoria --------
  console.log('🏆 Creando partidos eliminatorios...');
  for (const m of KNOCKOUT_MATCHES) {
    await prisma.match.create({
      data: {
        matchNumber: m.matchNumber,
        phase: m.phase,
        label: m.label,
        city: m.city,
        venue: m.venue,
        date: new Date(m.date),
        status: 'pending',
      },
    });
  }

  const totalMatches = await prisma.match.count();
  const totalTeams = await prisma.team.count();
  console.log(`\n✅ Seed completado:`);
  console.log(`   👕 ${totalTeams} equipos`);
  console.log(`   ⚽ ${totalMatches} partidos`);
  console.log(`   👤 Admin: admin@quiniela.com / admin123`);
  console.log(`   👤 Demo:  demo@quiniela.com  / demo123\n`);
}

main()
  .catch(e => { console.error('❌ Error en seed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
