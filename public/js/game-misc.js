'use strict';

// ── WORLD CUP DATA (for bracket) ─────────────────────────────────────────
let wcTeams={},wcGames=[];
function getWCFlag(id){const t=wcTeams[id];if(!t)return '';const iso=(t.iso2||'').toLowerCase();return iso?`https://flagcdn.com/w160/${iso}.png`:'';}
function getWCName(id){return wcTeams[id]?.name_en||'?';}
function wcIsDone(g){const f=g.finished;return f===true||f===1||String(f).toUpperCase()==='TRUE'||f==='1';}
function wcIsLive(g){return !wcIsDone(g)&&g.time_elapsed&&parseInt(g.time_elapsed)>0;}
async function wcFetch(base){
  const[tR,gR]=await Promise.all([fetch(base+'/teams'),fetch(base+'/games')]);
  if(!tR.ok||!gR.ok)throw new Error('bad response');
  const tArr=await tR.json();const gArr=await gR.json();
  wcTeams={};
  (Array.isArray(tArr)?tArr:tArr.data||tArr.teams||[]).forEach(t=>{wcTeams[t.id]=t;});
  wcGames=Array.isArray(gArr)?gArr:gArr.data||gArr.games||[];
}
async function fetchWCData(){
  const bases=['https://worldcup26.ir/get','https://corsproxy.io/?url=https://worldcup26.ir/get'];
  let ok=false;
  for(const base of bases){try{await wcFetch(base);ok=true;break;}catch(e){}}
  if(!ok){const el=document.getElementById('gk-teams');if(el&&!wcGames.length)el.innerHTML='<div class="gk-no-match">Fikstür verisi alınamadı.</div>';}
  setTimeout(fetchWCData,5*60*1000);
  scheduleMatchNotifications();
}

// ── BRACKET ───────────────────────────────────────────────────────────────
let brCurrentTab='groups';
function openBracket(){
  const ov=document.getElementById('bracket-overlay');
  if(ov){ov.classList.add('open');document.body.style.overflow='hidden';}
  if(wcGames.length)brRender();else fetchWCData().then(()=>brRender());
}
function closeBracket(){
  const ov=document.getElementById('bracket-overlay');
  if(ov){ov.classList.remove('open');document.body.style.overflow='';}
}
function brTab(t){
  brCurrentTab=t;
  document.getElementById('brtab-groups').classList.toggle('on',t==='groups');
  document.getElementById('brtab-knockout').classList.toggle('on',t==='knockout');
  brRender();
}
function brRender(){const body=document.getElementById('br-body');if(!body)return;brCurrentTab==='groups'?brRenderGroups(body):brRenderKnockout(body);}
function brRenderGroups(body){
  if(!wcGames.length){body.innerHTML='<div class="br-no-data">Grup verisi henüz yok.</div>';return;}
  const groups={};
  wcGames.forEach(g=>{
    const gr=g.group;if(!gr)return;
    if(!groups[gr])groups[gr]={name:gr,teams:{},matches:[]};
    groups[gr].matches.push(g);
    [g.home_team_id,g.away_team_id].forEach(tid=>{if(!groups[gr].teams[tid])groups[gr].teams[tid]={id:tid,mp:0,w:0,d:0,l:0,gf:0,ga:0,pts:0};});
    if(wcIsDone(g)){
      const hs=parseInt(g.home_score||0),as_=parseInt(g.away_score||0);
      const ht=groups[gr].teams[g.home_team_id],at=groups[gr].teams[g.away_team_id];
      if(ht&&at){ht.mp++;at.mp++;ht.gf+=hs;ht.ga+=as_;at.gf+=as_;at.ga+=hs;if(hs>as_){ht.w++;ht.pts+=3;at.l++;}else if(hs<as_){at.w++;at.pts+=3;ht.l++;}else{ht.d++;at.d++;ht.pts++;at.pts++;}}
    }
  });
  const sortedGroups=Object.values(groups).sort((a,b)=>a.name.localeCompare(b.name));
  if(!sortedGroups.length){body.innerHTML='<div class="br-no-data">Grup verisi bulunamadı.</div>';return;}
  body.innerHTML=`<div class="br-groups-grid">${sortedGroups.map(g=>{
    const teams=Object.values(g.teams).sort((a,b)=>b.pts-a.pts||(b.gf-b.ga)-(a.gf-a.ga));
    return `<div class="br-group-card"><div class="br-group-hdr">GRUP ${g.name}</div>
      <div class="br-group-row header"><span></span><span>TAKIM</span><span>O</span><span>G/B/M</span><span>A</span><span>P</span></div>
      ${teams.map((t,i)=>{const info=wcTeams[t.id]||{};const fc=(info.iso2||'').toLowerCase();const nm=escHtml(info.name_en||'?');
        return `<div class="br-group-row"><span class="br-rank">${i+1}</span><span class="br-team-name">${fc?`<img class="br-flag-sm" src="https://flagcdn.com/w40/${fc}.png" alt="">`:''} ${nm}</span><span style="color:var(--dim);font-size:10px">${t.mp}</span><span style="color:var(--dim);font-size:9px">${t.w}/${t.d}/${t.l}</span><span style="color:var(--dim);font-size:10px">${t.gf}-${t.ga}</span><span class="br-pts">${t.pts}</span></div>`;
      }).join('')}</div>`;
  }).join('')}</div>`;
}
function brRenderKnockout(body){
  const rounds=['Round of 32','Round of 16','Quarter Final','Semi Final','Third Place','Final'];
  const roundNames={'Round of 32':'SON 32','Round of 16':'SON 16','Quarter Final':'ÇEYREK FİNAL','Semi Final':'YARI FİNAL','Third Place':'3. LUK','Final':'FİNAL'};
  const byRound={};
  wcGames.forEach(g=>{const r=g.stage||g.round;if(!r||r.toLowerCase().includes('group'))return;if(!byRound[r])byRound[r]=[];byRound[r].push(g);});
  const ordered=rounds.filter(r=>byRound[r]&&byRound[r].length);
  if(!ordered.length){body.innerHTML='<div class="br-no-data">Eleme turu henüz başlamadı.</div>';return;}
  body.innerHTML=ordered.map(r=>{
    const matches=byRound[r];
    return `<div class="br-knockout-round"><div class="br-round-title">${roundNames[r]||r}</div>
      ${matches.map(g=>{
        const hN=escHtml(getWCName(g.home_team_id)),aN=escHtml(getWCName(g.away_team_id));
        const hFC=(wcTeams[g.home_team_id]?.iso2||'').toLowerCase(),aFC=(wcTeams[g.away_team_id]?.iso2||'').toLowerCase();
        const isLive=wcIsLive(g),isDone=wcIsDone(g);
        const scoreHtml=(isDone||isLive)?`<span class="br-match-score${isLive?' live':''}">${g.home_score??'?'} - ${g.away_score??'?'}</span>`:`<span style="color:var(--dim);font-size:11px">vs</span>`;
        return `<div class="br-match-card"><div class="br-match-team">${hFC?`<img class="br-flag-sm" src="https://flagcdn.com/w40/${hFC}.png" alt="">`:''}<span>${hN}</span></div>${scoreHtml}<div class="br-match-team away"><span>${aN}</span>${aFC?`<img class="br-flag-sm" src="https://flagcdn.com/w40/${aFC}.png" alt="">`:''}</div></div>`;
      }).join('')}</div>`;
  }).join('');
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeBracket();}});

