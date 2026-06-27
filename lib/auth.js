'use strict';
const crypto = require('crypto');
const redis = require('./redis');

async function hashPwd(password, salt) {
  return new Promise((resolve, reject) =>
    crypto.scrypt(String(password), salt, 32, (err, k) =>
      err ? reject(err) : resolve(k.toString('hex'))
    )
  );
}

function normNick(name) { return name.trim().toLowerCase(); }
function normEmail(email) { return email.trim().toLowerCase(); }

async function registerUser(deviceId, nickname, password, email, country) {
  const nick = normNick(nickname);
  const key  = `auth:nick:${nick}`;

  const existing = await redis.hgetall(key);
  if (existing && existing.salt) return { ok: false, reason: 'taken' };

  const cleanEmail   = email   ? normEmail(email)          : '';
  const cleanCountry = country ? String(country).trim()    : '';

  if (cleanEmail) {
    const emailTaken = await redis.get(`auth:email:${cleanEmail}`);
    if (emailTaken) return { ok: false, reason: 'email_taken' };
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await hashPwd(password, salt);

  await redis.hset(key, {
    passwordHash: hash,
    salt,
    deviceId,
    displayName: nickname.trim(),
    email: cleanEmail,
    country: cleanCountry,
    total: '0',
    createdAt: String(Date.now()),
  });
  await redis.set(`auth:device:${deviceId}`, nickname.trim());
  if (cleanEmail) {
    await redis.set(`auth:email:${cleanEmail}`, nickname.trim());
  }

  return { ok: true, name: nickname.trim(), email: cleanEmail, country: cleanCountry };
}

async function loginUser(deviceId, nameOrEmail, password) {
  let nick;

  if (nameOrEmail.includes('@')) {
    const storedNick = await redis.get(`auth:email:${normEmail(nameOrEmail)}`);
    if (!storedNick) return { ok: false, reason: 'not_found' };
    nick = normNick(storedNick);
  } else {
    nick = normNick(nameOrEmail);
  }

  const key  = `auth:nick:${nick}`;
  const user = await redis.hgetall(key);
  if (!user || !user.salt) return { ok: false, reason: 'not_found' };

  const hash = await hashPwd(password, user.salt);
  if (hash !== user.passwordHash) return { ok: false, reason: 'wrong_password' };

  await redis.hset(key, 'deviceId', deviceId);
  await redis.set(`auth:device:${deviceId}`, user.displayName || nick);

  return { ok: true, name: user.displayName || nick, email: user.email || '', country: user.country || '' };
}

module.exports = { registerUser, loginUser };
