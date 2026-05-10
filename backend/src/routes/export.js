const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const ExcelJS = require('exceljs');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const { getUserPredictedAdvancement } = require('../utils/bracketSimulation');

const prisma = new PrismaClient();

// ── Paleta ───────────────────────────────────────────────────────────
const C = {
  blue:      '003DA5',
  red:       'C0392B',
  gold:      'D4AC0D',
  green:     '1E8449',
  lightBlue: 'D6E4F7',
  lightGray: 'F2F3F4',
  gray:      'AAAAAA',
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
const GROUP_LETTERS  = ['A','B','C','D','E','F','G','H','I','J','K','L'];
const KNOCKOUT_ORDER = ['round32','round16','quarters','semis','third','final'];

// ── Helpers ──────────────────────────────────────────────────────────
const border = {
  top:    { style: 'thin', color: { argb: 'FFCCCCCC' } },
  left:   { style: 'thin', color: { argb: 'FFCCCCCC' } },
  bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
  right:  { style: 'thin', color: { argb: 'FFCCCCCC' } },
};

function hStyle(bg, fg = C.white, sz = 10) {
  return {
    font: { bold: true, color: { argb: 'FF' + fg }, size: sz, name: 'Calibri' },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bg } },
    alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
    border,
  };
}

function dStyle(bg = C.white, fg = C.dark, bold = false, align = 'center') {
  return {
    font: { bold, color: { argb: 'FF' + fg }, size: 10, name: 'Calibri' },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bg } },
    alignment: { horizontal: align, vertical: 'middle' },
    border,
  };
}

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
  sheet.getRow(3).height = 6;
}

function setCell(sheet, row, col, value, style, height = 18) {
  const c = sheet.getCell(row, col);
  c.value = value;
  c.style = style;
  if (height) sheet.getRow(row).height = height;
}

function sectionHeader(sheet, row, label, cols, color) {
  sheet.mergeCells(row, 1, row, cols);
  const c = sheet.getCell(row, 1);
  c.value = label;
  c.style = hStyle(color || C.red);
  sheet.getRow(row).height = 16;
}

