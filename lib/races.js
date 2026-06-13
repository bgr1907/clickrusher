'use strict';
const crypto = require('crypto');
const redis  = require('./redis');

const TTL = 24 * 3600; // 24 saat — yarış TTL

function genId() {
  return crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 karakter
}

// Yarış oluştur; yaratıcı otomatik katılır
async function createRace({ creatorDevice, creatorName, mode, winType, winValue, maxPlayers, teams, creatorFlag }) {
  const id  = genId();
  const now = Date.now();

  await redis.hset(`race:${id}`, {
    creator:     creatorDevice,
    creatorName,
    mode,           // 'individual' | 'team'
    winType,        // 'clicks' | 'time'
    winValue:    String(winValue),
    maxPlayers:  String(maxPlayers),
    status:      'waiting',
    createdAt:   String(now),
  });
  await redis.expire(`race:${id}`, TTL);

  if (mode === 'team' && Array.isArray(teams)) {
    for (const t of teams) {
      await redis.hset(`race:${id}:teams`, { [t.id]: JSON.stringify(t) });
    }
    await redis.expire(`race:${id}:teams`, TTL);
  }

  const creatorTeamId = (mode === 'team' && teams && teams.length) ? teams[0].id : null;
  await _addPlayer(id, creatorDevice, creatorName, creatorFlag, creatorTeamId);

  await redis.zadd('races:open', now, id);
  return { ok: true, id };
}

// Oyuncuyu yarışa ekle (iç kullanım)
async function _addPlayer(raceId, deviceId, username, flag, teamId) {
  await redis.hset(`race:${raceId}:players`, {
    [deviceId]: JSON.stringify({ name: username, flag, teamId: teamId ?? null, clicks: 0, joinedAt: Date.now() }),
  });
  await redis.expire(`race:${raceId}:players`, TTL);
}

// Oyuncu yarışa katılır; oda dolunca { shouldStartCountdown: true } döner
async function joinRace(raceId, deviceId, username, flag, teamId) {
  const race = await redis.hgetall(`race:${raceId}`);
  if (!race || !race.status) return { ok: false, reason: 'not_found' };
  if (race.status !== 'waiting')  return { ok: false, reason: 'already_started' };

  const playersRaw    = await redis.hgetall(`race:${raceId}:players`);
  const currentCount  = playersRaw ? Object.keys(playersRaw).length : 0;
  const maxPlayers    = Number(race.maxPlayers);

  if (playersRaw && playersRaw[deviceId]) return { ok: false, reason: 'already_joined' };
  if (currentCount >= maxPlayers)          return { ok: false, reason: 'full' };

  await _addPlayer(raceId, deviceId, username, flag, teamId ?? null);

  const shouldStartCountdown = currentCount + 1 >= maxPlayers;
  return { ok: true, shouldStartCountdown };
}

// Geri sayımı Redis'e yaz (server.js setTimeout'u yönetir)
async function beginCountdown(raceId) {
  const startAt = Date.now() + 10_000;
  await redis.hset(`race:${raceId}`, { status: 'countdown', startAt: String(startAt) });
  await redis.zrem('races:open', raceId);
  return startAt;
}

// Yarışı aktif hale getir; süre bazlıysa endAt da yaz
async function activateRace(raceId) {
  const race = await redis.hgetall(`race:${raceId}`);
  if (!race) return null;
  const updates = { status: 'active' };
  if (race.winType === 'time') {
    updates.endAt = String(Date.now() + Number(race.winValue) * 1000);
  }
  await redis.hset(`race:${raceId}`, updates);
  return race;
}

// Tık ekle; tık limitine ulaşıldıysa { finished: true } döner
async function addRaceClick(raceId, deviceId, n) {
  const race = await redis.hgetall(`race:${raceId}`);
  if (!race || race.status !== 'active') return { ok: false };

  const playerRaw = await redis.hget(`race:${raceId}:players`, deviceId);
  if (!playerRaw) return { ok: false };

  const player    = JSON.parse(playerRaw);
  player.clicks  += n;
  await redis.hset(`race:${raceId}:players`, { [deviceId]: JSON.stringify(player) });

  if (race.winType !== 'clicks') return { ok: true, finished: false };

  const target = Number(race.winValue);
  let finished = false;

  if (race.mode === 'individual') {
    finished = player.clicks >= target;
  } else {
    const playersRaw = await redis.hgetall(`race:${raceId}:players`);
    const teamClicks = _calcTeamClicks(playersRaw);
    finished = Math.max(...Object.values(teamClicks), 0) >= target;
  }

  return { ok: true, finished };
}

