import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../lib/axios';
import Spinner from '../components/Spinner';

const MEDALS = ['🥇', '🥈', '🥉'];

function PodiumCard({ user, position }) {
  const sizes = ['', 'order-2', 'order-1', 'order-3'];
  const heights = ['', 'h-32', 'h-24', 'h-20'];
  const bgColors = ['', 'bg-amber-400', 'bg-gray-300', 'bg-amber-600'];
  const textSizes = ['', 'text-4xl', 'text-3xl', 'text-2xl'];

  return (
    <div className={`flex flex-col items-center ${sizes[position]}`}>
      <div className="text-center mb-2">
        <div className={`w-14 h-14 rounded-full bg-wc-blue flex items-center justify-center text-white text-xl font-black mb-1 mx-auto ${position === 1 ? 'w-16 h-16' : ''}`}>
          {user.name.charAt(0).toUpperCase()}
        </div>
        <p className={`font-bold text-wc-dark truncate max-w-[80px] text-center ${position === 1 ? 'text-sm' : 'text-xs'}`}>
          {user.name.split(' ')[0]}
        </p>
        <p className={`font-black text-wc-blue ${position === 1 ? 'text-xl' : 'text-base'}`}>
          {user.totalPoints} pts
        </p>
      </div>
      <div className={`w-20 ${heights[position]} ${bgColors[position]} rounded-t-2xl flex items-start justify-center pt-2`}>
        <span className={textSizes[position]}>{MEDALS[position - 1]}</span>
      </div>
    </div>
  );
}

export default function Ranking() {
  const { user } = useAuth();
  const [ranking, setRanking] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/ranking')
      .then(res => setRanking(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = ranking.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase())
  );

  const myPosition = ranking.find(u => Number(u.id) === Number(user.id));
  const top3 = ranking.filter(u => u.role !== 'admin').slice(0, 3);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;
  }

  return (
    <div className="page-container page-enter">
      {/* Header */}
      <h1 className="text-2xl font-black text-wc-dark mb-1">🏆 Ranking</h1>
      <p className="text-sm text-gray-500 mb-4">Clasificación general de la quiniela</p>

      {/* My position card */}
      {myPosition && (
        <div className="bg-wc-gradient rounded-2xl p-4 mb-4 text-white flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-xl font-black">
            {myPosition.position <= 3 ? MEDALS[myPosition.position - 1] : `#${myPosition.position}`}
          </div>
          <div className="flex-1">
            <p className="text-xs opacity-70">Tu posición</p>
            <p className="font-black text-lg">{user.name}</p>
            <p className="text-sm opacity-80">
              {myPosition.exactScores} exactos · {myPosition.accuracy}% precisión
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-black">{myPosition.totalPoints}</p>
            <p className="text-xs opacity-70">puntos</p>
          </div>
        </div>
      )}

      {/* Podium */}
      {top3.length >= 3 && (
        <div className="mb-4">
          <h2 className="section-title">🎖️ Podio</h2>
          <div className="card">
            <div className="flex items-end justify-center gap-2 pb-2">
              {top3.length >= 2 && <PodiumCard user={top3[1]} position={2} />}
              {top3.length >= 1 && <PodiumCard user={top3[0]} position={1} />}
              {top3.length >= 3 && <PodiumCard user={top3[2]} position={3} />}
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-3">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
          <path fillRule="evenodd" d="M10.5 3.75a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5ZM2.25 10.5a8.25 8.25 0 1 1 14.59 5.28l4.69 4.69a.75.75 0 1 1-1.06 1.06l-4.69-4.69A8.25 8.25 0 0 1 2.25 10.5Z" clipRule="evenodd" />
        </svg>
        <input
          type="text"
          placeholder="Buscar participante..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-field pl-9 text-sm"
        />
      </div>

      {/* Stats header */}
      <div className="grid grid-cols-5 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wide px-1 mb-2">
        <span className="col-span-1">#</span>
        <span className="col-span-2 text-left">Jugador</span>
        <span>Exactos</span>
        <span>Puntos</span>
      </div>

      {/* Ranking list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="card text-center py-8 text-gray-400">
            <p>No se encontraron participantes</p>
          </div>
        ) : (
          filtered.map(u => {
            const isMe = Number(u.id) === Number(user.id);
            const medal = u.position <= 3 ? MEDALS[u.position - 1] : null;

            return (
              <div
                key={u.id}
                className={`card flex items-center gap-3 py-3 transition-all ${
                  isMe ? 'ring-2 ring-wc-blue shadow-wc' : ''
                }`}
              >
                {/* Position */}
                <div className="w-8 text-center flex-shrink-0">
                  {medal ? (
                    <span className="text-xl">{medal}</span>
                  ) : (
                    <span className={`text-sm font-black ${isMe ? 'text-wc-blue' : 'text-gray-400'}`}>
                      #{u.position}
                    </span>
                  )}
                </div>

                {/* Avatar */}
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0 ${
                  isMe ? 'bg-wc-blue text-white' : 'bg-wc-light-bg text-wc-dark'
                }`}>
                  {u.name.charAt(0).toUpperCase()}
                </div>

                {/* Name & stats */}
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold text-sm truncate ${isMe ? 'text-wc-blue' : 'text-wc-dark'}`}>
                    {u.name} {isMe && <span className="text-xs font-normal">(Tú)</span>}
                  </p>
                  <p className="text-xs text-gray-400">
                    {u.exactScores} exactos · {u.accuracy}% precisión
                  </p>
                  {(u.groupPoints > 0 || u.championPoints > 0) && (
                    <p className="text-xs text-gray-300">
                      {u.matchPoints}p partidos
                      {u.groupPoints > 0 ? ` · ${u.groupPoints}p grupos` : ''}
                      {u.championPoints > 0 ? ` · ${u.championPoints}p especiales` : ''}
                    </p>
                  )}
                </div>

                {/* Exact scores */}
                <div className="text-center flex-shrink-0">
                  <span className="text-sm font-bold text-amber-600">{u.exactScores}</span>
                  <p className="text-[10px] text-gray-400">exactos</p>
                </div>

                {/* Points */}
                <div className="text-right flex-shrink-0">
                  <span className={`text-lg font-black ${isMe ? 'text-wc-blue' : 'text-wc-dark'}`}>
                    {u.totalPoints}
                  </span>
                  <p className="text-[10px] text-gray-400">pts</p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Legend */}
      <div className="mt-6 card bg-wc-light-bg">
        <p className="text-xs font-bold text-gray-600 mb-2">🎯 Sistema de puntuación</p>
        <div className="space-y-1 text-xs text-gray-500">
          <div className="flex justify-between">
            <span>⭐ Marcador exacto</span>
            <span className="font-bold text-amber-600">puntos según fase</span>
          </div>
          <div className="flex justify-between">
            <span>✓ Resultado correcto</span>
            <span className="font-bold text-wc-blue">puntos según fase</span>
          </div>
          <div className="flex justify-between">
            <span>📊 Posición grupo exacta</span>
            <span className="font-bold text-green-600">+2 pts</span>
          </div>
          <div className="flex justify-between">
            <span>✗ Resultado errado</span>
            <span className="font-bold text-gray-400">0 pts</span>
          </div>
        </div>
      </div>
    </div>
  );
}
