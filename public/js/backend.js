'use strict';
// ── HELPERS ──────────────────────────────────────────────────────────────
function $(id){ return document.getElementById(id); }
function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── DEVICE ID ─────────────────────────────────────────────────────────
function genId(){ return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&0x3|0x8)).toString(16);}); }
const deviceId=(()=>{ let d=localStorage.getItem('ta26_device'); if(!d){d=genId();localStorage.setItem('ta26_device',d);} return d; })();

// ── STATE ─────────────────────────────────────────────────────────────
const S = {
  name: localStorage.getItem('ta26_name') || '',
  email: localStorage.getItem('ta26_email') || '',
  mineTotal: 0,
  minePerTeam: {},
  grid: {},
  battles: {},
  fixtures: [],
  fix: null,
  liveScores: {},
  cTops: {},
  clickTimes: [],
  country: localStorage.getItem('ta26_country') || '',
};

// Supabase stub için quiz/rush uyumluluğu
const CR_USER = null;
function crAddPoints(){}

let pendingClicks = [];

// ── API ───────────────────────────────────────────────────────────────
async function loadState() {
  try {
    const res = await fetch('/api/state');
    if (!res.ok) return;
    const data = await res.json();
    if (data.scores)       Object.assign(S.grid, data.scores);
    if (data.fixtures){
      S.fixtures = data.fixtures;
      S.fixtures.forEach(f=>{ if(f.counters){ if(!S.battles)S.battles={}; S.battles[f.id]={A:f.counters.A||0,B:f.counters.B||0}; } });
    }
    if (data.countryTops)  S.cTops = data.countryTops;
    if (data.liveScores)   S.liveScores = data.liveScores;
    if (data.me)           { S.mineTotal = data.me.total || 0; }
    if (data.myCountries)  S.minePerTeam = data.myCountries;
  } catch(e) {}
}

function applyState(data) {
  if (data.scores)      Object.assign(S.grid, data.scores);
  if (data.fixtures){
    S.fixtures = data.fixtures;
    S.fixtures.forEach(f=>{ if(f.counters){ if(!S.battles)S.battles={}; S.battles[f.id]={A:f.counters.A||0,B:f.counters.B||0}; } });
  }
  if (data.countryTops) S.cTops = data.countryTops;
  if (data.liveScores)  S.liveScores = data.liveScores;
  if (typeof crRefreshGrid === 'function') crRefreshGrid();
  if (typeof gkRenderMatchBarFromFixtures === 'function') gkRenderMatchBarFromFixtures();
}

let sseConn = null;
function connectSSE() {
  if (sseConn) { try { sseConn.close(); } catch {} }
  sseConn = new EventSource('/api/stream');
  sseConn.addEventListener('message', e => {
    try { applyState(JSON.parse(e.data)); } catch {}
  });
  sseConn.addEventListener('chat', e => {
    try {
      const d = JSON.parse(e.data);
      if (d.fixtureId === chatState.fixId && d.msg) appendChatMsg(d.msg);
    } catch {}
  });
  sseConn.onerror = () => { setTimeout(connectSSE, 5000); };
}

// ── CLICK QUEUE ──────────────────────────────────────────────────────
function allowClick(){
  const now = performance.now();
  S.clickTimes = S.clickTimes.filter(t => now - t < 1000);
  if (S.clickTimes.length >= 15) return false;
  S.clickTimes.push(now);
  return true;
}

function queueClick(type, id, side){
  if (!allowClick()) return false;
  const existing = pendingClicks.find(it => it.type===type && it.id===id && it.side===side);
  if (existing) existing.n = Math.min(existing.n + 1, 10);
  else pendingClicks.push({type, id, ...(side?{side}:{}), n:1});
  return true;
}

