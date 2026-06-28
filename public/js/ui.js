'use strict';

// ── NATION GRID ───────────────────────────────────────────────────────────
function crRefreshGrid(){
  const ng=document.getElementById('nations-grid');
  const t3El=document.getElementById('top3-grid');
  const sorted=[...TEAMS].sort((a,b)=>{
    const pa=S.grid[a.code]||0,pb=S.grid[b.code]||0;
    if(pb!==pa)return pb-pa;
    return b.pts-a.pts||(b.w-a.w);
  });

  // Update stats bar
  const total=Object.values(S.grid).reduce((s,v)=>s+(v||0),0);
  const statTotal=document.getElementById('stat-total');
  if(statTotal)statTotal.textContent=total.toLocaleString('tr');
  const statLeader=document.getElementById('stat-leader');
  if(statLeader&&sorted.length){
    const top=sorted[0];
    statLeader.textContent=(S.grid[top.code]||0)>0?top.name:'—';
  }

  if(t3El){
    t3El.innerHTML='';
    [[1,'s'],[0,'g'],[2,'b']].forEach(([idx,cls])=>{
      const t=sorted[idx];if(!t)return;
      const pts=S.grid[t.code]||0;
      const d=document.createElement('div');d.className=`medal ${cls}`;
      d.innerHTML=`<div class="medal-rank">#${idx+1}</div>
        <div class="flag-circ"><img src="${FLAG_BASE}${t.fc}.png" onerror="this.style.opacity='.5'" alt="${t.name}"></div>
        <div class="medal-name">${t.name}</div>
        <div class="medal-pts">${pts.toLocaleString('tr')} puan</div>`;
      t3El.appendChild(d);
    });
  }
  if(!ng)return;
  ng.innerHTML='';
  const maxPts=sorted.reduce((m,t)=>Math.max(m,S.grid[t.code]||0),1);
  sorted.forEach((t,i)=>{
    const rank=i+1;
    const rkCls=rank===4?'rk4':rank<=10?'rk5':'';
    const gamePts=S.grid[t.code]||0;
    const barPct=maxPts>0?Math.round(gamePts/maxPts*100):0;
    const ptsLabel=gamePts.toLocaleString('tr')+' puan';
    const d=document.createElement('div');d.className='nf-item';
    d.innerHTML=`<div class="nf-flag-wrap">
        <div class="nf-rank ${rkCls}">#${rank}</div>
        <div class="nf-circ"><img src="${FLAG_SM}${t.fc}.png" onerror="this.style.opacity='.4'" alt="${t.name}"></div>
      </div>
      <div class="nf-name">${t.name}</div>
      <div class="nf-pts-wrap">
        <div class="nf-pts-bar-bg"><div class="nf-pts-bar" style="width:${barPct}%"></div></div>
        <div class="nf-pts-val">${ptsLabel}</div>
      </div>`;
    d.addEventListener('click',()=>openModal(t));
    ng.appendChild(d);
  });
}

// ── TABS / PANELS ─────────────────────────────────────────────────────────
const ALL_PANELS=['panel-main','panel-gun','panel-rush','panel-quiz'];
let gunInited=false;
function calcIframeH(){const hh=document.querySelector('header').offsetHeight,th=document.querySelector('.tabs').offsetHeight;return(window.innerHeight-hh-th)+'px';}

function goHome(){
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab==='bayrak'));
  switchPanel('panel-main');
  window.scrollTo({top:0,behavior:'smooth'});
}

function switchPanel(target){
  const cur=ALL_PANELS.find(id=>{const el=document.getElementById(id);return el&&el.style.display!=='none'&&el.style.display!=='';});
  if(cur===target)return;
  const curEl=cur?document.getElementById(cur):null;
  const tgtEl=document.getElementById(target);
  if(!tgtEl)return;
  if(curEl){
    curEl.style.transition='opacity .22s ease,transform .22s ease';
    curEl.style.opacity='0';curEl.style.transform='translateY(-14px)';
  }
  setTimeout(()=>{
    ALL_PANELS.forEach(id=>{const el=document.getElementById(id);if(el){el.style.display='none';el.style.opacity='';el.style.transform='';el.style.transition='';}});
    tgtEl.style.display='block';
    tgtEl.style.opacity='0';tgtEl.style.transform='translateY(28px)';
    tgtEl.style.transition='opacity .36s ease,transform .36s ease';
    tgtEl.offsetHeight;
    tgtEl.style.opacity='1';tgtEl.style.transform='translateY(0)';
  },200);
}

