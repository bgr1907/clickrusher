'use strict';
const crypto = require('crypto');
const redis = require('./redis');

// Node.js yerleşik crypto.scrypt — dış paket gerekmez
async function hashPwd(password, salt) {
  return new Promise((resolve, reject) =>
    crypto.scrypt(String(password), salt, 32, (err, k) =>
      err ? reject(err) : resolve(k.toString('hex'))
    )
  );
}

// Nick'i normalize et: küçük harf, trim
function normNick(name) { return name.trim().toLowerCase(); }

async function registerUser(deviceId, nickname, password) {
  const nick = normNick(nickname);
  const key  = `auth:nick:${nick}`;

  const existing = await redis.hgetall(key);
  if (existing) return { ok: false, reason: 'taken' };

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await hashPwd(password, salt);

  await redis.hset(key,
    'passwordHash', hash,
    'salt', salt,
    'deviceId', deviceId,
    'displayName', nickname.trim(),
    'total', '0',
    'createdAt', String(Date.now())
  );
  await redis.set(`auth:device:${deviceId}`, nickname.trim());

  return { ok: true, name: nickname.trim() };
}

async function loginUser(deviceId, nickname, password) {
  const nick = normNick(nickname);
  const key  = `auth:nick:${nick}`;

  const user = await redis.hgetall(key);
  if (!user) return { ok: false, reason: 'not_found' };

  const hash = await hashPwd(password, user.salt);
  if (hash !== user.passwordHash) return { ok: false, reason: 'wrong_password' };

  // DeviceId'yi güncelle (farklı cihazdan giriş)
  await redis.hset(key, 'deviceId', deviceId);
  await redis.set(`auth:device:${deviceId}`, user.displayName || nickname.trim());

  return { ok: true, name: user.displayName || nickname.trim() };
}

module.exports = { registerUser, loginUser };