async function flushClicks(){
  if (!pendingClicks.length || !S.name) return;
  const batch = pendingClicks.splice(0);
  try {
    const res = await fetch('/api/clicks', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({device: deviceId, name: S.name, items: batch, _hp: ''}),
    });
    if (!res.ok) {
      pendingClicks = [...batch, ...pendingClicks];
    } else {
      const me = await res.json();
      if (me?.total != null) {
        S.mineTotal = me.total;
        const el = $('stat-total');
        if (el) el.textContent = S.mineTotal.toLocaleString('tr');
        const profEl = $('prof-total');
        if (profEl) profEl.textContent = `Toplam: ${S.mineTotal.toLocaleString('tr')} puan`;
      }
    }
  } catch {
    pendingClicks = [...batch, ...pendingClicks];
  }
}
setInterval(flushClicks, 500);

// ── AUTH ─────────────────────────────────────────────────────────────
let _authSelectedCountry = '';

function openAuthModal() {
  const m = $('auth-modal');
  if (m) m.classList.remove('hidden');
  buildAuthCGrid();
}
function _resetRegisterForm() {
  const s1=$('af-reg-step1'), s2=$('af-reg-step2');
  if(s1) s1.style.display='';
  if(s2) s2.style.display='none';
  $('re-err')  && ($('re-err').textContent='');
  $('re-err1') && ($('re-err1').textContent='');
  // Ülke seçimini sıfırla
  _authSelectedCountry = '';
  const grid=$('auth-cgrid');
  if(grid) grid.querySelectorAll('.acc.sel').forEach(x=>x.classList.remove('sel'));
}

function closeAuthModal() {
  const m = $('auth-modal');
  if (m) m.classList.add('hidden');
  $('li-err') && ($('li-err').textContent='');
  _resetRegisterForm();
}
function authTab(tab) {
  const isLogin = tab !== 'register';
  $('atab-login')    && $('atab-login').classList.toggle('on', isLogin);
  $('atab-register') && $('atab-register').classList.toggle('on', !isLogin);
  $('af-login')      && ($('af-login').style.display    = isLogin ? '' : 'none');
  $('af-register')   && ($('af-register').style.display = isLogin ? 'none' : '');
  if (isLogin) _resetRegisterForm();
}

function buildAuthCGrid() {
  const grid = $('auth-cgrid');
  if (!grid || grid.children.length) return;
  TEAMS.forEach(t => {
    const div = document.createElement('div');
    div.className = 'acc';
    div.innerHTML = `<img src="${FLAG_SM}${t.fc}.png" onerror="this.style.opacity='.4'" alt="${t.code}"><div style="font-size:8px;color:var(--dim2)">${t.name}</div>`;
    div.addEventListener('click', () => {
      grid.querySelectorAll('.acc').forEach(x => x.classList.remove('sel'));
      div.classList.add('sel');
      _authSelectedCountry = t.code;
    });
    grid.appendChild(div);
  });
}

function togglePw(id, btn) {
  const inp = $(id);
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  if (btn) btn.textContent = inp.type === 'password' ? '👁' : '🙈';
}

async function authLogin() {
  const nameOrEmail = ($('li-nick')?.value || '').trim();
  const pw          = ($('li-pw')?.value  || '');
  const errEl = $('li-err');
  if (!nameOrEmail || !pw) { if(errEl) errEl.textContent='E-posta / kullanıcı adı ve şifre gerekli'; return; }
  const btn = $('li-btn');
  if (btn) btn.disabled = true;
  try {
    const res  = await fetch('/api/login', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({device:deviceId,name:nameOrEmail,password:pw})});
    const data = await res.json();
    if (data.ok) {
      S.name    = data.name;
      S.email   = data.email || '';
      S.country = data.country || '';
      localStorage.setItem('ta26_name', data.name);
      localStorage.setItem('ta26_pwd',  pw);
      if (data.email)   localStorage.setItem('ta26_email', data.email);
      if (data.country) localStorage.setItem('ta26_country', data.country);
      closeAuthModal();
      updateUserChip();
      updateChatUI();
      checkPendingRace();
    } else {
      const msgs = {
        not_found:'Kullanıcı bulunamadı',wrong_password:'Şifre hatalı',
        invalid_credentials:'Kullanıcı adı veya şifre hatalı',
        rate_limited:'Çok fazla deneme, lütfen biraz bekle',
      };
      if (errEl) errEl.textContent = msgs[data.reason] || data.reason || 'Giriş başarısız';
    }
  } catch { if (errEl) errEl.textContent = 'Bağlantı hatası'; }
  if (btn) btn.disabled = false;
}

