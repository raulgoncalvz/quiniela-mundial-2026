const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const ExcelJS = require('exceljs');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

const prisma = new PrismaClient();

// ── Colores ─────────────────────────────────────────────────────────
const C = {
  blue:      '003DA5',
  red:       'C0392B',
  gold:      'F4C430',
  green:     '27AE60',
  amber:     'E67E22',
  gray:      'BDC3C7',
  lightGray: 'F2F3F4',
  darkText:  '1A1A2E',
  white:     'FFFFFF',
};

const PHASE_LABEL = {
  groups: 'Fase de Grupos', round32: 'Ronda de 32', round16: 'Octavos',
  quarters: 'Cuartos', semis: 'Semis', third: '3er Lugar', final: 'Final',
};

// ── Helpers de estilo ───────────────────────────────────────────────
function headerStyle(bgHex, textHex = C.white, size = 11) {
  return {
    font: { bold: true, color: { argb: 'FF' + textHex }, size, name: 'Calibri' },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bgHex } },
    alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
    border: {
      top: { style: 'thin', color: { argb: 'FFAAAAAA' } },
      left: { style: 'thin', color: { argb: 'FFAAAAAA' } },
      bottom: { style: 'thin', color: { argb: 'FFAAAAAA' } },
      right: { style: 'thin', color: { argb: 'FFAAAAAA' } },
    },
  };
}

function cellStyle(bgHex, textHex = C.darkText, bold = false) {
  return {
    font: { bold, color: { argb: 'FF' + textHex }, size: 10, name: 'Calibri' },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bgHex } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: {
      top: { style: 'hair', color: { argb: 'FFDDDDDD' } },
      left: { style: 'hair', color: { argb: 'FFDDDDDD' } },
      bottom: { style: 'hair', color: { argb: 'FFDDDDDD' } },
      right: { style: 'hair', color: { argb: 'FFDDDDDD' } },
    },
  };
}

function predStyle(points, hasPred, hasResult) {
  if (!hasPred) return cellStyle('EEEEEE', 'AAAAAA');
  if (!hasResult) return cellStyle('F8F9FA', C.darkText);   // partido no jugado aún
  if (points >= 3) return cellStyle('1E8449', C.white, true); // exacto
  if (points >= 1) return cellStyle('F39C12', C.white, true); // resultado correcto
  return cellStyle('E74C3C', C.white);                         // incorrecto
}

function applyTitle(sheet, text, cols) {
  sheet.mergeCells(1, 1, 1, cols);
  const tc = sheet.getCell(1, 1);
  tc.value = text;
  tc.style = {
    font: { bold: true, size: 14, color: { argb: 'FF' + C.white }, name: 'Calibri' },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + C.blue } },
    alignment: { horizontal: 'center', vertical: 'middle' },
  };
  sheet.getRow(1).height = 28;

  sheet.mergeCells(2, 1, 2, cols);
  const sc = sheet.getCell(2, 1);
  sc.value = `Generado el ${new Date().toLocaleString('es-ES', { dateStyle: 'full', timeStyle: 'short' })} — Quiniela Mundial FIFA 2026`;
  sc.style = {
    font: { italic: true, size: 9, color: { argb: 'FF666666' } },
    alignment: { horizontal: 'center', vertical: 'middle' },
  };
  sheet.getRow(2).height = 16;
}