// ── RUSH GAME ─────────────────────────────────────────────────────────────
const RUSH_DURATION=30;
let rushActive=false,rushScore=0,rushCombo=0,rushTimer=0,rushInterval=null,rushSpawnInterval=null;
const RUSH_TARGETS=['⚽','⚽','⚽','🥅','⭐'];
const RUSH_POINTS={'⚽':10,'🥅':25,'⭐':50};
function rushBestScore(){return parseInt(localStorage.getItem('CR_RUSH_BEST')||'0');}
function rushUpdateBestLabel(){const el=document.getElementById('rush-best-lbl');const b=rushBestScore();if(el)el.textContent=b>0?`En İyi: ${b} puan`:'';  }
function rushStart(){
  const lobby=document.getElementById('rush-lobby');const arena=document.getElementById('rush-arena');
  if(lobby)lobby.style.display='none';if(arena)arena.style.display='block';
  rushScore=0;rushCombo=0;rushTimer=RUSH_DURATION;rushActive=true;rushUpdateHud();
  const field=document.getElementById('rush-field');if(field)field.innerHTML='';
  rushInterval=setInterval(()=>{rushTimer--;rushUpdateHud();if(rushTimer<=0)rushEnd();},1000);
  rushSpawnInterval=setInterval(rushSpawn,900);rushSpawn();
}
function rushUpdateHud(){
  const t=document.getElementById('rush-timer'),s=document.getElementById('rush-score-hud'),c=document.getElementById('rush-combo-hud');
  if(t){t.textContent=rushTimer;t.className='rush-hud-val'+(rushTimer<=5?' timer-warn':'');}
  if(s)s.textContent=rushScore;if(c)c.textContent='x'+Math.max(1,rushCombo);
}
function rushSpawn(){
  if(!rushActive)return;
  const field=document.getElementById('rush-field');if(!field)return;
  const emoji=RUSH_TARGETS[Math.floor(Math.random()*RUSH_TARGETS.length)];
  const el=document.createElement('div');el.className='rush-target';el.textContent=emoji;
  const fw=field.offsetWidth||320,fh=field.offsetHeight||400;
  const x=Math.random()*(fw-70),y=Math.random()*(fh-70);
  el.style.left=x+'px';el.style.top=y+'px';
  let alive=true;
  el.addEventListener('click',(e)=>{
    if(!alive||!rushActive)return;alive=false;el.classList.add('dying');setTimeout(()=>el.remove(),250);
    rushCombo++;const pts=(RUSH_POINTS[emoji]||10)*Math.max(1,rushCombo);rushScore+=pts;rushUpdateHud();
    const pop=document.createElement('div');pop.className='rush-combo-pop';pop.textContent='+'+pts+(rushCombo>1?' x'+rushCombo:'');pop.style.left=(x+15)+'px';pop.style.top=(y-10)+'px';field.appendChild(pop);setTimeout(()=>pop.remove(),750);
    e.stopPropagation();
  });
  field.appendChild(el);
  const lifetime=1200+Math.random()*600;
  setTimeout(()=>{if(alive&&el.parentNode){alive=false;rushCombo=0;el.classList.add('dying');setTimeout(()=>el.remove(),250);rushUpdateHud();}},lifetime);
}
function rushEnd(){
  rushActive=false;clearInterval(rushInterval);clearInterval(rushSpawnInterval);
  const field=document.getElementById('rush-field');if(field)field.querySelectorAll('.rush-target').forEach(el=>el.remove());
  const best=Math.max(rushBestScore(),rushScore);
  localStorage.setItem('CR_RUSH_BEST',String(best));
  const endDiv=document.createElement('div');endDiv.className='rush-end-overlay';
  endDiv.innerHTML=`<div class="rush-end-lbl">OYUN BİTTİ</div><div class="rush-end-score">${rushScore}</div><div class="rush-end-lbl">PUAN</div>${rushScore>=best&&rushScore>0?'<div class="rush-end-best">🏆 YENİ REKOR!</div>':''}<button class="rush-start-btn" style="margin-top:16px" onclick="rushRestart()">TEKRAR OYNA</button>`;
  const arena=document.getElementById('rush-arena');if(arena)arena.appendChild(endDiv);
}
function rushRestart(){
  const arena=document.getElementById('rush-arena');if(arena){arena.querySelectorAll('.rush-end-overlay').forEach(e=>e.remove());arena.style.display='none';}
  const lobby=document.getElementById('rush-lobby');if(lobby){lobby.style.display='flex';rushUpdateBestLabel();}
}
rushUpdateBestLabel();

