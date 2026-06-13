'use strict';
// Küfür/argo filtresi: naughty-words TR + ek liste + normalize + loose-regex
// Yakalar: boşluk bypass, leet-speak, sembol ikamesi, Türkçe harf, harf arası ekleme

const naughtyWords = require('naughty-words');

// Tüm normalizasyonlar: Türkçe → ASCII, leet-speak, sembol → harf
function normalize(str) {
  return str.toLowerCase()
    .replace(/[ıİ]/g, 'i').replace(/[ğĞ]/g, 'g').replace(/[üÜ]/g, 'u')
    .replace(/[şŞ]/g, 's').replace(/[öÖ]/g, 'o').replace(/[çÇ]/g, 'c')
    .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e')
    .replace(/4/g, 'a').replace(/5/g, 's')
    .replace(/\$/g, 's').replace(/@/g, 'a')
    .replace(/[/|\\]/g, 'i');
}

// Ham liste: naughty-words TR + EN + ek Türkçe argo
const RAW = [
  ...naughtyWords.tr,
  ...naughtyWords.en,
  // Ek Türkçe kısaltmalar / argo
  'amk', 'oc', 'pic', 'ibne', 'yarrak', 'kahpe', 'pezevenk',
  'siktirgit', 'sikik', 'sikim', 'sikis', 'sikme', 'sikerim',
  'gotek', 'gotlek', 'amini', 'anani', 'ananin', 'bok', 'boktan',
  'gerizekal', 'dangalak', 'embesil', 'gerzek',
  // İngilizce ek
  'fuk', 'fck', 'sht', 'btch', 'dck', 'cck', 'psy',
  'motherfuck', 'retard', 'moron',
];

// Normalize + unique
const WORDS = [...new Set(RAW.map(normalize))].filter(w => w.length >= 2);

// 4+ karakterli kelimeler için loose regex: araya 1 ekstra harf girebilir
// "yarak" → /y.{0,1}a.{0,1}r.{0,1}a.{0,1}k/ → "yarcak" da yakalanır
function escapeRe(ch) {
  return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
const LOOSE_PATTERNS = WORDS
  .filter(w => w.length >= 4)
  .map(w => new RegExp(w.split('').map(escapeRe).join('.{0,2}')));

// Tüm ayraç karakterleri — "s i k", "s.i.k", "s-i-k" bypass
const STRIP_RE = /[\s\-_.,;:!?*'"()+=~^[\]{}]/g;

function containsBadWord(name) {
  const base = normalize(name);

  // 1. Normalize edilmiş metin — doğrudan substring
  if (WORDS.some(w => base.includes(w))) return true;

  // 2. Ayraçlar sıyrılmış — boşluk / noktalama bypass
  const compact = base.replace(STRIP_RE, '');
  if (WORDS.some(w => compact.includes(w))) return true;

  // 3. Loose regex — normalize üzerinde (harf arası ekleme: yarcak, tascak)
  if (LOOSE_PATTERNS.some(p => p.test(base))) return true;
  if (LOOSE_PATTERNS.some(p => p.test(compact))) return true;

  return false;
}

module.exports = { containsBadWord };
