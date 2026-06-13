'use strict';
const fs   = require('fs');
const path = require('path');
const redis = require('./redis');

const API_BASE    = 'https://worldcup26.ir';
const POLL_MS     = 60_000;
const TOKEN_TTL_S = 84 * 24 * 60 * 60;

// Stadyum ID → UTC ofset (saat), yaz saati 2026
const STADIUM_UTC_OFFSET = {
  1: -6, 2: -6, 3: -6,             // Meksika Şehri, Guadalajara, Monterrey (CST - 2023'ten beri DST yok)
  4: -5, 5: -5, 6: -5,             // Dallas, Houston, Kansas City (CDT)
  7: -4, 8: -4, 9: -4,             // Atlanta, Miami, Boston (EDT)
  10: -4, 11: -4, 12: -4,          // Philadelphia, New York/NJ, Toronto (EDT)
  13: -7, 14: -7, 15: -7, 16: -7, // Vancouver, Seattle, SF Bay Area, Los Angeles (PDT)
};

let teamIds = {}; // { "1": "MEX", ... }

function loadTeamIds() {
  try {
    teamIds = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'team_ids.json')));
  } catch {
    console.warn('[scores] data/team_ids.json yok — node scripts/fetch_team_ids.js çalıştırın');
  }
}

// API local_date ("06/13/2026 21:00") + stadyum offset → UTC ISO string
function gameToUtc(g) {
  const m = String(g.local_date ?? '').match(/(\d+)\/(\d+)\/(\d+) (\d+):(\d+)/);
  if (!m) return null;
  const [, mo, da, yr, h, min] = m.map(Number);
  const offsetH = STADIUM_UTC_OFFSET[Number(g.stadium_id)] ?? -5;
  // UTC = yerel saat − ofset  (ofset negatif olduğu için toplanır)
  const utcMs = Date.UTC(yr, mo - 1, da, h, min, 0) - offsetH * 3_600_000;
  return new Date(utcMs).toISOString();
}

function todayStr() {
  const n = new Date();
  return String(n.getMonth() + 1).padStart(2, '0') + '/' +
         String(n.getDate()).padStart(2, '0') + '/' +
         n.getFullYear(); // "06/13/2026"
}

async function getToken() {
  const stored = await redis.get('live:jwt');
  if (stored) return stored;
  return refreshToken();
}

async function refreshToken() {
  const { WC_EMAIL: email, WC_PASSWORD: password } = process.env;
  if (!email || !password) {
    console.warn('[scores] WC_EMAIL/WC_PASSWORD eksik — canlı skor pasif');
    return null;
  }
  try {
    const res = await fetch(`${API_BASE}/auth/authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) { console.error('[scores] auth hatası:', res.status); return null; }
    const data = await res.json();
    const token = data.token;
    if (!token) { console.error('[scores] token yok:', JSON.stringify(data)); return null; }
    await redis.set('live:jwt', token);
    await redis.expire('live:jwt', TOKEN_TTL_S);
    console.log('[scores] JWT token alındı');
    return token;
  } catch (err) {
    console.error('[scores] refreshToken hatası:', err.message);
    return null;
  }
}

async function fetchGames(token) {
  const res = await fetch(`${API_BASE}/get/games`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`/get/games ${res.status}`);
  const raw = await res.json();
  return raw.games ?? raw;
}

async function processGames(games) {
  const today     = todayStr();
  const todayGames = games.filter(g => g.local_date && g.local_date.startsWith(today));

  // --- Günün fikstürlerini otomatik oluştur ve Redis'e yaz ---
  const autoFixtures = [];
  for (const g of todayGames) {
    const homeCode = teamIds[String(g.home_team_id)];
    const awayCode = teamIds[String(g.away_team_id)];
    if (!homeCode || !awayCode) continue;
    const utc = gameToUtc(g);
    if (utc) autoFixtures.push({ id: `m${g.id}`, a: homeCode, b: awayCode, utc });
  }
  if (autoFixtures.length > 0) {
    await redis.set('live:fixtures', JSON.stringify(autoFixtures));
  }

  // --- Canlı skorları Redis'e yaz ---
  let updated = 0;
  for (const g of todayGames) {
    const homeCode = teamIds[String(g.home_team_id)];
    const awayCode = teamIds[String(g.away_team_id)];
    if (!homeCode || !awayCode) continue;
    const finished = g.finished === true || String(g.finished).toUpperCase() === 'TRUE';
    await redis.set(`live:score:m${g.id}`, JSON.stringify({
      homeScore: Number(g.home_score ?? 0),
      awayScore: Number(g.away_score ?? 0),
      finished,
      elapsed: finished || String(g.time_elapsed) === 'finished' ? '' : (g.time_elapsed ?? ''),
    }));
    updated++;
  }
  if (updated > 0) console.log(`[scores] ${updated} maç, ${autoFixtures.length} fikstür güncellendi`);
}

async function poll() {
  try {
    let token = await getToken();
    if (!token) return;

    let games = await fetchGames(token);
    if (games === null) {
      await redis.del('live:jwt');
      token = await refreshToken();
      if (!token) return;
      games = await fetchGames(token);
      if (!games) { console.error('[scores] token yenileme sonrası hata'); return; }
    }

    await processGames(games);
  } catch (err) {
    console.error('[scores] poll hatası:', err.message);
  }
}

async function getLiveScores(fixtures) {
  if (!fixtures || fixtures.length === 0) return {};
  const pairs = await Promise.all(
    fixtures.map(async f => {
      const raw = await redis.get(`live:score:${f.id}`);
      return [f.id, raw ? JSON.parse(raw) : null];
    })
  );
  const result = {};
  for (const [id, val] of pairs) {
    if (val) result[id] = val;
  }
  return result;
}

function start() {
  loadTeamIds();
  if (!process.env.WC_EMAIL) {
    console.warn('[scores] WC_EMAIL tanımlı değil — canlı skor devre dışı');
    return;
  }
  poll();
  setInterval(poll, POLL_MS);
}

module.exports = { start, getLiveScores };
