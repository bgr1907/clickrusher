'use strict';
// .env dosyası varsa yükle
if (process.env.NODE_ENV !== 'test') {
  try { require('fs').readFileSync('.env', 'utf8').split('\n').forEach(l => {
    const m = l.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g,'');
  }); } catch {}
}

const path     = require('path');
const fs       = require('fs');
const Fastify  = require('fastify');
const { applyLimits }    = require('./lib/ratelimit');
const counters           = require('./lib/counters');
const { registerUser, loginUser } = require('./lib/auth');
const { containsBadWord }         = require('./lib/badwords');
const scoresLib          = require('./lib/scores');
const racesLib           = require('./lib/races');
const crunLib            = require('./lib/crun');
const redis              = require('./lib/redis');

const app = Fastify({ logger: { level: 'warn' } });

app.register(require('@fastify/static'), {
  root: path.join(__dirname, 'public'),
  prefix: '/',
});

// ---- Takımlar & fikstürler ----
const TEAMS = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'teams.json')));
let fixtures = [];

function loadFixtures() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'fixtures.json')));
    fixtures = raw.fixtures ?? [];
  } catch (e) { console.error('[fixtures] okuma hatası:', e.message); }
}
loadFixtures();
setInterval(loadFixtures, 5 * 60 * 1000);

// ---- SSE istemci havuzları ----
const sseClients  = new Set();
const raceClients = new Map(); // raceId → Set<res>

// ---- Doğrulama sabitleri ----
// Task 2: max 15 karakter, nokta kaldırıldı
const NAME_RE   = /^[a-zA-Z0-9ğüşıöçĞÜŞİÖÇ_\-]{1,15}$/u;
const PWD_RE    = /^.{4,20}$/;
const DEVICE_RE = /^[a-zA-Z0-9_\-]{8,64}$/;

function sanitizeName(name) {
  if (!name || !NAME_RE.test(String(name))) return null;
  const clean = String(name).replace(/[<>"'&]/g, '');
  if (containsBadWord(clean)) return null;
  return clean;
}

// ---- Durum snapshot ----
async function buildState(deviceId, username) {
  // Otomatik güncellenen fikstürleri Redis'ten al; yoksa statik dosyaya dön
  let activeFixtures = fixtures;
  try {
    const cached = await redis.get('live:fixtures');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.length > 0) activeFixtures = parsed;
    }
  } catch {}

  const [scores, liveScores, ...fixData] = await Promise.all([
    counters.getCountryScores(TEAMS),
    scoresLib.getLiveScores(activeFixtures),
    ...activeFixtures.flatMap(f => [
      counters.getMatchCounters(f.id),
      counters.getMatchTop10(f.id, 'A'),
      counters.getMatchTop10(f.id, 'B'),
    ]),
  ]);

  const countryTops = {};
  await Promise.all(TEAMS.map(async t => {
    countryTops[t.c] = await counters.getCountryTop10(t.c);
  }));

  const fixtureStates = activeFixtures.map((f, i) => ({
    id: f.id, a: f.a, b: f.b, ko: f.ko, utc: f.utc,
    counters: fixData[i * 3],
    topA: fixData[i * 3 + 1],
    topB: fixData[i * 3 + 2],
  }));

  const state = { scores, fixtures: fixtureStates, countryTops, liveScores };
  if (deviceId && username) {
    const nick = username.toLowerCase().trim();
    [state.me, state.myCountries] = await Promise.all([
      counters.getUserStats(nick, username),
      counters.getUserCountryStats(nick),
    ]);
  }
  return state;
}

// ---- ROUTES ----

app.get('/healthz', async () => ({ ok: true }));

app.get('/api/state', async (req) => {
  const { device, name } = req.query;
  return buildState(device, name);
});