// Adım 1: E-posta + şifre doğrulama
let _regEmail = '', _regPw = '';
function authRegisterStep1() {
  const email = ($('re-email')?.value || '').trim();
  const pw    = ($('re-pw')?.value    || '');
  const pw2   = ($('re-pw2')?.value   || '');
  const errEl = $('re-err1');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { if(errEl) errEl.textContent='Geçerli bir e-posta adresi gir'; return; }
  if (pw.length < 6)  { if(errEl) errEl.textContent='Şifre en az 6 karakter olmalı'; return; }
  if (pw !== pw2)     { if(errEl) errEl.textContent='Şifreler eşleşmiyor'; return; }
  if (errEl) errEl.textContent = '';
  _regEmail = email;
  _regPw    = pw;
  $('af-reg-step1').style.display = 'none';
  $('af-reg-step2').style.display = '';
  buildAuthCGrid();
  $('re-nick')?.focus();
}

function authRegisterBack() {
  $('af-reg-step2').style.display = 'none';
  $('af-reg-step1').style.display = '';
}

const NICK_RE = /^[a-zA-Z0-9ğüşıöçĞÜŞİÖÇ_\-]{2,15}$/u;

// Adım 2: Nick + ülke → kayıt tamamla
async function authRegister() {
  const nick  = ($('re-nick')?.value || '').trim();
  const errEl = $('re-err');
  if (!nick || nick.length < 2)    { if(errEl) errEl.textContent='En az 2 karakter kullanıcı adı gir'; return; }
  if (!NICK_RE.test(nick))         { if(errEl) errEl.textContent='Sadece harf, rakam, _ ve - kullanabilirsin (boşluk yok)'; return; }
  if (!_authSelectedCountry)       { if(errEl) errEl.textContent='Bir ülke seç'; return; }
  const btn = $('re-btn');
  if (btn) btn.disabled = true;
  try {
    const res  = await fetch('/api/register', {method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({device:deviceId,name:nick,password:_regPw,email:_regEmail,country:_authSelectedCountry})});
    const data = await res.json();
    if (data.ok) {
      S.name    = data.name;
      S.email   = data.email || _regEmail;
      S.country = _authSelectedCountry;
      localStorage.setItem('ta26_name',    data.name);
      localStorage.setItem('ta26_pwd',     _regPw);
      localStorage.setItem('ta26_email',   S.email);
      localStorage.setItem('ta26_country', _authSelectedCountry);
      _regEmail = ''; _regPw = '';
      closeAuthModal();
      updateUserChip();
      updateChatUI();
    } else {
      const msgs = {taken:'Bu kullanıcı adı alınmış',email_taken:'Bu e-posta zaten kayıtlı',badword:'Uygunsuz kullanıcı adı',invalid_password:'Şifre geçersiz',invalid:'Kullanıcı adı geçersiz (harf, rakam, _ ve - kullanabilirsin)',email_required:'E-posta zorunludur',rate_limited:'Çok fazla deneme, lütfen biraz bekle'};
      if (errEl) errEl.textContent = msgs[data.reason] || data.reason || 'Kayıt başarısız';
    }
  } catch { if (errEl) errEl.textContent = 'Bağlantı hatası'; }
  if (btn) btn.disabled = false;
}

