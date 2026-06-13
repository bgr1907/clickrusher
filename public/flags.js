/* CLICKRUSHER — Bayrak çizim motoru (flags.js)
   drawCountryFlag(code, fallback?) → data URL
   drawCustomFlag(color, text)      → data URL
*/

const FS=240;
function R(c,x,y,w,h,col){c.fillStyle=col;c.fillRect(x,y,w,h)}
function hb(c,cols){const h=FS/cols.length;cols.forEach((col,i)=>R(c,0,i*h,FS,h+1,col))}
function vb(c,cols){const w=FS/cols.length;cols.forEach((col,i)=>R(c,i*w,0,w+1,FS,col))}
function hw(c,specs){const tot=specs.reduce((a,b)=>a+b[1],0);let y=0;
  specs.forEach(([col,w])=>{const h=FS*w/tot;R(c,0,y,FS,h+1,col);y+=h})}
function disc(c,x,y,r,col){c.fillStyle=col;c.beginPath();c.arc(x,y,r,0,7);c.fill()}
function ring(c,x,y,r,col,w){c.strokeStyle=col;c.lineWidth=w;c.beginPath();c.arc(x,y,r,0,7);c.stroke()}
function star(c,cx,cy,r,col,rot=-Math.PI/2,pts=5,inner=.45){
  c.fillStyle=col;c.beginPath();
  for(let i=0;i<pts*2;i++){const rr=i%2?r*inner:r,a=rot+i*Math.PI/pts;
    const X=cx+rr*Math.cos(a),Y=cy+rr*Math.sin(a);i?c.lineTo(X,Y):c.moveTo(X,Y)}
  c.closePath();c.fill()}
function cres(c,cx,cy,r,col){
  c.fillStyle=col;c.beginPath();
  c.arc(cx,cy,r,Math.PI*.5,Math.PI*1.5);
  c.arc(cx+r*.5,cy,r*.72,Math.PI*1.5,Math.PI*.5,true);
  c.closePath();c.fill()}
function tri(c,pts,col){c.fillStyle=col;c.beginPath();c.moveTo(pts[0][0],pts[0][1]);
  for(let i=1;i<pts.length;i++)c.lineTo(pts[i][0],pts[i][1]);c.closePath();c.fill()}
function dg(c,x1,y1,x2,y2,w,col){c.strokeStyle=col;c.lineWidth=w;c.lineCap='butt';
  c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke()}
function nordic(c,colO,wO,colI,wI){const cx=FS*.42;
  R(c,cx-wO/2,0,wO,FS,colO);R(c,0,FS/2-wO/2,FS,wO,colO);
  if(colI){R(c,cx-wI/2,0,wI,FS,colI);R(c,0,FS/2-wI/2,FS,wI,colI)}}
function sunRays(c,cx,cy,r,col){disc(c,cx,cy,r,col);c.strokeStyle=col;c.lineWidth=r*.3;
  for(let i=0;i<12;i++){const a=i*Math.PI/6;c.beginPath();
    c.moveTo(cx+Math.cos(a)*r*1.3,cy+Math.sin(a)*r*1.3);
    c.lineTo(cx+Math.cos(a)*r*1.85,cy+Math.sin(a)*r*1.85);c.stroke()}}
function uj(c,x,y,w,h){
  c.save();c.beginPath();c.rect(x,y,w,h);c.clip();
  R(c,x,y,w,h,'#1A337F');
  dg(c,x,y,x+w,y+h,h*.30,'#fff');dg(c,x+w,y,x,y+h,h*.30,'#fff');
  dg(c,x,y,x+w,y+h,h*.13,'#C8102E');dg(c,x+w,y,x,y+h,h*.13,'#C8102E');
  R(c,x+w/2-h*.17,y,h*.34,h,'#fff');R(c,x,y+h/2-h*.17,w,h*.34,'#fff');
  R(c,x+w/2-h*.10,y,h*.20,h,'#C8102E');R(c,x,y+h/2-h*.10,w,h*.20,'#C8102E');
  c.restore()}
function wavy(c,x0,x1,y,amp,col,w){c.strokeStyle=col;c.lineWidth=w;c.lineCap='round';
  c.beginPath();for(let x=x0;x<=x1;x+=4){const yy=y+Math.sin((x-x0)/13)*amp;
    x===x0?c.moveTo(x,yy):c.lineTo(x,yy)}c.stroke()}

