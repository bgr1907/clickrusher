'use strict';
const redis = require('./redis');

// Ülkeye tık ekle; leaderboard üyesi = displayName (nick ile 1-1 unique)
async function addCountryClicks(countryCode, nick, displayName, n) {
  await redis.zincrby('clicks:countries', n, countryCode);
  await redis.zincrby(`top:country:${countryCode}`, n, displayName);
  await redis.hincrby(`user:countries:nick:${nick}`, countryCode, n);
}

// Kullanıcının ülke bazlı tık istatistikleri: {TUR: 42, BRA: 7, ...}
async function getUserCountryStats(nick) {
  const raw = await redis.hgetall(`user:countries:nick:${nick}`);
  if (!raw) return {};
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Number(v)]));
}

// Maç tarafına tık ekle
async function addMatchClicks(fixtureId, side, displayName, n) {
  await redis.incrby(`clicks:match:${fixtureId}:${side}`, n);
  await redis.zincrby(`top:match:${fixtureId}:${side}`, n, displayName);
}

// Kullanıcı toplam tıklarını artır (bu istek için n kadar)
async function updateUser(nick, displayName, n) {
  await redis.hincrby(`user:nick:${nick}`, 'total', n);
  await redis.hset(`user:nick:${nick}`, { name: displayName });
}

// 48 ülkenin skorlarını döndür: {TUR: 1234, ...}
async function getCountryScores(teams) {
  const result = {};
  const raw = await redis.zrevrange('clicks:countries', 0, -1, 'WITHSCORES');
  for (let i = 0; i < raw.length; i += 2) {
    result[raw[i]] = Number(raw[i + 1]);
  }
  for (const t of teams) {
    if (!(t.c in result)) result[t.c] = 0;
  }
  return result;
}

// Bir ülke için ilk 10 kullanıcı: [{name, score, nick}]
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
async function getUserStats(nick, username) {
  const hash = await redis.hgetall(`user:nick:${nick}`);
  return { name: username, total: Number(hash?.total ?? 0) };
}

// Kullanıcının bir ülkedeki kişisel sıralaması ve skoru
async function getUserCountryRank(countryCode, displayName) {
  const [rank, score] = await Promise.all([
    redis.zrevrank(`top:country:${countryCode}`, displayName),
    redis.zscore(`top:country:${countryCode}`, displayName),
  ]);
  return { rank: rank !== null ? rank + 1 : null, score: Number(score ?? 0) };
}

function parseTop10(raw) {
  const out = [];
  for (let i = 0; i < raw.length; i += 2) {
    const member = raw[i];
    // Eski format: "deviceId|displayName" — yeni format: sadece "displayName"
    const pipeIdx = member.indexOf('|');
    const name = pipeIdx !== -1 ? member.slice(pipeIdx + 1) : member;
    out.push({ name, score: Number(raw[i + 1]), nick: name.toLowerCase() });
  }
  return out;
}

module.exports = {
  addCountryClicks, addMatchClicks, updateUser,
  getCountryScores, getCountryTop10, getMatchTop10,
  getMatchCounters, getUserStats, getUserCountryRank,
  getUserCountryStats,
};
