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

// Nick içinde yasaklı kelime geçiyor mu (leet speak dahil)
function containsBadWord(name) {
  const normalized = name.toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/\$/g, 's')
    .replace(/@/g, 'a');
  return BAD_WORDS.some(w => normalized.includes(w));
}

module.exports = { containsBadWord };
