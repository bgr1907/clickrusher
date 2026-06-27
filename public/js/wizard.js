'use strict';

// ── STARTUP ───────────────────────────────────────────────────────────────
(async()=>{
  const name=localStorage.getItem('ta26_name');
  const pwd=localStorage.getItem('ta26_pwd');
  if(name&&pwd){
    try{
      const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({device:deviceId,name,password:pwd})});
      if(r.ok){
        const data=await r.json();
        if(data.ok){
          S.name=data.name||name;
          S.email=data.email||localStorage.getItem('ta26_email')||'';
          S.country=data.country||localStorage.getItem('ta26_country')||'';
          if(data.name)localStorage.setItem('ta26_name',data.name);
          if(data.email)localStorage.setItem('ta26_email',data.email);
          updateUserChip();
        }
      }
    }catch(e){}
  }
  await loadState();
  connectSSE();
  crRefreshGrid();
  fetchWCData();
  if(typeof qUpdateSelScreen==='function')qUpdateSelScreen();
})();

// ── WIZARD STATE ──────────────────────────────────────────────────────────
let wizMode='individual',wizWinType='clicks',wizWinVal=200,wizMaxPlayers=4;
let wizFlagType='country',wiz3SelCountry=null;
let wizTeamCount=2,wizTeams=[{name:'Takım 1',color:'#00C8FF'},{name:'Takım 2',color:'#FF3C3C'}];
let wizMaxPlayersTeam=8,wizVisibility='public';

function openWizard(){
  if(!S.name){openAuthModal();return;}
  const veil=document.getElementById('wizVeil');
  if(veil)veil.classList.remove('off');
  wizInit();wizGoPane('wizPane1');
}
function closeWizard(){
  const veil=document.getElementById('wizVeil');if(veil)veil.classList.add('off');
}
function wizGoPane(id){
  document.querySelectorAll('.wiz-pane').forEach(p=>p.classList.remove('on'));
  const p=document.getElementById(id);if(p)p.classList.add('on');
}

