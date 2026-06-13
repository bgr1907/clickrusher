'use strict';
const fs   = require('fs');
const path = require('path');
const redis = require('./redis');

const API_BASE    = 'https://worldcup26.ir';
const POLL_MS     = 60_000;
const TOKEN_TTL_S = 84 * 24 * 60 * 60; // 84 gün saniye cinsinden

let teamIds      = {};  // { "23": "ARG", ... }
let fixtureByCode = {}; // { "ARG|USA": "m1", "USA|ARG": "m1" }

function loadMappings() {
  try {
    teamIds = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'team_ids.json')));
  } catch {
    console.warn('[scores] data/team_ids.json yok — node scripts/fetch_team_ids.js çalıştırın');
  }
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'fixtures.json')));
    fixtureByCode = {};
    for (const f of (raw.fixtures ?? [])) {
      fixtureByCode[`${f.a}|${f.b}`] = f.id;
      fixtureByCode[`${f.b}|${f.a}`] = f.id;
    }
  } catch {
    console.warn('[scores] fixtures.json okunamadı');
  }
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
    if (!token) { console.error('[scores] token alanı boş:', JSON.stringify(data)); return null; }
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
  if (res.status === 401) return null; // token süresi dolmuş
  if (!res.ok) throw new Error(`/get/games ${res.status}`);
  const raw = await res.json();
  return raw.games ?? raw; // API {games:[...]} veya direkt dizi
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

    // API local_date formatı: "06/13/2026 18:00" (MM/DD/YYYY HH:MM)
    const now   = new Date();
    const today = String(now.getMonth() + 1).padStart(2, '0') + '/' +
                  String(now.getDate()).padStart(2, '0') + '/' +
                  now.getFullYear(); // "06/13/2026"
    let updated = 0;
    for (const g of games) {
      if (!g.local_date || !g.local_date.startsWith(today)) continue;
      const homeCode = teamIds[String(g.home_team_id)];
      const awayCode = teamIds[String(g.away_team_id)];
      if (!homeCode || !awayCode) continue;
      const fid = fixtureByCode[`${homeCode}|${awayCode}`];
      if (!fid) continue;
      await redis.set(`live:score:${fid}`, JSON.stringify({
        homeScore: g.home_score  ?? 0,
        awayScore: g.away_score  ?? 0,
        finished:  Boolean(g.finished),
        elapsed:   g.time_elapsed ?? '',
      }));
      updated++;
    }
    if (updated > 0) console.log(`[scores] ${updated} maç güncellendi`);
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
  loadMappings();
  if (!process.env.WC_EMAIL) {
    console.warn('[scores] WC_EMAIL tanımlı değil — canlı skor devre dışı');
    return;
  }
  poll();
  setInterval(poll, POLL_MS);
}

module.exports = { start, getLiveScores };