// Task 3: Kayıt
app.post('/api/register', {
  schema: { body: { type: 'object', required: ['device','name','password'],
    properties: { device:{type:'string'}, name:{type:'string'}, password:{type:'string'} } } },
  attachValidation: true,
}, async (req) => {
  if (req.validationError) return { ok: false, reason: 'invalid' };
  const { device, name, password } = req.body;
  if (!DEVICE_RE.test(String(device ?? ''))) return { ok: false, reason: 'invalid' };
  if (!PWD_RE.test(String(password ?? '')))  return { ok: false, reason: 'invalid_password' };
  const clean = sanitizeName(name);
  if (!clean) {
    // Format mı bad word mü ayırt et
    const stripped = String(name).replace(/[<>"'&]/g, '');
    return { ok: false, reason: containsBadWord(stripped) ? 'badword' : 'invalid' };
  }
  return registerUser(device, clean, password);
});

// Task 3: Giriş
app.post('/api/login', {
  schema: { body: { type: 'object', required: ['device','name','password'],
    properties: { device:{type:'string'}, name:{type:'string'}, password:{type:'string'} } } },
  attachValidation: true,
}, async (req) => {
  if (req.validationError) return { ok: false, reason: 'invalid' };
  const { device, name, password } = req.body;
  if (!DEVICE_RE.test(String(device ?? ''))) return { ok: false, reason: 'invalid' };
  return loginUser(device, String(name ?? ''), String(password ?? ''));
});

// Toplu tık
app.post('/api/clicks', {
  schema: { body: { type: 'object', required: ['device','name','items'],
    properties: { device:{type:'string'}, name:{type:'string'}, items:{type:'array'} } } },
  attachValidation: true,
}, async (req, reply) => {
  if (req.validationError) return reply.code(204).send();

  const { device, name, items } = req.body;

  // Task 4C: Honeypot — bot'lar gizli alanı doldurur
  if (req.body._hp !== undefined && String(req.body._hp) !== '') return reply.code(204).send();

  if (!DEVICE_RE.test(String(device ?? ''))) return reply.code(204).send();
  const cleanName = sanitizeName(name);
  if (!cleanName) return reply.code(204).send();
  if (!Array.isArray(items) || items.length === 0) return reply.code(204).send();

  // Task 3: Kayıtlı kullanıcıysa nick eşleşmeli
  const registeredName = await redis.get(`auth:device:${device}`);
  if (registeredName && registeredName.toLowerCase() !== cleanName.toLowerCase()) {
    return reply.code(204).send();
  }

  const validItems = items
    .filter(it => it && typeof it === 'object' &&
      ['country','match'].includes(it.type) &&
      typeof it.id === 'string' && it.id.length >= 2 &&
      Number.isInteger(it.n) && it.n >= 1)
    .map(it => ({ ...it, n: Math.min(it.n, 10) }));

  if (validItems.length === 0) return reply.code(204).send();

  const ip      = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ?? req.ip ?? '0.0.0.0';
  const allowed = applyLimits(device, ip, validItems);
  if (allowed.length === 0) return reply.code(204).send();

  const nick = cleanName.toLowerCase();
  let userTotal = 0;
  await Promise.all(allowed.map(async it => {
    if (it.type === 'country') {
      await counters.addCountryClicks(it.id, nick, cleanName, it.n);
    } else {
      const side = ['A','B'].includes(it.side) ? it.side : 'A';
      await counters.addMatchClicks(it.id, side, cleanName, it.n);
    }
    userTotal += it.n;
  }));

  await counters.updateUser(nick, cleanName, userTotal);
  return counters.getUserStats(nick, cleanName);
});

// SSE akışı
app.get('/api/stream', async (req, reply) => {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  reply.raw.write('retry: 3000\n\n');
  const client = reply.raw;
  sseClients.add(client);
  console.log(`[sse] bağlı istemci: ${sseClients.size}`);
  req.raw.on('close', () => {
    sseClients.delete(client);
    console.log(`[sse] ayrılan istemci: ${sseClients.size}`);
  });
  return reply;
});

// SSE broadcast: saniyede 1
async function broadcast() {
  if (sseClients.size === 0) return;
  try {
    const state = await buildState();
    const data  = `data: ${JSON.stringify(state)}\n\n`;
    for (const client of sseClients) {
      try { client.write(data); } catch { sseClients.delete(client); }
    }
  } catch (e) { console.error('[broadcast] hata:', e.message); }
}
setInterval(broadcast, 1000);

// ---- Yarış SSE ----
async function broadcastRace(raceId) {
  const set = raceClients.get(raceId);
  if (!set || set.size === 0) return;
  const state = await racesLib.getRaceState(raceId);
  if (!state) return;
  const data = `data: ${JSON.stringify(state)}\n\n`;
  for (const client of set) {
    try { client.write(data); } catch { set.delete(client); }
  }
}

// Geri sayım → aktif → (süre bazlıysa) bitiş zinciri
function scheduleRaceTransitions(raceId, winType, winValue) {
  setTimeout(async () => {
    const race = await racesLib.activateRace(raceId);
    if (!race) return;
    await broadcastRace(raceId);
    if (winType === 'time') {
      setTimeout(async () => {
        const r = await redis.hgetall(`race:${raceId}`);
        if (r && r.status === 'active') {
          await racesLib.finishRace(raceId);
          await broadcastRace(raceId);
        }
      }, winValue * 1000);
    }
  }, 10_000);
}

app.get('/api/race/:id/stream', async (req, reply) => {
  const { id } = req.params;
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  reply.raw.write('retry: 3000\n\n');
  if (!raceClients.has(id)) raceClients.set(id, new Set());
  raceClients.get(id).add(reply.raw);
  const state = await racesLib.getRaceState(id);
  if (state) reply.raw.write(`data: ${JSON.stringify(state)}\n\n`);
  req.raw.on('close', () => {
    const s = raceClients.get(id);
    if (s) { s.delete(reply.raw); if (!s.size) raceClients.delete(id); }
  });
  return reply;
});

// Yarış yarat
app.post('/api/race/create', {
  schema: { body: { type:'object', required:['device','name','mode','winType','winValue','maxPlayers'],
    properties: { device:{type:'string'}, name:{type:'string'}, mode:{type:'string'},
      winType:{type:'string'}, winValue:{type:'number'}, maxPlayers:{type:'number'},
      teams:{type:'array'}, creatorFlag:{type:'object'}, isPublic:{type:'boolean'} } } },
  attachValidation: true,
}, async (req) => {
  if (req.validationError) return { ok: false, reason: 'invalid' };
  const { device, name, mode, winType, winValue, maxPlayers, teams, creatorFlag, isPublic } = req.body;
  if (!DEVICE_RE.test(String(device ?? ''))) return { ok: false, reason: 'invalid' };
  const registeredName = await redis.get(`auth:device:${device}`);
  if (!registeredName) return { ok: false, reason: 'not_logged_in' };
  if (!['individual','team'].includes(mode))   return { ok: false, reason: 'invalid' };
  if (!['clicks','time'].includes(winType))     return { ok: false, reason: 'invalid' };
  const wv = Math.min(Math.max(Math.floor(winValue), winType === 'clicks' ? 50 : 15), winType === 'clicks' ? 10000 : 300);
  const mp = Math.min(Math.max(Math.floor(maxPlayers), 2), 16);

  // Özel bayrak metni küfür filtresi
  if (creatorFlag && creatorFlag.type === 'custom' && creatorFlag.value) {
    const txt = String(creatorFlag.value.text || '').replace(/[<>"'&]/g, '').slice(0, 3);
    if (containsBadWord(txt)) return { ok: false, reason: 'flag_badword' };
    creatorFlag.value.text = txt;
  }

  // Takım adları ve takım bayrakları küfür filtresi
  if (mode === 'team' && Array.isArray(teams)) {
    for (const t of teams) {
      const tName = String(t.name || '').replace(/[<>"'&]/g, '').slice(0, 30);
      if (containsBadWord(tName)) return { ok: false, reason: 'flag_badword' };
      t.name = tName;
      if (t.flag && t.flag.type === 'custom' && t.flag.value) {
        const txt = String(t.flag.value.text || '').replace(/[<>"'&]/g, '').slice(0, 3);
        if (containsBadWord(txt)) return { ok: false, reason: 'flag_badword' };
        t.flag.value.text = txt;
      }
    }
  }

  return racesLib.createRace({ creatorDevice: device, creatorName: registeredName, mode, winType, winValue: wv, maxPlayers: mp, teams, creatorFlag, isPublic: isPublic !== false });
});

// Yarışa katıl
app.post('/api/race/:id/join', {
  schema: { body: { type:'object', required:['device','name'],
    properties: { device:{type:'string'}, name:{type:'string'}, flag:{type:'object'}, teamId:{type:'string'} } } },
  attachValidation: true,
}, async (req) => {
  if (req.validationError) return { ok: false, reason: 'invalid' };
  const { device, name, flag, teamId } = req.body;
  const { id } = req.params;
  if (!DEVICE_RE.test(String(device ?? ''))) return { ok: false, reason: 'invalid' };
  const registeredName = await redis.get(`auth:device:${device}`);
  if (!registeredName) return { ok: false, reason: 'not_logged_in' };

  // Katılımcı özel bayrak metni küfür filtresi
  if (flag && flag.type === 'custom' && flag.value) {
    const txt = String(flag.value.text || '').replace(/[<>"'&]/g, '').slice(0, 3);
    if (containsBadWord(txt)) return { ok: false, reason: 'flag_badword' };
    flag.value.text = txt;
  }

  const result = await racesLib.joinRace(id, device, registeredName, flag, teamId);
  if (!result.ok) return result;
  if (result.shouldStartCountdown) {
    const race = await redis.hgetall(`race:${id}`);
    await racesLib.beginCountdown(id);
    scheduleRaceTransitions(id, race.winType, Number(race.winValue));
  }
  await broadcastRace(id);
  return { ok: true };
});

// Kurucu erken başlatma (sadece bireysel mod)
app.post('/api/race/:id/force-start', {
  schema: { body: { type:'object', required:['device'],
    properties: { device:{type:'string'} } } },
  attachValidation: true,
}, async (req) => {
  if (req.validationError) return { ok: false, reason: 'invalid' };
  const { device } = req.body;
  const { id } = req.params;
  if (!DEVICE_RE.test(String(device ?? ''))) return { ok: false, reason: 'invalid' };
  const registeredName = await redis.get(`auth:device:${device}`);
  if (!registeredName) return { ok: false, reason: 'not_logged_in' };
  const result = await racesLib.forceStart(id, device);
  if (!result.ok) return result;
  scheduleRaceTransitions(id, result.winType, result.winValue);
  await broadcastRace(id);
  return { ok: true };
});

// Yarışa tık gönder
app.post('/api/race/:id/click', {
  schema: { body: { type:'object', required:['device','n'],
    properties: { device:{type:'string'}, n:{type:'number'} } } },
  attachValidation: true,
}, async (req) => {
  if (req.validationError) return { ok: false };
  const { device, n } = req.body;
  const { id } = req.params;
  if (!DEVICE_RE.test(String(device ?? ''))) return { ok: false };
  const safeN = Math.min(Math.max(Math.floor(n), 1), 10);
  const result = await racesLib.addRaceClick(id, device, safeN);
  if (!result.ok) return { ok: false };
  if (result.finished) await racesLib.finishRace(id);
  await broadcastRace(id);
  return { ok: true };
});

// Yarış durumunu al
app.get('/api/race/:id/state', async (req) => {
  const state = await racesLib.getRaceState(req.params.id);
  return state ?? { error: 'not_found' };
});

// Bekleyen yarışları listele
app.get('/api/races/open', async () => racesLib.getOpenRaces());

// Profil endpoint
app.get('/api/profile', async (req) => {
  const { device } = req.query;
  if (!device || !DEVICE_RE.test(String(device))) return { ok: false };
  const displayName = await redis.get(`auth:device:${device}`);
  if (!displayName) return { ok: false, reason: 'not_logged_in' };
  const nick = displayName.toLowerCase().trim();
  const [userHash, authHash, countries, raceHistory] = await Promise.all([
    redis.hgetall(`user:nick:${nick}`),
    redis.hgetall(`auth:nick:${nick}`),
    counters.getUserCountryStats(nick),
    racesLib.getUserRaceHistory(nick),
  ]);
  return {
    ok:        true,
    name:      displayName,
    total:     Number(userHash?.total ?? 0),
    createdAt: authHash?.createdAt ? Number(authHash.createdAt) : null,
    countries,
    raceHistory,
  };
});

// ---- Chat SSE broadcast ----
function broadcastChatMsg(fixtureId, msg) {
  const data = `event: chat\ndata: ${JSON.stringify({ fixtureId, msg })}\n\n`;
  for (const client of sseClients) {
    try { client.write(data); } catch { sseClients.delete(client); }
  }
}

// Chat: geçmişi al (son 50 mesaj, eskiden yeniye sıralı)
app.get('/api/chat/:fixtureId', async (req) => {
  const { fixtureId } = req.params;
  const raw = await redis.lrange(`chat:match:${fixtureId}`, 0, 49);
  const messages = (raw || []).map(r => JSON.parse(r)).reverse();
  return { ok: true, messages };
});

// Chat: mesaj gönder
app.post('/api/chat/:fixtureId', {
  schema: { body: { type: 'object', required: ['device', 'text'],
    properties: { device: { type: 'string' }, text: { type: 'string' } } } },
  attachValidation: true,
}, async (req) => {
  if (req.validationError) return { ok: false, reason: 'invalid' };
  const { device, text } = req.body;
  const { fixtureId } = req.params;
  if (!DEVICE_RE.test(String(device ?? ''))) return { ok: false, reason: 'invalid' };
  const displayName = await redis.get(`auth:device:${device}`);
  if (!displayName) return { ok: false, reason: 'not_logged_in' };

  const rawText = String(text ?? '').trim().slice(0, 140);
  if (!rawText.length) return { ok: false, reason: 'empty' };
  const escapeMap = { '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', '&': '&amp;' };
  const cleanText = rawText.replace(/[<>"'&]/g, c => escapeMap[c]);
  if (containsBadWord(cleanText)) return { ok: false, reason: 'badword' };

  const nick = displayName.toLowerCase().trim();
  const rlKey = `chat:rl:${nick}`;
  const limited = await redis.get(rlKey);
  if (limited) return { ok: false, reason: 'rate_limited' };
  await redis.set(rlKey, '1');
  await redis.expire(rlKey, 3);

  const msg = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    nick,
    name: displayName,
    text: cleanText,
    ts: Date.now(),
  };
  const chatKey = `chat:match:${fixtureId}`;
  await redis.lpush(chatKey, JSON.stringify(msg));
  await redis.ltrim(chatKey, 0, 199);
  await redis.expire(chatKey, 24 * 3600);

  broadcastChatMsg(fixtureId, msg);
  return { ok: true, msg };
});

// ============================================================
// CHAMELEON RUN
// ============================================================
const crunClients = new Map(); // roomId → Set<res>

async function broadcastCrun(roomId, extra) {
  const set = crunClients.get(roomId);
  if (!set || !set.size) return;
  const state = await crunLib.getRoomState(roomId);
  if (!state) return;
  const payload = extra ? { ...state, ...extra } : state;
  const data    = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of set) {
    try { client.write(data); } catch { set.delete(client); }
  }
}

function scheduleCrunTransitions(roomId, duration) {
  setTimeout(async () => {
    await crunLib.activateRoom(roomId);
    await broadcastCrun(roomId);
    setTimeout(async () => {
      const room = await redis.hgetall(`crun:${roomId}`);
      if (room && room.status === 'active') {
        await crunLib.finishRoom(roomId);
        await broadcastCrun(roomId);
      }
    }, duration * 1000);
  }, 6000);
}

app.get('/api/crun/open', async () => crunLib.getOpenRooms());

app.get('/api/crun/:id/state', async (req) => {
  const state = await crunLib.getRoomState(req.params.id);
  return state ?? { error: 'not_found' };
});

app.get('/api/crun/:id/stream', async (req, reply) => {
  const { id } = req.params;
  reply.raw.writeHead(200, {
    'Content-Type':      'text/event-stream',
    'Cache-Control':     'no-cache',
    'Connection':        'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  reply.raw.write('retry: 3000\n\n');
  if (!crunClients.has(id)) crunClients.set(id, new Set());
  crunClients.get(id).add(reply.raw);
  const state = await crunLib.getRoomState(id);
  if (state) reply.raw.write(`data: ${JSON.stringify(state)}\n\n`);
  req.raw.on('close', () => {
    const s = crunClients.get(id);
    if (s) { s.delete(reply.raw); if (!s.size) crunClients.delete(id); }
  });
  return reply;
});

app.post('/api/crun/create', {
  schema: { body: { type: 'object', required: ['device', 'duration'],
    properties: { device: { type: 'string' }, duration: { type: 'number' }, isPublic: { type: 'boolean' } } } },
  attachValidation: true,
}, async (req) => {
  if (req.validationError) return { ok: false, reason: 'invalid' };
  const { device, duration, isPublic } = req.body;
  if (!DEVICE_RE.test(String(device ?? ''))) return { ok: false, reason: 'invalid' };
  const registeredName = await redis.get(`auth:device:${device}`);
  if (!registeredName) return { ok: false, reason: 'not_logged_in' };
  return crunLib.createRoom({ creatorDevice: device, creatorName: registeredName, duration, isPublic: isPublic !== false });
});

app.post('/api/crun/:id/join', {
  schema: { body: { type: 'object', required: ['device'],
    properties: { device: { type: 'string' }, flag: { type: 'object' } } } },
  attachValidation: true,
}, async (req) => {
  if (req.validationError) return { ok: false, reason: 'invalid' };
  const { device, flag } = req.body;
  const { id } = req.params;
  if (!DEVICE_RE.test(String(device ?? ''))) return { ok: false, reason: 'invalid' };
  const registeredName = await redis.get(`auth:device:${device}`);
  if (!registeredName) return { ok: false, reason: 'not_logged_in' };
  const result = await crunLib.joinRoom(id, device, registeredName, flag ?? null);
  if (!result.ok) return result;
  await broadcastCrun(id);
  return { ok: true };
});

app.post('/api/crun/:id/set-flag', {
  schema: { body: { type: 'object', required: ['device', 'flag'],
    properties: { device: { type: 'string' }, flag: { type: 'object' } } } },
  attachValidation: true,
}, async (req) => {
  if (req.validationError) return { ok: false, reason: 'invalid' };
  const { device, flag } = req.body;
  const { id } = req.params;
  if (!DEVICE_RE.test(String(device ?? ''))) return { ok: false, reason: 'invalid' };
  const registeredName = await redis.get(`auth:device:${device}`);
  if (!registeredName) return { ok: false, reason: 'not_logged_in' };
  await crunLib.setFlag(id, device, flag);
  await broadcastCrun(id);
  return { ok: true };
});

app.post('/api/crun/:id/ready', {
  schema: { body: { type: 'object', required: ['device'],
    properties: { device: { type: 'string' } } } },
  attachValidation: true,
}, async (req) => {
  if (req.validationError) return { ok: false, reason: 'invalid' };
  const { device } = req.body;
  const { id } = req.params;
  if (!DEVICE_RE.test(String(device ?? ''))) return { ok: false, reason: 'invalid' };
  const registeredName = await redis.get(`auth:device:${device}`);
  if (!registeredName) return { ok: false, reason: 'not_logged_in' };
  const result = await crunLib.setReady(id, device);
  if (!result.ok) return result;
  if (result.allReady) {
    const room = await redis.hgetall(`crun:${id}`);
    await crunLib.beginCountdown(id);
    scheduleCrunTransitions(id, Number(room.duration));
  }
  await broadcastCrun(id);
  return { ok: true, allReady: result.allReady };
});

app.post('/api/crun/:id/force-start', {
  schema: { body: { type: 'object', required: ['device'],
    properties: { device: { type: 'string' } } } },
  attachValidation: true,
}, async (req) => {
  if (req.validationError) return { ok: false, reason: 'invalid' };
  const { device } = req.body;
  const { id } = req.params;
  if (!DEVICE_RE.test(String(device ?? ''))) return { ok: false, reason: 'invalid' };
  const registeredName = await redis.get(`auth:device:${device}`);
  if (!registeredName) return { ok: false, reason: 'not_logged_in' };
  const result = await crunLib.forceStart(id, device);
  if (!result.ok) return result;
  scheduleCrunTransitions(id, result.duration);
  await broadcastCrun(id);
  return { ok: true };
});

app.post('/api/crun/:id/powerup', {
  schema: { body: { type: 'object', required: ['device', 'type'],
    properties: { device: { type: 'string' }, type: { type: 'string' },
      target: { type: 'string', nullable: true } } } },
  attachValidation: true,
}, async (req) => {
  if (req.validationError) return { ok: false };
  const { device, type, target } = req.body;
  const { id } = req.params;
  if (!DEVICE_RE.test(String(device ?? ''))) return { ok: false };
  const result = await crunLib.usePowerup(id, device, type, target ?? null);
  if (!result.ok) return result;
  // Broadcast powerup event immediately to all room clients
  const set = crunClients.get(id);
  if (set) {
    const data = `data: ${JSON.stringify({ _event: 'powerup', event: result.event })}\n\n`;
    for (const client of set) {
      try { client.write(data); } catch { set.delete(client); }
    }
  }
  return { ok: true };
});

app.post('/api/crun/:id/distance', {
  schema: { body: { type: 'object', required: ['device', 'distance'],
    properties: { device: { type: 'string' }, distance: { type: 'number' } } } },
  attachValidation: true,
}, async (req) => {
  if (req.validationError) return { ok: false };
  const { device, distance } = req.body;
  const { id } = req.params;
  if (!DEVICE_RE.test(String(device ?? ''))) return { ok: false };
  await crunLib.reportDistance(id, device, distance);
  await broadcastCrun(id);
  return { ok: true };
});

const PORT = Number(process.env.PORT ?? 3000);
app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) { console.error(err); process.exit(1); }
  console.log(`Taraftar Arena 26 → http://localhost:${PORT}`);
  scoresLib.start();
});