function wizInit(){
  // Mode cards
  document.querySelectorAll('.mode-card').forEach(btn=>{
    btn.classList.toggle('selected',btn.dataset.mode===wizMode);
    btn.onclick=()=>{wizMode=btn.dataset.mode;document.querySelectorAll('.mode-card').forEach(b=>b.classList.toggle('selected',b.dataset.mode===wizMode));};
  });
  // Win type
  document.querySelectorAll('.wtype-btn').forEach(btn=>{
    btn.classList.toggle('selected',btn.dataset.wt===wizWinType);
    btn.onclick=()=>{wizWinType=btn.dataset.wt;document.querySelectorAll('.wtype-btn').forEach(b=>b.classList.toggle('selected',b.dataset.wt===wizWinType));wizUpdateSlider();};
  });
  // Win slider
  const slider=document.getElementById('winSlider');
  const valDisp=document.getElementById('winValDisplay');
  if(slider){
    slider.oninput=()=>{wizWinVal=parseInt(slider.value);wizUpdateSlider();};
    wizWinVal=parseInt(slider.value||200);
  }
  wizUpdateSlider();
  // Max players (individual)
  const mpr=document.getElementById('maxPlayersRow');
  if(mpr){mpr.innerHTML='';[2,4,6,8,10].forEach(n=>{const b=document.createElement('button');b.className='num-btn'+(n===wizMaxPlayers?' selected':'');b.textContent=n;b.onclick=()=>{wizMaxPlayers=n;mpr.querySelectorAll('.num-btn').forEach(x=>x.classList.toggle('selected',parseInt(x.textContent)===n));};mpr.appendChild(b);});}
  // Flag type
  const wftC=document.getElementById('wftCountry');const wftX=document.getElementById('wftCustom');
  if(wftC)wftC.onclick=()=>{wizFlagType='country';wftC.classList.add('on');if(wftX)wftX.classList.remove('on');document.getElementById('wiz3IndCountryPick').style.display='';document.getElementById('wiz3IndCustomPick').style.display='none';};
  if(wftX)wftX.onclick=()=>{wizFlagType='custom';wftX.classList.add('on');if(wftC)wftC.classList.remove('on');document.getElementById('wiz3IndCountryPick').style.display='none';document.getElementById('wiz3IndCustomPick').style.display='';wizDrawCustomPreview();};
  // Country search + grid
  wizBuildCtryGrid();
  const search=document.getElementById('wiz3Search');
  if(search)search.oninput=()=>wizBuildCtryGrid(search.value);
  // Custom color/text
  const col=document.getElementById('wiz3Color');const txt=document.getElementById('wiz3Text');
  if(col)col.oninput=wizDrawCustomPreview;
  if(txt)txt.oninput=wizDrawCustomPreview;
  // Team count
  const tcr=document.getElementById('teamCountRow');
  if(tcr){tcr.innerHTML='';[2,3,4].forEach(n=>{const b=document.createElement('button');b.className='num-btn'+(n===wizTeamCount?' selected':'');b.textContent=n;b.onclick=()=>{wizTeamCount=n;tcr.querySelectorAll('.num-btn').forEach(x=>x.classList.toggle('selected',parseInt(x.textContent)===n));wizBuildTeamBuilder();};tcr.appendChild(b);});}
  wizBuildTeamBuilder();
  // Max players (team)
  const mpt=document.getElementById('maxPlayersTeamRow');
  if(mpt){mpt.innerHTML='';[4,6,8,10,12,16].forEach(n=>{const b=document.createElement('button');b.className='num-btn'+(n===wizMaxPlayersTeam?' selected':'');b.textContent=n;b.onclick=()=>{wizMaxPlayersTeam=n;mpt.querySelectorAll('.num-btn').forEach(x=>x.classList.toggle('selected',parseInt(x.textContent)===n));};mpt.appendChild(b);});}
  // Visibility
  const vp=document.getElementById('wizVisPublic');const vpr=document.getElementById('wizVisPrivate');
  if(vp)vp.onclick=()=>{wizVisibility='public';vp.classList.add('selected');if(vpr)vpr.classList.remove('selected');};
  if(vpr)vpr.onclick=()=>{wizVisibility='private';vpr.classList.add('selected');if(vp)vp.classList.remove('selected');};
}

function wizUpdateSlider(){
  const valDisp=document.getElementById('winValDisplay');
  if(!valDisp)return;
  valDisp.textContent=wizWinType==='clicks'?wizWinVal+' tık':wizWinVal+' sn';
}

function wizBuildCtryGrid(filter){
  const scroll=document.getElementById('wiz3CtryScroll');if(!scroll)return;
  scroll.innerHTML='';
  const filtered=CTRY_CODES.filter(c=>{
    const t=T[c];if(!t)return false;
    return !filter||t.name.toLowerCase().includes(filter.toLowerCase());
  });
  filtered.forEach(c=>{
    const t=T[c];
    const el=document.createElement('div');el.className='wiz-ctry-btn'+(wiz3SelCountry===c?' sel':'');
    el.innerHTML=`<img src="https://flagcdn.com/w40/${t.fc}.png" alt="${t.name}" onerror="this.style.opacity='.3'"><span>${t.name}</span>`;
    el.onclick=()=>{wiz3SelCountry=c;scroll.querySelectorAll('.wiz-ctry-btn').forEach(x=>x.classList.toggle('sel',x===el));};
    scroll.appendChild(el);
  });
}

function wizDrawCustomPreview(){
  const col=document.getElementById('wiz3Color');const txt=document.getElementById('wiz3Text');const cnv=document.getElementById('wiz3PrevCanvas');
  if(!cnv)return;
  const color=col?col.value:'#1a6b4a';const text=txt?txt.value:'⚡';
  if(typeof window.drawCustomFlag==='function'){window.drawCustomFlag(cnv,color,text);}
  else{const ctx=cnv.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,240,240);ctx.fillStyle='#fff';ctx.font='bold 80px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,120,120);}
}