// ── PUSH NOTIFICATIONS ────────────────────────────────────────────────────
let notifScheduled=[];
function scheduleMatchNotifications(){
  if(!('Notification' in window)||Notification.permission!=='granted')return;
  notifScheduled.forEach(t=>clearTimeout(t));notifScheduled=[];
  const now=Date.now();
  (S.fixtures||[]).forEach(f=>{
    const tA=T[f.a]||{name:f.a},tB=T[f.b]||{name:f.b};
    const matchTime=f.utc?new Date(f.utc).getTime():(f.ko?new Date(f.ko).getTime():0);
    if(!matchTime)return;
    const notifTime=matchTime-15*60*1000;
    if(notifTime<=now||notifTime-now>48*60*60*1000)return;
    const t=setTimeout(()=>{
      new Notification('⚽ Maç 15 dakika sonra!',{body:`${tA.name} vs ${tB.name} — Şimdi destekle!`,icon:'https://flagcdn.com/w40/tr.png'});
    },notifTime-now);
    notifScheduled.push(t);
  });
}
async function requestNotifPermission(){
  if(!('Notification' in window))return;
  const perm=await Notification.requestPermission();
  if(perm==='granted')scheduleMatchNotifications();
  return perm;
}

// ── QUIZ GAME ─────────────────────────────────────────────────────────────
const QQ=[
{tr:"İlk FIFA Dünya Kupası hangi ülkede oynandı?",en:"Which country hosted the first FIFA World Cup?",opts:["Uruguay","Brazil","Italy","France"],ans:0},
{tr:"En fazla Dünya Kupası şampiyonluğuna sahip ülke?",en:"Which country has won the most World Cup titles?",opts:["Germany","Brazil","Italy","Argentina"],ans:1},
{tr:"Dünya Kupası tarihinin en fazla gol atan oyuncusu?",en:"Who is the all-time top scorer in World Cup history?",opts:["Ronaldo (Brazil)","Miroslav Klose","Just Fontaine","Gerd Müller"],ans:1},
{tr:"2022 Dünya Kupası'nı kazanan ülke?",en:"Which country won the 2022 World Cup?",opts:["France","Croatia","Morocco","Argentina"],ans:3},
{tr:"2022 Dünya Kupası hangi ülkede oynandı?",en:"Which country hosted the 2022 World Cup?",opts:["UAE","Qatar","Saudi Arabia","Bahrain"],ans:1},
{tr:"2022 Dünya Kupası Altın Top ödülü kime verildi?",en:"Who won the Golden Ball at the 2022 World Cup?",opts:["Mbappé","Messi","Modrić","De Bruyne"],ans:1},
{tr:"2022 Dünya Kupası Altın Çizme ödülü kime verildi?",en:"Who won the Golden Boot at the 2022 World Cup?",opts:["Messi","Mbappé","Benzema","Neymar"],ans:1},
{tr:"Tek bir Dünya Kupası'nda en fazla gol atan oyuncu (1958)?",en:"Most goals in a single World Cup tournament (1958)?",opts:["Ronaldo","Just Fontaine","Sandor Kocsis","Eusébio"],ans:1},
{tr:"2018 Dünya Kupası'nı kazanan ülke?",en:"Which country won the 2018 World Cup?",opts:["Croatia","France","Belgium","England"],ans:1},
{tr:"2018 Dünya Kupası hangi ülkede oynandı?",en:"Which country hosted the 2018 World Cup?",opts:["Russia","Ukraine","Poland","Germany"],ans:0},
{tr:"2010 Dünya Kupası'nı kazanan ülke?",en:"Which country won the 2010 World Cup?",opts:["Netherlands","Germany","Spain","Argentina"],ans:2},
{tr:"2010 Dünya Kupası hangi ülkede oynandı?",en:"Which country hosted the 2010 World Cup?",opts:["Nigeria","South Africa","Egypt","Morocco"],ans:1},
{tr:"2006 Dünya Kupası'nı kazanan ülke?",en:"Which country won the 2006 World Cup?",opts:["Italy","France","Germany","Portugal"],ans:0},
{tr:"2014 Dünya Kupası'nı kazanan ülke?",en:"Which country won the 2014 World Cup?",opts:["Germany","Brazil","Argentina","Netherlands"],ans:0},
{tr:"Almanya, 2014 WC yarı finalinde Brezilya'ya kaç gol attı?",en:"How many goals did Germany score vs Brazil in the 2014 WC semi-final?",opts:["5","6","7","4"],ans:2},
{tr:"2002 Dünya Kupası'nı kazanan ülke?",en:"Which country won the 2002 World Cup?",opts:["Brazil","Germany","Turkey","Senegal"],ans:0},
{tr:"2002 Dünya Kupası hangi iki ülkede düzenlendi?",en:"Which two countries co-hosted the 2002 World Cup?",opts:["Japan & China","South Korea & Japan","Japan & Australia","South Korea & China"],ans:1},
{tr:"1998 Dünya Kupası'nı kazanan ülke?",en:"Which country won the 1998 World Cup?",opts:["Brazil","France","Germany","Italy"],ans:1},
{tr:"1994 Dünya Kupası hangi ülkede oynandı?",en:"Which country hosted the 1994 World Cup?",opts:["USA","Mexico","Canada","Brazil"],ans:0},
{tr:"1990 Dünya Kupası'nı kazanan ülke?",en:"Which country won the 1990 World Cup?",opts:["Argentina","West Germany","Italy","Netherlands"],ans:1},
{tr:"1986 Dünya Kupası'nı kazanan ülke?",en:"Which country won the 1986 World Cup?",opts:["Argentina","Germany","France","Brazil"],ans:0},
{tr:"1982 Dünya Kupası'nı kazanan ülke?",en:"Which country won the 1982 World Cup?",opts:["West Germany","Italy","France","Brazil"],ans:1},
{tr:"1978 Dünya Kupası'nı kazanan ülke?",en:"Which country won the 1978 World Cup?",opts:["Brazil","Netherlands","Argentina","Germany"],ans:2},
{tr:"1974 Dünya Kupası'nı kazanan ülke?",en:"Which country won the 1974 World Cup?",opts:["Netherlands","West Germany","Brazil","Poland"],ans:1},
{tr:"1966 Dünya Kupası'nı kazanan ülke?",en:"Which country won the 1966 World Cup?",opts:["England","West Germany","Portugal","USSR"],ans:0},
{tr:"Pelé kaç yaşında ilk Dünya Kupası'nı kazandı?",en:"At what age did Pelé win his first World Cup?",opts:["15","16","17","18"],ans:2},
{tr:"'Tanrı'nın Eli' golü hangi maçta atıldı?",en:"In which match was the 'Hand of God' goal scored?",opts:["Brazil vs Germany","Argentina vs England","Argentina vs France","Brazil vs England"],ans:1},
{tr:"2006 WC finalinde Zidane'ın kafa attığı oyuncu?",en:"Which player did Zidane headbutt in the 2006 WC final?",opts:["Totti","Cannavaro","Materazzi","Zambrotta"],ans:2},
{tr:"Kylian Mbappé hangi millî takımda oynuyor?",en:"Which national team does Kylian Mbappé play for?",opts:["Belgium","Cameroon","France","Ivory Coast"],ans:2},
{tr:"Lionel Messi hangi millî takımda oynuyor?",en:"Which national team does Lionel Messi play for?",opts:["Spain","Uruguay","Argentina","Brazil"],ans:2},
{tr:"Cristiano Ronaldo hangi millî takımda oynuyor?",en:"Which national team does Cristiano Ronaldo play for?",opts:["Spain","Portugal","Brazil","Italy"],ans:1},
{tr:"Erling Haaland hangi ülkenin millî takımında oynuyor?",en:"Which national team does Erling Haaland play for?",opts:["Sweden","Denmark","Norway","Finland"],ans:2},
{tr:"2022 WC'de hangi Afrika ülkesi ilk kez yarı finale çıktı?",en:"Which African nation reached the WC semis for the first time in 2022?",opts:["Nigeria","Senegal","Morocco","Cameroon"],ans:2},
{tr:"UEFA Şampiyonlar Ligi'ni en fazla kazanan kulüp?",en:"Which club has won the UEFA Champions League most times?",opts:["Barcelona","Bayern Munich","Liverpool","Real Madrid"],ans:3},
{tr:"FIFA hangi yılda kuruldu?",en:"When was FIFA founded?",opts:["1900","1904","1908","1912"],ans:1},
{tr:"VAR ilk hangi Dünya Kupası'nda kullanıldı?",en:"In which World Cup was VAR first used?",opts:["2014","2018","2022","2010"],ans:1},
{tr:"2026 Dünya Kupası'nda kaç takım yer alacak?",en:"How many teams will play in the 2026 World Cup?",opts:["32","40","48","36"],ans:2},
{tr:"2026 Dünya Kupası hangi ülkelerde düzenlenecek?",en:"Which countries will host the 2026 World Cup?",opts:["USA & Canada","USA, Canada & Mexico","USA & Mexico","Canada & Mexico"],ans:1},
{tr:"EURO 2024'ü kazanan ülke?",en:"Which country won EURO 2024?",opts:["Germany","France","England","Spain"],ans:3},
{tr:"Hangi ülke 5 kez Dünya Kupası kazanmıştır?",en:"Which country has won the World Cup 5 times?",opts:["Germany","Argentina","Italy","Brazil"],ans:3},
{tr:"Türk Süper Ligi'ni en fazla kazanan kulüp?",en:"Which club has won the most Turkish Super League titles?",opts:["Beşiktaş","Galatasaray","Fenerbahçe","Trabzonspor"],ans:1},
{tr:"Galatasaray UEFA Kupası'nı hangi yılda kazandı?",en:"In which year did Galatasaray win the UEFA Cup?",opts:["1998","1999","2000","2001"],ans:2},
{tr:"İkinci sarı kart ne anlama gelir?",en:"What happens when a player receives a second yellow card?",opts:["Fine","Red card","Penalty","Warning only"],tropts:["Para cezası","Kırmızı kart","Penaltı","Sadece uyarı"],ans:1},
];

