'use strict';

// Kayan pencere (sliding window) hız sınırı
// Cihaz: saniyede max 15 tık | IP: saniyede max 60 tık

const WINDOW_MS  = 1000;
const DEVICE_MAX = 15;
const IP_MAX     = 60;

// Task 4A — Ritim analizi: üst üste 8 tam pencere → 30s soft-ban
const RHYTHM_CONSEC_LIMIT = 8;
const RHYTHM_BAN_MS       = 30_000;

// Task 4B — Burst cezası: 3 saniyede 45+ tık → 10s cooldown
const BURST_WINDOW_MS  = 3_000;
const BURST_MAX        = 45;
const BURST_COOLDOWN_MS = 10_000;

const windows     = new Map(); // sliding window state
const rhythmState = new Map(); // Task 4A
const burstState  = new Map(); // Task 4B

// Eski kayıtları temizle
setInterval(() => {
  const now    = Date.now();
  const winCut = now - WINDOW_MS * 2;
  const extCut = now - Math.max(RHYTHM_BAN_MS, BURST_WINDOW_MS) * 2;
  for (const [k, v] of windows)     if (v.windowStart < winCut) windows.delete(k);
  for (const [k, v] of rhythmState) if ((v.bannedUntil || 0) < extCut) rhythmState.delete(k);
  for (const [k, v] of burstState)  if ((v.cooledUntil || 0) < extCut) burstState.delete(k);
}, 10_000);

function allow(key, requested, max) {
  const now = Date.now();
  let w = windows.get(key);
  if (!w || now - w.windowStart >= WINDOW_MS) {
    w = { count: 0, windowStart: now };
    windows.set(key, w);
  }
  const remaining = Math.max(0, max - w.count);
  const granted   = Math.min(requested, remaining);
  w.count += granted;
  return { granted, windowFull: w.count >= max };
}

function applyLimits(deviceId, ip, items) {
  const now        = Date.now();
  const batchTotal = Math.min(items.reduce((s, it) => s + it.n, 0), 10);

  // Task 4B: Burst cooldown aktif mi?
  const burst = burstState.get(deviceId);
  if (burst && now < (burst.cooledUntil || 0)) return [];

  // Task 4A: Ritim ban aktif mi?
  const rhythm = rhythmState.get(deviceId);
  if (rhythm && now < (rhythm.bannedUntil || 0)) return [];

  // Sliding window
  const { granted: devGranted, windowFull } = allow(`dev:${deviceId}`, batchTotal, DEVICE_MAX);
  const { granted: ipGranted }              = allow(`ip:${ip}`, batchTotal, IP_MAX);
  let budget = Math.min(devGranted, ipGranted);

  // Task 4A: Pencere dolu mu sayacı güncelle
  const r = rhythmState.get(deviceId) || { consecFull: 0, bannedUntil: 0 };
  if (windowFull) {
    r.consecFull++;
    if (r.consecFull >= RHYTHM_CONSEC_LIMIT) {
      r.bannedUntil = now + RHYTHM_BAN_MS;
      r.consecFull  = 0;
    }
  } else {
    r.consecFull = 0;
  }
  rhythmState.set(deviceId, r);

  // Task 4B: Burst sayacını güncelle
  const b = burstState.get(deviceId) || { total: 0, since: now, cooledUntil: 0 };
  if (now - b.since >= BURST_WINDOW_MS) { b.total = 0; b.since = now; }
  b.total += budget;
  if (b.total >= BURST_MAX) {
    b.cooledUntil = now + BURST_COOLDOWN_MS;
    b.total = 0;
    b.since = now;
  }
  burstState.set(deviceId, b);

  const result = [];
  for (const it of items) {
    if (budget <= 0) break;
    const granted = Math.min(it.n, budget);
    if (granted > 0) result.push({ ...it, n: granted });
    budget -= granted;
  }
  return result;
}

module.exports = { applyLimits };
