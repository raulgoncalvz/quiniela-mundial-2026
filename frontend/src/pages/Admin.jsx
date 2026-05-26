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
  { key: 'users',     label: '👥 Usuarios' },
  { key: 'trivia',    label: '🧠 Trivia' },
];

const GROUP_LETTERS = ['A','B','C','D','E','F','G','H','I','J','K','L'];

export default function Admin() {
  const [phase, setPhase] = useState('groups');
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState({});
  const [results, setResults] = useState({});
  const [adminGroup, setAdminGroup] = useState('A');
  const [groupStandings, setGroupStandings] = useState([]);
  const [loadingStandings, setLoadingStandings] = useState(false);
  const [savingStandings, setSavingStandings] = useState(false);
  const [scoringConfigs, setScoringConfigs] = useState([]);
  const [savingScoring, setSavingScoring] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [champForm, setChampForm] = useState({ champion:'', runnerUp:'', third:'', topScorer:'', bestPlayer:'', bestGoalkeeper:'' });
  const [calculatingChamp, setCalculatingChamp] = useState(false);
  const [derivingChamp, setDerivingChamp] = useState(false);
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState({ name: '', username: '', password: '' });
  const [creatingUser, setCreatingUser] = useState(false);
  const [deletingUser, setDeletingUser] = useState({});
  const [resetPass, setResetPass] = useState({}); // { [id]: newPassword }
  const [clearing, setClearing] = useState({});
  const [exporting, setExporting] = useState(false);

  // Trivia state
  const [triviaQuestions, setTriviaQuestions] = useState([]);
  const [triviaForm, setTriviaForm] = useState({
    question: '', type: 'multiple',
    options: ['', '', '', ''], correctAnswer: '',
    scoreHome: '', scoreAway: '',
  });
  const [savingTrivia, setSavingTrivia] = useState(false);
  const [togglingTrivia, setTogglingTrivia] = useState({});
  const [deletingTrivia, setDeletingTrivia] = useState({});
  const [showTriviaForm, setShowTriviaForm] = useState(false);
  const [triviaResponses, setTriviaResponses] = useState({}); // { [questionId]: responses[] }
  const [loadingResponses, setLoadingResponses] = useState({});
  const [expandedTrivia, setExpandedTrivia] = useState({});

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const res = await api.get('/export/excel', { responseType: 'blob', timeout: 120000 });
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Quiniela Mundial FIFA 2026 - Pronósticos Oficiales.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('✅ Excel generado correctamente');
    } catch {
      toast.error('Error al generar el Excel');
    } finally {
      setExporting(false);
    }
  };

  const toSlug = (str) =>
    str.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

  const generatePassword = () => String(Math.floor(100000 + Math.random() * 900000));

  const generateFromName = (name) => {
    const parts = name.trim().split(/\s+/);
    const username = parts.length >= 2
      ? toSlug(parts[0]) + toSlug(parts[1])
      : toSlug(parts[0]);
    const password = generatePassword();
    setNewUser(f => ({ ...f, username, password }));
  };

  const handleClearResult = async (matchId) => {
    setClearing(prev => ({ ...prev, [matchId]: true }));
    try {
      await api.put(`/matches/${matchId}/status`, { status: 'pending' });
      setMatches(prev => prev.map(m => m.id === matchId
        ? { ...m, status: 'pending', homeScore: null, awayScore: null, penaltyWinner: null }
        : m
      ));
      setResults(prev => ({ ...prev, [matchId]: { homeScore: '', awayScore: '', penaltyWinner: '', status: 'pending' } }));
      toast.success('Resultado limpiado');
    } catch {
      toast.error('Error al limpiar resultado');
    } finally {
      setClearing(prev => ({ ...prev, [matchId]: false }));
    }
  };

  const loadGroupStandings = async (group) => {
    setLoadingStandings(true);
    try {
      const { data } = await api.get(`/matches/groups/${group}/standings`);
      setGroupStandings(data);
    } catch {
      setGroupStandings([]);
    } finally {
      setLoadingStandings(false);
    }
  };

  const handleSaveStandings = async () => {
    setSavingStandings(true);
    try {
      const { data } = await api.post(`/matches/groups/${adminGroup}/standings`);
      toast.success(`✅ Grupo ${adminGroup}: puntos calculados para ${data.updated} usuarios`);
      await loadGroupStandings(adminGroup);
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

  const handleDeriveChampion = async () => {
    setDerivingChamp(true);
    try {
      // Fetch final (match 104) and third place (match 103) results
      const [finalRes, thirdRes] = await Promise.allSettled([
        api.get('/matches?phase=final'),
        api.get('/matches?phase=third'),
      ]);

      let champion = '', runnerUp = '', third = '';

      if (finalRes.status === 'fulfilled') {
        const finals = finalRes.value.data.filter(m => m.status === 'finished' && m.homeScore !== null);
        if (finals.length > 0) {
          const f = finals[0];
          if (f.homeScore > f.awayScore) {
            champion = f.homeTeam?.name || ''; runnerUp = f.awayTeam?.name || '';
          } else if (f.homeScore < f.awayScore) {
            champion = f.awayTeam?.name || ''; runnerUp = f.homeTeam?.name || '';
          } else {
            champion = f.penaltyWinner === 'away' ? (f.awayTeam?.name || '') : (f.homeTeam?.name || '');
            runnerUp = f.penaltyWinner === 'away' ? (f.homeTeam?.name || '') : (f.awayTeam?.name || '');
          }
        }
      }

      if (thirdRes.status === 'fulfilled') {
        const thirds = thirdRes.value.data.filter(m => m.status === 'finished' && m.homeScore !== null);
        if (thirds.length > 0) {
          const t = thirds[0];
          if (t.homeScore > t.awayScore) third = t.homeTeam?.name || '';
          else if (t.homeScore < t.awayScore) third = t.awayTeam?.name || '';
          else third = t.penaltyWinner === 'away' ? (t.awayTeam?.name || '') : (t.homeTeam?.name || '');
        }
      }

      if (!champion) { toast.error('El partido Final aún no tiene resultado'); return; }

      setChampForm(prev => ({ ...prev, champion, runnerUp, third }));
      toast.success('✅ Campeón, Finalista y 3er Lugar auto-derivados del torneo');
    } catch (err) {
      toast.error('Error al derivar resultados');
    } finally {
      setDerivingChamp(false);
    }
  };

  const handleCalculateChamp = async () => {
    setCalculatingChamp(true);
    try {
      const { data } = await api.post('/config/champion/calculate', champForm);
      toast.success(`✅ Puntos especiales asignados a ${data.updated} usuarios`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al calcular');
    } finally {
      setCalculatingChamp(false);
    }
  };

  const loadUsers = async () => {
    try {
      const { data } = await api.get('/users');
      setUsers(data);
    } catch {
      toast.error('Error al cargar usuarios');
    }
  };

  const handleCreateUser = async e => {
    e.preventDefault();
    if (!newUser.name || !newUser.username || !newUser.password) return;
    setCreatingUser(true);
    try {
      const { data } = await api.post('/users', newUser);
      setUsers(prev => [...prev, data]);
      setNewUser({ name: '', username: '', password: '' });
      toast.success(`✅ Usuario "${data.username}" creado`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al crear usuario');
    } finally {
      setCreatingUser(false);
    }
  };

  const handleDeleteUser = async (id, name) => {
    if (!confirm(`¿Eliminar a ${name}? Se borrarán todos sus pronósticos.`)) return;
    setDeletingUser(prev => ({ ...prev, [id]: true }));
    try {
      await api.delete(`/users/${id}`);
      setUsers(prev => prev.filter(u => u.id !== id));
      toast.success(`Usuario eliminado`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al eliminar');
    } finally {
      setDeletingUser(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleResetPassword = async (id) => {
    const pass = resetPass[id];
    if (!pass || pass.length < 4) { toast.error('Mínimo 4 caracteres'); return; }
    try {
      const { data } = await api.put(`/users/${id}`, { password: pass });
      setUsers(prev => prev.map(u => u.id === id ? { ...u, plainPassword: data.plainPassword } : u));
      setResetPass(prev => ({ ...prev, [id]: '' }));
      toast.success('Contraseña actualizada');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    }
  };

  const loadTriviaQuestions = async () => {
    try {
      const { data } = await api.get('/trivia');
      setTriviaQuestions(data);
    } catch {
      toast.error('Error al cargar preguntas');
    }
  };

  const handleSaveTrivia = async (e) => {
    e.preventDefault();
    if (!triviaForm.question.trim()) {
      toast.error('La pregunta es obligatoria');
      return;
    }
    if (triviaForm.type === 'multiple') {
      const filled = triviaForm.options.filter(o => o.trim());
      if (filled.length < 2) { toast.error('Mínimo 2 opciones'); return; }
      if (!triviaForm.correctAnswer.trim()) { toast.error('Indica la respuesta correcta'); return; }
    }
    if (triviaForm.type === 'score') {
      if (triviaForm.scoreHome === '' || triviaForm.scoreAway === '') {
        toast.error('Ingresa el marcador correcto');
        return;
      }
    }
    setSavingTrivia(true);
    try {
      const payload = {
        question: triviaForm.question,
        type: triviaForm.type,
        options: triviaForm.type === 'multiple' ? triviaForm.options.filter(o => o.trim()) : [],
        correctAnswer: triviaForm.correctAnswer,
      };
      const { data } = await api.post('/trivia', payload);
      setTriviaQuestions(prev => [data, ...prev]);
      setTriviaForm({ question: '', type: 'multiple', options: ['', '', '', ''], correctAnswer: '', scoreHome: '', scoreAway: '' });
      setShowTriviaForm(false);
      toast.success('✅ Pregunta creada');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    } finally {
      setSavingTrivia(false);
    }
  };

  const handleToggleTrivia = async (id, active) => {
    setTogglingTrivia(prev => ({ ...prev, [id]: true }));
    try {
      await api.put(`/trivia/${id}/activate`, { active });
      setTriviaQuestions(prev => prev.map(q =>
        active ? { ...q, isActive: q.id === id } : (q.id === id ? { ...q, isActive: false } : q)
      ));
      toast.success(active ? '✅ Pregunta activada' : 'Pregunta desactivada');
    } catch {
      toast.error('Error al cambiar estado');
    } finally {
      setTogglingTrivia(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleDeleteTrivia = async (id) => {
    if (!confirm('¿Eliminar esta pregunta y todas sus respuestas?')) return;
    setDeletingTrivia(prev => ({ ...prev, [id]: true }));
    try {
      await api.delete(`/trivia/${id}`);
      setTriviaQuestions(prev => prev.filter(q => q.id !== id));
      toast.success('Pregunta eliminada');
    } catch {
      toast.error('Error al eliminar');
    } finally {
      setDeletingTrivia(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleToggleTriviaExpand = async (id) => {
    const isOpen = expandedTrivia[id];
    setExpandedTrivia(prev => ({ ...prev, [id]: !isOpen }));
    if (!isOpen && !triviaResponses[id]) {
      setLoadingResponses(prev => ({ ...prev, [id]: true }));
      try {
        const { data } = await api.get(`/trivia/${id}/responses`);
        setTriviaResponses(prev => ({ ...prev, [id]: data }));
      } catch {
        toast.error('Error al cargar respuestas');
      } finally {
        setLoadingResponses(prev => ({ ...prev, [id]: false }));
      }
    }
  };

  const loadMatches = async () => {
    if (phase === 'positions') { setLoading(false); return; }
    if (phase === 'scoring') { setLoading(false); return; }
    if (phase === 'users') { setLoading(false); return; }
    if (phase === 'trivia') { setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await api.get(`/matches?phase=${phase}`);
      setMatches(data);
      const init = {};
      for (const m of data) {
        init[m.id] = {
          homeScore: m.homeScore !== null ? String(m.homeScore) : '',
          awayScore: m.awayScore !== null ? String(m.awayScore) : '',
          penaltyWinner: m.penaltyWinner || '',
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
    else if (phase === 'users') loadUsers();
    else if (phase === 'trivia') loadTriviaQuestions();
    else loadMatches();
  }, [phase]);

  useEffect(() => {
    if (phase === 'positions') loadGroupStandings(adminGroup);
  }, [adminGroup, phase]);

  const handleResultChange = (matchId, field, value) => {
    setResults(prev => ({
      ...prev,
      [matchId]: { ...prev[matchId], [field]: value },
    }));
  };

  const KNOCKOUT_PHASES = ['round32','round16','quarters','semis','third','final'];

  const handleSaveResult = async (matchId) => {
    const r = results[matchId];
    if (r.homeScore === '' || r.awayScore === '') {
      toast.error('Ingresa ambos marcadores');
      return;
    }
    const isKnockoutPhase = KNOCKOUT_PHASES.includes(phase);
    const isDraw = r.homeScore === r.awayScore;
    if (isKnockoutPhase && isDraw && !r.penaltyWinner) {
      toast.error('Selecciona quién ganó por penales');
      return;
    }
    setUpdating(prev => ({ ...prev, [matchId]: true }));
    try {
      await api.put(`/matches/${matchId}/result`, {
        homeScore: parseInt(r.homeScore),
        awayScore: parseInt(r.awayScore),
        status: 'finished',
        penaltyWinner: isKnockoutPhase && isDraw ? r.penaltyWinner : null,
      });
      setMatches(prev => prev.map(m =>
        m.id === matchId
          ? { ...m, homeScore: parseInt(r.homeScore), awayScore: parseInt(r.awayScore), status: 'finished', penaltyWinner: isKnockoutPhase && isDraw ? r.penaltyWinner : null }
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
      const cleared = status === 'pending' ? { homeScore: '', awayScore: '', penaltyWinner: '' } : {};
      setMatches(prev => prev.map(m => m.id === matchId
        ? { ...m, status, ...(status === 'pending' ? { homeScore: null, awayScore: null, penaltyWinner: null } : {}) }
        : m));
      setResults(prev => ({ ...prev, [matchId]: { ...prev[matchId], status, ...cleared } }));
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

      {/* ── Posiciones finales de grupo (auto-calculadas) ── */}
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
            <h3 className="font-bold text-wc-dark mb-1">Grupo {adminGroup} — Tabla de Posiciones</h3>
            <p className="text-xs text-gray-400 mb-3">
              Posiciones calculadas automáticamente por resultados reales (puntos → dif. de goles → goles a favor)
            </p>

            {loadingStandings ? (
              <div className="flex justify-center py-6"><Spinner size="md" /></div>
            ) : groupStandings.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-4">No hay partidos finalizados en este grupo</p>
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
                    {groupStandings.map((s) => (
                      <tr key={s.teamId} className={s.position <= 2 ? 'bg-green-50' : ''}>
                        <td className="py-2 font-bold text-gray-500">{s.position}</td>
                        <td className="py-2">
                          <span className="mr-1">{s.teamFlag}</span>
                          <span className="font-semibold text-wc-dark">{s.teamName}</span>
                          {s.position <= 2 && <span className="ml-1 text-green-600 text-xs">✓</span>}
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

            <button onClick={handleSaveStandings} disabled={savingStandings || loadingStandings}
              className="btn-primary w-full mt-4 flex items-center justify-center gap-2">
              {savingStandings ? <Spinner size="sm" color="white" /> : `🏆 Asignar Puntos — Grupo ${adminGroup}`}
            </button>
            <p className="text-xs text-gray-400 text-center mt-2">
              Solo funciona cuando los 6 partidos del grupo están finalizados
            </p>
          </div>
        </div>
      )}

      {/* ── Scoring Config ── */}
      {phase === 'scoring' && (
        <div className="space-y-4">

          {/* Puntos por fase de partidos */}
          <div className="card">
            <h3 className="font-bold text-wc-dark mb-1">⚙️ Puntos por Partido</h3>
            <p className="text-xs text-gray-400 mb-3">Marcador exacto y resultado correcto por fase</p>
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
                  {scoringConfigs.filter(c => !c.phase.startsWith('bet_')).map(cfg => (
                    <tr key={cfg.phase}>
                      <td className="py-2 font-medium text-wc-dark">{cfg.label || cfg.phase}</td>
                      <td className="py-2 text-center">
                        <input type="number" min="1" max="30" value={cfg.exactScore}
                          onChange={e => handleScoringChange(cfg.phase, 'exactScore', parseInt(e.target.value) || 0)}
                          className="w-14 text-center text-sm rounded-xl border border-gray-200 py-1 px-2 focus:ring-2 focus:ring-wc-red outline-none bg-wc-light-bg font-bold text-wc-red"
                        />
                      </td>
                      <td className="py-2 text-center">
                        <input type="number" min="0" max="30" value={cfg.correctResult}
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

          {/* Puntos por apuestas especiales (campeón, goleador, etc.) */}
          <div className="card">
            <h3 className="font-bold text-wc-dark mb-1">🏆 Puntos por Apuestas Especiales</h3>
            <p className="text-xs text-gray-400 mb-3">Puntos al acertar cada apuesta especial del torneo (campeón, goleador, etc.)</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-100">
                    <th className="text-left py-2 font-semibold">Apuesta</th>
                    <th className="text-center py-2 font-semibold">🎯 Puntos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {scoringConfigs
                    .filter(c => ['bet_champion','bet_runnerUp','bet_third','bet_topScorer','bet_bestPlayer','bet_goalkeeper'].includes(c.phase))
                    .map(cfg => (
                    <tr key={cfg.phase}>
                      <td className="py-2 font-medium text-wc-dark">{cfg.label || cfg.phase}</td>
                      <td className="py-2 text-center">
                        <input type="number" min="1" max="50" value={cfg.exactScore}
                          onChange={e => handleScoringChange(cfg.phase, 'exactScore', parseInt(e.target.value) || 0)}
                          className="w-14 text-center text-sm rounded-xl border border-gray-200 py-1 px-2 focus:ring-2 focus:ring-wc-red outline-none bg-wc-light-bg font-bold text-wc-red"
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

          {/* Puntos por avance de ronda */}
          <div className="card">
            <h3 className="font-bold text-wc-dark mb-1">🚀 Puntos por Avance de Ronda</h3>
            <p className="text-xs text-gray-400 mb-3">Puntos por cada equipo que aciertes que avanza a cada ronda eliminatoria</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-100">
                    <th className="text-left py-2 font-semibold">Ronda</th>
                    <th className="text-center py-2 font-semibold">🎯 Pts / equipo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {scoringConfigs
                    .filter(c => ['bet_round16','bet_quarters','bet_semis','bet_final'].includes(c.phase))
                    .map(cfg => (
                    <tr key={cfg.phase}>
                      <td className="py-2 font-medium text-wc-dark">{cfg.label || cfg.phase}</td>
                      <td className="py-2 text-center">
                        <input type="number" min="1" max="20" value={cfg.correctResult}
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

          {/* Asignar ganadores reales de apuestas especiales */}
          <div className="card border border-wc-gold bg-amber-50">
            <h3 className="font-bold text-amber-900 mb-1">🏅 Asignar Ganadores Reales</h3>
            <p className="text-xs text-amber-700 mb-3">
              Ingresa los ganadores reales y calcula los puntos de todos los usuarios
            </p>
            <button onClick={handleDeriveChampion} disabled={derivingChamp}
              className="w-full mb-3 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 border border-amber-300 text-amber-900 font-bold text-xs transition-all flex items-center justify-center gap-2">
              {derivingChamp ? <Spinner size="sm" /> : '🔁 Auto-derivar Campeón/Finalista/3er del torneo'}
            </button>
            <div className="space-y-2">
              {[
                { key: 'champion',       label: '🏆 Campeón',       placeholder: 'País campeón' },
                { key: 'runnerUp',       label: '🥈 Finalista',      placeholder: 'País finalista' },
                { key: 'third',          label: '🥉 3er Lugar',       placeholder: 'País 3er lugar' },
                { key: 'topScorer',      label: '⚽ Bota de Oro',     placeholder: 'Nombre del goleador' },
                { key: 'bestPlayer',     label: '🌟 Balón de Oro',    placeholder: 'Nombre del mejor jugador' },
                { key: 'bestGoalkeeper', label: '🧤 Mejor Portero',   placeholder: 'Nombre del mejor portero' },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="text-xs font-bold text-amber-800 block mb-1">{label}</label>
                  <input
                    type="text"
                    placeholder={placeholder}
                    value={champForm[key]}
                    onChange={e => setChampForm(prev => ({ ...prev, [key]: e.target.value }))}
                    className="w-full text-sm rounded-xl border border-amber-200 py-2 px-3 focus:ring-2 focus:ring-amber-400 outline-none bg-white"
                  />
                </div>
              ))}
            </div>
            <button onClick={handleCalculateChamp} disabled={calculatingChamp}
              className="w-full mt-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm transition-all flex items-center justify-center gap-2">
              {calculatingChamp ? <Spinner size="sm" color="white" /> : '⚡ Calcular Puntos Especiales'}
            </button>
          </div>

          {/* Recalcular partidos */}
          <div className="card border border-gray-200">
            <h3 className="font-bold text-gray-700 mb-1">🔄 Recalcular Puntos de Partidos</h3>
            <p className="text-xs text-gray-500 mb-3">
              Aplica la configuración a todos los partidos ya finalizados
            </p>
            <button onClick={handleRecalculate} disabled={recalculating}
              className="w-full py-2 rounded-xl bg-gray-600 hover:bg-gray-700 text-white font-bold text-sm transition-all flex items-center justify-center gap-2">
              {recalculating ? <Spinner size="sm" color="white" /> : '⚡ Recalcular Partidos'}
            </button>
          </div>

        </div>
      )}

      {/* ── Usuarios ── */}
      {phase === 'users' && (
        <div className="space-y-4">

          {/* Exportar Excel */}
          <div className="card border border-green-200 bg-green-50">
            <h3 className="font-bold text-green-900 mb-1">📊 Exportar Quiniela Completa</h3>
            <p className="text-xs text-green-700 mb-3">
              Genera un Excel protegido con todos los pronósticos, posiciones y apuestas especiales de cada participante.
              Ideal para compartir con todos y verificar que no hay cambios.
            </p>
            <button
              onClick={handleExportExcel}
              disabled={exporting}
              className="w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-bold text-sm transition-all flex items-center justify-center gap-2"
            >
              {exporting ? <Spinner size="sm" color="white" /> : '📥 Descargar Excel de Pronósticos'}
            </button>
          </div>

          {/* Crear usuario */}
          <div className="card">
            <h3 className="font-bold text-wc-dark mb-1">➕ Crear Usuario</h3>
            <p className="text-xs text-gray-400 mb-3">El usuario inicia sesión con su nombre de usuario y contraseña (sin email)</p>
            <form onSubmit={handleCreateUser} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Nombre completo (visible en ranking)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Ej: Juan García"
                    value={newUser.name}
                    onChange={e => setNewUser(f => ({ ...f, name: e.target.value }))}
                    className="input-field text-sm py-2 flex-1"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => generateFromName(newUser.name)}
                    disabled={!newUser.name.trim()}
                    className="px-3 py-2 rounded-xl bg-wc-blue text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                  >
                    🎲 Generar
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Usuario (para iniciar sesión)</label>
                <input
                  type="text"
                  placeholder="Ej: juangarcia"
                  value={newUser.username}
                  onChange={e => setNewUser(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s+/g,'') }))}
                  className="input-field text-sm py-2"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Contraseña</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="6 dígitos"
                    value={newUser.password}
                    onChange={e => setNewUser(f => ({ ...f, password: e.target.value }))}
                    className="input-field text-sm py-2 flex-1 font-mono tracking-widest"
                    required
                    minLength={4}
                  />
                  <button
                    type="button"
                    onClick={() => setNewUser(f => ({ ...f, password: generatePassword() }))}
                    className="px-3 py-2 rounded-xl border border-gray-200 text-gray-500 text-xs font-bold hover:bg-gray-50 flex-shrink-0"
                  >
                    🎲
                  </button>
                </div>
              </div>
              <button type="submit" disabled={creatingUser} className="btn-primary w-full flex items-center justify-center gap-2">
                {creatingUser ? <Spinner size="sm" color="white" /> : '👤 Crear Usuario'}
              </button>
            </form>
          </div>

          {/* Lista de usuarios */}
          <div className="card">
            <h3 className="font-bold text-wc-dark mb-3">👥 Usuarios ({users.length})</h3>
            {users.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-4">No hay usuarios registrados</p>
            ) : (
              <div className="space-y-3">
                {users.map(u => (
                  <div key={u.id} className={`p-3 rounded-xl border ${u.role === 'admin' ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-gray-50'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-bold text-wc-dark text-sm">{u.name}</p>
                        <p className="text-xs text-gray-500">
                          @{u.username || '—'}
                          {u.role === 'admin' && <span className="ml-1 text-amber-600 font-bold">· Admin</span>}
                        </p>
                        {u.plainPassword && (
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-xs font-mono bg-gray-100 text-gray-700 px-2 py-0.5 rounded-lg tracking-widest">
                              🔑 {u.plainPassword}
                            </span>
                            <button
                              onClick={() => { navigator.clipboard.writeText(u.plainPassword); toast.success('Contraseña copiada'); }}
                              className="text-xs text-gray-400 hover:text-gray-600"
                              title="Copiar contraseña"
                            >📋</button>
                          </div>
                        )}
                      </div>
                      {u.role !== 'admin' && (
                        <button
                          onClick={() => handleDeleteUser(u.id, u.name)}
                          disabled={deletingUser[u.id]}
                          className="text-xs text-red-500 hover:text-red-700 font-semibold px-2 py-1 rounded-lg hover:bg-red-50 transition-all"
                        >
                          {deletingUser[u.id] ? '...' : 'Eliminar'}
                        </button>
                      )}
                    </div>
                    {u.role !== 'admin' && (
                      <div className="flex gap-2 mt-1">
                        <input
                          type="text"
                          placeholder="Nueva contraseña"
                          value={resetPass[u.id] || ''}
                          onChange={e => setResetPass(p => ({ ...p, [u.id]: e.target.value }))}
                          className="flex-1 text-xs rounded-lg border border-gray-200 py-1.5 px-2 focus:ring-1 focus:ring-wc-blue outline-none"
                        />
                        <button
                          onClick={() => handleResetPassword(u.id)}
                          className="text-xs bg-wc-blue text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-blue-700 transition-all"
                        >
                          Cambiar
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Trivia ── */}
      {phase === 'trivia' && (
        <div className="space-y-4">
          {/* Header + new question button */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-wc-dark">🧠 Preguntas de Trivia</h3>
              <p className="text-xs text-gray-400">Solo una pregunta puede estar activa a la vez</p>
            </div>
            <button
              onClick={() => setShowTriviaForm(v => !v)}
              className="px-4 py-2 rounded-2xl bg-wc-gradient text-white font-bold text-xs"
            >
              {showTriviaForm ? '✕ Cancelar' : '+ Nueva'}
            </button>
          </div>

          {/* Create form */}
          {showTriviaForm && (
            <form onSubmit={handleSaveTrivia} className="card space-y-3 border border-wc-blue/20">
              <h4 className="font-bold text-wc-dark text-sm">Nueva Pregunta</h4>

              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Pregunta *</label>
                <textarea
                  rows={3}
                  placeholder="Ej: ¿En qué año Brasil ganó su primer Mundial?"
                  value={triviaForm.question}
                  onChange={e => setTriviaForm(f => ({ ...f, question: e.target.value }))}
                  className="w-full text-sm rounded-xl border border-gray-200 py-2 px-3 focus:ring-2 focus:ring-wc-blue outline-none resize-none"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Tipo de respuesta</label>
                <div className="flex gap-2">
                  {[
                    { key: 'multiple', label: '🔘 Múltiple' },
                    { key: 'score',    label: '⚽ Marcador' },
                  ].map(({ key, label }) => (
                    <button
                      type="button" key={key}
                      onClick={() => setTriviaForm(f => ({ ...f, type: key, correctAnswer: '', scoreHome: '', scoreAway: '' }))}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                        triviaForm.type === key
                          ? 'bg-wc-blue text-white border-wc-blue'
                          : 'bg-white text-gray-600 border-gray-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {triviaForm.type === 'multiple' && (
                <div>
                  <label className="text-xs font-bold text-gray-600 block mb-1">Opciones (mín. 2)</label>
                  <div className="space-y-2">
                    {triviaForm.options.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-400 w-5 text-center">
                          {String.fromCharCode(65 + i)}.
                        </span>
                        <input
                          type="text"
                          placeholder={`Opción ${String.fromCharCode(65 + i)}`}
                          value={opt}
                          onChange={e => {
                            const opts = [...triviaForm.options];
                            opts[i] = e.target.value;
                            setTriviaForm(f => ({ ...f, options: opts }));
                          }}
                          className="flex-1 text-sm rounded-xl border border-gray-200 py-1.5 px-3 focus:ring-1 focus:ring-wc-blue outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {triviaForm.type === 'score' && (
                <div>
                  <label className="text-xs font-bold text-gray-600 block mb-2">
                    Marcador correcto *
                  </label>
                  <div className="flex items-center justify-center gap-4 py-2">
                    <input
                      type="number" min="0" max="99"
                      placeholder="0"
                      value={triviaForm.scoreHome ?? ''}
                      onChange={e => {
                        const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
                        setTriviaForm(f => ({ ...f, scoreHome: v, correctAnswer: `${v}-${f.scoreAway ?? ''}` }));
                      }}
                      className="w-16 h-16 text-center text-3xl font-black border-2 border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-wc-blue bg-gray-50"
                    />
                    <span className="text-2xl font-black text-gray-300">—</span>
                    <input
                      type="number" min="0" max="99"
                      placeholder="0"
                      value={triviaForm.scoreAway ?? ''}
                      onChange={e => {
                        const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
                        setTriviaForm(f => ({ ...f, scoreAway: v, correctAnswer: `${f.scoreHome ?? ''}-${v}` }));
                      }}
                      className="w-16 h-16 text-center text-3xl font-black border-2 border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-wc-blue bg-gray-50"
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-gray-400 font-semibold px-4 mt-1">
                    <span>Local</span>
                    <span>Visitante</span>
                  </div>
                </div>
              )}

              {triviaForm.type === 'multiple' && (
                <div>
                  <label className="text-xs font-bold text-gray-600 block mb-1">
                    Respuesta correcta *
                    <span className="font-normal text-gray-400 ml-1">(debe coincidir con una opción)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Respuesta correcta"
                    value={triviaForm.correctAnswer}
                    onChange={e => setTriviaForm(f => ({ ...f, correctAnswer: e.target.value }))}
                    className="w-full text-sm rounded-xl border border-gray-200 py-2 px-3 focus:ring-2 focus:ring-wc-blue outline-none"
                    required
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={savingTrivia}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {savingTrivia ? <Spinner size="sm" color="white" /> : '💾 Guardar Pregunta'}
              </button>
            </form>
          )}

          {/* Questions list */}
          {triviaQuestions.length === 0 ? (
            <div className="card text-center py-10 text-gray-400">
              <p className="text-3xl mb-2">🧠</p>
              <p className="text-sm">No hay preguntas creadas</p>
              <p className="text-xs mt-1">Crea la primera usando el botón "+ Nueva"</p>
            </div>
          ) : (
            <div className="space-y-3">
              {triviaQuestions.map(q => {
                const pct = q.totalResponses > 0
                  ? Math.round((q.correctResponses / q.totalResponses) * 100)
                  : 0;
                return (
                  <div
                    key={q.id}
                    className={`card border-2 transition-all ${
                      q.isActive ? 'border-green-400 bg-green-50' : 'border-gray-100'
                    }`}
                  >
                    {q.isActive && (
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-xs font-bold text-green-600 uppercase tracking-wide">Activa ahora</span>
                      </div>
                    )}
                    <p className="font-semibold text-wc-dark text-sm leading-snug mb-2">{q.question}</p>

                    {q.type === 'multiple' && q.options.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {q.options.map((opt, i) => (
                          <span
                            key={i}
                            className={`text-xs px-2 py-0.5 rounded-lg font-medium ${
                              opt === q.correctAnswer
                                ? 'bg-green-100 text-green-700 border border-green-200'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {String.fromCharCode(65 + i)}. {opt}
                            {opt === q.correctAnswer && ' ✓'}
                          </span>
                        ))}
                      </div>
                    )}
                    {q.type === 'text' && (
                      <p className="text-xs text-gray-500 mb-2">
                        Respuesta: <span className="font-bold text-green-700">{q.correctAnswer}</span>
                      </p>
                    )}

                    {/* Stats */}
                    <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                      <span>👥 {q.totalResponses} respuestas</span>
                      <span>✅ {q.correctResponses} correctas</span>
                      <span>📊 {pct}% acierto</span>
                    </div>

                    {/* Progress bar */}
                    {q.totalResponses > 0 && (
                      <div className="w-full h-1.5 bg-gray-100 rounded-full mb-3 overflow-hidden">
                        <div
                          className="h-full bg-green-400 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}

                    <div className="flex gap-2 mb-2">
                      <button
                        onClick={() => handleToggleTrivia(q.id, !q.isActive)}
                        disabled={!!togglingTrivia[q.id]}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                          q.isActive
                            ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            : 'bg-green-100 text-green-700 hover:bg-green-200'
                        }`}
                      >
                        {togglingTrivia[q.id] ? '...' : q.isActive ? '⏸ Desactivar' : '▶ Activar'}
                      </button>
                      <button
                        onClick={() => handleDeleteTrivia(q.id)}
                        disabled={!!deletingTrivia[q.id]}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-red-50 text-red-500 hover:bg-red-100 transition-all"
                      >
                        {deletingTrivia[q.id] ? '...' : '🗑'}
                      </button>
                    </div>

                    {/* Ver respuestas toggle */}
                    {q.totalResponses > 0 && (
                      <button
                        onClick={() => handleToggleTriviaExpand(q.id)}
                        className="w-full py-2 rounded-xl text-xs font-bold bg-blue-50 text-wc-blue hover:bg-blue-100 transition-all"
                      >
                        {expandedTrivia[q.id] ? '▲ Ocultar respuestas' : `▼ Ver quién respondió (${q.totalResponses})`}
                      </button>
                    )}

                    {/* Responses list */}
                    {expandedTrivia[q.id] && (
                      <div className="mt-3 space-y-1.5">
                        {loadingResponses[q.id] ? (
                          <div className="flex justify-center py-3"><Spinner size="sm" /></div>
                        ) : (triviaResponses[q.id] || []).length === 0 ? (
                          <p className="text-xs text-gray-400 text-center py-2">Sin respuestas aún</p>
                        ) : (
                          (triviaResponses[q.id] || []).map(r => (
                            <div
                              key={r.id}
                              className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs ${
                                r.isCorrect ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span>{r.isCorrect ? '✅' : '❌'}</span>
                                <span className="font-semibold text-gray-700">{r.user.name}</span>
                                <span className="text-gray-400">@{r.user.username}</span>
                              </div>
                              <span className={`font-bold ${r.isCorrect ? 'text-green-600' : 'text-red-500'}`}>
                                {r.answer === '__timeout__' ? '⏰ tiempo' : r.answer}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {phase !== 'positions' && phase !== 'scoring' && phase !== 'users' && phase !== 'trivia' && loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : phase !== 'positions' && phase !== 'scoring' && phase !== 'users' && phase !== 'trivia' && matches.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <p>No hay partidos en esta fase</p>
        </div>
      ) : phase !== 'positions' && phase !== 'scoring' && phase !== 'users' && phase !== 'trivia' ? (
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

                {/* Penalty winner selector for knockout draws */}
                {KNOCKOUT_PHASES.includes(phase) && r.homeScore !== '' && r.awayScore !== '' && r.homeScore === r.awayScore && (
                  <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded-xl">
                    <p className="text-xs font-bold text-amber-800 mb-1.5 text-center">⚽ Empate — ¿Quién avanza por penales?</p>
                    <div className="flex gap-2">
                      <button type="button"
                        onClick={() => handleResultChange(match.id, 'penaltyWinner', 'home')}
                        className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                          r.penaltyWinner === 'home' ? 'bg-wc-blue text-white' : 'bg-white border border-gray-200 text-gray-600'
                        }`}>
                        {homeTeam?.name || 'Local'}
                      </button>
                      <button type="button"
                        onClick={() => handleResultChange(match.id, 'penaltyWinner', 'away')}
                        className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                          r.penaltyWinner === 'away' ? 'bg-wc-blue text-white' : 'bg-white border border-gray-200 text-gray-600'
                        }`}>
                        {awayTeam?.name || 'Visitante'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Date & save */}
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
                  <span className="text-xs text-gray-400">
                    {new Date(match.date).toLocaleDateString('es-ES', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                  </span>
                  <div className="flex gap-2">
                    {(match.homeScore !== null || match.status !== 'pending') && (
                      <button
                        onClick={() => handleClearResult(match.id)}
                        disabled={clearing[match.id]}
                        className="py-1.5 px-3 text-xs font-semibold rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 flex items-center gap-1"
                      >
                        {clearing[match.id] ? <Spinner size="sm" /> : '🗑️ Limpiar'}
                      </button>
                    )}
                    <button
                      onClick={() => handleSaveResult(match.id)}
                      disabled={updating[match.id]}
                      className="btn-primary py-1.5 px-4 text-xs flex items-center gap-1"
                    >
                      {updating[match.id] ? <Spinner size="sm" color="white" /> : '💾 Guardar resultado'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