const QCOUNTRIES=[
  {f:"🇧🇷",n:"Brazil",fc:"br"},{f:"🇩🇪",n:"Germany",fc:"de"},{f:"🇫🇷",n:"France",fc:"fr"},
  {f:"🇦🇷",n:"Argentina",fc:"ar"},{f:"🇪🇸",n:"Spain",fc:"es"},{f:"🇮🇹",n:"Italy",fc:"it"},
  {f:"🇳🇱",n:"Netherlands",fc:"nl"},{f:"🇵🇹",n:"Portugal",fc:"pt"},
  {f:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",n:"England",fc:"gb-eng"},{f:"🇹🇷",n:"Türkiye",fc:"tr"},
  {f:"🇧🇪",n:"Belgium",fc:"be"},{f:"🇺🇾",n:"Uruguay",fc:"uy"},
  {f:"🇭🇷",n:"Croatia",fc:"hr"},{f:"🇯🇵",n:"Japan",fc:"jp"},
  {f:"🇸🇳",n:"Senegal",fc:"sn"},{f:"🇲🇦",n:"Morocco",fc:"ma"},
  {f:"🇺🇸",n:"USA",fc:"us"},{f:"🇰🇷",n:"S. Korea",fc:"kr"},
  {f:"🇲🇽",n:"Mexico",fc:"mx"},{f:"🇨🇱",n:"Chile",fc:"cl"},
];

const QS={
  tr:{sel:"Ülkeni seç",cont:"Devam →",mode:"Nasıl oynamak istersin?",solo:"Solo Oyna",mp:"Çok Oyunculu",
      back:"Geri",lobby:"Quiz Lobisi",create:"Oda Oluştur",join:"Katıl",open:"Açık Odalar",
      public:"Herkese Açık Oda",docreate:"Oda Oluştur",dojoin:"Katıl",norooms:"Açık oda bulunamadı",
      refresh:"↻ Yenile",lback:"Geri",wait:"Bekleme Odası",codel:"Oda Kodu:",ready:"✓ Hazırım",
      force:"Başlat (Host)",ready2:"Hazır ol!",nick:"Kullanıcı adı *",
      over:"Quiz Bitti! 🏆",again:"Tekrar Oyna",
      q:"Soru",of:"/ 7",score:"Puan:",correct:"✓ Doğru cevap!",wrong:"✗ Yanlış",
      nextq:"Sonraki soru...",answered:"cevapladı",results:"Sonuçlar",timeout:"Süre Doldu!"},
  en:{sel:"Choose your country",cont:"Continue →",mode:"How do you want to play?",solo:"Play Solo",mp:"Multiplayer",
      back:"Back",lobby:"Quiz Lobby",create:"Create Room",join:"Join",open:"Open Rooms",
      public:"Open Room",docreate:"Create Room",dojoin:"Join",norooms:"No open rooms found",
      refresh:"↻ Refresh",lback:"Back",wait:"Waiting Room",codel:"Room Code:",ready:"✓ Ready",
      force:"Start (Host)",ready2:"Get ready!",nick:"Username *",
      over:"Quiz Over! 🏆",again:"Play Again",
      q:"Question",of:"/ 7",score:"Score:",correct:"✓ Correct!",wrong:"✗ Wrong",
      nextq:"Next question...",answered:"answered",results:"Results",timeout:"Time's Up!"},
};

const QBAD=['amk','amq','bok','orospu','pic','sik','yarrak','kahpe','oc','amina','sikik','kic','ibne','pezevenk','serefsiz','got','bitch','fuck','shit','ass'];
function qNorm(t){return t.toLowerCase().replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c').replace(/[^a-z0-9]/g,'');}
function qBad(t){const n=qNorm(t);return QBAD.some(w=>n.includes(qNorm(w)));}

let QLANG='tr',QSEL=null,QPLAYER={};
let QSOLO=false,QIS_HOST=false,QROOM_ID='';
let QMY_SCORE=0,QQ_IDXS=[],QQ_CUR=0,QQ_TOTAL=7,QQ_ANS=[];
let QTIMER=null,QANSWERED=false,QQ_ST=0;
let QMP={};
let qSocket=null;

function qs(k){return QS[QLANG][k]||k;}
function qShowScreen(id){document.querySelectorAll('#panel-quiz .screen').forEach(el=>el.classList.remove('active'));const el=document.getElementById(id);if(el)el.classList.add('active');}
function qApplyLang(){
  const m={'qt-sel':'sel','qt-cont':'cont','qt-mode':'mode','qt-solo':'solo','qt-mp':'mp',
    'qt-back':'back','qt-lobby':'lobby','qt-create':'create','qt-join':'join','qt-open':'open',
    'qt-public':'public','qt-docreate':'docreate','qt-dojoin':'dojoin','qt-norooms':'norooms',
    'qt-refresh':'refresh','qt-lback':'lback','qt-wait':'wait','qt-code-lbl':'codel',
    'qt-ready':'ready','qt-force':'force','qt-ready2':'ready2','qt-over':'over','qt-again':'again'};
  Object.entries(m).forEach(([id,k])=>{const el=document.getElementById(id);if(el)el.textContent=qs(k);});
  const ni=document.getElementById('qnick');if(ni)ni.placeholder=qs('nick');
}
function qSetLang(l){QLANG=l;qApplyLang();qBuildCGrid();qShowScreen('qsel');qUpdateSelScreen();}
function qGetFlag(cn){const c=QCOUNTRIES.find(x=>x.n===cn);return c?c.f:'🌍';}

function qUpdateSelScreen(){
  const guestBox=document.getElementById('qsel-guest-login');
  const welcomeBox=document.getElementById('qsel-user-welcome');
  const nickEl=document.getElementById('qsel-user-nick');
  const ni=document.getElementById('qnick');
  if(S.name){
    if(guestBox)guestBox.style.display='none';
    if(welcomeBox)welcomeBox.style.display='';
    if(nickEl)nickEl.textContent=S.name;
    if(ni){ni.value=S.name;ni.readOnly=true;}
  }else{
    if(guestBox)guestBox.style.display='';
    if(welcomeBox)welcomeBox.style.display='none';
    if(ni){ni.value='';ni.readOnly=false;}
  }
}
function qSkipLogin(){
  const guestBox=document.getElementById('qsel-guest-login');
  if(guestBox)guestBox.style.display='none';
}

async function qLoginInline(){
  const nickEl=document.getElementById('q-li-nick');
  const pwEl=document.getElementById('q-li-pw');
  const errEl=document.getElementById('q-li-err');
  if(!nickEl||!pwEl)return;
  const nameOrEmail=nickEl.value.trim(),pw=pwEl.value;
  if(!nameOrEmail||!pw){if(errEl){errEl.textContent='E-posta / kullanıcı adı ve şifre girin.';errEl.style.display='';}return;}
  if(errEl){errEl.textContent='';errEl.style.display='none';}
  try{
    const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({device:deviceId,name:nameOrEmail,password:pw})});
    const data=await r.json();
    if(!data.ok){
      const msgs={not_found:'Kullanıcı bulunamadı',wrong_password:'Şifre hatalı'};
      if(errEl){errEl.textContent=msgs[data.reason]||data.reason||'Giriş hatası';errEl.style.display='';}
      return;
    }
    S.name=data.name;S.email=data.email||'';S.country=data.country||'';
    localStorage.setItem('ta26_name',data.name);
    if(data.email)localStorage.setItem('ta26_email',data.email);
    if(data.country)localStorage.setItem('ta26_country',data.country);
    updateUserChip();qUpdateSelScreen();
  }catch(e){if(errEl){errEl.textContent='Bağlantı hatası';errEl.style.display='';}}
}