const DRAW={
 MEX(c){vb(c,['#006847','#fff','#CE1126']);
   disc(c,120,118,15,'#7B5230');tri(c,[[120,104],[136,96],[128,116]],'#7B5230');
   tri(c,[[106,122],[94,134],[112,130]],'#7B5230');
   c.strokeStyle='#3F7A34';c.lineWidth=6;c.beginPath();c.arc(120,124,26,Math.PI*.15,Math.PI*.85);c.stroke()},
 RSA(c){R(c,0,0,FS,120,'#E03C31');R(c,0,120,FS,120,'#001489');
   R(c,0,77,FS,86,'#fff');tri(c,[[0,0],[144,120],[0,240]],'#fff');
   R(c,0,96,FS,48,'#007749');tri(c,[[0,26],[124,120],[0,214]],'#007749');
   tri(c,[[0,46],[96,120],[0,194]],'#FFB81C');
   tri(c,[[0,72],[70,120],[0,168]],'#000')},
 KOR(c){R(c,0,0,FS,FS,'#fff');
   c.fillStyle='#CD2E3A';c.beginPath();c.arc(120,120,42,Math.PI,0);c.fill();
   c.fillStyle='#0047A0';c.beginPath();c.arc(120,120,42,0,Math.PI);c.fill();
   disc(c,99,120,21,'#CD2E3A');disc(c,141,120,21,'#0047A0');
   const bars=(x,y,a)=>{c.save();c.translate(x,y);c.rotate(a);
     for(let k=-1;k<=1;k++)R(c,-17,k*10-3,34,6,'#000');c.restore()};
   bars(52,52,Math.PI/4);bars(188,52,-Math.PI/4);
   bars(52,188,-Math.PI/4);bars(188,188,Math.PI/4)},
 CZE(c){R(c,0,0,FS,120,'#fff');R(c,0,120,FS,120,'#D7141A');
   tri(c,[[0,0],[132,120],[0,240]],'#11457E')},
 CAN(c){R(c,0,0,FS,FS,'#fff');R(c,0,0,62,FS,'#D80621');R(c,178,0,62,FS,'#D80621');
   const L=[[0,-36],[7,-19],[22,-28],[17,-9],[34,-13],[26,3],[38,10],[11,13],[15,32],[5,21],[0,38],[-5,21],[-15,32],[-11,13],[-38,10],[-26,3],[-34,-13],[-17,-9],[-22,-28],[-7,-19]];
   c.fillStyle='#D80621';c.beginPath();
   L.forEach((p,i)=>i?c.lineTo(120+p[0],112+p[1]):c.moveTo(120+p[0],112+p[1]));
   c.closePath();c.fill();R(c,117,148,6,18,'#D80621')},
 BIH(c){R(c,0,0,FS,FS,'#002F6C');tri(c,[[80,0],[200,0],[200,240]],'#FECB00');
   for(let i=0;i<5;i++){const t=.08+.21*i;star(c,80+120*t-16,240*t,10,'#fff')}},
 QAT(c){R(c,0,0,FS,FS,'#fff');c.fillStyle='#8A1538';c.beginPath();
   c.moveTo(82,0);const n=9,h=FS/n;
   for(let i=0;i<n;i++){c.lineTo(58,(i+.5)*h);c.lineTo(82,(i+1)*h)}
   c.lineTo(240,240);c.lineTo(240,0);c.closePath();c.fill()},
 SUI(c){R(c,0,0,FS,FS,'#DA291C');R(c,102,52,36,136,'#fff');R(c,52,102,136,36,'#fff')},
 SCO(c){R(c,0,0,FS,FS,'#005EB8');dg(c,0,0,240,240,36,'#fff');dg(c,240,0,0,240,36,'#fff')},
 MAR(c){R(c,0,0,FS,FS,'#C1272D');
   const pts=[];for(let i=0;i<5;i++){const a=-Math.PI/2+i*2*Math.PI/5;
     pts.push([120+46*Math.cos(a),124+46*Math.sin(a)])}
   c.strokeStyle='#006233';c.lineWidth=8;c.lineJoin='miter';c.beginPath();
   c.moveTo(pts[0][0],pts[0][1]);[2,4,1,3,0].forEach(i=>c.lineTo(pts[i][0],pts[i][1]));
   c.closePath();c.stroke()},
 BRA(c){R(c,0,0,FS,FS,'#009C3B');
   tri(c,[[120,26],[214,120],[120,214],[26,120]],'#FFDF00');
   disc(c,120,120,52,'#002776');
   c.save();c.beginPath();c.arc(120,120,52,0,7);c.clip();
   c.strokeStyle='#fff';c.lineWidth=12;c.beginPath();c.arc(120,216,116,-Math.PI*.74,-Math.PI*.28);c.stroke();
   c.restore()},
 HAI(c){R(c,0,0,FS,120,'#00209F');R(c,0,120,FS,120,'#D21034');
   R(c,94,94,52,52,'#fff');disc(c,120,110,8,'#1C7C3F');R(c,117,110,6,22,'#7B5230')},
 USA(c){for(let i=0;i<7;i++)R(c,0,i*FS/7,FS,FS/7+1,i%2?'#fff':'#B22234');
   R(c,0,0,108,FS*3/7,'#3C3B6E');
   for(let r=0;r<3;r++)for(let k=0;k<4;k++)disc(c,16+k*26,17+r*34,5,'#fff')},
 PAR(c){hb(c,['#D52B1E','#fff','#0038A8']);
   ring(c,120,120,21,'#1C7C3F',5);star(c,120,120,11,'#FFD700')},
 AUS(c){R(c,0,0,FS,FS,'#012169');uj(c,0,0,120,120);
   star(c,60,180,21,'#fff',-Math.PI/2,7,.5);
   star(c,176,42,10,'#fff',-Math.PI/2,7,.5);star(c,202,98,10,'#fff',-Math.PI/2,7,.5);
   star(c,158,124,9,'#fff',-Math.PI/2,7,.5);star(c,188,186,10,'#fff',-Math.PI/2,7,.5);
   star(c,150,86,6,'#fff')},
 TUR(c){R(c,0,0,FS,FS,'#E30A17');cres(c,92,120,52,'#fff');star(c,158,120,20,'#fff',Math.PI/2*5)},
 GER(c){hb(c,['#000','#DD0000','#FFCE00'])},
 CIV(c){vb(c,['#FF8200','#fff','#009A44'])},
 CUW(c){R(c,0,0,FS,FS,'#002B7F');R(c,0,150,FS,30,'#F9E300');
   star(c,46,46,17,'#fff');star(c,82,84,11,'#fff')},
 ECU(c){hw(c,[['#FFDD00',2],['#0033A0',1],['#EF3340',1]]);
   disc(c,120,108,19,'#9DBBDD');disc(c,120,98,6,'#5C4632');
   c.strokeStyle='#5C4632';c.lineWidth=4;c.beginPath();c.arc(120,112,14,Math.PI*.1,Math.PI*.9);c.stroke()},
 NED(c){hb(c,['#AE1C28','#fff','#21468B'])},
 JPN(c){R(c,0,0,FS,FS,'#fff');disc(c,120,120,46,'#BC002D')},
 SWE(c){R(c,0,0,FS,FS,'#006AA7');nordic(c,'#FECC02',34)},
 TUN(c){R(c,0,0,FS,FS,'#E70013');disc(c,120,120,48,'#fff');
   cres(c,108,120,32,'#E70013');star(c,130,120,13,'#E70013',Math.PI/2*5)},
 ESP(c){hw(c,[['#AA151B',1],['#F1BF00',2],['#AA151B',1]]);
   R(c,68,96,26,34,'#AA151B');R(c,68,96,26,9,'#F1BF00');
   ring(c,81,113,15,'#7A6A00',3)},
 CPV(c){R(c,0,0,FS,FS,'#003893');R(c,0,138,FS,15,'#fff');R(c,0,153,FS,14,'#CF2027');R(c,0,167,FS,15,'#fff');
   for(let i=0;i<8;i++){const a=i*Math.PI/4;star(c,96+32*Math.cos(a),152+32*Math.sin(a),7,'#F7D116')}},
 KSA(c){R(c,0,0,FS,FS,'#006C35');
   wavy(c,46,194,92,6,'#fff',10);wavy(c,66,174,116,4,'#fff',7);
   R(c,52,152,136,9,'#fff');tri(c,[[188,152],[202,156.5],[188,161]],'#fff');R(c,42,148,12,17,'#fff')},
 URU(c){for(let i=0;i<9;i++)R(c,0,i*FS/9,FS,FS/9+1,i%2?'#0038A8':'#fff');
   R(c,0,0,96,FS*4/9,'#fff');sunRays(c,48,53,15,'#FCD116')},
 BEL(c){vb(c,['#000','#FDDA24','#EF3340'])},
 EGY(c){hb(c,['#CE1126','#fff','#000']);
   disc(c,120,116,11,'#C09300');tri(c,[[108,124],[96,106],[112,110]],'#C09300');
   tri(c,[[132,124],[144,106],[128,110]],'#C09300');R(c,112,128,16,6,'#C09300')},
 IRN(c){hb(c,['#239F40','#fff','#DA0000']);
   c.strokeStyle='#DA0000';c.lineWidth=6;
   c.beginPath();c.arc(108,120,14,Math.PI*1.6,Math.PI*.9);c.stroke();
   c.beginPath();c.arc(132,120,14,Math.PI*.1,Math.PI*1.4,true);c.stroke();
   R(c,117,104,6,30,'#DA0000')},
 NZL(c){R(c,0,0,FS,FS,'#012169');uj(c,0,0,120,120);
   const st=(x,y)=>{star(c,x,y,12,'#fff');star(c,x,y,8,'#C8102E')};
   st(174,56);st(202,108);st(150,114);st(178,172)},
 FRA(c){vb(c,['#0055A4','#fff','#EF4135'])},
 NOR(c){R(c,0,0,FS,FS,'#BA0C2F');nordic(c,'#fff',42,'#00205B',20)},
 SEN(c){vb(c,['#00853F','#FDEF42','#E31B23']);star(c,120,120,23,'#00853F')},
 IRQ(c){hb(c,['#CE1126','#fff','#000']);wavy(c,72,168,118,7,'#007A3D',10)},
 ARG(c){hb(c,['#74ACDF','#fff','#74ACDF']);sunRays(c,120,120,17,'#F6B40E')},
 AUT(c){hb(c,['#ED2939','#fff','#ED2939'])},
 JOR(c){hb(c,['#000','#fff','#007A3D']);tri(c,[[0,0],[120,120],[0,240]],'#CE1126');
   star(c,46,120,13,'#fff',-Math.PI/2,7,.5)},
 ALG(c){R(c,0,0,FS,FS,'#fff');R(c,0,0,120,FS,'#006233');
   cres(c,108,120,44,'#D21034');star(c,142,120,15,'#D21034')},
 POR(c){R(c,0,0,96,FS,'#046A38');R(c,96,0,144,FS,'#DA291C');
   disc(c,96,120,32,'#FFE900');disc(c,96,120,19,'#fff');ring(c,96,120,19,'#DA291C',4)},
 UZB(c){hb(c,['#0099B5','#fff','#1EB53A']);
   R(c,0,76,FS,7,'#CE1126');R(c,0,157,FS,7,'#CE1126');
   cres(c,42,40,19,'#fff');
   disc(c,80,28,4,'#fff');disc(c,96,42,4,'#fff');disc(c,80,52,4,'#fff')},
 COL(c){hw(c,[['#FCD116',2],['#003893',1],['#CE1126',1]])},
 COD(c){R(c,0,0,FS,FS,'#007FFF');dg(c,0,240,240,0,62,'#F7D618');dg(c,0,240,240,0,40,'#CE1021');
   star(c,46,46,25,'#F7D618')},
 ENG(c){R(c,0,0,FS,FS,'#fff');R(c,100,0,40,FS,'#CE1124');R(c,0,100,FS,40,'#CE1124')},
 GHA(c){hb(c,['#CE1126','#FCD116','#006B3F']);star(c,120,120,23,'#000')},
 PAN(c){R(c,0,0,FS,FS,'#fff');R(c,120,0,120,120,'#D21034');R(c,0,120,120,120,'#005293');
   star(c,60,60,22,'#005293');star(c,180,180,22,'#D21034')},
 CRO(c){hb(c,['#FF0000','#fff','#171796']);
   for(let i=0;i<4;i++)for(let j=0;j<4;j++)
     R(c,102+j*9,94+i*9,9,9,(i+j)%2?'#fff':'#FF0000');
   c.strokeStyle='#fff';c.lineWidth=3;c.strokeRect(102,94,36,36)},
};

