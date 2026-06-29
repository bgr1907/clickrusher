'use strict';

// Returns true only when score data indicates the match is genuinely in progress.
// API returns time_elapsed as "notstarted" | "live" | "finished" (not a minute counter).
function cbScoreIsLive(sc){
  if(!sc||sc.finished)return false;
  const e=sc.elapsed;
  if(e===null||e===undefined||e==='')return false;
  const s=String(e);
  if(s==='live'||s==='HT')return true;
  const n=parseInt(s);
  return!isNaN(n)&&n>0;
}

// ── MATCH BAR FROM FIXTURES ───────────────────────────────────────────────
function gkRenderMatchBarFromFixtures(){
  const inner=document.getElementById('gk-match-bar-inner');
  if(!inner)return;
  const fixtures=S.fixtures||[];
  if(!fixtures.length){inner.innerHTML='<div class="gk-no-match">Fikstür bekleniyor…</div>';return;}
  inner.innerHTML='';
  const now=Date.now();
  const shown=fixtures.filter(f=>{
    const t=f.utc?new Date(f.utc).getTime():(f.ko?new Date(f.ko).getTime():0);
    return !t||t>now-2*60*60*1000;
  }).sort((a,b)=>{
    const ta=a.utc?new Date(a.utc).getTime():(a.ko?new Date(a.ko).getTime():Infinity);
    const tb=b.utc?new Date(b.utc).getTime():(b.ko?new Date(b.ko).getTime():Infinity);
    return ta-tb;
  }).slice(0,6);
  if(!shown.length){inner.innerHTML='<div class="gk-no-match">Yaklaşan maç yok.</div>';return;}
  shown.forEach(f=>{
    const tA=T[f.a],tB=T[f.b];
    const hCC=(tA&&tA.fc)||f.a||'xx';
    const aCC=(tB&&tB.fc)||f.b||'xx';
    const t=f.utc?new Date(f.utc):(f.ko?new Date(f.ko):null);
    const _tz=typeof tzOffset!=='undefined'?tzOffset:3;
    const _tzLabel=`GMT${_tz>=0?'+':''}${_tz}`;
    const _tzDate=t?new Date(t.getTime()+_tz*3600000):null;
    const gmtTime=_tzDate?_tzDate.toLocaleTimeString('tr-TR',{timeZone:'UTC',hour:'2-digit',minute:'2-digit'})+' '+_tzLabel:'—';
    const card=document.createElement('div');
    card.className='gk-mbar-card'+(cbMatchId===f.id?' active':'');
    card.innerHTML=`<div class="gk-mbar-flags"><img class="gk-mbar-flag" src="https://flagcdn.com/w40/${hCC}.png" alt=""><span class="gk-mbar-sep">-</span><img class="gk-mbar-flag" src="https://flagcdn.com/w40/${aCC}.png" alt=""></div><div><div class="gk-mbar-time">${gmtTime}</div></div>`;
    card.onclick=()=>{
      inner.querySelectorAll('.gk-mbar-card').forEach(c=>c.classList.remove('active'));
      card.classList.add('active');
      gkSelectFixture(f);
    };
    inner.appendChild(card);
  });
}

function gkSelectFixture(f){
  const tA=T[f.a]||{name:f.a,fc:f.a};
  const tB=T[f.b]||{name:f.b,fc:f.b};
  const isLive=cbScoreIsLive(S.liveScores&&S.liveScores[f.id]);
  cbSetupMatchFromFixture(f,tA,tB,isLive);
  initChat(f.id);
}

function initGunTab(){
  gkRenderMatchBarFromFixtures();
  const fixtures=S.fixtures||[];
  if(!fixtures.length)return;
  const now=Date.now();
  const upcoming=fixtures.filter(f=>{
    const t=f.utc?new Date(f.utc).getTime():(f.ko?new Date(f.ko).getTime():0);
    return !t||t>now-2*60*60*1000;
  }).sort((a,b)=>{
    const ta=a.utc?new Date(a.utc).getTime():(a.ko?new Date(a.ko).getTime():Infinity);
    const tb=b.utc?new Date(b.utc).getTime():(b.ko?new Date(b.ko).getTime():Infinity);
    return ta-tb;
  });
  gkSelectFixture(upcoming.length?upcoming[0]:fixtures[0]);
}

