'use strict';
const https = require('https');
const { finalizeMatch } = require('./matchFinalizer');
const prisma = require('../lib/prisma');
const API_KEY = process.env.FOOTBALL_API_KEY || '';
const POLL_MS = 60_000;

// SSE connected clients
const clients = new Set();

// Current minute per match (ephemeral, not persisted)
const liveMinutes = {};

function addClient(res) {
  clients.add(res);
}

function removeClient(res) {
  clients.delete(res);
}

function broadcast(event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch {
      clients.delete(client);
    }
  }
}

function apiGet(path) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.football-data.org',
      path: `/v4${path}`,
      headers: { 'X-Auth-Token': API_KEY },
    };
    https.get(opts, (res) => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error('Invalid JSON from football API')); }
      });
    }).on('error', reject);
  });
}

// Map of English API names → normalized Spanish name used in our DB
const EN_TO_ES = {
  'germany': 'alemania',
  'saudi arabia': 'arabia saudita',
  'algeria': 'argelia',
  'belgium': 'belgica',
  'bosnia and herzegovina': 'bosniaherzegovina',
  'brazil': 'brasil',
  'canada': 'canada',
  'qatar': 'catar',
  'south korea': 'corea del sur',
  'korea republic': 'corea del sur',
  "cote d'ivoire": 'costa de marfil',
  'ivory coast': 'costa de marfil',
  'egypt': 'egipto',
  'scotland': 'escocia',
  'spain': 'espana',
  'united states': 'estados unidos',
  'usa': 'estados unidos',
  'france': 'francia',
  'england': 'inglaterra',
  'iraq': 'irak',
  'iran': 'iran',
  'ir iran': 'iran',
  'japan': 'japon',
  'jordan': 'jordania',
  'mexico': 'mexico',
  'morocco': 'marruecos',
  'norway': 'noruega',
  'new zealand': 'nueva zelanda',
  'netherlands': 'paises bajos',
  'panama': 'panama',
  'portugal': 'portugal',
  'dr congo': 'rd congo',
  'democratic republic of the congo': 'rd congo',
  'czechia': 'rep checa',
  'czech republic': 'rep checa',
  'south africa': 'sudafrica',
  'sweden': 'suecia',
  'switzerland': 'suiza',
  'turkey': 'turquia',
  'tunisia': 'tunez',
  'uzbekistan': 'uzbekistan',
  'curacao': 'curazao',
  'cape verde': 'cabo verde',
};

function normalize(name) {
  if (!name) return '';
  const n = name.toLowerCase()
    .replace(/[áàäâã]/g, 'a').replace(/[éèëê]/g, 'e')
    .replace(/[íìïî]/g, 'i').replace(/[óòöôõ]/g, 'o')
    .replace(/[úùüû]/g, 'u').replace(/[ñ]/g, 'n')
    .replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
  return EN_TO_ES[n] || n;
}

async function pollLiveMatches() {
  if (!API_KEY) return;

  try {
    const today = new Date().toISOString().split('T')[0];
    const data = await apiGet(`/competitions/WC/matches?dateFrom=${today}&dateTo=${today}`);
    const apiMatches = data.matches || [];
    if (!apiMatches.length) return;

    // Load all of today's DB matches with team names
    const todayStart = new Date(`${today}T00:00:00.000Z`);
    const todayEnd   = new Date(`${today}T23:59:59.999Z`);
    const dbMatches = await prisma.match.findMany({
      where: { date: { gte: todayStart, lte: todayEnd } },
      include: { homeTeam: true, awayTeam: true },
    });

    for (const apiM of apiMatches) {
      const apiHome = normalize(apiM.homeTeam?.name || '');
      const apiAway = normalize(apiM.awayTeam?.name || '');

      const dbM = dbMatches.find(m =>
        normalize(m.homeTeam?.name || '') === apiHome &&
        normalize(m.awayTeam?.name || '') === apiAway
      );
      if (!dbM) continue;

      const apiStatus = apiM.status || '';
      let newStatus;
      if (['IN_PLAY', 'PAUSED', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'].includes(apiStatus)) {
        newStatus = 'live';
      } else if (apiStatus === 'FINISHED') {
        newStatus = 'finished';
      } else {
        continue; // SCHEDULED / TIMED — no update needed
      }

      // football-data v4: live score is in score.fullTime during play
      const newHome = apiM.score?.fullTime?.home ?? 0;
      const newAway = apiM.score?.fullTime?.away ?? 0;
      const minute  = apiM.minute ?? null;

      const changed =
        dbM.status !== newStatus ||
        dbM.homeScore !== newHome ||
        dbM.awayScore !== newAway;

      const wasLive = dbM.status === 'live';

      if (changed) {
        // Handle penalty winner from API (penalty shootout status)
        let penaltyWinner = dbM.penaltyWinner;
        if (apiStatus === 'PENALTY_SHOOTOUT' || newStatus === 'finished') {
          const homePens = apiM.score?.penalties?.home;
          const awayPens = apiM.score?.penalties?.away;
          if (homePens != null && awayPens != null) {
            penaltyWinner = homePens > awayPens ? 'home' : 'away';
          }
        }
        await prisma.match.update({
          where: { id: dbM.id },
          data: { status: newStatus, homeScore: newHome, awayScore: newAway, penaltyWinner },
        });
      }

      if (newStatus === 'live') {
        if (minute !== null) liveMinutes[dbM.id] = minute;
      } else {
        delete liveMinutes[dbM.id];
      }

      if (newStatus === 'live' || changed) {
        broadcast({
          type: 'match_update',
          match: {
            id: dbM.id,
            matchNumber: dbM.matchNumber,
            status: newStatus,
            homeScore: newHome,
            awayScore: newAway,
            minute: liveMinutes[dbM.id] ?? null,
          },
        });
      }

      // Auto-calcular puntos cuando el partido termina (solo una vez: cuando pasa de live a finished)
      if (wasLive && newStatus === 'finished') {
        finalizeMatch(dbM.id).catch(err =>
          console.error(`⚽ Error auto-finalizando partido ${dbM.matchNumber}:`, err.message)
        );
      }
    }
  } catch (err) {
    console.error('⚽ Live poll error:', err.message);
  }
}

let timer = null;

function start() {
  if (timer || !API_KEY) return;
  console.log('⚽ Live match service started (polling every 60s)');
  pollLiveMatches();
  timer = setInterval(pollLiveMatches, POLL_MS);
}

function stop() {
  clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, addClient, removeClient };