// Yarışı bitir; kazananı belirle ve geçmişe kaydet
async function finishRace(raceId) {
  const race = await redis.hgetall(`race:${raceId}`);
  if (!race || race.status === 'finished') return;

  const [playersRaw, teamsRaw] = await Promise.all([
    redis.hgetall(`race:${raceId}:players`),
    redis.hgetall(`race:${raceId}:teams`),
  ]);
  if (!playersRaw) return;

  const players = Object.entries(playersRaw).map(([deviceId, raw]) => ({ deviceId, ...JSON.parse(raw) }));
  const now     = Date.now();
  let winnerId = '', winnerName = '';

  if (race.mode === 'team') {
    const teams      = teamsRaw ? Object.values(teamsRaw).map(r => JSON.parse(r)) : [];
    const teamClicks = _calcTeamClicks(playersRaw);
    let maxC = -1, winTeam = null;
    for (const t of teams) {
      const c = teamClicks[t.id] || 0;
      if (c > maxC) { maxC = c; winTeam = t; }
    }
    winnerId   = winTeam?.id   ?? '';
    winnerName = winTeam?.name ?? '';

    for (const p of players) {
      const nick = (p.name || '').toLowerCase().trim();
      await _saveHistory(nick, {
        raceId, result: p.teamId === winnerId ? 'win' : 'lose',
        score: p.clicks, winnerName, finishedAt: now, mode: race.mode,
      });
    }
  } else {
    let maxC = -1, winner = null;
    for (const p of players) { if (p.clicks > maxC) { maxC = p.clicks; winner = p; } }
    winnerId   = winner?.deviceId ?? '';
    winnerName = winner?.name     ?? '';

    for (const p of players) {
      const nick = (p.name || '').toLowerCase().trim();
      await _saveHistory(nick, {
        raceId, result: p.deviceId === winnerId ? 'win' : 'lose',
        score: p.clicks, winnerName, finishedAt: now, mode: race.mode,
      });
    }
  }

  await redis.hset(`race:${raceId}`, { status: 'finished', winner: winnerId, winnerName, finishedAt: String(now) });
  await redis.zrem('races:open', raceId);
}

async function _saveHistory(nick, data) {
  await redis.lpush(`user:race:history:nick:${nick}`, JSON.stringify(data));
  await redis.ltrim(`user:race:history:nick:${nick}`, 0, 49);
  await redis.expire(`user:race:history:nick:${nick}`, 365 * 24 * 3600);
}

function _calcTeamClicks(playersRaw) {
  const map = {};
  for (const raw of Object.values(playersRaw)) {
    const p = JSON.parse(raw);
    if (p.teamId) map[p.teamId] = (map[p.teamId] || 0) + p.clicks;
  }
  return map;
}

// Tam yarış durumu snapshot
async function getRaceState(raceId) {
  const [race, playersRaw, teamsRaw] = await Promise.all([
    redis.hgetall(`race:${raceId}`),
    redis.hgetall(`race:${raceId}:players`),
    redis.hgetall(`race:${raceId}:teams`),
  ]);
  if (!race || !race.status) return null;

  const players = playersRaw
    ? Object.entries(playersRaw).map(([deviceId, raw]) => ({ deviceId, ...JSON.parse(raw) }))
    : [];
  const teams = teamsRaw
    ? Object.values(teamsRaw).map(r => JSON.parse(r))
    : [];

  if (race.mode === 'team') {
    const tc = _calcTeamClicks(playersRaw || {});
    for (const t of teams) t.clicks = tc[t.id] || 0;
  }

  return {
    id:          raceId,
    creator:     race.creator,
    creatorName: race.creatorName,
    mode:        race.mode,
    winType:     race.winType,
    winValue:    Number(race.winValue),
    maxPlayers:  Number(race.maxPlayers),
    status:      race.status,
    createdAt:   Number(race.createdAt),
    startAt:     race.startAt   ? Number(race.startAt)   : null,
    endAt:       race.endAt     ? Number(race.endAt)     : null,
    winner:      race.winner    || null,
    winnerName:  race.winnerName || null,
    finishedAt:  race.finishedAt ? Number(race.finishedAt) : null,
    players,
    teams,
  };
}

// Bekleyen yarışları listele (son 20)
async function getOpenRaces() {
  const ids = await redis.zrevrange('races:open', 0, 19);
  const races = await Promise.all(ids.map(async id => {
    const [race, playersRaw] = await Promise.all([
      redis.hgetall(`race:${id}`),
      redis.hgetall(`race:${id}:players`),
    ]);
    if (!race) return null;
    return {
      id,
      creatorName: race.creatorName,
      mode:        race.mode,
      winType:     race.winType,
      winValue:    Number(race.winValue),
      maxPlayers:  Number(race.maxPlayers),
      playerCount: playersRaw ? Object.keys(playersRaw).length : 0,
    };
  }));
  return races.filter(Boolean);
}

// Kullanıcının yarış geçmişi (son 50)
async function getUserRaceHistory(nick) {
  const raw = await redis.lrange(`user:race:history:nick:${nick}`, 0, 49);
  return (raw || []).map(r => JSON.parse(r));
}

module.exports = {
  createRace, joinRace, beginCountdown, activateRace,
  addRaceClick, finishRace, getRaceState,
  getOpenRaces, getUserRaceHistory,
};
