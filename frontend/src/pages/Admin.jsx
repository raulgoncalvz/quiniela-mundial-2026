import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import api from '../lib/axios';
import Spinner from '../components/Spinner';

const PHASES = [
  { key: 'groups',    label: 'Grupos' },
  { key: 'positions', label: 'Posiciones' },
  { key: 'round32',   label: 'Ronda 32' },
  { key: 'round16',   label: 'Octavos' },
  { key: 'quarters',  label: 'Cuartos' },
  { key: 'semis',     label: 'Semis' },
  { key: 'third',     label: '3er Lugar' },
  { key: 'final',     label: 'Final' },
  { key: 'scoring',   label: '⚙️ Puntos' },
];

const GROUP_LETTERS = ['A','B','C','D','E','F','G','H','I','J','K','L'];

const GROUP_TEAMS = {
  A: ['México', 'Sudáfrica', 'Corea del Sur', 'Rep. Checa'],
  B: ['Canadá', 'Bosnia-Herz.', 'Catar', 'Suiza'],
  C: ['Brasil', 'Marruecos', 'Haití', 'Escocia'],
  D: ['Estados Unidos', 'Paraguay', 'Australia', 'Turquía'],
  E: ['Alemania', 'Curazao', 'Costa de Marfil', 'Ecuador'],
  F: ['Países Bajos', 'Japón', 'Suecia', 'Túnez'],
  G: ['Bélgica', 'Egipto', 'Irán', 'Nueva Zelanda'],
  H: ['España', 'Cabo Verde', 'Arabia Saudita', 'Uruguay'],
  I: ['Francia', 'Senegal', 'Irak', 'Noruega'],
  J: ['Argentina', 'Argelia', 'Austria', 'Jordania'],
  K: ['Portugal', 'RD Congo', 'Uzbekistán', 'Colombia'],
  L: ['Inglaterra', 'Croacia', 'Ghana', 'Panamá'],
};

