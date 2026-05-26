import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../lib/axios';
import Spinner from '../components/Spinner';
import MatchCard from '../components/MatchCard';
import TriviaModal from '../components/TriviaModal';
import { useLiveMatches } from '../hooks/useLiveMatches';

function StatCard({ value, label, icon, color = 'blue' }) {
  const colors = {
    blue: 'text-wc-blue bg-blue-50',
    red: 'text-wc-red bg-red-50',
    gold: 'text-amber-600 bg-amber-50',
    green: 'text-green-600 bg-green-50',
  };
  return (
    <div className="card flex flex-col items-center text-center p-3">
      <span className="text-2xl mb-1">{icon}</span>
      <span className={`text-2xl font-black ${colors[color].split(' ')[0]}`}>{value}</span>
      <span className="text-xs text-gray-500 mt-0.5">{label}</span>
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [upcoming, setUpcoming] = useState([]);
  const [recent, setRecent] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [stats, setStats] = useState(null);
  const [myRank, setMyRank] = useState(null);

  const [predMap, setPredMap] = useState({});
  const [liveMatches, setLiveMatches] = useState([]);
  const liveData = useLiveMatches();

  const [triviaQuestion, setTriviaQuestion] = useState(null);
  const [showTrivia, setShowTrivia] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/matches/upcoming?limit=3'),
      api.get('/matches/recent?limit=3'),
      api.get('/ranking'),
      api.get('/predictions/stats'),
      api.get('/predictions'),
      api.get('/matches?status=live'),
    ]).then(([up, re, rk, st, preds, live]) => {
      setUpcoming(up.data);
      setRecent(re.data);
      setRanking(rk.data.slice(0, 3));
      setStats(st.data);
      setLiveMatches(live.data);
      const me = rk.data.find(u => Number(u.id) === Number(user.id));
      setMyRank(me);
      const map = {};
      for (const p of preds.data) map[p.matchId] = p;
      setPredMap(map);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, [user.id]);

  // Load active trivia question — show if this user hasn't seen it yet
  useEffect(() => {
    api.get('/trivia/active').then(({ data }) => {
      if (!data) return;
      const key = `trivia_seen_${user.id}_${data.id}`;
      if (!localStorage.getItem(key)) {
        setTriviaQuestion(data);
        setTimeout(() => setShowTrivia(true), 800);
      }
    }).catch(console.error);
  }, [user.id]);

  // Sync SSE live updates into liveMatches state
  useEffect(() => {
    if (!Object.keys(liveData).length) return;
    setLiveMatches(prev => {
      // Add new live matches that aren't in the list yet
      const updated = prev.map(m => {
        const d = liveData[m.id];
        return d ? { ...m, status: d.status, homeScore: d.homeScore, awayScore: d.awayScore } : m;
      });
      // Remove matches that transitioned out of 'live'
      return updated.filter(m => {
        const d = liveData[m.id];
        return !d || d.status === 'live';
      });
    });
  }, [liveData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  const daysToWC = Math.max(0, Math.ceil((new Date('2026-06-11') - new Date()) / (1000 * 60 * 60 * 24)));

  return (
    <div className="page-container page-enter">
      {showTrivia && triviaQuestion && (
        <TriviaModal
          question={triviaQuestion}
          userId={user.id}
          onClose={() => setShowTrivia(false)}
        />
      )}
      {/* Hero Banner */}
      <div className="bg-wc-gradient rounded-3xl mb-4 text-white relative overflow-hidden">
        {/* Logo image — top section */}
        <div className="relative w-full h-36 overflow-hidden rounded-t-3xl">
          <img
            src="/wc2026-logo.jpg"
            alt="FIFA World Cup 2026"
            className="w-full h-full object-cover object-center"
          />
          {/* gradient overlay so text below blends nicely */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 to-wc-blue/80" />
          {/* Countdown badge over the image */}
          <div className="absolute top-3 right-3 bg-black/40 backdrop-blur-sm rounded-2xl px-3 py-1.5 text-right">
            <p className="text-[10px] opacity-80 uppercase tracking-widest">Inicia en</p>
            <p className="text-2xl font-black leading-none">{daysToWC}</p>
            <p className="text-[10px] opacity-80">días</p>
          </div>
          {/* Title over image */}
          <div className="absolute bottom-3 left-4">
            <p className="text-[10px] font-semibold opacity-80 uppercase tracking-widest">FIFA World Cup</p>
            <h1 className="text-2xl font-black leading-tight drop-shadow">MUNDIAL 2026</h1>
            <p className="text-xs opacity-70">USA · Canadá · México</p>
          </div>
        </div>

        {/* Bottom info strip */}
        <div className="px-5 py-3 flex items-center gap-3">
          <div className="flex-1">
            <p className="text-xs opacity-70">Hola, {user.name}!</p>
            <p className="font-bold text-sm">
              {myRank
                ? `#${myRank.position} en el ranking`
                : stats?.totalPoints > 0
                  ? 'Puntos acumulados'
                  : 'Sin puntos aún'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black">{stats?.totalPoints ?? 0}</p>
            <p className="text-xs opacity-70">puntos</p>
          </div>
        </div>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-4 gap-2 mb-4">
          <StatCard value={stats.totalPredictions} label="Pronósticos" icon="📝" color="blue" />
          <StatCard value={stats.exactScores} label="Exactos" icon="⭐" color="gold" />
          <StatCard value={`${stats.accuracy}%`} label="Precisión" icon="🎯" color="green" />
          <StatCard value={myRank?.position || '—'} label="Posición" icon="🏅" color="red" />
        </div>
      )}

      {/* Top 3 Ranking preview */}
      {ranking.length > 0 && (
        <section className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-title">🏆 Top Ranking</h2>
            <Link to="/ranking" className="text-xs font-semibold text-wc-blue">Ver todos →</Link>
          </div>
          <div className="card space-y-3">
            {ranking.map((u, i) => {
              const medals = ['🥇', '🥈', '🥉'];
              const isMe = u.id === user.id;
              return (
                <div key={u.id} className={`flex items-center gap-3 ${isMe ? 'bg-blue-50 -mx-2 px-2 py-1 rounded-xl' : ''}`}>
                  <span className="text-xl w-8 text-center">{medals[i]}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-sm truncate ${isMe ? 'text-wc-blue' : 'text-wc-dark'}`}>
                      {u.name} {isMe && '(Tú)'}
                    </p>
                    <p className="text-xs text-gray-400">{u.exactScores} exactos · {u.accuracy}% precisión</p>
                  </div>
                  <span className="text-lg font-black text-wc-blue">{u.totalPoints} pts</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* EN VIVO section */}
      {liveMatches.length > 0 && (
        <section className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <h2 className="section-title text-red-600">EN VIVO</h2>
          </div>
          <div className="space-y-3">
            {liveMatches.map(match => {
              const live = liveData[match.id];
              const displayMatch = live
                ? { ...match, status: live.status, homeScore: live.homeScore, awayScore: live.awayScore }
                : match;
              return (
                <MatchCard
                  key={match.id}
                  match={displayMatch}
                  prediction={predMap[match.id]}
                  readOnly
                  liveMinute={live?.minute}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Upcoming matches */}
      {upcoming.length > 0 && (
        <section className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-title">📅 Próximos Partidos</h2>
            <Link to="/quiniela" className="text-xs font-semibold text-wc-blue">Pronosticar →</Link>
          </div>
          <div className="space-y-3">
            {upcoming.map(match => (
              <MatchCard key={match.id} match={match} readOnly />
            ))}
          </div>
        </section>
      )}

      {/* Recent results */}
      {recent.length > 0 && (
        <section className="mb-4">
          <h2 className="section-title">⚽ Últimos Resultados</h2>
          <div className="space-y-3">
            {recent.map(match => (
              <MatchCard key={match.id} match={match} prediction={predMap[match.id]} readOnly />
            ))}
          </div>
        </section>
      )}

      {/* CTA if no predictions */}
      {stats?.totalPredictions === 0 && (
        <div className="card bg-wc-gradient text-white text-center py-8">
          <p className="text-4xl mb-3">⚽</p>
          <h3 className="font-black text-xl mb-1">¡Empieza a pronosticar!</h3>
          <p className="text-sm opacity-80 mb-4">Predice los marcadores del Mundial 2026</p>
          <Link to="/quiniela">
            <button className="bg-white text-wc-blue font-bold px-6 py-2.5 rounded-2xl active:scale-95 transition-transform">
              Ir a la Quiniela →
            </button>
          </Link>
        </div>
      )}
    </div>
  );
}