// ── CLICK BATTLE ─────────────────────────────────────────────────────────
let cbCounts={home:0,away:0};
let cbMatchId=null;
let cbMatchTime=null,cbCountdownInterval=null;

function cbSetupMatchFromFixture(f,tA,tB,isLive){
  cbMatchId=f.id;
  cbMatchTime=f.utc?new Date(f.utc):(f.ko?new Date(f.ko):null);
  const hImg=document.getElementById('cb-home-flag');
  const aImg=document.getElementById('cb-away-flag');
  const hName=document.getElementById('cb-home-name');
  const aName=document.getElementById('cb-away-name');
  if(hImg){hImg.src=`https://flagcdn.com/w160/${tA.fc||f.a}.png`;hImg.alt=tA.name||f.a;}
  if(aImg){aImg.src=`https://flagcdn.com/w160/${tB.fc||f.b}.png`;aImg.alt=tB.name||f.b;}
  if(hName)hName.textContent=tA.name||f.a||'—';
  if(aName)aName.textContent=tB.name||f.b||'—';
  const pHN=document.getElementById('pred-home-name');
  const pAN=document.getElementById('pred-away-name');
  if(pHN)pHN.textContent=tA.name||f.a||'—';
  if(pAN)pAN.textContent=tB.name||f.b||'—';
  cbCounts={home:0,away:0};
  cbSetCharge('home',0);
  cbSetCharge('away',0);
  cbLoadTotals();
  clearInterval(cbCountdownInterval);
  cbUpdateLock(isLive);
  cbCountdownInterval=setInterval(()=>{
    cbUpdateLock(cbScoreIsLive(S.liveScores&&S.liveScores[cbMatchId]));
  },1000);
}

function cbUpdateLock(isLive){
  const now=new Date();
  const locked=!isLive; // only allow clicks while match is actually live
  const hBtn=document.getElementById('cb-home-btn');
  const aBtn=document.getElementById('cb-away-btn');
  const hLock=document.getElementById('cb-home-lock');
  const aLock=document.getElementById('cb-away-lock');
  const cdEl=document.getElementById('gk-countdown');
  const vsEl=document.getElementById('gk-vs-text');
  const scoreEl=document.getElementById('gk-live-score');
  if(hBtn)hBtn.disabled=locked;
  if(aBtn)aBtn.disabled=locked;
  if(hLock)hLock.style.display=locked?'':'none';
  if(aLock)aLock.style.display=locked?'':'none';
  const sc=S.liveScores&&S.liveScores[cbMatchId];
  if(scoreEl&&vsEl){
    if(isLive&&sc){
      scoreEl.textContent=`${sc.homeScore??0} - ${sc.awayScore??0}`;
      scoreEl.style.display='';
      vsEl.style.display='none';
    }else{
      scoreEl.style.display='none';
      vsEl.style.display='';
    }
  }
  if(cdEl){
    if(isLive){cdEl.textContent='CANLI';cdEl.className='gk-countdown live';}
    else if(cbMatchTime&&cbMatchTime>now){
      const diff=cbMatchTime-now;
      const h=Math.floor(diff/3600000),m=Math.floor((diff%3600000)/60000),s=Math.floor((diff%60000)/1000);
      cdEl.textContent=`⏰ ${h>0?h+'sa ':''} ${m}dk ${s}sn kaldı`;
      cdEl.className='gk-countdown';
    }else{
      cdEl.textContent='BAŞLIYOR…';cdEl.className='gk-countdown';
    }
  }
}