function doLogout() {
  S.name = '';
  S.email = '';
  S.country = '';
  S.mineTotal = 0;
  S.minePerTeam = {};
  localStorage.removeItem('ta26_name');
  localStorage.removeItem('ta26_pwd');
  localStorage.removeItem('ta26_email');
  localStorage.removeItem('ta26_country');
  updateUserChip();
  updateChatUI();
  closeProfile();
}

function updateUserChip() {
  const nameEl = $('user-name');
  const avEl   = $('user-avatar');
  if (!nameEl) return;
  if (S.name) {
    nameEl.textContent = S.name;
    const t = T[S.country];
    if (avEl && t) {
      avEl.innerHTML = `<img src="${FLAG_SM}${t.fc}.png" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    } else if (avEl) {
      avEl.textContent = S.name[0].toUpperCase();
    }
  } else {
    nameEl.textContent = 'Giriş Yap';
    if (avEl) avEl.textContent = '👤';
  }
}

// user-chip tıklaması
(()=>{
  const chip = $('user-chip');
  if (chip) chip.addEventListener('click', () => {
    if (S.name) openProfile();
    else openAuthModal();
  });
})();

// ── CHAT ─────────────────────────────────────────────────────────────
const chatState = { fixId: null, polling: null, lastId: 0, cooldownUntil: 0 };

function initChat(fixId) {
  chatState.fixId = fixId || null;
  chatState.lastId = 0;
  const msgsEl = $('chat-msgs');
  if (msgsEl) msgsEl.innerHTML = '';
  updateChatUI();
  if (chatState.polling) clearInterval(chatState.polling);
  if (fixId) {
    chatState.polling = setInterval(pollChat, 4000);
    pollChat();
  }
}

function updateChatUI() {
  const wrap = $('chat-input-wrap');
  if (!wrap) return;
  if (S.name && chatState.fixId) {
    wrap.innerHTML = `<input id="chatInput" type="text" placeholder="Mesajınız…" maxlength="200"
      style="flex:1;background:rgba(0,0,0,.35);border:1px solid rgba(0,200,255,.18);border-radius:6px;
      padding:9px 12px;color:#fff;font-family:'Barlow',sans-serif;font-size:13px;outline:none;">
      <button id="chatSendBtn" class="chat-send-btn">→</button>`;
    $('chatSendBtn').onclick = sendChatMsg;
    $('chatInput').addEventListener('keydown', e => { if(e.key==='Enter') sendChatMsg(); });
  } else {
    wrap.innerHTML = `<div class="chat-login-hint">Sohbet için <span onclick="openAuthModal()" style="color:var(--cyan);cursor:pointer;text-decoration:underline">giriş yap</span></div>`;
  }
}

async function pollChat() {
  if (!chatState.fixId) return;
  try {
    const res  = await fetch(`/api/chat/${chatState.fixId}`);
    const data = await res.json();
    if (data.messages) {
      const newMsgs = data.messages.filter(m => m.id > chatState.lastId);
      newMsgs.forEach(appendChatMsg);
      if (data.messages.length) chatState.lastId = Math.max(...data.messages.map(m => m.id));
    }
  } catch {}
}

function appendChatMsg(msg) {
  const msgsEl = $('chat-msgs');
  if (!msgsEl) return;
  const t = T[msg.name];
  const d = document.createElement('div');
  d.className = 'chat-msg';
  d.innerHTML = `<div class="chat-msg-av">${t?`<img src="${FLAG_SM}${t.fc}.png" alt="">`:''}</div>
    <div class="chat-msg-body">
      <span class="chat-msg-nick">${escHtml(msg.nick)}</span>
      <span class="chat-msg-time">${new Date(msg.ts).toLocaleTimeString('tr',{hour:'2-digit',minute:'2-digit'})}</span>
      <div class="chat-msg-text">${escHtml(msg.text)}</div>
    </div>`;
  msgsEl.appendChild(d);
  msgsEl.scrollTop = msgsEl.scrollHeight;
}

async function sendChatMsg() {
  if (!S.name || !chatState.fixId) return;
  const input   = $('chatInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  if (Date.now() < chatState.cooldownUntil) return;
  const sendBtn = $('chatSendBtn');
  input.disabled = true;
  if (sendBtn) sendBtn.disabled = true;
  try {
    const res  = await fetch(`/api/chat/${chatState.fixId}`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({device:deviceId, text}),
    });
    const data = await res.json();
    if (data.ok) {
      input.value = '';
      chatState.cooldownUntil = Date.now() + 3000;
      setTimeout(() => {
        if(input) { input.disabled=false; input.focus(); }
        if(sendBtn) sendBtn.disabled=false;
      }, 3000);
    } else {
      input.disabled = false;
      if (sendBtn) sendBtn.disabled = false;
    }
  } catch {
    input.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
  }
}

// ── PROFILE ──────────────────────────────────────────────────────────
function openProfile() {
  const ov = $('profile-overlay');
  if (!ov) return;
  ov.classList.add('open');
  const av = $('prof-av');
  const nm = $('prof-dispname');
  const em = $('prof-dispemail');
  const pt = $('prof-total');
  if (av) { const t=T[S.country]; av.innerHTML = t ? `<img src="${FLAG_SM}${t.fc}.png" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : (S.name?S.name[0].toUpperCase():'👤'); }
  if (nm) nm.textContent = S.name || '—';
  if (em) { em.textContent = S.email || ''; em.style.display = S.email ? '' : 'none'; }
  if (pt) pt.textContent = `Toplam: ${S.mineTotal.toLocaleString('tr')} puan`;
}
function closeProfile() {
  const ov = $('profile-overlay');
  if (ov) ov.classList.remove('open');
}

// ── SETTINGS ─────────────────────────────────────────────────────────
function openSettings()  { const m=$('settings-modal'); if(m) m.classList.remove('hidden'); updateNotifStatus(); }
function closeSettings() { const m=$('settings-modal'); if(m) m.classList.add('hidden'); }
function setUiLang(lang) {
  document.querySelectorAll('[id^="hlang-"]').forEach(b=>b.classList.remove('on'));
  const btn=$('hlang-'+lang); if(btn) btn.classList.add('on');
  localStorage.setItem('ta26_lang', lang);
}
function updateNotifStatus() {
  const el=$('notif-status');
  if(!el)return;
  if(!('Notification' in window)){el.textContent='Tarayıcı desteklemiyor';return;}
  el.textContent = Notification.permission==='granted'?'Bildirimler açık ✓':Notification.permission==='denied'?'Bildirimler engellendi':'İzin verilmedi';
}
function requestNotifPerms() {
  if(!('Notification' in window))return;
  Notification.requestPermission().then(p=>{updateNotifStatus();if(p==='granted'&&S.fixtures.length)scheduleMatchNotifications(S.fixtures);});
}

// ── LEADERBOARD ───────────────────────────────────────────────────────
function openLeaderboard() {
  const ov=$('lb-overlay');
  if(ov) ov.classList.add('open');
  renderLbBanner();
  loadLeaderboard();
}
function closeLeaderboard() {
  const ov=$('lb-overlay');
  if(ov) ov.classList.remove('open');
}
function renderLbBanner() {
  const flagsEl=$('lb-banner-flags');
  if(!flagsEl)return;
  const entries=Object.entries(S.minePerTeam).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).slice(0,8);
  if(!entries.length){flagsEl.innerHTML='<div class="lb-banner-empty">Henüz puan kazanılmadı.</div>';return;}
  flagsEl.innerHTML=entries.map(([code,pts])=>{
    const t=T[code];if(!t)return '';
    return `<div class="lb-flag-chip"><img src="${FLAG_SM}${t.fc}.png" alt="${t.name}"><div class="lb-flag-pts">${pts.toLocaleString('tr')}</div><div class="lb-flag-name">${t.name}</div></div>`;
  }).join('');
}
function loadLeaderboard() {
  renderLbCountry();
  renderLbList();
}
function renderLbCountry() {
  const el=$('lb-country-list');
  if(!el)return;
  const sorted=TEAMS.map(t=>({code:t.code,name:t.name,fc:t.fc,pts:S.grid[t.code]||0})).sort((a,b)=>b.pts-a.pts);
  if(!sorted.some(t=>t.pts>0)){el.innerHTML='<div class="lb-empty">Henüz puan yok.</div>';return;}
  el.innerHTML=sorted.filter(t=>t.pts>0).map((t,i)=>{
    const rk=i+1;
    const rkCls=rk===1?'gold':rk===2?'silver':rk===3?'bronze':'';
    const medal=rk===1?'🥇':rk===2?'🥈':rk===3?'🥉':rk;
    return `<div class="lb-row"><div class="lb-rank ${rkCls}">${medal}</div><img class="lb-flag-sm" src="${FLAG_SM}${t.fc}.png" alt=""><div class="lb-nick">${t.name}</div><div class="lb-pts">${t.pts.toLocaleString('tr')}</div></div>`;
  }).join('');
}
function renderLbList() {
  const el=$('lb-global-list');
  if(!el)return;
  const tops=S.cTops||{};
  const entries=Object.entries(tops).flatMap(([code,players])=>players.map(p=>({...p,code}))).sort((a,b)=>b.pts-a.pts).slice(0,50);
  if(!entries.length){el.innerHTML='<div class="lb-empty">Henüz veri yok.</div>';return;}
  el.innerHTML=entries.map((p,i)=>{
    const rk=i+1;
    const rkCls=rk===1?'gold':rk===2?'silver':rk===3?'bronze':'';
    const medal=rk===1?'🥇':rk===2?'🥈':rk===3?'🥉':rk;
    const t=T[p.code];
    const isMe=S.name&&p.name===S.name;
    return `<div class="lb-row${isMe?' me':''}"><div class="lb-rank ${rkCls}">${medal}</div>${t?`<img class="lb-flag-sm" src="${FLAG_SM}${t.fc}.png" alt="">`:''}<div class="lb-nick">${escHtml(p.name)}</div><div class="lb-pts">${(p.pts||0).toLocaleString('tr')}</div></div>`;
  }).join('');
}

