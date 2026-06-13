'use strict';
// Küfür ve argo kelime filtresi — kısmi eşleşme + leet-speak normalizasyonu

const BAD_WORDS = [
  // Türkçe
  'orospu','götveren','amcık','amk','göt','sik','sikim','sikik','sikiş','sikme',
  'oç','piç','ibne','yarrak','yarak','taşak','götveren','kahpe','pezevenk',
  'orospu','orospu','götek','götlek','amını','ananı','ananın','bok','boktan',
  'salak','gerizekalı','aptal','mal','dangalak','embesil','gerzek','götveren',
  'oğlunun','oğlumu','orospu','sikerim','siktir','siktirgit',
  // İngilizce
  'fuck','fuk','fck','shit','sht','ass','bitch','btch','cunt','dick','dck',
  'cock','cck','pussy','psy','nigga','nigger','faggot','fag','whore','slut',
  'bastard','asshole','motherfuck','retard','idiot','moron',
];

// Leet-speak + Türkçe normalizasyon
function normalize(str) {
  return str.toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/\$/g, 's')
    .replace(/@/g, 'a');
}

// Yasaklı kelime kontrolü:
// 1. Normal normalized metin (tek kelime eşleşmesi)
// 2. Tüm ayraçlar / boşluklar sıyrılmış metin ("s i k", "s.i.k", "s-i-k" vb. bypass'ları engeller)
function containsBadWord(name) {
  const base    = normalize(name);
  if (BAD_WORDS.some(w => base.includes(w))) return true;
  const compact = base.replace(/[\s\-_.,;:!?*'"()+=~^\\/<>[\]{}|]/g, '');
  return BAD_WORDS.some(w => compact.includes(w));
}

module.exports = { containsBadWord };
