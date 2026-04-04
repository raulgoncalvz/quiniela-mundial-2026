import { useState, useEffect } from 'react';

const PHASE_LABELS = {
  groups: 'Fase de Grupos',
  round32: 'Ronda de 32',
  round16: 'Octavos de Final',
  quarters: 'Cuartos de Final',
  semis: 'Semifinal',
  third: '3er y 4to Puesto',
  final: 'FINAL',
};

const STATUS_BADGE = {
  pending:  { label: 'Pendiente', class: 'badge-gray' },
  live:     { label: '🔴 EN VIVO', class: 'badge-red' },
  finished: { label: 'Finalizado', class: 'badge-blue' },
};

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

export default function MatchCard({ match, prediction, onSave, readOnly = false }) {
  const [homeScore, setHomeScore] = useState('');
  const [awayScore, setAwayScore] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (prediction) {
      setHomeScore(String(prediction.homeScore));
      setAwayScore(String(prediction.awayScore));
    } else {
      setHomeScore('');
      setAwayScore('');
    }
  }, [prediction]);

  const canEdit = !readOnly && match.status === 'pending';
  const homeTeam = match.homeTeam;
  const awayTeam = match.awayTeam;
  const status = STATUS_BADGE[match.status] || STATUS_BADGE.pending;

  const handleSave = async () => {
    if (homeScore === '' || awayScore === '') return;
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(match.id, parseInt(homeScore), parseInt(awayScore));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleInput = (setter) => (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 2);
    setter(val);
  };

  // Calculate points if match is finished and prediction exists
  let pointsBadge = null;
  if (match.status === 'finished' && prediction) {
    const pts = prediction.points;
    if (pts === 3) pointsBadge = { label: '+3 pts ⭐', class: 'bg-amber-100 text-amber-700' };
    else if (pts === 1) pointsBadge = { label: '+1 pt ✓', class: 'bg-blue-100 text-wc-blue' };
    else pointsBadge = { label: '0 pts ✗', class: 'bg-gray-100 text-gray-500' };
  }

  return (
    <div className={`card animate-fade-in ${match.status === 'live' ? 'ring-2 ring-wc-red ring-offset-1' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={status.class}>{status.label}</span>
          {match.group && <span className="badge badge-blue">Grupo {match.group}</span>}
          {match.phase !== 'groups' && (
            <span className="badge badge-gold">{PHASE_LABELS[match.phase]}</span>
          )}
        </div>
        {pointsBadge && (
          <span className={`badge ${pointsBadge.class} font-bold`}>{pointsBadge.label}</span>
        )}
      </div>

      {/* Teams & Score */}
      <div className="flex items-center justify-between gap-2">
        {/* Home Team */}
        <div className="flex flex-col items-center flex-1 min-w-0">
          <span className="text-3xl mb-1">{homeTeam?.flag || '🏳️'}</span>
          <span className="text-xs font-semibold text-center text-wc-dark leading-tight line-clamp-2">
            {homeTeam?.name || match.label?.split(' vs ')[0] || 'TBD'}
          </span>
        </div>

        {/* Score area */}
        <div className="flex items-center gap-1 mx-2">
          {match.status === 'finished' ? (
            /* Actual result */
            <div className="flex items-center gap-2">
              <div className="flex flex-col items-center">
                <span className="text-xs text-gray-400 mb-1">Pred.</span>
                <div className="flex items-center gap-1">
                  <span className="w-8 h-8 flex items-center justify-center text-sm font-bold bg-wc-light-bg rounded-lg text-gray-500">
                    {prediction?.homeScore ?? '–'}
                  </span>
                  <span className="text-gray-300">:</span>
                  <span className="w-8 h-8 flex items-center justify-center text-sm font-bold bg-wc-light-bg rounded-lg text-gray-500">
                    {prediction?.awayScore ?? '–'}
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-xs text-wc-blue font-semibold mb-1">Real</span>
                <div className="flex items-center gap-1">
                  <span className="w-10 h-10 flex items-center justify-center text-lg font-black bg-wc-blue text-white rounded-xl">
                    {match.homeScore}
                  </span>
                  <span className="text-wc-dark font-bold text-lg">:</span>
                  <span className="w-10 h-10 flex items-center justify-center text-lg font-black bg-wc-blue text-white rounded-xl">
                    {match.awayScore}
                  </span>
                </div>
              </div>
            </div>
          ) : canEdit ? (
            /* Prediction inputs */
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs text-gray-400">Tu pronóstico</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  className="score-input"
                  placeholder="0"
                  value={homeScore}
                  onChange={handleInput(setHomeScore)}
                  onBlur={handleSave}
                  min="0"
                  max="20"
                />
                <span className="text-gray-400 font-bold text-lg">:</span>
                <input
                  type="number"
                  className="score-input"
                  placeholder="0"
                  value={awayScore}
                  onChange={handleInput(setAwayScore)}
                  onBlur={handleSave}
                  min="0"
                  max="20"
                />
              </div>
            </div>
          ) : (
            /* Locked prediction or no prediction */
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs text-gray-400">Pronóstico</span>
              <div className="flex items-center gap-2">
                <span className="w-10 h-10 flex items-center justify-center text-lg font-black bg-wc-light-bg text-wc-dark rounded-xl">
                  {prediction?.homeScore ?? '–'}
                </span>
                <span className="text-gray-400 font-bold">:</span>
                <span className="w-10 h-10 flex items-center justify-center text-lg font-black bg-wc-light-bg text-wc-dark rounded-xl">
                  {prediction?.awayScore ?? '–'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Away Team */}
        <div className="flex flex-col items-center flex-1 min-w-0">
          <span className="text-3xl mb-1">{awayTeam?.flag || '🏳️'}</span>
          <span className="text-xs font-semibold text-center text-wc-dark leading-tight line-clamp-2">
            {awayTeam?.name || match.label?.split(' vs ')[1] || 'TBD'}
          </span>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
        <span className="text-xs text-gray-400">
          📅 {formatDate(match.date)} · {formatTime(match.date)}
        </span>
        {match.city && (
          <span className="text-xs text-gray-400 truncate ml-2">📍 {match.city}</span>
        )}
        {saving && <span className="text-xs text-wc-blue animate-pulse">Guardando...</span>}
        {saved && !saving && <span className="text-xs text-green-600">✓ Guardado</span>}
      </div>
    </div>
  );
}