// ── FLAG PICKER ───────────────────────────────────────────────────────
let fpSelected = S.country || '';
function openFlagPicker() {
  const fp=$('flag-picker');
  if(!fp)return;
  fp.classList.add('open');
  const grid=$('fp-grid');
  if(!grid||grid.children.length)return;
  TEAMS.forEach(t=>{
    const d=document.createElement('div'); d.className='fp-item'+(t.code===fpSelected?' sel':'');
    d.innerHTML=`<img src="${FLAG_SM}${t.fc}.png" alt="${t.code}"><span>${t.name}</span>`;
    d.addEventListener('click',()=>{
      fpSelected=t.code;
      grid.querySelectorAll('.fp-item').forEach(x=>x.classList.toggle('sel',x===d));
    });
    grid.appendChild(d);
  });
}
function fpConfirm(code) {
  const fp=$('flag-picker');
  if(fp) fp.classList.remove('open');
  if(code) {
    S.country=code;
    localStorage.setItem('ta26_country',code);
  }
}

// ── PENDING RACE ──────────────────────────────────────────────────────
function checkPendingRace(){
  const pending=localStorage.getItem('race_pending');
  if(pending&&S.name){ localStorage.removeItem('race_pending'); window.location.href='/race.html?id='+pending; }
}

// ── CAPS LOCK ─────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const w=$('caps-warn');
  if(w) w.style.display=e.getModifierState('CapsLock')?'':'none';
});

// ── INIT LANG ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('ta26_lang') || 'tr';
  setUiLang(saved);
});