document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===t.dataset.tab));
  const tab=t.dataset.tab;
  let target='panel-main';
  if(tab==='gun')target='panel-gun';
  else if(tab==='rush')target='panel-rush';
  else if(tab==='quiz')target='panel-quiz';
  switchPanel(target);
  setTimeout(()=>{
    const tabsEl=document.querySelector('.tabs');
    if(tabsEl){
      const hh=document.querySelector('header').offsetHeight;
      const top=tabsEl.getBoundingClientRect().top+window.scrollY-hh;
      window.scrollTo({top:Math.max(0,top),behavior:'smooth'});
    }
  },60);
  if(tab==='rush'&&typeof rushUpdateBestLabel==='function')rushUpdateBestLabel();
  if(tab==='gun'&&!gunInited){gunInited=true;if(typeof initGunTab==='function')initGunTab();}
  if(tab==='quiz'){const cgrid=document.getElementById('cgrid');if(cgrid&&!cgrid.children.length&&typeof qBuildCGrid==='function')qBuildCGrid();}
}));
window.addEventListener('resize',()=>{const rp=document.getElementById('panel-rush');if(rp&&rp.style.display==='block')rp.style.height=calcIframeH();});

// ── MODAL ─────────────────────────────────────────────────────────────────
function openModal(team){
  document.getElementById('m-flag').src=FLAG_BASE+team.fc+'.png';
  document.getElementById('m-name').textContent=team.name.toUpperCase();
  document.getElementById('m-grp').textContent=`GRUP ${team.grp} · 2026 FİFA DÜNYA KUPASI`;
  const members=TEAMS.filter(x=>x.grp===team.grp).sort((a,b)=>b.pts-a.pts||(b.w-a.w));
  document.getElementById('m-table').innerHTML=
    `<tr><th>#</th><th>Ülke</th><th style="text-align:center">G</th><th style="text-align:center">B</th><th style="text-align:center">M</th><th style="text-align:right">P</th></tr>`
    +members.map((m,i)=>`<tr${m.code===team.code?' class="hl"':''}>
      <td style="color:var(--dim);font-family:'Barlow Condensed',sans-serif">${i+1}</td>
      <td><img class="st-flag" src="${FLAG_SM}${m.fc}.png" onerror="this.style.display='none'">${m.name}</td>
      <td style="text-align:center">${m.w}</td><td style="text-align:center">${m.d}</td>
      <td style="text-align:center">${m.l}</td>
      <td style="text-align:right;font-weight:800;color:var(--cyan);font-family:'Barlow Condensed',sans-serif">${m.pts}</td>
    </tr>`).join('');
  document.getElementById('modal').classList.remove('hidden');
}
document.getElementById('modal-x').onclick=()=>document.getElementById('modal').classList.add('hidden');
document.getElementById('modal').addEventListener('click',e=>{if(e.target===document.getElementById('modal'))document.getElementById('modal').classList.add('hidden');});

// ── SIDEBAR ───────────────────────────────────────────────────────────────
(()=>{
  const sidebar=document.getElementById('sidebar');
  const overlay=document.getElementById('sidebar-overlay');
  const toggle=document.getElementById('sb-toggle');
  const close=document.getElementById('sb-close');
  function openSb(){sidebar.classList.add('open');overlay.classList.add('open');document.body.style.overflow='hidden';}
  function shutSb(){sidebar.classList.remove('open');overlay.classList.remove('open');document.body.style.overflow='';}
  toggle.addEventListener('click',openSb);
  close.addEventListener('click',shutSb);
  overlay.addEventListener('click',shutSb);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')shutSb();});
  toggle.addEventListener('click',()=>toggle.classList.toggle('active'));
  close.addEventListener('click',()=>toggle.classList.remove('active'));
  overlay.addEventListener('click',()=>toggle.classList.remove('active'));
})();

function closeSidebar(){
  const sidebar=document.getElementById('sidebar');
  const overlay=document.getElementById('sidebar-overlay');
  const toggle=document.getElementById('sb-toggle');
  if(sidebar)sidebar.classList.remove('open');
  if(overlay)overlay.classList.remove('open');
  if(toggle)toggle.classList.remove('active');
  document.body.style.overflow='';
}

