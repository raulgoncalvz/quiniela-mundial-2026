import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import api from '../lib/axios';
import Spinner from '../components/Spinner';

const PHASES = [
  { key: 'groups',   label: 'Grupos' },
  { key: 'round32',  label: 'Ronda 32' },
  { key: 'round16',  label: 'Octavos' },
  { key: 'quarters', label: 'Cuartos' },
  { key: 'semis',    label: 'Semis' },
  { key: 'third',    label: '3er Lugar' },
  { key: 'final',    label: 'Final' },
];

export default function Admin() {
  const [phase, setPhase] = useState('groups');
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState({});
  const [results, setResults] = useState({});

  const loadMatches = async () => {
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

  useEffect(() => { loadMatches(); }, [phase]);

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

      {/* Matches */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : matches.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <p>No hay partidos en esta fase</p>
        </div>
      ) : (
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