function wizBuildTeamBuilder(){
  const tb=document.getElementById('teamBuilder');if(!tb)return;
  while(wizTeams.length<wizTeamCount)wizTeams.push({name:'Takım '+(wizTeams.length+1),color:'#'+(Math.floor(Math.random()*0xffffff)).toString(16).padStart(6,'0')});
  wizTeams=wizTeams.slice(0,wizTeamCount);
  tb.innerHTML='';
  wizTeams.forEach((team,i)=>{
    const row=document.createElement('div');row.className='team-builder-row';
    row.innerHTML=`<input type="color" value="${team.color}" oninput="wizTeams[${i}].color=this.value"><input type="text" maxlength="20" value="${team.name}" placeholder="Takım adı" oninput="wizTeams[${i}].name=this.value">`;
    tb.appendChild(row);
  });
}

function wizBuildSummary(){
  const el=document.getElementById('wizSummary');if(!el)return;
  const modeLabel=wizMode==='individual'?'Bireysel':'Takımlı';
  const winLabel=wizWinType==='clicks'?wizWinVal+' tık':'En İyi Süre ('+wizWinVal+'sn)';
  const playersLabel=wizMode==='individual'?wizMaxPlayers:wizMaxPlayersTeam;
  const visLabel=wizVisibility==='public'?'Herkese Açık':'Gizli';
  el.innerHTML=`<div>Mod: <b>${modeLabel}</b></div><div>Kazanma: <b>${winLabel}</b></div><div>Max Oyuncu: <b>${playersLabel}</b></div><div>Görünürlük: <b>${visLabel}</b></div>`
    +(wizMode==='team'?`<div>Takımlar: <b>${wizTeams.map(t=>t.name).join(', ')}</b></div>`:'');
}

// Button wiring
document.getElementById('wizCloseBtn').addEventListener('click',closeWizard);
document.getElementById('wizBackBtn').addEventListener('click',()=>{
  const active=document.querySelector('.wiz-pane.on');
  if(!active)return;
  const id=active.id;
  if(id==='wizPane2')wizGoPane('wizPane1');
  else if(id==='wizPane3Ind'||id==='wizPane3Team')wizGoPane('wizPane2');
  else if(id==='wizPane4')wizGoPane(wizMode==='individual'?'wizPane3Ind':'wizPane3Team');
});
document.getElementById('wizVeil').addEventListener('click',e=>{if(e.target===document.getElementById('wizVeil'))closeWizard();});
document.getElementById('wizStep1Next').addEventListener('click',()=>wizGoPane('wizPane2'));
document.getElementById('wizStep2Next').addEventListener('click',()=>wizGoPane(wizMode==='individual'?'wizPane3Ind':'wizPane3Team'));
document.getElementById('wizStep2Back').addEventListener('click',()=>wizGoPane('wizPane1'));
document.getElementById('wizStep3IndNext').addEventListener('click',()=>{wizBuildSummary();wizGoPane('wizPane4');});
document.getElementById('wizStep3IndBack').addEventListener('click',()=>wizGoPane('wizPane2'));
document.getElementById('wizStep3TeamNext').addEventListener('click',()=>{wizBuildSummary();wizGoPane('wizPane4');});
document.getElementById('wizStep3TeamBack').addEventListener('click',()=>wizGoPane('wizPane2'));
document.getElementById('wizStep4Back').addEventListener('click',()=>wizGoPane(wizMode==='individual'?'wizPane3Ind':'wizPane3Team'));
document.getElementById('wizCreateBtn').addEventListener('click',()=>{
  closeWizard();
  alert('Yarış oluşturuldu! (Beta — çok yakında çevrimiçi yarışlar!)');
});
