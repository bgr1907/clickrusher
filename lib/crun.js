'use strict';
const crypto = require('crypto');
const redis  = require('./redis');

const TTL             = 12 * 3600;
const MAX_PLAYERS     = 4;
const COUNTDOWN_MS    = 6000;
const POWERUP_COOLDOWN = 8; // seconds
const POWERUP_TYPES   = ['hammer', 'boost', 'freeze', 'lightning'];

function genId() {
  return 'CR' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

async function createRoom({ creatorDevice, creatorName, duration, isPublic }) {
  const id  = genId();
  const now = Date.now();
  const dur = Math.min(Math.max(Math.floor(Number(duration)), 30), 300);
  const pub = isPublic !== false;

  await redis.hset(`crun:${id}`, {
    creator:     creatorDevice,
    creatorName,
    duration:    String(dur),
    status:      'waiting',
    createdAt:   String(now),
    isPublic:    pub ? '1' : '0',
  });
  await redis.expire(`crun:${id}`, TTL);

  await _addPlayer(id, creatorDevice, creatorName, null, 0);

  if (pub) await redis.zadd('crun:open', now, id);
  return { ok: true, id };
}

async function _addPlayer(roomId, deviceId, name, flag, lane) {
  await redis.hset(`crun:${roomId}:players`, {
    [deviceId]: JSON.stringify({ name, flag: flag ?? null, lane, ready: false, joinedAt: Date.now() }),
  });
  await redis.expire(`crun:${roomId}:players`, TTL);
}

async function joinRoom(roomId, deviceId, name, flag) {
  const room = await redis.hgetall(`crun:${roomId}`);
  if (!room || !room.status) return { ok: false, reason: 'not_found' };
  if (room.status !== 'waiting') return { ok: false, reason: 'already_started' };

  const playersRaw   = await redis.hgetall(`crun:${roomId}:players`);
  const currentCount = playersRaw ? Object.keys(playersRaw).length : 0;

  if (playersRaw && playersRaw[deviceId]) {
    if (flag) {
      const p = JSON.parse(playersRaw[deviceId]);
      p.flag = flag;
      await redis.hset(`crun:${roomId}:players`, { [deviceId]: JSON.stringify(p) });
    }
    return { ok: true, alreadyJoined: true };
  }

  if (currentCount >= MAX_PLAYERS) return { ok: false, reason: 'full' };

  await _addPlayer(roomId, deviceId, name, flag ?? null, currentCount);
  return { ok: true };
}

// HAZIR butonu — tüm oyuncular hazır olunca countdown başlar
async function setReady(roomId, deviceId) {
  const room = await redis.hgetall(`crun:${roomId}`);
  if (!room || room.status !== 'waiting') return { ok: false, reason: 'not_waiting' };

  const playersRaw = await redis.hgetall(`crun:${roomId}:players`);
  if (!playersRaw || !playersRaw[deviceId]) return { ok: false, reason: 'not_in_room' };

  const player = JSON.parse(playersRaw[deviceId]);
  player.ready = true;
  await redis.hset(`crun:${roomId}:players`, { [deviceId]: JSON.stringify(player) });

  // Tüm oyuncular hazır mı?
  const updatedRaw = await redis.hgetall(`crun:${roomId}:players`);
  const players    = Object.values(updatedRaw).map(r => JSON.parse(r));
  const allReady   = players.length >= 2 && players.every(p => p.ready);

  return { ok: true, allReady };
}

async function setFlag(roomId, deviceId, flag) {
  const playersRaw = await redis.hgetall(`crun:${roomId}:players`);
  if (!playersRaw || !playersRaw[deviceId]) return { ok: false };
  const player = JSON.parse(playersRaw[deviceId]);
  player.flag  = flag;
  await redis.hset(`crun:${roomId}:players`, { [deviceId]: JSON.stringify(player) });
  return { ok: true };
}

async function forceStart(roomId, deviceId) {
  const room = await redis.hgetall(`crun:${roomId}`);
  if (!room || !room.status)      return { ok: false, reason: 'not_found' };
  if (room.status !== 'waiting')  return { ok: false, reason: 'already_started' };
  if (room.creator !== deviceId)  return { ok: false, reason: 'not_creator' };

  const playersRaw = await redis.hgetall(`crun:${roomId}:players`);
  if (!playersRaw || Object.keys(playersRaw).length < 2)
    return { ok: false, reason: 'not_enough' };

  await beginCountdown(roomId);
  return { ok: true, duration: Number(room.duration) };
}

async function beginCountdown(roomId) {
  const startAt = Date.now() + COUNTDOWN_MS;
  await redis.hset(`crun:${roomId}`, { status: 'countdown', startAt: String(startAt) });
  await redis.zrem('crun:open', roomId);
  return startAt;
}

async function activateRoom(roomId) {
  const room = await redis.hgetall(`crun:${roomId}`);
  if (!room) return null;
  const endAt = Date.now() + Number(room.duration) * 1000;
  await redis.hset(`crun:${roomId}`, { status: 'active', endAt: String(endAt) });
  return room;
}

async function usePowerup(roomId, deviceId, type, targetDevice) {
  const room = await redis.hgetall(`crun:${roomId}`);
  if (!room || room.status !== 'active') return { ok: false };
  if (!POWERUP_TYPES.includes(type))     return { ok: false, reason: 'invalid_type' };

  // Server-side cooldown
  const rlKey  = `crun:${roomId}:pu:${deviceId}`;
  const limited = await redis.get(rlKey);
  if (limited) return { ok: false, reason: 'cooldown' };
  await redis.set(rlKey, '1');
  await redis.expire(rlKey, POWERUP_COOLDOWN);

  const event = {
    id:     crypto.randomBytes(4).toString('hex'),
    type,
    from:   deviceId,
    target: targetDevice || null,
    ts:     Date.now(),
  };

  await redis.lpush(`crun:${roomId}:events`, JSON.stringify(event));
  await redis.ltrim(`crun:${roomId}:events`, 0, 99);
  await redis.expire(`crun:${roomId}:events`, TTL);

  return { ok: true, event };
}

async function finishRoom(roomId) {
  const room = await redis.hgetall(`crun:${roomId}`);
  if (!room || room.status === 'finished') return;
  await redis.hset(`crun:${roomId}`, { status: 'finished', finishedAt: String(Date.now()) });
  await redis.zrem('crun:open', roomId);
}

async function reportDistance(roomId, deviceId, distance) {
  const playersRaw = await redis.hgetall(`crun:${roomId}:players`);
  if (!playersRaw || !playersRaw[deviceId]) return { ok: false };
  const player     = JSON.parse(playersRaw[deviceId]);
  player.distance  = Math.max(0, Math.floor(Number(distance)));
  await redis.hset(`crun:${roomId}:players`, { [deviceId]: JSON.stringify(player) });
  return { ok: true };
}

async function getRoomState(roomId) {
  const [room, playersRaw] = await Promise.all([
    redis.hgetall(`crun:${roomId}`),
    redis.hgetall(`crun:${roomId}:players`),
  ]);
  if (!room || !room.status) return null;

  const players = playersRaw
    ? Object.entries(playersRaw).map(([deviceId, raw]) => ({ deviceId, ...JSON.parse(raw) }))
    : [];

  return {
    id:          roomId,
    creator:     room.creator,
    creatorName: room.creatorName,
    duration:    Number(room.duration),
    status:      room.status,
    createdAt:   Number(room.createdAt),
    startAt:     room.startAt    ? Number(room.startAt)    : null,
    endAt:       room.endAt      ? Number(room.endAt)      : null,
    finishedAt:  room.finishedAt ? Number(room.finishedAt) : null,
    players,
  };
}

async function getOpenRooms() {
  const ids   = await redis.zrevrange('crun:open', 0, 19);
  const rooms = await Promise.all(ids.map(async id => {
    const [room, playersRaw] = await Promise.all([
      redis.hgetall(`crun:${id}`),
      redis.hgetall(`crun:${id}:players`),
    ]);
    if (!room) return null;
    return {
      id,
      creatorName: room.creatorName,
      duration:    Number(room.duration),
      playerCount: playersRaw ? Object.keys(playersRaw).length : 0,
    };
  }));
  return rooms.filter(Boolean);
}

module.exports = {
  createRoom, joinRoom, setFlag, setReady, forceStart,
  beginCountdown, activateRoom,
  usePowerup, finishRoom, reportDistance,
  getRoomState, getOpenRooms,
  POWERUP_TYPES, MAX_PLAYERS,
};
