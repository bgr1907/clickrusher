'use strict';
const Redis = require('ioredis');

let client;

// REDIS_URL yoksa in-memory sahte istemci kullan (geliştirme için)
if (!process.env.REDIS_URL) {
  console.warn('[redis] REDIS_URL tanımlı değil — in-memory mod aktif (veri kalıcı değil)');

  const store = new Map();
  const sortedSets = new Map(); // key -> Map<member, score>

  function ssGet(key) {
    if (!sortedSets.has(key)) sortedSets.set(key, new Map());
    return sortedSets.get(key);
  }

  client = {
    async get(key) { return store.get(key) ?? null; },
    async set(key, val) { store.set(key, String(val)); return 'OK'; },
    async incrby(key, n) {
      const v = Number(store.get(key) ?? 0) + Number(n);
      store.set(key, String(v)); return v;
    },
    async hset(key, ...args) {
      if (!store.has(key)) store.set(key, {});
      const h = store.get(key);
      if (args.length === 1 && args[0] !== null && typeof args[0] === 'object') {
        Object.assign(h, args[0]);
      } else {
        for (let i = 0; i < args.length; i += 2) h[args[i]] = args[i + 1];
      }
      return 1;
    },
    async hgetall(key) { return store.get(key) ?? null; },
    async hincrby(key, field, n) {
      if (!store.has(key)) store.set(key, {});
      const h = store.get(key);
      h[field] = String(Number(h[field] ?? 0) + Number(n));
      return Number(h[field]);
    },
    async zincrby(key, inc, member) {
      const ss = ssGet(key);
      const cur = ss.get(member) ?? 0;
      ss.set(member, cur + Number(inc));
      return cur + Number(inc);
    },
    async zscore(key, member) {
      const ss = ssGet(key);
      return ss.has(member) ? ss.get(member) : null;
    },
    async zrevrange(key, start, stop, ...opts) {
      const ss = ssGet(key);
      const sorted = [...ss.entries()].sort((a, b) => b[1] - a[1]);
      const slice = sorted.slice(start, stop === -1 ? undefined : stop + 1);
      const withScores = opts.includes('WITHSCORES');
      if (!withScores) return slice.map(e => e[0]);
      return slice.flatMap(e => [e[0], String(e[1])]);
    },
    async zrevrank(key, member) {
      const ss = ssGet(key);
      const sorted = [...ss.entries()].sort((a, b) => b[1] - a[1]);
      const idx = sorted.findIndex(e => e[0] === member);
      return idx === -1 ? null : idx;
    },
    async zcard(key) { return ssGet(key).size; },
    async keys(pattern) {
      const re = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return [...store.keys(), ...sortedSets.keys()].filter(k => re.test(k));
    },
    status: 'ready',
    on() { return this; },
  };
} else {
  client = new Redis(process.env.REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 3 });
  client.on('error', err => console.error('[redis] hata:', err.message));
}

module.exports = client;
