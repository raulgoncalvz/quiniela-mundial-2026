import { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

// Returns a map { matchId: { status, homeScore, awayScore, minute } }
// updated in real-time via SSE whenever the backend polls the football API.
export function useLiveMatches() {
  const [liveData, setLiveData] = useState({});

  useEffect(() => {
    const es = new EventSource(`${API_BASE}/matches/live/stream`);

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        if (event.type === 'match_update') {
          setLiveData(prev => ({
            ...prev,
            [event.match.id]: {
              status:    event.match.status,
              homeScore: event.match.homeScore,
              awayScore: event.match.awayScore,
              minute:    event.match.minute,
            },
          }));
        }
      } catch { /* ignore malformed events */ }
    };

    // EventSource auto-reconnects on error — no special handling needed
    return () => es.close();
  }, []);

  return liveData;
}
