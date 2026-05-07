// Fix knockout match labels — corrects wrong labels from old seeds.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CORRECT_LABELS = [
  // Ronda de 32 (labels = slots de grupo que clasifican)
  { matchNumber: 73,  label: '2A vs 2B'    },
  { matchNumber: 74,  label: '1E vs 3ABCDF'  },
  { matchNumber: 75,  label: '1F vs 2C'      },
  { matchNumber: 76,  label: '1C vs 2F'      },
  { matchNumber: 77,  label: '1I vs 3CDFGH'  },
  { matchNumber: 78,  label: '2E vs 2I'      },
  { matchNumber: 79,  label: '1A vs 3CEFHI'  },
  { matchNumber: 80,  label: '1L vs 3EHIJK'  },
  { matchNumber: 81,  label: '1D vs 3BEFIJ'  },
  { matchNumber: 82,  label: '1G vs 3AEHIJ'  },
  { matchNumber: 83,  label: '2K vs 2L'      },
  { matchNumber: 84,  label: '1H vs 2J'      },
  { matchNumber: 85,  label: '1B vs 3EFGIJ'  },
  { matchNumber: 86,  label: '1J vs 2H'      },
  { matchNumber: 87,  label: '1K vs 3DEIJL'  },
  { matchNumber: 88,  label: '2D vs 2G'    },
  // Octavos de final (labels = ganadores de Ronda 32)
  { matchNumber: 89,  label: 'W74 vs W77'  },
  { matchNumber: 90,  label: 'W73 vs W75'  },
  { matchNumber: 91,  label: 'W76 vs W78'  },
  { matchNumber: 92,  label: 'W79 vs W80'  },
  { matchNumber: 93,  label: 'W83 vs W84'  },
  { matchNumber: 94,  label: 'W81 vs W82'  },
  { matchNumber: 95,  label: 'W86 vs W88'  },
  { matchNumber: 96,  label: 'W85 vs W87'  },
  // Cuartos de final
  { matchNumber: 97,  label: 'W89 vs W90'  },
  { matchNumber: 98,  label: 'W93 vs W94'  },
  { matchNumber: 99,  label: 'W91 vs W92'  },
  { matchNumber: 100, label: 'W95 vs W96'  },
  // Semifinales
  { matchNumber: 101, label: 'W97 vs W98'  },
  { matchNumber: 102, label: 'W99 vs W100' },
  // 3er puesto y Final
  { matchNumber: 103, label: 'L101 vs L102' },
  { matchNumber: 104, label: 'W101 vs W102' },
];

async function main() {
  let updated = 0;
  for (const { matchNumber, label } of CORRECT_LABELS) {
    const existing = await prisma.match.findUnique({ where: { matchNumber } });
    if (!existing) { console.log(`⚠️  Partido ${matchNumber} no encontrado`); continue; }
    if (existing.label === label) continue;
    await prisma.match.update({ where: { matchNumber }, data: { label } });
    updated++;
    console.log(`✅ M${matchNumber}: "${existing.label}" → "${label}"`);
  }
  if (updated === 0) console.log('fix-labels: todos los labels ya son correctos');
  else console.log(`fix-labels: ${updated} labels actualizados`);
}

main()
  .catch(e => { console.error('❌ Error en fix-labels:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
