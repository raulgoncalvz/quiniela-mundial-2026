const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const ExcelJS = require('exceljs');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

const prisma = new PrismaClient();

// ── Paleta ───────────────────────────────────────────────────────────
const C = {
  blue:      '003DA5',
  red:       'C0392B',
  gold:      'D4AC0D',
  green:     '1E8449',
  lightBlue: 'D6E4F7',
  paleGold:  'FEF9E7',
  gray:      'AAAAAA',
  lightGray: 'F2F3F4',
  white:     'FFFFFF',
  dark:      '1A1A2E',
};

const PHASE_LABEL = {
  groups: 'Fase de Grupos', round32: 'Ronda de 32', round16: 'Octavos de Final',
  quarters: 'Cuartos de Final', semis: 'Semifinales', third: '3er Lugar', final: 'Final',
};

const PHASE_COLORS = {
  round32: '1F618D', round16: '117A65', quarters: '6C3483',
  semis: 'B7950B', third: '935116', final: C.red,
};

const GROUP_LETTERS = ['A','B','C','D','E','F','G','H','I','J','K','L'];

// ── Helpers ──────────────────────────────────────────────────────────
const thinBorder = {
  top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
  left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
  bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
  right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
};

function hStyle(bgHex, textHex = C.white, size = 10) {
  return {
    font: { bold: true, color: { argb: 'FF' + textHex }, size, name: 'Calibri' },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bgHex } },
    alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
    border: thinBorder,
  };
}

function dStyle(bgHex = C.white, textHex = C.dark, bold = false, align = 'center') {
  return {
    font: { bold, color: { argb: 'FF' + textHex }, size: 10, name: 'Calibri' },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bgHex } },
    alignment: { horizontal: align, vertical: 'middle' },
    border: thinBorder,
  };
}

// Estilo para celda de pronóstico: azul claro si tiene, gris si no
function predStyle(hasPred) {
  return hasPred ? dStyle(C.lightBlue, C.dark, true) : dStyle('EEEEEE', C.gray);
}

function applyTitle(sheet, title, cols) {
  const now = new Date().toLocaleString('es-ES', { dateStyle: 'full', timeStyle: 'short' });

  sheet.mergeCells(1, 1, 1, cols);
  const t = sheet.getCell(1, 1);
  t.value = title;
  t.style = {
    font: { bold: true, size: 14, color: { argb: 'FF' + C.white }, name: 'Calibri' },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + C.blue } },
    alignment: { horizontal: 'center', vertical: 'middle' },
  };
  sheet.getRow(1).height = 30;

  sheet.mergeCells(2, 1, 2, cols);
  const s = sheet.getCell(2, 1);
  s.value = `📅 Generado el ${now}  ·  Registro oficial de pronósticos — Quiniela Mundial FIFA 2026`;
  s.style = {
    font: { italic: true, size: 9, color: { argb: 'FF555555' }, name: 'Calibri' },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9C4' } },
    alignment: { horizontal: 'center', vertical: 'middle' },
  };
  sheet.getRow(2).height = 15;

  // Fila vacía de separación
  sheet.getRow(3).height = 6;
}

