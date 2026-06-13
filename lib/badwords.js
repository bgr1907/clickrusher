'use strict';
// Küfür ve argo kelime filtresi — kısmi eşleşme + leet-speak + Türkçe normalizasyon

const BAD_WORDS_RAW = [
  // Türkçe
  'orospu','gotveren','amcik','amk','got','sik','sikim','sikik','sikis','sikme',
  'oc','pic','ibne','yarrak','yarak','tasak','kahpe','pezevenk',
  'gotek','gotlek','amini','anani','ananin','bok','boktan',
  'salak','gerizekal','aptal','mal','dangalak','embesil','gerzek',
  'sikerim','siktir','siktirgit',
  // İngilizce
  'fuck','fuk','fck','shit','sht','ass','bitch','btch','cunt','dick','dck',
  'cock','cck','pussy','psy','nigga','nigger','faggot','fag','whore','slut',
  'bastard','asshole','motherfuck','retard','idiot','moron',
];

// Tüm normalizasyonlar: Türkçe → ASCII, leet-speak, sembol yerine harf
function normalize(str) {
  return str.toLowerCase()
    // Türkçe karakterler → ASCII
    .replace(/[ı]/g, 'i').replace(/[ğ]/g, 'g').replace(/[ü]/g, 'u')
    .replace(/[ş]/g, 's').replace(/[ö]/g, 'o').replace(/[ç]/g, 'c')
    // Leet-speak sayılar
    .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e')
    .replace(/4/g, 'a').replace(/5/g, 's')
    // Semboller → harf (s/k, s|k, s\k gibi bypass'lar)
    .replace(/\$/g, 's').replace(/@/g, 'a')
    .replace(/[/|\\]/g, 'i');
}

// Bad words listesini de aynı normalize'dan geçir (Türkçe char uyumsuzluğunu engeller)
const BAD_WORDS = BAD_WORDS_RAW.map(normalize);

// Yasaklı kelime kontrolü:
// 1. Normalize edilmiş metin (s/k → sik, @mc1k → amcik)
// 2. Tüm ayraçlar sıyrılmış metin ("s i k", "s.i.k" vb. bypass'lar)
function containsBadWord(name) {
  const base = normalize(name);
  if (BAD_WORDS.some(w => base.includes(w))) return true;
  const compact = base.replace(/[\s\-_.,;:!?*'"()+=~^[\]{}]/g, '');
  return BAD_WORDS.some(w => compact.includes(w));
}

module.exports = { containsBadWord };