// --- Public API ---

const _countryCache = {};

window.drawCountryFlag = function(code, fallback) {
  if (_countryCache[code]) return _countryCache[code];
  const cv = document.createElement('canvas');
  cv.width = FS; cv.height = FS;
  const x = cv.getContext('2d');
  (DRAW[code] || (c => {
    R(c,0,0,FS,FS,'#456');
    c.fillStyle='#fff';c.font='bold 72px sans-serif';
    c.textAlign='center';c.textBaseline='middle';
    c.fillText(fallback || code, 120, 120);
  }))(x);
  return (_countryCache[code] = cv.toDataURL('image/png'));
};

window.drawCustomFlag = function(color, text) {
  const cv = document.createElement('canvas');
  cv.width = FS; cv.height = FS;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = color || '#2a4a3a';
  ctx.fillRect(0, 0, FS, FS);
  const t = (text || '?').substring(0, 3);
  const fontSize = t.length > 2 ? 68 : t.length > 1 ? 82 : 100;
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(t, 120, 126);
  return cv.toDataURL('image/png');
};

// Render a flag onto an existing <canvas> element
window.renderFlagOnCanvas = function(canvas, flagType, flagValue) {
  if (flagType === 'country') {
    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = window.drawCountryFlag(flagValue, flagValue);
  } else {
    const src = window.drawCustomFlag(flagValue.color, flagValue.text);
    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = src;
  }
};

// Get data URL for a flag object { type, value }
window.getFlagSrc = function(flag) {
  if (!flag) return window.drawCustomFlag('#234', '?');
  if (flag.type === 'country') return window.drawCountryFlag(flag.value, flag.value);
  return window.drawCustomFlag(flag.value && flag.value.color, flag.value && flag.value.text);
};
