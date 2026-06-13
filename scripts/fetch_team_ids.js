'use strict';
// Tek seferlik script: worldcup26.ir'dan takım ID → FIFA kodu eşlemesini üretir
// Kullanım: WC_EMAIL=x WC_PASSWORD=y node scripts/fetch_team_ids.js

const fs   = require('fs');
const path = require('path');

async function main() {
  const { WC_EMAIL: email, WC_PASSWORD: password } = process.env;
  if (!email || !password) {
    console.error('Kullanım: WC_EMAIL=... WC_PASSWORD=... node scripts/fetch_team_ids.js');
    process.exit(1);
  }

  console.log('Kimlik doğrulanıyor...');
  const authRes = await fetch('https://worldcup26.ir/auth/authenticate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!authRes.ok) {
    console.error('Auth başarısız:', authRes.status, await authRes.text());
    process.exit(1);
  }
  const { token } = await authRes.json();
  if (!token) { console.error('Token alınamadı'); process.exit(1); }

  console.log('Takımlar çekiliyor...');
  const teamsRes = await fetch('https://worldcup26.ir/get/teams', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!teamsRes.ok) {
    console.error('/get/teams başarısız:', teamsRes.status);
    process.exit(1);
  }
  const teams = await teamsRes.json();

  const map = {};
  for (const t of teams) {
    if (t.id != null && t.fifa_code) {
      map[String(t.id)] = t.fifa_code;
    }
  }

  const outPath = path.join(__dirname, '..', 'data', 'team_ids.json');
  fs.writeFileSync(outPath, JSON.stringify(map, null, 2));
  console.log(`${Object.keys(map).length} takım kaydedildi → data/team_ids.json`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
