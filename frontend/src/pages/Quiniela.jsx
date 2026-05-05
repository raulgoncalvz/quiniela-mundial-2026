import { useEffect, useState, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import api from '../lib/axios';
import MatchCard from '../components/MatchCard';
import Spinner from '../components/Spinner';

const PHASES = [
  { key: 'groups',    label: 'Grupos',     icon: '⚽' },
  { key: 'positions', label: 'Posiciones', icon: '📊' },
  { key: 'round32',   label: 'Ronda 32',   icon: '🔵' },
  { key: 'round16',   label: 'Octavos',    icon: '⚡' },
  { key: 'quarters',  label: 'Cuartos',    icon: '🔥' },
  { key: 'semis',     label: 'Semis',      icon: '💥' },
  { key: 'third',     label: '3er Lugar',  icon: '🥉' },
  { key: 'final',     label: 'Final',      icon: '🏆' },
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
  const [champForm, setChampForm] = useState({ champion:'', runnerUp:'', third:'', topScorer:'', bestPlayer:'', bestGoalkeeper:'' });
  const [loading, setLoading] = useState(true);
  const [savingChamp, setSavingChamp] = useState(false);
  const [progress, setProgress] = useState(0);
  const [posStandings, setPosStandings] = useState({});
  const [posLoading, setPosLoading] = useState(false);

  useEffect(() => {
    if (activePhase !== 'positions') return;
    const load = async () => {
      setPosLoading(true);
      try {
        const { data } = await api.get(`/predictions/groups/${activeGroup}/standings`);
        setPosStandings(prev => ({ ...prev, [activeGroup]: data }));
      } catch {
        toast.error('Error al cargar posiciones');
      } finally {
        setPosLoading(false);
      }
    };
    load();
  }, [activeGroup, activePhase]);

  const loadData = useCallback(async () => {
    if (activePhase === 'positions') return;
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

      {/* Group sub-tabs (groups + positions phases) */}
      {(activePhase === 'groups' || activePhase === 'positions') && (
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

          {/* Dot indicators for positions tab */}
          {activePhase === 'positions' && (
            <div className="flex gap-1.5 mb-1">
              {GROUP_LETTERS.map(g => {
                const s = posStandings[g];
                const done = s?.predictedMatches === s?.totalMatches && s?.totalMatches > 0;
                const partial = s?.predictedMatches > 0 && !done;
                return (
                  <div key={g} className={`w-2 h-2 rounded-full ${done ? 'bg-green-500' : partial ? 'bg-yellow-400' : 'bg-gray-300'}`} />
                );
              })}
            </div>
          )}

          {/* Progress bar */}
          {activePhase === 'groups' && pending.length > 0 && (
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

      {/* ── Posiciones de grupo (auto-calculadas desde pronósticos) ── */}
      {activePhase === 'positions' && (
        <div className="space-y-3">
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-bold text-wc-dark">Grupo {activeGroup}</h3>
                <p className="text-xs text-gray-400 mt-0.5">Tabla calculada desde tus pronósticos · 2 pts por posición exacta</p>
              </div>
              {posStandings[activeGroup] && (
                <span className={`text-xs font-bold px-2 py-1 rounded-lg ${
                  posStandings[activeGroup].predictedMatches === posStandings[activeGroup].totalMatches
                    ? 'bg-green-100 text-green-700'
                    : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {posStandings[activeGroup].predictedMatches}/{posStandings[activeGroup].totalMatches} partidos
                </span>
              )}
            </div>

            {posLoading ? (
              <div className="flex justify-center py-6"><Spinner size="md" /></div>
            ) : !posStandings[activeGroup] || posStandings[activeGroup].standings.every(s => s.mp === 0) ? (
              <div className="text-center py-6 text-gray-400">
                <p className="text-3xl mb-2">⚽</p>
                <p className="text-sm font-semibold">No has pronosticado ningún partido de este grupo</p>
                <p className="text-xs mt-1">Ve al tab <strong>Grupos</strong> y completa tus marcadores</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-100">
                      <th className="text-left py-1.5 w-6">#</th>
                      <th className="text-left py-1.5">Equipo</th>
                      <th className="text-center py-1.5 w-7">PJ</th>
                      <th className="text-center py-1.5 w-7">G</th>
                      <th className="text-center py-1.5 w-7">E</th>
                      <th className="text-center py-1.5 w-7">P</th>
                      <th className="text-center py-1.5 w-8">GD</th>
                      <th className="text-center py-1.5 w-8 font-bold text-wc-dark">Pts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {posStandings[activeGroup].standings.map(s => (
                      <tr key={s.teamId} className={s.position <= 2 ? 'bg-green-50' : ''}>
                        <td className="py-2 font-bold text-gray-400">{s.position}</td>
                        <td className="py-2">
                          <span className="mr-1">{s.teamFlag}</span>
                          <span className="font-semibold text-wc-dark">{s.teamName}</span>
                          {s.position <= 2 && <span className="ml-1 text-green-500 text-xs">✓</span>}
                        </td>
                        <td className="py-2 text-center text-gray-500">{s.mp}</td>
                        <td className="py-2 text-center text-gray-500">{s.w}</td>
                        <td className="py-2 text-center text-gray-500">{s.d}</td>
                        <td className="py-2 text-center text-gray-500">{s.l}</td>
                        <td className="py-2 text-center text-gray-500">{s.gd > 0 ? `+${s.gd}` : s.gd}</td>
                        <td className="py-2 text-center font-black text-wc-dark">{s.pts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-xs text-gray-400 text-center mt-3">
              Los puntos se asignan automáticamente al finalizar el grupo
            </p>
          </div>

          {/* Progreso de grupos */}
          <div className="card">
            <p className="text-xs font-bold text-gray-600 mb-2">
              Grupos con pronósticos completos — {
                Object.values(posStandings).filter(s => s?.predictedMatches === s?.totalMatches && s?.totalMatches > 0).length
              }/12
            </p>
            <div className="flex flex-wrap gap-1.5">
              {GROUP_LETTERS.map(g => {
                const s = posStandings[g];
                const full = s?.predictedMatches === s?.totalMatches && s?.totalMatches > 0;
                const partial = s?.predictedMatches > 0 && !full;
                return (
                  <button key={g} onClick={() => setActiveGroup(g)}
                    className={`w-9 h-9 rounded-xl text-xs font-black transition-all ${
                      full ? 'bg-green-100 text-green-700 border border-green-300'
                      : partial ? 'bg-yellow-100 text-yellow-700 border border-yellow-300'
                      : 'bg-gray-100 text-gray-400'
                    } ${activeGroup === g ? 'ring-2 ring-wc-blue' : ''}`}>
                    {g}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Partidos (todas las fases excepto posiciones) ── */}
      {activePhase !== 'positions' && (
        <>
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

          {/* Apuestas especiales */}
          <div className="mt-8">
            <h2 className="section-title">🏆 Apuestas Especiales</h2>
            <form onSubmit={handleSaveChampion} className="card space-y-4">

              {/* Podio */}
              <div>
                <p className="text-xs font-bold text-gray-600 mb-2">🏆 Podio Final</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { key: 'champion', label: '🥇 Campeón' },
                    { key: 'runnerUp', label: '🥈 Finalista' },
                    { key: 'third',    label: '🥉 3er Lugar' },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className="text-xs font-bold text-gray-500 block mb-1">{label}</label>
                      <select
                        value={champForm[key]}
                        onChange={e => setChampForm(f => ({ ...f, [key]: e.target.value }))}
                        className="w-full text-xs rounded-xl border border-gray-200 py-2 px-2 focus:ring-2 focus:ring-wc-blue outline-none bg-wc-light-bg"
                      >
                        <option value="">—</option>
                        {TEAMS_LIST.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Premios individuales */}
              <div className="border-t pt-3 space-y-2">
                {[
                  { key: 'topScorer',      label: '⚽ Bota de Oro',   placeholder: 'Nombre del goleador' },
                  { key: 'bestPlayer',     label: '🌟 Balón de Oro',  placeholder: 'Nombre del mejor jugador' },
                  { key: 'bestGoalkeeper', label: '🧤 Mejor Portero', placeholder: 'Nombre del mejor portero' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label className="text-xs font-bold text-gray-600 block mb-1">{label}</label>
                    <input type="text" placeholder={placeholder}
                      value={champForm[key]}
                      onChange={e => setChampForm(f => ({ ...f, [key]: e.target.value }))}
                      className="input-field text-sm py-2"
                    />
                  </div>
                ))}
              </div>

              <button type="submit" disabled={savingChamp} className="btn-gold w-full flex items-center justify-center gap-2">
                {savingChamp ? <Spinner size="sm" color="white" /> : '💾 Guardar Apuestas Especiales'}
              </button>

              {champion?.champion && (
                <p className="text-center text-xs text-green-600">✓ Apuestas guardadas correctamente</p>
              )}
            </form>
          </div>
        </>
      )}

    </div>
  );
}