function qBuildCGrid(){
  const g=document.getElementById('cgrid');if(!g)return;g.innerHTML='';
  QCOUNTRIES.forEach((c,i)=>{
    const d=document.createElement('div');d.className='cc'+(QSEL===i?' sel':'');
    d.innerHTML=`<img src="https://flagcdn.com/w40/${c.fc}.png" style="width:38px;height:26px;object-fit:cover;border-radius:3px" alt="${c.n}" onerror="this.style.opacity='.3'">`;
    d.title=c.n;d.onclick=()=>{QSEL=i;document.querySelectorAll('#panel-quiz .cc').forEach((x,j)=>x.classList.toggle('sel',j===i));};
    g.appendChild(d);
  });
}

function qGoMode(){
  const cerr=document.getElementById('qcerr'),nerr=document.getElementById('qnerr');
  cerr.style.display='none';nerr.style.display='none';
  if(QSEL===null){cerr.textContent=QLANG==='tr'?'Lütfen bir ülke seç!':'Please select a country!';cerr.style.display='block';return;}
  const nickEl=document.getElementById('qnick');const nick=(nickEl?.value||S.name||'').trim();
  if(nickEl)nickEl.style.borderColor='';
  if(nick.length<2){if(nickEl)nickEl.style.borderColor='#e53935';nerr.textContent=QLANG==='tr'?'Kullanıcı adı en az 2 karakter!':'At least 2 characters!';nerr.style.display='block';if(nickEl)nickEl.focus();return;}
  if(qBad(nick)){if(nickEl)nickEl.style.borderColor='#e53935';nerr.textContent=QLANG==='tr'?'Uygunsuz kullanıcı adı!':'Inappropriate username!';nerr.style.display='block';if(nickEl)nickEl.focus();return;}
  const c=QCOUNTRIES[QSEL];QPLAYER={country:c.n,flag:c.f,name:nick};qShowScreen('qmode');
}