export default function Admin() {
  const [phase, setPhase] = useState('groups');
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState({});
  const [results, setResults] = useState({});
  const [adminGroup, setAdminGroup] = useState('A');
  const [standingForms, setStandingForms] = useState({});
  const [savingStandings, setSavingStandings] = useState(false);
  const [scoringConfigs, setScoringConfigs] = useState([]);
  const [savingScoring, setSavingScoring] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  const handleSaveStandings = async () => {
    const form = standingForms[adminGroup] || {};
    if (!form.pos1 || !form.pos2 || !form.pos3 || !form.pos4)
      return toast.error('Completa las 4 posiciones finales');
    setSavingStandings(true);
    try {
      const { data } = await api.post(`/matches/groups/${adminGroup}/standings`, form);
      toast.success(`✅ Grupo ${adminGroup}: puntos calculados para ${data.updated} usuarios`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al calcular');
    } finally {
      setSavingStandings(false);
    }
  };

  const loadScoringConfigs = async () => {
    try {
      const { data } = await api.get('/config/scoring');
      setScoringConfigs(data);
    } catch {
      toast.error('Error al cargar configuración de puntos');
    }
  };

  const handleScoringChange = (phase, field, value) => {
    setScoringConfigs(prev => prev.map(c =>
      c.phase === phase ? { ...c, [field]: value } : c
    ));
  };

  const handleSaveScoring = async () => {
    setSavingScoring(true);
    try {
      await api.put('/config/scoring', { configs: scoringConfigs });
      toast.success('✅ Configuración de puntos guardada');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    } finally {
      setSavingScoring(false);
    }
  };

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      const { data } = await api.post('/config/scoring/recalculate');
      toast.success(`✅ ${data.predictionsRecalculated} predicciones recalculadas`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al recalcular');
    } finally {
      setRecalculating(false);
    }
  };

  const loadMatches = async () => {
    if (phase === 'positions') { setLoading(false); return; }
    if (phase === 'scoring') { setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await api.get(`/matches?phase=${phase}`);
      setMatches(data);
      const init = {};
      for (const m of data) {
        init[m.id] = {
          homeScore: m.homeScore !== null ? String(m.homeScore) : '',
          awayScore: m.awayScore !== null ? String(m.awayScore) : '',
          status: m.status,
        };
      }
      setResults(init);
    } catch {
      toast.error('Error al cargar partidos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (phase === 'scoring') loadScoringConfigs();
    else loadMatches();
  }, [phase]);

  const handleResultChange = (matchId, field, value) => {
    setResults(prev => ({
      ...prev,
      [matchId]: { ...prev[matchId], [field]: value },
    }));
  };

  const handleSaveResult = async (matchId) => {
    const r = results[matchId];
    if (r.homeScore === '' || r.awayScore === '') {
      toast.error('Ingresa ambos marcadores');
      return;
    }
    setUpdating(prev => ({ ...prev, [matchId]: true }));
    try {
      await api.put(`/matches/${matchId}/result`, {
        homeScore: parseInt(r.homeScore),
        awayScore: parseInt(r.awayScore),
        status: 'finished',
      });
      setMatches(prev => prev.map(m =>
        m.id === matchId
          ? { ...m, homeScore: parseInt(r.homeScore), awayScore: parseInt(r.awayScore), status: 'finished' }
          : m
      ));
      toast.success('✅ Resultado guardado y puntos calculados');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    } finally {
      setUpdating(prev => ({ ...prev, [matchId]: false }));
    }
  };

  const handleStatusChange = async (matchId, status) => {
    try {
      await api.put(`/matches/${matchId}/status`, { status });
      setMatches(prev => prev.map(m => m.id === matchId ? { ...m, status } : m));
      setResults(prev => ({ ...prev, [matchId]: { ...prev[matchId], status } }));
      toast.success(`Estado actualizado: ${status}`);
    } catch {
      toast.error('Error al cambiar estado');
    }
  };

  const STATUS_COLORS = {
    pending: 'bg-gray-100 text-gray-600',
    live: 'bg-red-100 text-wc-red',
    finished: 'bg-blue-100 text-wc-blue',
  };

  return (
    <div className="max-w-2xl mx-auto pb-8 pt-4 px-4 min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/" className="text-wc-blue font-semibold text-sm">← Volver</Link>
        <div>
          <h1 className="text-2xl font-black text-wc-dark">🛡️ Panel Admin</h1>
          <p className="text-sm text-gray-500">Gestiona resultados del Mundial 2026</p>
        </div>
      </div>

      {/* Phase selector */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-4 px-4">
        {PHASES.map(p => (
          <button
            key={p.key}
            onClick={() => setPhase(p.key)}
            className={`flex-shrink-0 px-3 py-2 rounded-2xl text-xs font-bold transition-all ${
              phase === p.key ? 'bg-wc-red text-white' : 'bg-white text-gray-500 border border-gray-200'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* ── Posiciones finales de grupo (admin) ── */}
      {phase === 'positions' && (
        <div className="space-y-4">
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
            {GROUP_LETTERS.map(g => (
              <button key={g} onClick={() => setAdminGroup(g)}
                className={`w-9 h-9 flex-shrink-0 rounded-xl text-xs font-black transition-all ${
                  adminGroup === g ? 'bg-wc-red text-white shadow-md' : 'bg-white text-gray-500 border border-gray-200'
                }`}>{g}</button>
            ))}
          </div>

          <div className="card">
            <h3 className="font-bold text-wc-dark mb-1">Grupo {adminGroup} — Clasificación Final</h3>
            <p className="text-xs text-gray-400 mb-4">Ingresa el orden final real para calcular puntos de todos los usuarios</p>

            <div className="space-y-3">
              {[
                { pos: 'pos1', label: '🥇 1er Lugar' },
                { pos: 'pos2', label: '🥈 2do Lugar' },
                { pos: 'pos3', label: '🥉 3er Lugar' },
                { pos: 'pos4', label: '4️⃣  4to Lugar' },
              ].map(({ pos, label }) => {
                const form = standingForms[adminGroup] || {};
                const selected = form[pos] || '';
                const otherSelected = ['pos1','pos2','pos3','pos4']
                  .filter(p => p !== pos).map(p => form[p]).filter(Boolean);
                return (
                  <div key={pos}>
                    <label className="text-xs font-bold text-gray-600 block mb-1">{label}</label>
                    <select value={selected}
                      onChange={e => setStandingForms(prev => ({
                        ...prev, [adminGroup]: { ...prev[adminGroup], [pos]: e.target.value },
                      }))}
                      className="w-full text-sm rounded-xl border border-gray-200 py-2 px-3 focus:ring-2 focus:ring-wc-red outline-none bg-wc-light-bg"
                    >
                      <option value="">Seleccionar equipo</option>
                      {(GROUP_TEAMS[adminGroup] || []).map(t => (
                        <option key={t} value={t} disabled={otherSelected.includes(t)}>{t}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>

            <button onClick={handleSaveStandings} disabled={savingStandings}
              className="btn-primary w-full mt-4 flex items-center justify-center gap-2">
              {savingStandings ? <Spinner size="sm" color="white" /> : `🏆 Calcular Puntos Grupo ${adminGroup}`}
            </button>
          </div>
        </div>
      )}

      {/* ── Scoring Config ── */}
      {phase === 'scoring' && (
        <div className="space-y-4">
          <div className="card">
            <h3 className="font-bold text-wc-dark mb-1">⚙️ Sistema de Puntuación</h3>
            <p className="text-xs text-gray-400 mb-4">Define los puntos por marcador exacto y resultado correcto en cada fase</p>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-100">
                    <th className="text-left py-2 font-semibold">Fase</th>
                    <th className="text-center py-2 font-semibold">🎯 Exacto</th>
                    <th className="text-center py-2 font-semibold">✅ Resultado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {scoringConfigs.map(cfg => (
                    <tr key={cfg.phase}>
                      <td className="py-2 font-medium text-wc-dark">{cfg.label || cfg.phase}</td>
                      <td className="py-2 text-center">
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={cfg.exactScore}
                          onChange={e => handleScoringChange(cfg.phase, 'exactScore', parseInt(e.target.value) || 0)}
                          className="w-14 text-center text-sm rounded-xl border border-gray-200 py-1 px-2 focus:ring-2 focus:ring-wc-red outline-none bg-wc-light-bg font-bold text-wc-red"
                        />
                      </td>
                      <td className="py-2 text-center">
                        <input
                          type="number"
                          min="0"
                          max="20"
                          value={cfg.correctResult}
                          onChange={e => handleScoringChange(cfg.phase, 'correctResult', parseInt(e.target.value) || 0)}
                          className="w-14 text-center text-sm rounded-xl border border-gray-200 py-1 px-2 focus:ring-2 focus:ring-wc-blue outline-none bg-wc-light-bg font-bold text-wc-blue"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button onClick={handleSaveScoring} disabled={savingScoring}
              className="btn-primary w-full mt-4 flex items-center justify-center gap-2">
              {savingScoring ? <Spinner size="sm" color="white" /> : '💾 Guardar Configuración'}
            </button>
          </div>

          <div className="card border border-amber-200 bg-amber-50">
            <h3 className="font-bold text-amber-800 mb-1">🔄 Recalcular Puntos</h3>
            <p className="text-xs text-amber-700 mb-3">
              Aplica la configuración actual a todos los partidos ya finalizados. Útil si cambiaste los puntos después de guardar resultados.
            </p>
            <button onClick={handleRecalculate} disabled={recalculating}
              className="w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm transition-all flex items-center justify-center gap-2">
              {recalculating ? <Spinner size="sm" color="white" /> : '⚡ Recalcular Todos los Puntos'}
            </button>
          </div>
        </div>
      )}

      {phase !== 'positions' && phase !== 'scoring' && loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : phase !== 'positions' && phase !== 'scoring' && matches.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <p>No hay partidos en esta fase</p>
        </div>
      ) : phase !== 'positions' && phase !== 'scoring' ? (
        <div className="space-y-4">
          {matches.map(match => {
            const r = results[match.id] || {};
            const homeTeam = match.homeTeam;
            const awayTeam = match.awayTeam;

            return (
              <div key={match.id} className="card">
                {/* Match header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-500">
                      #{match.matchNumber}
                    </span>
                    {match.group && (
                      <span className="badge badge-blue">Grupo {match.group}</span>
                    )}
                    {match.label && (
                      <span className="badge badge-gold text-xs">{match.label}</span>
                    )}
                  </div>
                  <select
                    value={r.status || match.status}
                    onChange={e => handleStatusChange(match.id, e.target.value)}
                    className={`text-xs font-bold px-2 py-1 rounded-lg border-0 outline-none cursor-pointer ${STATUS_COLORS[r.status] || STATUS_COLORS.pending}`}
                  >
                    <option value="pending">Pendiente</option>
                    <option value="live">En Vivo</option>
                    <option value="finished">Finalizado</option>
                  </select>
                </div>

                {/* Teams & score input */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 text-center">
                    <span className="text-2xl">{homeTeam?.flag || '🏳️'}</span>
                    <p className="text-xs font-semibold text-wc-dark mt-1 leading-tight">
                      {homeTeam?.name || match.label?.split(' vs ')[0] || 'TBD'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="20"
                      placeholder="0"
                      value={r.homeScore || ''}
                      onChange={e => handleResultChange(match.id, 'homeScore', e.target.value.replace(/\D/g, '').slice(0,2))}
                      className="score-input"
                    />
                    <span className="text-gray-400 font-bold">:</span>
                    <input
                      type="number"
                      min="0"
                      max="20"
                      placeholder="0"
                      value={r.awayScore || ''}
                      onChange={e => handleResultChange(match.id, 'awayScore', e.target.value.replace(/\D/g, '').slice(0,2))}
                      className="score-input"
                    />
                  </div>

                  <div className="flex-1 text-center">
                    <span className="text-2xl">{awayTeam?.flag || '🏳️'}</span>
                    <p className="text-xs font-semibold text-wc-dark mt-1 leading-tight">
                      {awayTeam?.name || match.label?.split(' vs ')[1] || 'TBD'}
                    </p>
                  </div>
                </div>

                {/* Date & save */}
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
                  <span className="text-xs text-gray-400">
                    {new Date(match.date).toLocaleDateString('es-ES', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                  </span>
                  <button
                    onClick={() => handleSaveResult(match.id)}
                    disabled={updating[match.id]}
                    className="btn-primary py-1.5 px-4 text-xs flex items-center gap-1"
                  >
                    {updating[match.id] ? <Spinner size="sm" color="white" /> : '💾 Guardar resultado'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
