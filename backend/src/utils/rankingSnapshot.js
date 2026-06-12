'use strict';
const { computeRanking } = require('./computeRanking');

// "Foto" en memoria de las posiciones del ranking, usada para mostrar las
// flechitas de subida/bajada durante una ventana de tiempo tras cargar un
// resultado. Es efímera a propósito: si el servidor reinicia, las flechitas
// simplemente desaparecen (que es justo lo que deben hacer pasados 15 min).
const WINDOW_MS = 15 * 60 * 1000; // 15 minutos

let snapshot = null; // { takenAt: number, positions: { [userId]: position } }

function isActive() {
  return !!snapshot && (Date.now() - snapshot.takenAt) < WINDOW_MS;
}

// Toma una foto de las posiciones actuales SOLO si no hay una ventana activa.
// Así, varios resultados cargados dentro de la misma ventana siguen
// comparándose contra la foto original (el movimiento se acumula).
// Debe llamarse ANTES de recalcular puntos, para capturar el estado previo.
async function captureIfExpired() {
  if (isActive()) return;
  try {
    const ranking = await computeRanking();
    const positions = {};
    for (const u of ranking) positions[u.id] = u.position;
    snapshot = { takenAt: Date.now(), positions };
  } catch (err) {
    console.error('Error capturando foto de ranking:', err.message);
  }
}

// Devuelve la foto solo si la ventana sigue activa; si expiró, null (sin flechitas).
function getActiveSnapshot() {
  return isActive() ? snapshot : null;
}

module.exports = { captureIfExpired, getActiveSnapshot, WINDOW_MS };