function qStartSolo(){_qDoStartSolo();}
function _qDoStartSolo(){
  QSOLO=true;QMY_SCORE=0;QQ_ANS=[];
  const all=Array.from({length:QQ.length},(_,i)=>i);
  for(let i=all.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[all[i],all[j]]=[all[j],all[i]];}
  QQ_IDXS=all.slice(0,QQ_TOTAL);QQ_CUR=0;qBuildDots();qShowScreen('qscr');qShowQuestion();
}

function qGoLobby(){QSOLO=false;qInitSocket();qShowScreen('qlobby');}
let qLTab=0;
function qLtab(i){
  qLTab=i;[0,1,2].forEach(j=>{document.getElementById('qlt'+j).classList.toggle('on',j===i);document.getElementById('qlp'+j).style.display=j===i?'':'none';});
  if(i===2)qRefreshRooms();
}
function qShowLobbyErr(msg){document.getElementById('qlerr').textContent=msg;}
function qCreateRoom(){const isOpen=document.getElementById('qopenchk').checked;qSocket.emit('room:create',{...QPLAYER,type:'quiz',isOpen});}
function qJoinRoom(){const code=document.getElementById('qcodein').value.trim().toUpperCase();if(!code||code.length!==4){qShowLobbyErr(QLANG==='tr'?'4 karakterli kod gir':'Enter 4-char code');return;}qSocket.emit('room:join',{...QPLAYER,roomId:code});}
function qRefreshRooms(){qSocket.emit('rooms:list');}
function qSendReady(){document.getElementById('qrbtn').disabled=true;qSocket.emit('player:ready');}
function qForceStart(){qSocket.emit('game:force_start');}

function qInitSocket(){
  if(qSocket&&qSocket.connected)return;
  const wsUrl=(location.hostname==='localhost'||location.hostname==='127.0.0.1')?'http://localhost:3000':location.origin;
  qSocket=io(wsUrl,{transports:['websocket','polling']});
  qSocket.on('room:joined',d=>{QROOM_ID=d.roomId;QIS_HOST=d.isHost;document.getElementById('qrcode').textContent=QROOM_ID;qRenderWait(d.room);document.getElementById('qfbtn').style.display=QIS_HOST?'block':'none';qShowScreen('qwait');});
  qSocket.on('room:update',d=>{qRenderWait(d);});
  qSocket.on('room:error',msg=>{qShowLobbyErr(msg);});
  qSocket.on('rooms:update',list=>{qRenderOpenRooms(list);});
  qSocket.on('game:countdown',d=>{const ov=document.getElementById('qcdov');ov.classList.add('on');document.getElementById('qcd-n').textContent=d.n;});
  qSocket.on('quiz:question',d=>{document.getElementById('qcdov').classList.remove('on');QSOLO=false;QQ_CUR=d.qNum-1;QQ_TOTAL=d.totalQ;if(QQ_CUR===0){QQ_IDXS=[];QMY_SCORE=0;QQ_ANS=[];qBuildDots();}QQ_IDXS[QQ_CUR]=d.qIdx;qShowScreen('qscr');qShowQuestion(d.startTime);});
  qSocket.on('quiz:player_answered',d=>{const chip=document.querySelector('#panel-quiz .pchip[data-id="'+d.id+'"]');if(chip)chip.classList.add('ank');if(QMP[d.id])QMP[d.id].answered=true;});
  qSocket.on('quiz:result',d=>{qStopTimer();const qObj=QQ[QQ_IDXS[QQ_CUR]];qMarkAnswers(qObj.ans);qShowResultPanel(d.answers,d.scores,qObj.ans);});
  qSocket.on('quiz:end',d=>{qStopTimer();qShowGameOver(d.players);});
}

