import { useEffect, useState, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import api from '../lib/axios';
import MatchCard from '../components/MatchCard';
import Spinner from '../components/Spinner';

const PHASES = [
  { key: 'groups',  label: 'Grupos',    icon: '⚽' },
  { key: 'round32', label: 'Ronda 32',  icon: '🔵' },
  { key: 'round16', label: 'Octavos',   icon: '⚡' },
  { key: 'quarters',label: 'Cuartos',   icon: '🔥' },
  { key: 'semis',   label: 'Semis',     icon: '💥' },
  { key: 'third',   label: '3er Lugar', icon: '🥉' },
  { key: 'final',   label: 'Final',     icon: '🏆' },
];

const GROUP_LETTERS = ['A','B','C','D','E','F','G','H','I','J','K','L'];

const TEAMS_LIST = [
  'Argentina','Alemania','Arabia Saudita','Argelia','Australia','Austria','Bélgica',
  'Bosnia-Herz.','Brasil','Canadá','Catar','Cabo Verde','Corea del Sur','Costa de Marfil',
  'Croacia','Curazao','Ecuador','Egipto','Escocia','España','Estados Unidos','Francia',
  'Ghana','Haití','Inglaterra','Irak','Irán','Japón','Jordania','México','Marruecos',
  'Noruega','Nueva Zelanda','Países Bajos','Panamá','Paraguay','Portugal','RD Congo',
  'Rep. Checa','Senegal','Sudáfrica','Suecia','Suiza','Turquía','Túnez','Uruguay','Uzbekistán',
].sort();

export default function Quiniela() {
  const [activePhase, setActivePhase] = useState('groups');
  const [activeGroup, setActiveGroup] = useState('A');
  const [matches, setMatches] = useState([]);
  const [predictions, setPredictions] = useState({}); // { matchId: prediction }
  const [champion, setChampion] = useState(null);
  const [champForm, setChampForm] = useState({ champion:'', runnerUp:'', third:'', topScorer1:'', topScorer2:'', topScorer3:'', bestPlayer1:'', bestPlayer2:'', bestPlayer3:'' });
  const [loading, setLoading] = useState(true);
  const [savingChamp, setSavingChamp] = useState(false);
  const [progress, setProgress] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ phase: activePhase });
      if (activePhase === 'groups') params.set('group', activeGroup);

      const [matchRes, predRes, champRes] = await Promise.all([
        api.get(`/matches?${params}`),
        api.get('/predictions'),
        api.get('/predictions/champion'),
      ]);

      setMatches(matchRes.data);

      const predMap = {};
      for (const p of predRes.data) predMap[p.matchId] = p;
      setPredictions(predMap);

      if (champRes.data) {
        setChampion(champRes.data);
        setChampForm(champRes.data);
      }

      // Progress for group stage
      if (activePhase === 'groups') {
        const total = matchRes.data.filter(m => m.status === 'pending').length;
        const done = matchRes.data.filter(m => m.status === 'pending' && predMap[m.id]).length;
        setProgress(total > 0 ? Math.round((done / total) * 100) : 100);
      }
    } catch (err) {
      toast.error('Error al cargar los datos');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [activePhase, activeGroup]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSavePrediction = async (matchId, homeScore, awayScore) => {
    try {
      const { data } = await api.post('/predictions', { matchId, homeScore, awayScore });
      setPredictions(prev => ({ ...prev, [matchId]: data }));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
      throw err;
    }
  };

  const handleSaveChampion = async e => {
    e.preventDefault();
    setSavingChamp(true);
    try {
      const { data } = await api.post('/predictions/champion', champForm);
      setChampion(data);
      toast.success('¡Apuesta especial guardada! 🏆');
    } catch (err) {
      toast.error('Error al guardar');
    } finally {
      setSavingChamp(false);
    }
  };

  const pending = matches.filter(m => m.status === 'pending');
  const predicted = pending.filter(m => predictions[m.id]);

  return (
    <div className="page-container page-enter">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-black text-wc-dark">⚽ Mi Quiniela</h1>
        <p className="text-sm text-gray-500">Predice los marcadores antes de cada partido</p>
      </div>

      {/* Phase tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-4 px-4 scrollbar-hide">
        {PHASES.map(phase => (
          <button
            key={phase.key}
            onClick={() => setActivePhase(phase.key)}
            className={`flex-shrink-0 px-3 py-2 rounded-2xl text-xs font-bold transition-all ${
              activePhase === phase.key
                ? 'bg-wc-blue text-white shadow-wc'
                : 'bg-white text-gray-500 border border-gray-200'
            }`}
          >
            {phase.icon} {phase.label}
          </button>
        ))}
      </div>

      {/* Group sub-tabs (only for groups phase) */}
      {activePhase === 'groups' && (
        <>
          <div className="flex gap-2 overflow-x-auto pb-2 mb-3 -mx-4 px-4">
            {GROUP_LETTERS.map(g => (
              <button
                key={g}
                onClick={() => setActiveGroup(g)}
                className={`w-9 h-9 flex-shrink-0 rounded-xl text-xs font-black transition-all ${
                  activeGroup === g
                    ? 'bg-wc-red text-white shadow-md'
                    : 'bg-white text-gray-500 border border-gray-200'
                }`}
              >
                {g}
              </button>
            ))}
          </div>

          {/* Progress bar */}
          {pending.length > 0 && (
            <div className="mb-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Progreso Grupo {activeGroup}</span>
                <span>{predicted.length}/{pending.length} pronósticos</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-wc-gradient-soft rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* Matches */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : matches.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">📋</p>
          <p className="font-semibold">No hay partidos disponibles</p>
          <p className="text-sm mt-1">Los partidos de esta fase se confirmarán conforme avance el torneo.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {matches.map(match => (
            <MatchCard
              key={match.id}
              match={match}
              prediction={predictions[match.id]}
              onSave={handleSavePrediction}
            />
          ))}
        </div>
      )}

      {/* Apuestas especiales / Champion prediction */}
      <div className="mt-8">
        <h2 className="section-title">🏆 Apuestas Especiales</h2>
        <form onSubmit={handleSaveChampion} className="card space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              { key: 'champion', label: '🥇 Campeón' },
              { key: 'runnerUp', label: '🥈 Finalista' },
              { key: 'third',    label: '🥉 3er Lugar' },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="text-xs font-bold text-gray-600 block mb-1">{label}</label>
                <select
                  value={champForm[key]}
                  onChange={e => setChampForm(f => ({ ...f, [key]: e.target.value }))}
                  className="w-full text-xs rounded-xl border border-gray-200 py-2 px-2 focus:ring-2 focus:ring-wc-blue focus:border-transparent outline-none bg-wc-light-bg"
                >
                  <option value="">Seleccionar</option>
                  {TEAMS_LIST.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            ))}
          </div>

          <div className="border-t pt-4">
            <p className="text-xs font-bold text-gray-600 mb-3">⚽ Bota de Oro (Goleadores)</p>
            <div className="space-y-2">
              {[
                { key: 'topScorer1', label: '1er Goleador' },
                { key: 'topScorer2', label: '2do Goleador' },
                { key: 'topScorer3', label: '3er Goleador' },
              ].map(({ key, label }) => (
                <input
                  key={key}
                  type="text"
                  placeholder={label}
                  value={champForm[key]}
                  onChange={e => setChampForm(f => ({ ...f, [key]: e.target.value }))}
                  className="input-field text-sm py-2"
                />
              ))}
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-xs font-bold text-gray-600 mb-3">🌟 Balón de Oro (Mejores Jugadores)</p>
            <div className="space-y-2">
              {[
                { key: 'bestPlayer1', label: 'Mejor Jugador' },
                { key: 'bestPlayer2', label: '2do Mejor Jugador' },
                { key: 'bestPlayer3', label: '3er Mejor Jugador' },
              ].map(({ key, label }) => (
                <input
                  key={key}
                  type="text"
                  placeholder={label}
                  value={champForm[key]}
                  onChange={e => setChampForm(f => ({ ...f, [key]: e.target.value }))}
                  className="input-field text-sm py-2"
                />
              ))}
            </div>
          </div>

          <button type="submit" disabled={savingChamp} className="btn-gold w-full flex items-center justify-center gap-2">
            {savingChamp ? <Spinner size="sm" color="white" /> : '💾 Guardar Apuestas Especiales'}
          </button>

          {champion?.champion && (
            <p className="text-center text-xs text-green-600">✓ Apuestas guardadas correctamente</p>
          )}
        </form>
      </div>
    </div>
  );
}