// ── GET /api/export/excel ────────────────────────────────────────────
router.get('/excel', auth, admin, async (req, res) => {
  try {
    // ── 1. Cargar datos ──────────────────────────────────────────────
    const [users, matches, allPreds, groupPreds, champPreds] = await Promise.all([
      prisma.user.findMany({ where: { role: { not: 'admin' } }, orderBy: { name: 'asc' } }),
      prisma.match.findMany({ include: { homeTeam: true, awayTeam: true }, orderBy: { matchNumber: 'asc' } }),
      prisma.prediction.findMany(),
      prisma.groupPrediction.findMany(),
      prisma.championPrediction.findMany(),
    ]);

    // Mapa de predicciones: userId → matchId → prediction
    const predMap = {};
    for (const p of allPreds) {
      if (!predMap[p.userId]) predMap[p.userId] = {};
      predMap[p.userId][p.matchId] = p;
    }

    // Mapa de apuestas de grupo: userId → group → groupPrediction
    const groupPredMap = {};
    for (const gp of groupPreds) {
      if (!groupPredMap[gp.userId]) groupPredMap[gp.userId] = {};
      groupPredMap[gp.userId][gp.group] = gp;
    }

    // Mapa de apuestas especiales: userId → championPrediction
    const champMap = {};
    for (const cp of champPreds) champMap[cp.userId] = cp;

    // Ranking calculado
    const ranked = users.map(u => {
      const myPreds = Object.values(predMap[u.id] || {});
      const myGroupPreds = Object.values(groupPredMap[u.id] || {});
      const cp = champMap[u.id];
      const finishedPreds = myPreds.filter(p => {
        const m = matches.find(m => m.id === p.matchId);
        return m?.status === 'finished';
      });
      const matchPoints = finishedPreds.reduce((s, p) => s + (p.points || 0), 0);
      const groupPoints = myGroupPreds.reduce((s, p) => s + (p.points || 0), 0);
      const champPoints = cp?.points || 0;
      const exactScores = finishedPreds.filter(p => {
        const m = matches.find(m => m.id === p.matchId);
        return m && p.homeScore === m.homeScore && p.awayScore === m.awayScore;
      }).length;
      return {
        ...u,
        matchPoints, groupPoints, champPoints,
        totalPoints: matchPoints + groupPoints + champPoints,
        exactScores,
        totalPredictions: myPreds.length,
      };
    }).sort((a, b) => b.totalPoints - a.totalPoints || b.exactScores - a.exactScores);

    const groupMatches    = matches.filter(m => m.phase === 'groups');
    const knockoutMatches = matches.filter(m => m.phase !== 'groups');
    const GROUP_LETTERS   = ['A','B','C','D','E','F','G','H','I','J','K','L'];

    // ── 2. Crear workbook ────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    wb.creator  = 'Quiniela Mundial 2026';
    wb.created  = new Date();
    wb.modified = new Date();

    // ════════════════════════════════════════════════════════════════
    // HOJA 1 — RESUMEN GENERAL
    // ════════════════════════════════════════════════════════════════
    const ws1 = wb.addWorksheet('📊 Resumen', { views: [{ state: 'frozen', ySplit: 4 }] });
    const cols1 = 8;
    applyTitle(ws1, '🏆 QUINIELA MUNDIAL FIFA 2026 — RANKING GENERAL', cols1);

    const rankHeaders = ['Pos', 'Participante', 'Pts Partidos', 'Pts Posiciones', 'Pts Especiales', 'TOTAL', 'Exactos', 'Predicciones'];
    ws1.getRow(3).height = 24;
    rankHeaders.forEach((h, i) => {
      const cell = ws1.getCell(3, i + 1);
      cell.value = h;
      cell.style = headerStyle(C.blue);
    });

    ws1.columns = [
      { width: 6 }, { width: 28 }, { width: 16 }, { width: 18 },
      { width: 18 }, { width: 12 }, { width: 10 }, { width: 14 },
    ];

    ranked.forEach((u, idx) => {
      const row = ws1.getRow(4 + idx);
      row.height = 20;
      const bg = idx % 2 === 0 ? C.white : C.lightGray;
      const pos = idx + 1;
      const medal = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : `#${pos}`;

      [medal, u.name, u.matchPoints, u.groupPoints, u.champPoints, u.totalPoints, u.exactScores, u.totalPredictions]
        .forEach((v, i) => {
          const cell = row.getCell(i + 1);
          cell.value = v;
          const isTotalCol = i === 5;
          cell.style = isTotalCol
            ? headerStyle(C.gold, C.darkText, 12)
            : cellStyle(bg, C.darkText, i === 1);
        });
    });

    ws1.protect('Mundial2026', { selectLockedCells: true, selectUnlockedCells: false });

    // ════════════════════════════════════════════════════════════════
    // HOJA 2 — FASE DE GRUPOS
    // ════════════════════════════════════════════════════════════════
    const ws2 = wb.addWorksheet('⚽ Fase de Grupos', { views: [{ state: 'frozen', xSplit: 4, ySplit: 4 }] });
    const cols2 = 5 + users.length;
    applyTitle(ws2, '⚽ FASE DE GRUPOS — PRONÓSTICOS', cols2);

    const groupRowHeaders = ['#', 'Local', 'Visitante', 'Resultado\nReal'];
    ws2.getRow(3).height = 24;
    groupRowHeaders.forEach((h, i) => {
      const cell = ws2.getCell(3, i + 1);
      cell.value = h;
      cell.style = headerStyle(C.blue);
    });
    users.forEach((u, i) => {
      const cell = ws2.getCell(3, 5 + i);
      cell.value = u.name;
      cell.style = headerStyle(C.blue);
    });

    ws2.columns = [
      { width: 5 }, { width: 20 }, { width: 20 }, { width: 12 },
      ...users.map(() => ({ width: 13 })),
    ];

    let row2 = 4;
    for (const grp of GROUP_LETTERS) {
      // Encabezado de grupo
      ws2.mergeCells(row2, 1, row2, cols2);
      const gc = ws2.getCell(row2, 1);
      gc.value = `GRUPO ${grp}`;
      gc.style = headerStyle(C.red);
      ws2.getRow(row2).height = 18;
      row2++;

      const gMatches = groupMatches.filter(m => m.group === grp);
      for (const m of gMatches) {
        const realResult = m.status === 'finished' && m.homeScore !== null
          ? `${m.homeScore} - ${m.awayScore}`
          : '—';
        const rowBg = row2 % 2 === 0 ? C.white : C.lightGray;

        const cells = [
          { v: m.matchNumber, style: cellStyle(rowBg, C.darkText, true) },
          { v: `${m.homeTeam?.flag || ''} ${m.homeTeam?.name || 'TBD'}`, style: { ...cellStyle(rowBg), alignment: { horizontal: 'left', vertical: 'middle' } } },
          { v: `${m.awayTeam?.flag || ''} ${m.awayTeam?.name || 'TBD'}`, style: { ...cellStyle(rowBg), alignment: { horizontal: 'left', vertical: 'middle' } } },
          { v: realResult, style: m.status === 'finished' ? cellStyle('1A5276', C.white, true) : cellStyle(rowBg) },
        ];
        cells.forEach((c, i) => {
          const cell = ws2.getCell(row2, i + 1);
          cell.value = c.v;
          cell.style = c.style;
        });

        users.forEach((u, ui) => {
          const pred = predMap[u.id]?.[m.id];
          const cell = ws2.getCell(row2, 5 + ui);
          if (pred) {
            cell.value = `${pred.homeScore} - ${pred.awayScore}`;
            cell.style = predStyle(pred.points || 0, true, m.status === 'finished');
          } else {
            cell.value = '—';
            cell.style = predStyle(0, false, false);
          }
        });

        ws2.getRow(row2).height = 18;
        row2++;
      }
    }

    ws2.protect('Mundial2026', { selectLockedCells: true, selectUnlockedCells: false });

    // ════════════════════════════════════════════════════════════════
    // HOJA 3 — ELIMINATORIAS
    // ════════════════════════════════════════════════════════════════
    const ws3 = wb.addWorksheet('🏆 Eliminatorias', { views: [{ state: 'frozen', xSplit: 4, ySplit: 4 }] });
    const cols3 = 5 + users.length;
    applyTitle(ws3, '🏆 ELIMINATORIAS — PRONÓSTICOS', cols3);

    const elim3Headers = ['#', 'Local', 'Visitante', 'Resultado\nReal'];
    ws3.getRow(3).height = 24;
    elim3Headers.forEach((h, i) => {
      const cell = ws3.getCell(3, i + 1);
      cell.value = h;
      cell.style = headerStyle(C.blue);
    });
    users.forEach((u, i) => {
      const cell = ws3.getCell(3, 5 + i);
      cell.value = u.name;
      cell.style = headerStyle(C.blue);
    });

    ws3.columns = [
      { width: 5 }, { width: 22 }, { width: 22 }, { width: 14 },
      ...users.map(() => ({ width: 13 })),
    ];

    const PHASE_ORDER = ['round32', 'round16', 'quarters', 'semis', 'third', 'final'];
    const PHASE_COLORS = { round32: '1F618D', round16: '117A65', quarters: '884EA0', semis: 'B7950B', third: '935116', final: C.red };

    let row3 = 4;
    for (const ph of PHASE_ORDER) {
      const phMatches = knockoutMatches.filter(m => m.phase === ph);
      if (phMatches.length === 0) continue;

      ws3.mergeCells(row3, 1, row3, cols3);
      const pc = ws3.getCell(row3, 1);
      pc.value = PHASE_LABEL[ph]?.toUpperCase() || ph.toUpperCase();
      pc.style = headerStyle(PHASE_COLORS[ph] || C.blue);
      ws3.getRow(row3).height = 18;
      row3++;

      for (const m of phMatches) {
        const homeName = m.homeTeam ? `${m.homeTeam.flag || ''} ${m.homeTeam.name}` : (m.label?.split(' vs ')[0] || 'TBD');
        const awayName = m.awayTeam ? `${m.awayTeam.flag || ''} ${m.awayTeam.name}` : (m.label?.split(' vs ')[1] || 'TBD');
        let realResult = '—';
        if (m.status === 'finished' && m.homeScore !== null) {
          realResult = `${m.homeScore} - ${m.awayScore}`;
          if (m.penaltyWinner) realResult += ` (pen ${m.penaltyWinner === 'home' ? '←' : '→'})`;
        }

        const rowBg = row3 % 2 === 0 ? C.white : C.lightGray;
        [
          { v: m.matchNumber, style: cellStyle(rowBg, C.darkText, true) },
          { v: homeName, style: { ...cellStyle(rowBg), alignment: { horizontal: 'left', vertical: 'middle' } } },
          { v: awayName, style: { ...cellStyle(rowBg), alignment: { horizontal: 'left', vertical: 'middle' } } },
          { v: realResult, style: m.status === 'finished' ? cellStyle('1A5276', C.white, true) : cellStyle(rowBg) },
        ].forEach((c, i) => {
          const cell = ws3.getCell(row3, i + 1);
          cell.value = c.v;
          cell.style = c.style;
        });

        users.forEach((u, ui) => {
          const pred = predMap[u.id]?.[m.id];
          const cell = ws3.getCell(row3, 5 + ui);
          if (pred) {
            let txt = `${pred.homeScore} - ${pred.awayScore}`;
            if (pred.penaltyWinner) txt += pred.penaltyWinner === 'home' ? ' (←)' : ' (→)';
            cell.value = txt;
            cell.style = predStyle(pred.points || 0, true, m.status === 'finished');
          } else {
            cell.value = '—';
            cell.style = predStyle(0, false, false);
          }
        });

        ws3.getRow(row3).height = 18;
        row3++;
      }
    }

    ws3.protect('Mundial2026', { selectLockedCells: true, selectUnlockedCells: false });

    // ════════════════════════════════════════════════════════════════
    // HOJA 4 — POSICIONES DE GRUPO
    // ════════════════════════════════════════════════════════════════
    const ws4 = wb.addWorksheet('📋 Posiciones de Grupo', { views: [{ state: 'frozen', xSplit: 2, ySplit: 4 }] });
    const cols4 = 7 + users.length;
    applyTitle(ws4, '📋 POSICIONES DE GRUPO PRONOSTICADAS', cols4);

    ['Grupo', 'Pos', '1°', '2°', '3°', '4°', 'Pts'].concat(users.map(u => u.name)).forEach((h, i) => {
      const cell = ws4.getCell(3, i + 1);
      cell.value = h;
      cell.style = headerStyle(C.blue);
    });
    ws4.getRow(3).height = 22;
    ws4.columns = [
      { width: 8 }, { width: 5 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 8 },
      ...users.map(() => ({ width: 16 })),
    ];

    let row4 = 4;
    for (const grp of GROUP_LETTERS) {
      // Real standings (pos 1-4) for this group
      const grpMatches = groupMatches.filter(m => m.group === grp && m.status === 'finished');
      ws4.mergeCells(row4, 1, row4, cols4);
      const gh = ws4.getCell(row4, 1);
      gh.value = `GRUPO ${grp}`;
      gh.style = headerStyle(C.red);
      ws4.getRow(row4).height = 16;
      row4++;

      const rowBg = row4 % 2 === 0 ? C.white : C.lightGray;
      // Real positions row
      [grp, 'Real', '1°', '2°', '3°', '4°', ''].forEach((v, i) => {
        const cell = ws4.getCell(row4, i + 1);
        cell.value = v;
        cell.style = headerStyle('2E4057', C.white, 10);
      });
      // Users don't have a real "position" column per user for real standings, skip
      users.forEach((_, ui) => {
        const cell = ws4.getCell(row4, 8 + ui);
        cell.style = headerStyle('2E4057');
      });
      ws4.getRow(row4).height = 16;
      row4++;

      // Users' predictions for this group
      users.forEach((u, ui) => {
        const gp = groupPredMap[u.id]?.[grp];
        const r = row4 + ui;
        const bg = ui % 2 === 0 ? C.white : C.lightGray;

        ws4.getCell(r, 1).value = grp;       ws4.getCell(r, 1).style = cellStyle(bg, C.darkText, true);
        ws4.getCell(r, 2).value = u.name;    ws4.getCell(r, 2).style = { ...cellStyle(bg), alignment: { horizontal: 'left', vertical: 'middle' } };
        ws4.getCell(r, 3).value = gp?.pos1 || '—'; ws4.getCell(r, 3).style = cellStyle(bg);
        ws4.getCell(r, 4).value = gp?.pos2 || '—'; ws4.getCell(r, 4).style = cellStyle(bg);
        ws4.getCell(r, 5).value = gp?.pos3 || '—'; ws4.getCell(r, 5).style = cellStyle(bg);
        ws4.getCell(r, 6).value = gp?.pos4 || '—'; ws4.getCell(r, 6).style = cellStyle(bg);
        ws4.getCell(r, 7).value = gp?.points ?? 0;
        ws4.getCell(r, 7).style = gp?.points > 0 ? cellStyle(C.green, C.white, true) : cellStyle(bg);
        ws4.getRow(r).height = 18;
      });
      row4 += users.length;
    }

    ws4.protect('Mundial2026', { selectLockedCells: true, selectUnlockedCells: false });

    // ════════════════════════════════════════════════════════════════
    // HOJA 5 — APUESTAS ESPECIALES
    // ════════════════════════════════════════════════════════════════
    const ws5 = wb.addWorksheet('🎯 Apuestas Especiales');
    const cols5 = 9;
    applyTitle(ws5, '🎯 APUESTAS ESPECIALES', cols5);

    const specialHeaders = ['Participante', '🥇 Campeón', '🥈 Finalista', '🥉 3er Lugar', '⚽ Bota de Oro', '🌟 Balón de Oro', '🧤 Mejor Portero', 'Pts', 'Estado'];
    ws5.getRow(3).height = 24;
    specialHeaders.forEach((h, i) => {
      const cell = ws5.getCell(3, i + 1);
      cell.value = h;
      cell.style = headerStyle(C.blue);
    });
    ws5.columns = [
      { width: 26 }, { width: 18 }, { width: 18 }, { width: 18 },
      { width: 20 }, { width: 20 }, { width: 20 }, { width: 8 }, { width: 14 },
    ];

    ranked.forEach((u, idx) => {
      const cp = champMap[u.id];
      const row = ws5.getRow(4 + idx);
      row.height = 20;
      const bg = idx % 2 === 0 ? C.white : C.lightGray;
      const hasAny = cp?.champion || cp?.runnerUp || cp?.third;
      const estado = !hasAny ? 'Sin llenar' : cp.topScorer ? 'Completa' : 'Parcial';

      [
        { v: u.name, s: { ...cellStyle(bg, C.darkText, true), alignment: { horizontal: 'left', vertical: 'middle' } } },
        { v: cp?.champion || '—', s: cellStyle(bg) },
        { v: cp?.runnerUp || '—', s: cellStyle(bg) },
        { v: cp?.third || '—', s: cellStyle(bg) },
        { v: cp?.topScorer || '—', s: cellStyle(bg) },
        { v: cp?.bestPlayer || '—', s: cellStyle(bg) },
        { v: cp?.bestGoalkeeper || '—', s: cellStyle(bg) },
        { v: cp?.points ?? 0, s: cp?.points > 0 ? cellStyle(C.green, C.white, true) : cellStyle(bg) },
        { v: estado, s: estado === 'Completa' ? cellStyle('1E8449', C.white) : estado === 'Parcial' ? cellStyle('E67E22', C.white) : cellStyle('E74C3C', C.white) },
      ].forEach((c, i) => {
        const cell = row.getCell(i + 1);
        cell.value = c.v;
        cell.style = c.s;
      });
    });

    ws5.protect('Mundial2026', { selectLockedCells: true, selectUnlockedCells: false });

    // ── Proteger estructura del workbook ─────────────────────────────
    wb.views = [{ activeTab: 0 }];

    // ── Enviar archivo ───────────────────────────────────────────────
    const filename = `Quiniela-Mundial-2026-${new Date().toISOString().slice(0,10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error('Error generando Excel:', err);
    res.status(500).json({ error: 'Error al generar el archivo Excel' });
  }
});

module.exports = router;