function qRenderWait(room){
  QMP={};const el=document.getElementById('qwplayers');el.innerHTML='';
  room.players.forEach(p=>{
    QMP[p.id]={f:qGetFlag(p.country),n:p.name||p.country,answered:false};
    const d=document.createElement('div');d.className='pslot';
    const badge=p.ready?'<span class="qbadge">'+qs('ready')+'</span>':'';
    d.innerHTML='<span class="pf">'+qGetFlag(p.country)+'</span><span class="pn">'+(p.name||p.country)+'</span>'+badge;
    el.appendChild(d);
  });
  document.getElementById('qfbtn').style.display=(QIS_HOST&&room.players.length>=2)?'block':'none';
}
function qRenderOpenRooms(list){
  const el=document.getElementById('qolist');
  if(!list.length){el.innerHTML='<p style="color:#999;text-align:center;padding:10px;font-size:.85rem">'+qs('norooms')+'</p>';return;}
  el.innerHTML='';
  list.filter(r=>r.type==='quiz').forEach(r=>{
    const flags=r.players.map(p=>p.country?qGetFlag(p.country):'🌍').join(' ');
    const d=document.createElement('div');d.className='oroom';
    d.innerHTML='<span>'+flags+'</span><span style="font-size:.85rem;color:#555">'+r.playerCount+'/4</span><button class="qbtn qbtn-primary" style="padding:6px 14px;font-size:.8rem;margin:0;width:auto" onclick="qSocket.emit(\'room:join\',{...QPLAYER,roomId:\''+r.id+'\'})">'+qs('join')+'</button>';
    el.appendChild(d);
  });
  if(!el.children.length)el.innerHTML='<p style="color:#999;text-align:center;padding:10px;font-size:.85rem">'+qs('norooms')+'</p>';
}

function qBuildDots(){
  const el=document.getElementById('qqdots');if(!el)return;el.innerHTML='';
  for(let i=0;i<QQ_TOTAL;i++){
    if(i>0){const line=document.createElement('div');line.className='qdot-line';line.style.backgroundColor=i<=QQ_CUR?(QQ_ANS[i-1]?'#43a047':'#e53935'):'rgba(255,255,255,.2)';el.appendChild(line);}
    const d=document.createElement('div');d.className='qdot';
    const isPast=i<QQ_CUR,isCur=i===QQ_CUR,wasOk=QQ_ANS[i];
    d.style.backgroundColor=isPast?(wasOk?'#43a047':'#e53935'):isCur?'#fff':'rgba(255,255,255,.2)';
    d.style.border=isCur?'2px solid #ffd700':'2px solid transparent';
    d.style.color=isCur?'#222':'#fff';
    d.textContent=isPast?(wasOk?'✓':'✗'):(i+1);
    el.appendChild(d);
  }
}

function qShowQuestion(startTime){
  QANSWERED=false;qBuildDots();
  const qi=QQ_IDXS[QQ_CUR];const qObj=QQ[qi];
  document.getElementById('qqnum').textContent=qs('q')+' '+(QQ_CUR+1)+' '+qs('of');
  document.getElementById('qscoredisp').textContent=qs('score')+' '+QMY_SCORE;
  document.getElementById('qqtxt').textContent=qObj[QLANG]||qObj.tr;
  const optsEl=document.getElementById('qopts');optsEl.innerHTML='';
  const labels=['A','B','C','D'];
  const displayOpts=(QLANG==='tr'&&qObj.tropts)?qObj.tropts:qObj.opts;
  displayOpts.forEach((opt,i)=>{const b=document.createElement('button');b.className='obtn';b.innerHTML='<span class="olbl">'+labels[i]+'</span>'+opt;b.onclick=()=>qOnAnswer(i,b);optsEl.appendChild(b);});
  const strip=document.getElementById('qpstrip');strip.innerHTML='';
  if(!QSOLO){Object.entries(QMP).forEach(([id,p])=>{const chip=document.createElement('div');chip.className='pchip';chip.dataset.id=id;chip.innerHTML='<span class="pcf">'+p.f+'</span><span class="pcn">'+p.n+'</span>';strip.appendChild(chip);});const me=document.createElement('div');me.className='pchip';me.dataset.id='me';me.innerHTML='<span class="pcf">'+QPLAYER.flag+'</span><span class="pcn">'+QPLAYER.name+'</span>';strip.appendChild(me);}
  document.getElementById('qrresult').style.display='none';
  QQ_ST=startTime||Date.now();const delay=Math.max(0,QQ_ST-Date.now());setTimeout(()=>qStartTimer(),delay);
}

function qStartTimer(){
  const circ=150.8;let last=-1;
  QTIMER=setInterval(()=>{
    const el=Math.max(0,Date.now()-QQ_ST),rem=Math.max(0,10000-el),sec=Math.ceil(rem/1000);
    if(sec!==last){last=sec;document.getElementById('qtnum').textContent=sec;const off=circ*(1-rem/10000);document.getElementById('qtarc').style.strokeDashoffset=off;document.getElementById('qtarc').style.stroke=sec<=3?'#ff5722':'#ffd700';}
    if(rem<=0){qStopTimer();qOnTimeout();}
  },80);
}
function qStopTimer(){clearInterval(QTIMER);QTIMER=null;}

let qExitCdInterval=null;
function qAskExit(){
  if(!document.getElementById('qscr').classList.contains('active'))return;
  qStopTimer();const ov=document.getElementById('q-exit-overlay');if(ov)ov.style.display='flex';
  let sec=3;document.getElementById('q-exit-sec').textContent=sec;
  qExitCdInterval=setInterval(()=>{sec--;const el=document.getElementById('q-exit-sec');if(el)el.textContent=sec;if(sec<=0){clearInterval(qExitCdInterval);qCancelExit();}},1000);
}
function qCancelExit(){
  clearInterval(qExitCdInterval);const ov=document.getElementById('q-exit-overlay');if(ov)ov.style.display='none';
  QQ_ST=Date.now()-(10000-(parseFloat(document.getElementById('qtnum').textContent)||0)*1000);qStartTimer();
}
function qConfirmExit(){
  clearInterval(qExitCdInterval);const ov=document.getElementById('q-exit-overlay');if(ov)ov.style.display='none';
  QMY_SCORE=Math.max(0,QMY_SCORE-100);qShowScreen('qsel');
}