// ── GET /api/export/excel ────────────────────────────────────────────
router.get('/excel', auth, admin, async (req, res) => {
  try {
    // 1. Datos base ───────────────────────────────────────────────────
    const [users, matches, allPreds, groupPreds, champPreds] = await Promise.all([
      prisma.user.findMany({ where: { role: { not: 'admin' } }, orderBy: { name: 'asc' } }),
      prisma.match.findMany({ include: { homeTeam: true, awayTeam: true }, orderBy: { matchNumber: 'asc' } }),
      prisma.prediction.findMany(),
      prisma.groupPrediction.findMany(),
      prisma.championPrediction.findMany(),
    ]);

    const predMap = {};
    for (const p of allPreds) {
      if (!predMap[p.userId]) predMap[p.userId] = {};
      predMap[p.userId][p.matchId] = p;
    }
    const gpMap = {};
    for (const gp of groupPreds) {
      if (!gpMap[gp.userId]) gpMap[gp.userId] = {};
      gpMap[gp.userId][gp.group] = gp;
    }
    const cpMap = {};
    for (const cp of champPreds) cpMap[cp.userId] = cp;

    const matchByNumber = {};
    for (const m of matches) matchByNumber[m.matchNumber] = m;

    const groupMatches    = matches.filter(m => m.phase === 'groups');
    const knockoutMatches = matches.filter(m => m.phase !== 'groups');

    // 2. Workbook ─────────────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    wb.creator  = 'Quiniela Mundial FIFA 2026';
    wb.created  = new Date();
    wb.modified = new Date();

    // ════════════════════════════════════════════════════════════════
    // HOJA 1 — PARTICIPANTES
    // ════════════════════════════════════════════════════════════════
    const ws1   = wb.addWorksheet('👥 Participantes');
    const cols1 = 5;
    applyTitle(ws1, '👥 PARTICIPANTES — ESTADO DE PRONÓSTICOS', cols1);

    ['Participante', 'Partidos Pronosticados', 'Total', '% Completado', 'Apuestas Especiales'].forEach((h, i) => {
      const c = ws1.getCell(4, i + 1);
      c.value = h;
      c.style = hStyle(C.blue);
    });
    ws1.getRow(4).height = 22;
    ws1.columns = [{ width: 30 }, { width: 22 }, { width: 10 }, { width: 16 }, { width: 20 }];

    users.forEach((u, idx) => {
      const myPreds = Object.keys(predMap[u.id] || {}).length;
      const total   = matches.length;
      const pct     = total > 0 ? Math.round((myPreds / total) * 100) : 0;
      const hasChamp = !!(cpMap[u.id]?.champion);
      const bg = idx % 2 === 0 ? C.white : C.lightGray;
      const row = ws1.getRow(5 + idx);
      row.height = 20;

      [
        { v: u.name,          s: dStyle(bg, C.dark, true, 'left') },
        { v: `${myPreds} / ${total}`, s: dStyle(bg) },
        { v: total,           s: dStyle(bg) },
        { v: `${pct}%`,       s: pct === 100 ? dStyle(C.green, C.white, true) : pct > 50 ? dStyle('E67E22', C.white, true) : dStyle(C.red, C.white, true) },
        { v: hasChamp ? '✓ Completa' : '— Sin llenar', s: hasChamp ? dStyle(C.green, C.white, true) : dStyle('EEEEEE', C.gray) },
      ].forEach((c, i) => { row.getCell(i + 1).value = c.v; row.getCell(i + 1).style = c.s; });
    });
    ws1.protect('Mundial2026', { selectLockedCells: true, selectUnlockedCells: false });

    // ════════════════════════════════════════════════════════════════
    // HOJA 2 — FASE DE GRUPOS (grid comparativo)
    // ════════════════════════════════════════════════════════════════
    const ws2   = wb.addWorksheet('⚽ Grupos', { views: [{ state: 'frozen', xSplit: 4, ySplit: 4 }] });
    const cols2 = 4 + users.length;
    applyTitle(ws2, '⚽ FASE DE GRUPOS — PRONÓSTICOS COMPARATIVOS', cols2);

    ['#', 'Local', 'Visitante', 'Fecha'].concat(users.map(u => u.name)).forEach((h, i) => {
      const c = ws2.getCell(4, i + 1);
      c.value = h;
      c.style = hStyle(C.blue);
    });
    ws2.getRow(4).height = 24;
    ws2.columns = [{ width: 5 }, { width: 22 }, { width: 22 }, { width: 11 }, ...users.map(() => ({ width: 12 }))];

    let r2 = 5;
    for (const grp of GROUP_LETTERS) {
      sectionHeader(ws2, r2, `GRUPO ${grp}`, cols2, C.red);
      r2++;
      for (const m of groupMatches.filter(mx => mx.group === grp)) {
        const fecha = new Date(m.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
        const bg    = r2 % 2 === 0 ? C.white : C.lightGray;
        [
          { v: m.matchNumber,                                         s: dStyle(bg, C.dark, true) },
          { v: `${m.homeTeam?.flag||''} ${m.homeTeam?.name||'TBD'}`, s: dStyle(bg, C.dark, false, 'left') },
          { v: `${m.awayTeam?.flag||''} ${m.awayTeam?.name||'TBD'}`, s: dStyle(bg, C.dark, false, 'left') },
          { v: fecha,                                                  s: dStyle(bg) },
        ].forEach((c, i) => { ws2.getCell(r2, i+1).value = c.v; ws2.getCell(r2, i+1).style = c.s; });

        users.forEach((u, ui) => {
          const pred = predMap[u.id]?.[m.id];
          const cell = ws2.getCell(r2, 5 + ui);
          cell.value = pred ? `${pred.homeScore} - ${pred.awayScore}` : '—';
          cell.style = predStyle(!!pred);
        });
        ws2.getRow(r2).height = 18;
        r2++;
      }
    }
    ws2.protect('Mundial2026', { selectLockedCells: true, selectUnlockedCells: false });

    // ════════════════════════════════════════════════════════════════
    // HOJA 3 — APUESTAS ESPECIALES
    // ════════════════════════════════════════════════════════════════
    const ws3   = wb.addWorksheet('🎯 Apuestas Especiales');
    const cols3 = 8;
    applyTitle(ws3, '🎯 APUESTAS ESPECIALES', cols3);

    ['Participante','🥇 Campeón','🥈 Finalista','🥉 3er Lugar','⚽ Bota de Oro','🌟 Balón de Oro','🧤 Mejor Portero','Estado'].forEach((h, i) => {
      const c = ws3.getCell(4, i + 1);
      c.value = h;
      c.style = hStyle(C.blue);
    });
    ws3.getRow(4).height = 24;
    ws3.columns = [{ width: 28 },{ width: 18 },{ width: 18 },{ width: 18 },{ width: 20 },{ width: 20 },{ width: 20 },{ width: 13 }];

    users.sort((a,b) => a.name.localeCompare(b.name)).forEach((u, idx) => {
      const cp  = cpMap[u.id];
      const bg  = idx % 2 === 0 ? C.white : C.lightGray;
      const hasAll = cp?.champion && cp?.runnerUp && cp?.third && cp?.topScorer && cp?.bestPlayer && cp?.bestGoalkeeper;
      const hasSome = !!(cp?.champion);
      const estado = !hasSome ? 'Sin llenar' : hasAll ? 'Completa' : 'Parcial';
      const row = ws3.getRow(5 + idx);
      row.height = 20;
      [
        { v: u.name,                  s: dStyle(bg, C.dark, true, 'left') },
        { v: cp?.champion||'—',       s: predStyle(!!cp?.champion) },
        { v: cp?.runnerUp||'—',       s: predStyle(!!cp?.runnerUp) },
        { v: cp?.third||'—',          s: predStyle(!!cp?.third) },
        { v: cp?.topScorer||'—',      s: predStyle(!!cp?.topScorer) },
        { v: cp?.bestPlayer||'—',     s: predStyle(!!cp?.bestPlayer) },
        { v: cp?.bestGoalkeeper||'—', s: predStyle(!!cp?.bestGoalkeeper) },
        { v: estado, s: !hasSome ? dStyle(C.red,C.white,true) : hasAll ? dStyle(C.green,C.white,true) : dStyle('E67E22',C.white,true) },
      ].forEach((c, i) => { row.getCell(i + 1).value = c.v; row.getCell(i + 1).style = c.s; });
    });
    ws3.protect('Mundial2026', { selectLockedCells: true, selectUnlockedCells: false });

    // ════════════════════════════════════════════════════════════════
    // HOJAS POR USUARIO — Bracket completo con llaves derivadas
    // ════════════════════════════════════════════════════════════════
    for (const u of users) {
      // Nombre de hoja: máx 31 chars, sin caracteres inválidos
      const sheetName = u.name.replace(/[\\/*?:[\]]/g, '').slice(0, 31);
      const wsU = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 4 }] });
      const cols = 5;

      applyTitle(wsU, `🗂️ ${u.name.toUpperCase()} — BRACKET COMPLETO`, cols);

      ['#', 'Local', '', 'Visitante', 'Pronóstico'].forEach((h, i) => {
        const c = wsU.getCell(4, i + 1);
        c.value = h;
        c.style = hStyle(C.blue);
      });
      wsU.getRow(4).height = 22;
      wsU.columns = [{ width: 5 }, { width: 24 }, { width: 5 }, { width: 24 }, { width: 14 }];

      let rU = 5;

      // ── GRUPOS ───────────────────────────────────────────────────
      for (const grp of GROUP_LETTERS) {
        sectionHeader(wsU, rU, `GRUPO ${grp}`, cols, C.red);
        rU++;

        for (const m of groupMatches.filter(mx => mx.group === grp)) {
          const pred = predMap[u.id]?.[m.id];
          const bg   = rU % 2 === 0 ? C.white : C.lightGray;
          setCell(wsU, rU, 1, m.matchNumber, dStyle(bg, C.dark, true));
          setCell(wsU, rU, 2, `${m.homeTeam?.flag||''} ${m.homeTeam?.name||'TBD'}`, dStyle(bg, C.dark, false, 'left'));
          setCell(wsU, rU, 3, 'vs', dStyle(bg, C.gray));
          setCell(wsU, rU, 4, `${m.awayTeam?.flag||''} ${m.awayTeam?.name||'TBD'}`, dStyle(bg, C.dark, false, 'left'));
          setCell(wsU, rU, 5, pred ? `${pred.homeScore} - ${pred.awayScore}` : '—', predStyle(!!pred));
          rU++;
        }

        // Posiciones de grupo del usuario
        const gp = gpMap[u.id]?.[grp];
        wsU.mergeCells(rU, 1, rU, cols);
        const posc = wsU.getCell(rU, 1);
        posc.value = gp?.pos1
          ? `📊 Pos: 1°${gp.pos1}  2°${gp.pos2}  3°${gp.pos3}  4°${gp.pos4}`
          : '📊 Posiciones: sin pronosticar';
        posc.style = {
          font: { italic: true, size: 9, color: { argb: 'FF555555' }, name: 'Calibri' },
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECF0F1' } },
          alignment: { horizontal: 'left', vertical: 'middle' },
          border,
        };
        wsU.getRow(rU).height = 14;
        rU++;

        // Fila en blanco entre grupos
        wsU.getRow(rU).height = 6;
        rU++;
      }

      // ── ELIMINATORIAS con bracket derivado ───────────────────────
      // Obtener bracket simulado para este usuario
      let bbn = {};
      try {
        const sim = await getUserPredictedAdvancement(u.id, prisma);
        bbn = sim.matchTeams || {};
      } catch (e) {
        console.warn(`Bracket simulation failed for user ${u.id}:`, e.message);
      }

      for (const ph of KNOCKOUT_ORDER) {
        const phMatches = knockoutMatches.filter(m => m.phase === ph);
        if (phMatches.length === 0) continue;

        sectionHeader(wsU, rU, PHASE_LABEL[ph]?.toUpperCase() || ph.toUpperCase(), cols, PHASE_COLORS[ph] || C.blue);
        rU++;

        for (const m of phMatches) {
          const slot = bbn[m.matchNumber];
          const home = slot?.home ? `${slot.home.flag||''} ${slot.home.name}` : '⚪ Por definir';
          const away = slot?.away ? `${slot.away.flag||''} ${slot.away.name}` : '⚪ Por definir';
          const pred = predMap[u.id]?.[m.id];
          const bg   = rU % 2 === 0 ? C.white : C.lightGray;

          let predTxt = '—';
          if (pred) {
            predTxt = `${pred.homeScore} - ${pred.awayScore}`;
            if (pred.penaltyWinner) predTxt += pred.penaltyWinner === 'home' ? ' (←pen)' : ' (pen→)';
          }

          setCell(wsU, rU, 1, m.matchNumber, dStyle(bg, C.dark, true));
          setCell(wsU, rU, 2, home, dStyle(bg, C.dark, false, 'left'));
          setCell(wsU, rU, 3, 'vs', dStyle(bg, C.gray));
          setCell(wsU, rU, 4, away, dStyle(bg, C.dark, false, 'left'));
          setCell(wsU, rU, 5, predTxt, predStyle(!!pred));
          rU++;
        }
        wsU.getRow(rU).height = 6;
        rU++;
      }

      // ── APUESTAS ESPECIALES al final de la hoja ──────────────────
      sectionHeader(wsU, rU, '🎯 APUESTAS ESPECIALES', cols, C.gold.length === 6 ? C.gold : 'B7950B');
      rU++;

      const cp = cpMap[u.id];
      [
        ['🥇 Campeón',     cp?.champion],
        ['🥈 Finalista',   cp?.runnerUp],
        ['🥉 3er Lugar',   cp?.third],
        ['⚽ Bota de Oro', cp?.topScorer],
        ['🌟 Balón de Oro',cp?.bestPlayer],
        ['🧤 Mejor Portero',cp?.bestGoalkeeper],
      ].forEach(([label, val]) => {
        wsU.mergeCells(rU, 1, rU, 2);
        setCell(wsU, rU, 1, label, dStyle(C.lightGray, C.dark, true, 'left'));
        wsU.mergeCells(rU, 3, rU, cols);
        setCell(wsU, rU, 3, val || '—', predStyle(!!val));
        wsU.getRow(rU).height = 18;
        rU++;
      });

      wsU.protect('Mundial2026', { selectLockedCells: true, selectUnlockedCells: false });
    }

    // ── Enviar ────────────────────────────────────────────────────────
    const filename = `Quiniela Mundial FIFA 2026 - Pronósticos Oficiales.xlsx`;
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
