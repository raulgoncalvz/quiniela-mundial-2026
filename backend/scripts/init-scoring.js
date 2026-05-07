// Ensure scoring configs exist for all phases.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DEFAULT_CONFIGS = [
  { phase: 'groups',         label: 'Fase de Grupos',     exactScore: 3,  correctResult: 1 },
  { phase: 'round32',        label: 'Ronda de 32',         exactScore: 4,  correctResult: 2 },
  { phase: 'round16',        label: 'Octavos de Final',    exactScore: 5,  correctResult: 2 },
  { phase: 'quarters',       label: 'Cuartos de Final',    exactScore: 6,  correctResult: 3 },
  { phase: 'semis',          label: 'Semifinales',          exactScore: 7,  correctResult: 3 },
  { phase: 'third',          label: 'Tercer Lugar',         exactScore: 6,  correctResult: 3 },
  { phase: 'final',          label: 'Final',                exactScore: 10, correctResult: 5 },
  { phase: 'bet_champion',   label: 'Campeón',              exactScore: 15, correctResult: 0 },
  { phase: 'bet_runnerUp',   label: 'Finalista',            exactScore: 10, correctResult: 0 },
  { phase: 'bet_third',      label: '3er Lugar Apuesta',    exactScore: 5,  correctResult: 0 },
  { phase: 'bet_topScorer',  label: 'Bota de Oro',          exactScore: 5,  correctResult: 0 },
  { phase: 'bet_bestPlayer', label: 'Balón de Oro',         exactScore: 5,  correctResult: 0 },
  { phase: 'bet_goalkeeper', label: 'Mejor Portero',        exactScore: 5,  correctResult: 0 },
];

async function main() {
  let created = 0;
  for (const cfg of DEFAULT_CONFIGS) {
    const existing = await prisma.scoringConfig.findUnique({ where: { phase: cfg.phase } });
    if (!existing) {
      await prisma.scoringConfig.create({ data: cfg });
      console.log(`✅ ScoringConfig creado: ${cfg.phase} (exacto=${cfg.exactScore}, correcto=${cfg.correctResult})`);
      created++;
    }
  }
  if (created === 0) console.log('init-scoring: todos los configs ya existen');
  else console.log(`init-scoring: ${created} configs creados`);
}

main()
  .catch(e => { console.error('❌ Error en init-scoring:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