function qOnAnswer(idx,btn){
  if(QANSWERED)return;QANSWERED=true;
  const elapsed=Date.now()-QQ_ST;const qObj=QQ[QQ_IDXS[QQ_CUR]];const correct=idx===qObj.ans;
  qStopTimer();if(correct){QMY_SCORE+=Math.max(1,10-Math.floor(elapsed/1000));}
  if(QSOLO){QQ_ANS[QQ_CUR]=correct;qMarkAnswers(qObj.ans,idx);qShowSoloResult(correct,idx,qObj.ans);}
  else{const me=document.querySelector('#panel-quiz .pchip[data-id="me"]');if(me)me.classList.add('ank');qSocket.emit('quiz:answer',{elapsed,correct});document.querySelectorAll('#panel-quiz .obtn').forEach(b=>b.disabled=true);if(correct)btn.classList.add('correct');else btn.classList.add('wrong');}
}
function qOnTimeout(){
  if(QANSWERED)return;QANSWERED=true;const qObj=QQ[QQ_IDXS[QQ_CUR]];
  if(QSOLO){QQ_ANS[QQ_CUR]=false;qMarkAnswers(qObj.ans,-1);qShowSoloResult(false,-1,qObj.ans);}
  else{qSocket.emit('quiz:answer',{elapsed:10000,correct:false});document.querySelectorAll('#panel-quiz .obtn').forEach(b=>b.disabled=true);qMarkAnswers(qObj.ans);}
}
function qMarkAnswers(correctIdx,chosenIdx){document.querySelectorAll('#panel-quiz .obtn').forEach((b,i)=>{b.disabled=true;if(i===correctIdx)b.classList.add('correct');else if(i===chosenIdx&&chosenIdx!==correctIdx)b.classList.add('wrong');});}
function qShowSoloResult(correct,chosen,correctIdx){
  const rr=document.getElementById('qrresult');
  document.getElementById('qrhead').textContent=correct?qs('correct'):(chosen===-1?qs('timeout'):qs('wrong'));
  document.getElementById('qrrows').innerHTML='';
  const pts=correct?Math.max(1,10-Math.floor((Date.now()-QQ_ST)/1000)):0;
  const row=document.createElement('div');row.className='rrow '+(correct?'right':'wrong');
  row.innerHTML='<span class="rf">'+QPLAYER.flag+'</span><span class="ri">'+QPLAYER.name+'</span><span class="rp">'+(correct?'+'+pts:'')+'</span>';
  document.getElementById('qrrows').appendChild(row);
  rr.style.display='block';document.getElementById('qscoredisp').textContent=qs('score')+' '+QMY_SCORE;qScheduleNext();
}
function qShowResultPanel(answers,scores,correctIdx){
  const rr=document.getElementById('qrresult');const rrows=document.getElementById('qrrows');rrows.innerHTML='';
  QMY_SCORE=scores[qSocket.id]||0;document.getElementById('qscoredisp').textContent=qs('score')+' '+QMY_SCORE;
  const correct=answers.filter(a=>a.correct).sort((a,b)=>a.elapsed-b.elapsed);const wrong=answers.filter(a=>!a.correct);
  [...correct,...wrong].forEach(a=>{const row=document.createElement('div');row.className='rrow '+(a.correct?'right':'wrong');const pl=a.id==='me'?QPLAYER:QMP[a.id];const fl=pl?pl.f:'🌍';const nm=pl?pl.n||pl.name:'?';row.innerHTML='<span class="rf">'+fl+'</span><span class="ri">'+nm+'</span><span class="rp">'+(a.correct?'+'+a.pts:'')+'</span>';rrows.appendChild(row);});
  document.getElementById('qrhead').textContent=qs('results');rr.style.display='block';
  document.querySelectorAll('#panel-quiz .pchip').forEach(c=>c.classList.remove('ank'));Object.values(QMP).forEach(p=>p.answered=false);
}
function qScheduleNext(){
  const bar=document.getElementById('qnqbar'),txt=document.getElementById('qrnext');
  bar.style.transition='none';bar.style.width='100%';txt.textContent=qs('nextq');
  requestAnimationFrame(()=>requestAnimationFrame(()=>{bar.style.transition='width 3.2s linear';bar.style.width='0%';}));
  setTimeout(()=>{QQ_CUR++;if(QQ_CUR>=QQ_TOTAL){qShowGameOver([{...QPLAYER,score:QMY_SCORE}]);}else{qShowQuestion();}},3200);
}
function qShowGameOver(players){
  qShowScreen('qover');
  document.getElementById('qt-over').textContent=qs('over');
  document.getElementById('qt-again').textContent=qs('again');
  const sorted=[...players].sort((a,b)=>b.score-a.score);
  const medals=['🥇','🥈','🥉'];
  const podiumEl=document.getElementById('qpodium'),listEl=document.getElementById('qflist');
  podiumEl.innerHTML='';listEl.innerHTML='';
  const podOrder=sorted.length>=2?[sorted[1],sorted[0],sorted[2]||null]:[sorted[0]];
  const podH=sorted.length>=2?['55px','75px','40px']:['75px'];
  podOrder.forEach((p,i)=>{if(!p)return;const rank=sorted.indexOf(p);const pod=document.createElement('div');pod.className='pod';pod.innerHTML='<div class="pm">'+(medals[rank]||'')+'</div><div class="pff">'+qGetFlag(p.country)+'</div><div class="psc">'+p.score+'</div><div class="pb" style="height:'+podH[i]+'">'+(rank+1)+'</div>';podiumEl.appendChild(pod);});
  sorted.forEach((p,i)=>{const row=document.createElement('div');row.className='frow';row.innerHTML='<div class="fr">'+(i+1)+'</div><div class="ffl">'+qGetFlag(p.country)+'</div><div class="fn">'+(p.name||p.country)+'</div><div class="fs">'+p.score+'</div>';listEl.appendChild(row);});
}
function qPlayAgain(){QMY_SCORE=0;QQ_CUR=0;QQ_ANS=[];qShowScreen(QSOLO?'qmode':'qlobby');}