function cbClick(side,e){
  if(!cbMatchId)return;
  if(!cbScoreIsLive(S.liveScores&&S.liveScores[cbMatchId]))return;
  const btn=e.currentTarget;
  const r=document.createElement('div');r.className='cb-ripple';
  const rect=btn.getBoundingClientRect();
  r.style.left=(e.clientX-rect.left)+'px';r.style.top=(e.clientY-rect.top)+'px';
  btn.appendChild(r);setTimeout(()=>r.remove(),500);
  const wrap=document.getElementById('cb-'+side+'-wrap');
  if(wrap){const f=document.createElement('div');f.className='gk-click-flash';wrap.appendChild(f);setTimeout(()=>f.remove(),280);}
  cbCounts[side]++;
  updateCbUI();
  queueClick('match',cbMatchId,side==='home'?'A':'B',1);
}

function updateCbUI(){
  const battles=S.battles&&S.battles[cbMatchId]?S.battles[cbMatchId]:{A:0,B:0};
  const h=(cbCounts.home)+(battles.A||0);
  const a=(cbCounts.away)+(battles.B||0);
  const tot=h+a||1;
  const hPct=Math.round(h/tot*100);
  const aPct=100-hPct;
  const hC=document.getElementById('cb-home-cnt');
  const aC=document.getElementById('cb-away-cnt');
  if(hC)hC.textContent=h;
  if(aC)aC.textContent=a;
  const hF=document.getElementById('cb-tow-home');
  const aF=document.getElementById('cb-tow-away');
  if(hF)hF.style.width=hPct+'%';
  if(aF)aF.style.width=aPct+'%';
  const hPE=document.getElementById('cb-home-pct');
  const aPE=document.getElementById('cb-away-pct');
  if(hPE)hPE.textContent=hPct+'%';
  if(aPE)aPE.textContent=aPct+'%';
  cbSetCharge('home',Math.min(cbCounts.home/30,1));
  cbSetCharge('away',Math.min(cbCounts.away/30,1));
}

function cbLoadTotals(){
  if(cbMatchId){
    const f=(S.fixtures||[]).find(x=>x.id===cbMatchId);
    if(f&&f.counters){
      if(!S.battles)S.battles={};
      S.battles[cbMatchId]={A:f.counters.A||0,B:f.counters.B||0};
    }
  }
  updateCbUI();
}

function cbSetCharge(side,pct){
  const ring=document.getElementById('cb-'+side+'-ring');
  if(!ring)return;
  const img=ring.querySelector('img');
  const inner=ring.querySelector('.gk-circle-inner')||ring.querySelector('.gk-charge-inner');
  if(!img)return;
  const sat=(0.25+pct*0.75).toFixed(2);
  const bri=(0.5+pct*0.5).toFixed(2);
  img.style.filter=`saturate(${sat}) brightness(${bri})`;
  if(inner)inner.style.transform=`scale(${(1+pct*0.08).toFixed(3)})`;
  const deg=Math.round(pct*360);
  const clr=side==='home'?`rgba(0,200,255,${(0.3+pct*0.7).toFixed(2)})`:`rgba(255,60,60,${(0.3+pct*0.7).toFixed(2)})`;
  ring.style.background=`conic-gradient(${clr} ${deg}deg, rgba(255,255,255,.04) ${deg}deg)`;
}

// ── SCORE PREDICTION (stub — no Redis backend) ────────────────────────────
function loadPrediction(){
  const btn=document.getElementById('pred-submit-btn');
  if(btn)btn.disabled=false;
}
function submitPrediction(){
  if(!S.name){openAuthModal();return;}
  const hInp=document.getElementById('pred-home-score');
  const aInp=document.getElementById('pred-away-score');
  const hs=parseInt(hInp?.value??0);
  const as_=parseInt(aInp?.value??0);
  if(isNaN(hs)||isNaN(as_)||hs<0||as_<0)return;
  const btn=document.getElementById('pred-submit-btn');
  const lock=document.getElementById('pred-locked-msg');
  if(btn)btn.disabled=true;
  if(hInp)hInp.disabled=true;
  if(aInp)aInp.disabled=true;
  if(lock)lock.style.display='block';
}
