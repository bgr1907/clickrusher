'use strict';
const redis = require('./redis');

// Ülkeye tık ekle; kullanıcı liderlik tablosunu güncelle
async function addCountryClicks(countryCode, deviceId, username, n) {
  await redis.zincrby('clicks:countries', n, countryCode);
  const member = `${deviceId}|${username}`;
  await redis.zincrby(`top:country:${countryCode}`, n, member);
}

// Maç tarafına tık ekle
async function addMatchClicks(fixtureId, side, deviceId, username, n) {
  await redis.incrby(`clicks:match:${fixtureId}:${side}`, n);
  const member = `${deviceId}|${username}`;
  await redis.zincrby(`top:match:${fixtureId}:${side}`, n, member);
}

// Kullanıcı hash'ini güncelle
async function updateUser(deviceId, username, totalClicks) {
  await redis.hset(`user:${deviceId}`, { name: username, total: String(totalClicks) });
}

// 48 ülkenin skorlarını döndür: {TUR: 1234, ...}
async function getCountryScores(teams) {
  const result = {};
  const raw = await redis.zrevrange('clicks:countries', 0, -1, 'WITHSCORES');
  for (let i = 0; i < raw.length; i += 2) {
    result[raw[i]] = Number(raw[i + 1]);
  }
  // Hiç tık almamış ülkeler için 0
  for (const t of teams) {
    if (!(t.c in result)) result[t.c] = 0;
  }
  return result;
}

// Bir ülke için ilk 10 kullanıcı: [{name, score, deviceId}]
async function getCountryTop10(countryCode) {
  const raw = await redis.zrevrange(`top:country:${countryCode}`, 0, 9, 'WITHSCORES');
  return parseTop10(raw);
}

// Bir maç tarafı için ilk 10 kullanıcı
async function getMatchTop10(fixtureId, side) {
  const raw = await redis.zrevrange(`top:match:${fixtureId}:${side}`, 0, 9, 'WITHSCORES');
  return parseTop10(raw);
}

// Maçın A ve B sayaçlarını döndür
async function getMatchCounters(fixtureId) {
  const [a, b] = await Promise.all([
    redis.get(`clicks:match:${fixtureId}:A`),
    redis.get(`clicks:match:${fixtureId}:B`),
  ]);
  return { A: Number(a ?? 0), B: Number(b ?? 0) };
}

// Kullanıcının kişisel istatistikleri
async function getUserStats(deviceId, username) {
  const hash = await redis.hgetall(`user:${deviceId}`);
  return { name: username, total: Number(hash?.total ?? 0) };
}

// Kullanıcının bir ülkedeki kişisel sıralaması ve skoru
async function getUserCountryRank(countryCode, deviceId, username) {
  const member = `${deviceId}|${username}`;
  const [rank, score] = await Promise.all([
    redis.zrevrank(`top:country:${countryCode}`, member),
    redis.zscore(`top:country:${countryCode}`, member),
  ]);
  return { rank: rank !== null ? rank + 1 : null, score: Number(score ?? 0) };
}

function parseTop10(raw) {
  const out = [];
  for (let i = 0; i < raw.length; i += 2) {
    const [deviceId, name] = raw[i].split('|');
    out.push({ name: name ?? deviceId, score: Number(raw[i + 1]), deviceId });
  }
  return out;
}

module.exports = {
  addCountryClicks, addMatchClicks, updateUser,
  getCountryScores, getCountryTop10, getMatchTop10,
  getMatchCounters, getUserStats, getUserCountryRank,
};
