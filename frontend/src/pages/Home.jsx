import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../lib/axios';
import Spinner from '../components/Spinner';
import MatchCard from '../components/MatchCard';

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

  useEffect(() => {
    Promise.all([
      api.get('/matches/upcoming?limit=3'),
      api.get('/matches/recent?limit=3'),
      api.get('/ranking'),
      api.get('/predictions/stats'),
    ]).then(([up, re, rk, st]) => {
      setUpcoming(up.data);
      setRecent(re.data);
      setRanking(rk.data.slice(0, 3));
      setStats(st.data);
      const me = rk.data.find(u => u.id === user.id);
      setMyRank(me);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, [user.id]);

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
      {/* Hero Banner */}
      <div className="bg-wc-gradient rounded-3xl p-6 mb-4 text-white relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/5" />
        <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full bg-white/5" />

        <div className="relative z-10">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold opacity-70 uppercase tracking-widest mb-1">
                FIFA World Cup
              </p>
              <h1 className="text-3xl font-black leading-tight">
                MUNDIAL<br />2026 🏆
              </h1>
              <p className="text-sm opacity-70 mt-1">USA · Canadá · México</p>
            </div>
            <div className="text-right">
              <p className="text-xs opacity-70">Inicia en</p>
              <p className="text-4xl font-black">{daysToWC}</p>
              <p className="text-xs opacity-70">días</p>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-white/20 flex items-center gap-3">
            <div className="flex-1">
              <p className="text-xs opacity-70">Hola, {user.name}!</p>
              <p className="font-bold">
                {myRank ? `#${myRank.position} en el ranking` : 'Sin puntos aún'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black">{stats?.totalPoints || 0}</p>
              <p className="text-xs opacity-70">puntos</p>
            </div>
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
              <MatchCard key={match.id} match={match} readOnly />
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