// ── CLOCK ─────────────────────────────────────────────────────────────────
let tzOffset=3;
function updateClock(){
  const now=new Date();
  const utc=now.getTime()+now.getTimezoneOffset()*60000;
  const local=new Date(utc+tzOffset*3600000);
  const h=String(local.getHours()).padStart(2,'0');
  const m=String(local.getMinutes()).padStart(2,'0');
  const s=String(local.getSeconds()).padStart(2,'0');
  const ct=document.getElementById('clock-time');
  const cg=document.getElementById('clock-gmt');
  if(ct)ct.textContent=`${h}:${m}:${s}`;
  if(cg)cg.textContent=`GMT${tzOffset>=0?'+':''}${tzOffset}`;
}
updateClock();setInterval(updateClock,1000);
document.querySelectorAll('.tz-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.tz-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    tzOffset=parseInt(btn.dataset.offset);
    updateClock();
    if(typeof gkRenderMatchBarFromFixtures==='function')gkRenderMatchBarFromFixtures();
  });
});

// ── STARS ─────────────────────────────────────────────────────────────────
(()=>{
  const s=document.getElementById('stars');if(!s)return;
  const anims=['tw','tw2','tw3'];
  const colors=['255,255,255','200,220,255','255,255,210','180,200,255','255,240,200'];
  for(let i=0;i<380;i++){
    const el=document.createElement('div');
    const big=Math.random()<0.06;
    const sz=big?Math.random()*1.4+1.6:Math.random()*1.2+.3;
    const col=colors[Math.floor(Math.random()*colors.length)];
    const anim=anims[Math.floor(Math.random()*anims.length)];
    const dur=(Math.random()*6+3).toFixed(1);
    const delay=(Math.random()*12).toFixed(1);
    el.style.cssText=`position:absolute;width:${sz}px;height:${sz}px;`+
      `background:rgba(${col},${(Math.random()*.5+.2).toFixed(2)});`+
      `border-radius:50%;top:${(Math.random()*100).toFixed(2)}%;`+
      `left:${(Math.random()*100).toFixed(2)}%;`+
      `animation:${anim} ${dur}s ${delay}s ease-in-out infinite;`+
      (big?`box-shadow:0 0 ${Math.round(sz*2)}px rgba(${col},.4);`:'');
    s.appendChild(el);
  }
})();

(function scheduleShoot(){
  const ANGLE=28;
  const delay=(40+Math.random()*80)*1000;
  setTimeout(()=>{
    const s=document.getElementById('stars');if(!s){scheduleShoot();return;}
    const el=document.createElement('div');
    const startX=30+Math.random()*(window.innerWidth*0.55);
    const startY=10+Math.random()*(window.innerHeight*0.40);
    const trailLen=100+Math.random()*60;
    el.style.cssText=
      `position:absolute;left:${startX}px;top:${startY}px;`+
      `width:${trailLen}px;height:1.5px;border-radius:4px;`+
      `background:linear-gradient(to right,transparent 0%,rgba(255,255,255,.18) 30%,rgba(255,255,255,.88) 80%,#fff 100%);`+
      `box-shadow:${trailLen-3}px 0 5px 2px rgba(255,255,255,.85);`+
      `pointer-events:none;opacity:0;will-change:transform,opacity;`;
    s.appendChild(el);
    const dist=320+Math.random()*160;
    const dur=4000+Math.random()*2500;
    el.animate([
      {opacity:0,transform:`rotate(${ANGLE}deg) translateX(0px) scale(1)`},
      {opacity:0.92,transform:`rotate(${ANGLE}deg) translateX(${dist*.04}px) scale(1)`,offset:0.04},
      {opacity:0.55,transform:`rotate(${ANGLE}deg) translateX(${dist*.45}px) scale(0.48)`,offset:0.45},
      {opacity:0.15,transform:`rotate(${ANGLE}deg) translateX(${dist*.80}px) scale(0.12)`,offset:0.80},
      {opacity:0,transform:`rotate(${ANGLE}deg) translateX(${dist}px) scale(0.03)`}
    ],{duration:dur,easing:'cubic-bezier(0.22,0.61,0.36,1)',fill:'forwards'}).onfinish=()=>el.remove();
    scheduleShoot();
  },delay);
}());

// Initial render
crRefreshGrid();