// ── GET /api/export/excel ────────────────────────────────────────────
router.get('/excel', auth, admin, async (req, res) => {
  try {
    // ── 1. Datos ─────────────────────────────────────────────────────
    const [users, matches, allPreds, groupPreds, champPreds] = await Promise.all([
      prisma.user.findMany({ where: { role: { not: 'admin' } }, orderBy: { name: 'asc' } }),
      prisma.match.findMany({ include: { homeTeam: true, awayTeam: true }, orderBy: { matchNumber: 'asc' } }),
      prisma.prediction.findMany(),
      prisma.groupPrediction.findMany(),
      prisma.championPrediction.findMany(),
    ]);

    // Maps de acceso rápido
    const predMap = {};   // userId → matchId → prediction
    for (const p of allPreds) {
      if (!predMap[p.userId]) predMap[p.userId] = {};
      predMap[p.userId][p.matchId] = p;
    }
    const gpMap = {};     // userId → group → groupPrediction
    for (const gp of groupPreds) {
      if (!gpMap[gp.userId]) gpMap[gp.userId] = {};
      gpMap[gp.userId][gp.group] = gp;
    }
    const cpMap = {};     // userId → championPrediction
    for (const cp of champPreds) cpMap[cp.userId] = cp;

    const groupMatches    = matches.filter(m => m.phase === 'groups');
    const knockoutMatches = matches.filter(m => m.phase !== 'groups');
    const PHASE_ORDER     = ['round32', 'round16', 'quarters', 'semis', 'third', 'final'];

    // Cuántos partidos pronosticó cada usuario (para el resumen)
    const userStats = users.map(u => {
      const myPreds   = Object.keys(predMap[u.id] || {}).length;
      const hasChamp  = !!(cpMap[u.id]?.champion);
      const hasGroups = Object.keys(gpMap[u.id] || {}).length;
      const total     = matches.length;
      const pct       = total > 0 ? Math.round((myPreds / total) * 100) : 0;
      return { ...u, myPreds, hasChamp, hasGroups, total, pct };
    }).sort((a, b) => b.myPreds - a.myPreds);

    // ── 2. Workbook ───────────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    wb.creator  = 'Quiniela Mundial FIFA 2026';
    wb.created  = new Date();
    wb.modified = new Date();

    // ════════════════════════════════════════════════════════════════
    // HOJA 1 — PARTICIPANTES
    // ════════════════════════════════════════════════════════════════
    const ws1 = wb.addWorksheet('👥 Participantes');
    const cols1 = 6;
    applyTitle(ws1, '👥 PARTICIPANTES — ESTADO DE PRONÓSTICOS', cols1);

    ws1.getRow(4).height = 22;
    ['Participante', 'Partidos\nPronosticados', 'Total\nPartidos', 'Completado', 'Posiciones\nde Grupo', 'Apuestas\nEspeciales'].forEach((h, i) => {
      const c = ws1.getCell(4, i + 1);
      c.value = h;
      c.style = hStyle(C.blue);
    });
    ws1.columns = [{ width: 30 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 18 }, { width: 18 }];

    userStats.forEach((u, idx) => {
      const row = ws1.getRow(5 + idx);
      row.height = 20;
      const bg = idx % 2 === 0 ? C.white : C.lightGray;
      const complete = u.pct === 100;

      [
        { v: u.name,      s: dStyle(bg, C.dark, true, 'left') },
        { v: `${u.myPreds} / ${u.total}`, s: dStyle(bg) },
        { v: u.total,     s: dStyle(bg) },
        { v: `${u.pct}%`, s: complete ? dStyle(C.green, C.white, true) : dStyle(u.pct > 50 ? 'F39C12' : C.red, C.white, true) },
        { v: u.hasGroups ? '✓' : '—', s: u.hasGroups ? dStyle(C.green, C.white, true) : dStyle('EEEEEE', C.gray) },
        { v: u.hasChamp  ? '✓' : '—', s: u.hasChamp  ? dStyle(C.green, C.white, true) : dStyle('EEEEEE', C.gray) },
      ].forEach((c, i) => {
        const cell = row.getCell(i + 1);
        cell.value = c.v;
        cell.style = c.s;
      });
    });

    ws1.protect('Mundial2026', { selectLockedCells: true, selectUnlockedCells: false });

    // ════════════════════════════════════════════════════════════════
    // HOJA 2 — FASE DE GRUPOS
    // ════════════════════════════════════════════════════════════════
    const ws2 = wb.addWorksheet('⚽ Fase de Grupos', { views: [{ state: 'frozen', xSplit: 4, ySplit: 4 }] });
    const cols2 = 4 + users.length;
    applyTitle(ws2, '⚽ FASE DE GRUPOS — PRONÓSTICOS', cols2);

    ws2.getRow(4).height = 24;
    ['#', 'Local', 'Visitante', 'Fecha'].concat(users.map(u => u.name)).forEach((h, i) => {
      const c = ws2.getCell(4, i + 1);
      c.value = h;
      c.style = hStyle(C.blue);
    });
    ws2.columns = [
      { width: 5 }, { width: 22 }, { width: 22 }, { width: 13 },
      ...users.map(() => ({ width: 12 })),
    ];

    let r2 = 5;
    for (const grp of GROUP_LETTERS) {
      // Separador de grupo
      ws2.mergeCells(r2, 1, r2, cols2);
      const gc = ws2.getCell(r2, 1);
      gc.value = `GRUPO ${grp}`;
      gc.style = hStyle(C.red);
      ws2.getRow(r2).height = 16;
      r2++;

      for (const m of groupMatches.filter(mx => mx.group === grp)) {
        const fecha = new Date(m.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
        const bg    = r2 % 2 === 0 ? C.white : C.lightGray;

        [
          { v: m.matchNumber,                                                  s: dStyle(bg, C.dark, true) },
          { v: `${m.homeTeam?.flag||''} ${m.homeTeam?.name||'TBD'}`,          s: dStyle(bg, C.dark, false, 'left') },
          { v: `${m.awayTeam?.flag||''} ${m.awayTeam?.name||'TBD'}`,          s: dStyle(bg, C.dark, false, 'left') },
          { v: fecha,                                                           s: dStyle(bg) },
        ].forEach((c, i) => { ws2.getCell(r2, i+1).value = c.v; ws2.getCell(r2, i+1).style = c.s; });

        users.forEach((u, ui) => {
          const pred = predMap[u.id]?.[m.id];
          const cell = ws2.getCell(r2, 5 + ui);
          if (pred) {
            cell.value = `${pred.homeScore} - ${pred.awayScore}`;
            cell.style = predStyle(true);
          } else {
            cell.value = '—';
            cell.style = predStyle(false);
          }
        });

        ws2.getRow(r2).height = 18;
        r2++;
      }
    }

    ws2.protect('Mundial2026', { selectLockedCells: true, selectUnlockedCells: false });

    // ════════════════════════════════════════════════════════════════
    // HOJA 3 — POSICIONES DE GRUPO
    // ════════════════════════════════════════════════════════════════
    const ws3 = wb.addWorksheet('📋 Posiciones de Grupo', { views: [{ state: 'frozen', xSplit: 1, ySplit: 4 }] });
    const cols3 = 5 + users.length;
    applyTitle(ws3, '📋 POSICIONES DE GRUPO PRONOSTICADAS', cols3);

    ws3.getRow(4).height = 22;
    ['Grupo', '1° Lugar', '2° Lugar', '3° Lugar', '4° Lugar'].concat(users.map(u => u.name)).forEach((h, i) => {
      const c = ws3.getCell(4, i + 1);
      c.value = h;
      c.style = hStyle(C.blue);
    });
    ws3.columns = [
      { width: 8 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 20 },
      ...users.map(() => ({ width: 16 })),
    ];

    // Una fila por grupo (posiciones como columnas fijas), una columna por usuario
    let r3 = 5;
    for (const grp of GROUP_LETTERS) {
      const bg = r3 % 2 === 0 ? C.white : C.lightGray;
      ws3.getCell(r3, 1).value = `Grupo ${grp}`;
      ws3.getCell(r3, 1).style = dStyle(C.red, C.white, true);

      // Mostramos las columnas de posiciones reales vacías (aún sin resultados)
      [2,3,4,5].forEach(col => {
        ws3.getCell(r3, col).value = '—';
        ws3.getCell(r3, col).style = dStyle(C.lightGray, C.gray);
      });

      users.forEach((u, ui) => {
        const gp = gpMap[u.id]?.[grp];
        const cell = ws3.getCell(r3, 6 + ui);
        if (gp?.pos1) {
          cell.value = `${gp.pos1} / ${gp.pos2} / ${gp.pos3} / ${gp.pos4}`;
          cell.style = predStyle(true);
        } else {
          cell.value = '—';
          cell.style = predStyle(false);
        }
      });

      ws3.getRow(r3).height = 18;
      r3++;
    }

    ws3.protect('Mundial2026', { selectLockedCells: true, selectUnlockedCells: false });

    // ════════════════════════════════════════════════════════════════
    // HOJA 4 — ELIMINATORIAS
    // ════════════════════════════════════════════════════════════════
    const ws4 = wb.addWorksheet('🏆 Eliminatorias', { views: [{ state: 'frozen', xSplit: 3, ySplit: 4 }] });
    const cols4 = 3 + users.length;
    applyTitle(ws4, '🏆 ELIMINATORIAS — PRONÓSTICOS', cols4);

    ws4.getRow(4).height = 24;
    ['#', 'Partido', 'Fase'].concat(users.map(u => u.name)).forEach((h, i) => {
      const c = ws4.getCell(4, i + 1);
      c.value = h;
      c.style = hStyle(C.blue);
    });
    ws4.columns = [
      { width: 5 }, { width: 32 }, { width: 14 },
      ...users.map(() => ({ width: 12 })),
    ];

    let r4 = 5;
    for (const ph of PHASE_ORDER) {
      const phMatches = knockoutMatches.filter(m => m.phase === ph);
      if (phMatches.length === 0) continue;

      ws4.mergeCells(r4, 1, r4, cols4);
      const phc = ws4.getCell(r4, 1);
      phc.value = PHASE_LABEL[ph]?.toUpperCase() || ph.toUpperCase();
      phc.style = hStyle(PHASE_COLORS[ph] || C.blue);
      ws4.getRow(r4).height = 16;
      r4++;

      for (const m of phMatches) {
        const home = m.homeTeam ? `${m.homeTeam.flag||''} ${m.homeTeam.name}` : (m.label?.split(' vs ')[0] || 'TBD');
        const away = m.awayTeam ? `${m.awayTeam.flag||''} ${m.awayTeam.name}` : (m.label?.split(' vs ')[1] || 'TBD');
        const bg   = r4 % 2 === 0 ? C.white : C.lightGray;

        [
          { v: m.matchNumber,            s: dStyle(bg, C.dark, true) },
          { v: `${home}  vs  ${away}`,   s: dStyle(bg, C.dark, false, 'left') },
          { v: PHASE_LABEL[ph] || ph,    s: dStyle(bg) },
        ].forEach((c, i) => { ws4.getCell(r4, i+1).value = c.v; ws4.getCell(r4, i+1).style = c.s; });

        users.forEach((u, ui) => {
          const pred = predMap[u.id]?.[m.id];
          const cell = ws4.getCell(r4, 4 + ui);
          if (pred) {
            let txt = `${pred.homeScore} - ${pred.awayScore}`;
            if (pred.penaltyWinner) txt += pred.penaltyWinner === 'home' ? ' (←pen)' : ' (pen→)';
            cell.value = txt;
            cell.style = predStyle(true);
          } else {
            cell.value = '—';
            cell.style = predStyle(false);
          }
        });

        ws4.getRow(r4).height = 18;
        r4++;
      }
    }

    ws4.protect('Mundial2026', { selectLockedCells: true, selectUnlockedCells: false });

    // ════════════════════════════════════════════════════════════════
    // HOJA 5 — APUESTAS ESPECIALES
    // ════════════════════════════════════════════════════════════════
    const ws5 = wb.addWorksheet('🎯 Apuestas Especiales');
    const cols5 = 8;
    applyTitle(ws5, '🎯 APUESTAS ESPECIALES', cols5);

    ws5.getRow(4).height = 24;
    ['Participante', '🥇 Campeón', '🥈 Finalista', '🥉 3er Lugar', '⚽ Bota de Oro', '🌟 Balón de Oro', '🧤 Mejor Portero', 'Estado'].forEach((h, i) => {
      const c = ws5.getCell(4, i + 1);
      c.value = h;
      c.style = hStyle(C.blue);
    });
    ws5.columns = [
      { width: 28 }, { width: 18 }, { width: 18 }, { width: 18 },
      { width: 20 }, { width: 20 }, { width: 20 }, { width: 12 },
    ];

    users.sort((a,b) => a.name.localeCompare(b.name)).forEach((u, idx) => {
      const cp  = cpMap[u.id];
      const row = ws5.getRow(5 + idx);
      row.height = 20;
      const bg  = idx % 2 === 0 ? C.white : C.lightGray;

      const hasAll = cp?.champion && cp?.runnerUp && cp?.third && cp?.topScorer && cp?.bestPlayer && cp?.bestGoalkeeper;
      const hasSome = cp?.champion || cp?.runnerUp || cp?.third;
      const estado = !hasSome ? 'Sin llenar' : hasAll ? 'Completa' : 'Parcial';
      const estadoStyle = !hasSome
        ? dStyle('E74C3C', C.white, true)
        : hasAll ? dStyle(C.green, C.white, true) : dStyle('E67E22', C.white, true);

      [
        { v: u.name,                   s: dStyle(bg, C.dark, true, 'left') },
        { v: cp?.champion       || '—', s: predStyle(!!cp?.champion) },
        { v: cp?.runnerUp       || '—', s: predStyle(!!cp?.runnerUp) },
        { v: cp?.third          || '—', s: predStyle(!!cp?.third) },
        { v: cp?.topScorer      || '—', s: predStyle(!!cp?.topScorer) },
        { v: cp?.bestPlayer     || '—', s: predStyle(!!cp?.bestPlayer) },
        { v: cp?.bestGoalkeeper || '—', s: predStyle(!!cp?.bestGoalkeeper) },
        { v: estado,                    s: estadoStyle },
      ].forEach((c, i) => {
        const cell = row.getCell(i + 1);
        cell.value = c.v;
        cell.style = c.s;
      });
    });

    ws5.protect('Mundial2026', { selectLockedCells: true, selectUnlockedCells: false });

    // ── Enviar ────────────────────────────────────────────────────────
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
