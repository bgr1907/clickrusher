# ClickRusher

2026 Dünya Kupası boyunca yayında kalacak gerçek zamanlı taraftar tık yarışı sitesi.

Kullanıcılar; ülkeleri için tıklayabilir, canlı maçlarda taraf tutabilir, bireysel veya takım halinde özel yarışlar düzenleyebilir ve maç sohbet odasına katılabilir.

## Özellikler

- **Ülke tık tablosu** — 48 takım için gerçek zamanlı sıralama, her takımın kendi Top 10'u
- **Maç tıkları** — aktif fikstürlerde ev/deplasman tarafı seçip tıklama yarışı
- **Özel tık yarışları** — bireysel ya da takım modu, hedef tık sayısı veya süre bazlı, kamuya açık / özel
- **Canlı skorlar** — worldcup26.ir API üzerinden otomatik puan güncelleme
- **Maç sohbeti** — her fikstür için gerçek zamanlı sohbet (küfür filtreli)
- **Kullanıcı profili** — toplam tık, ülke istatistikleri, yarış geçmişi
- **Bot koruması** — sliding-window hız sınırı, ritim analizi, burst cezası, honeypot
- **Küfür filtresi** — Türkçe + İngilizce, leet-speak ve bypass denemeleri dahil

## Teknik Yığın

| Katman | Teknoloji |
|---|---|
| Sunucu | Node.js ≥ 20, Fastify 5 |
| Kalıcı veri | Redis (ioredis) |
| Geliştirme modu | In-memory sahte Redis (Redis kurulumu gerekmez) |
| Gerçek zamanlı | Server-Sent Events (SSE) |
| Ön yüz | Vanilla HTML / JS (framework yok) |
| Deploy | Railway + Redis eklentisi |

## Kurulum (Lokal)

```bash
# Bağımlılıkları yükle
npm install

# Sunucuyu başlat — REDIS_URL tanımlanmamışsa in-memory modda çalışır
npm start
# → http://localhost:3000

# Geliştirme (dosya değişikliklerinde otomatik yeniden başlatır)
npm run dev
```

`.env` dosyası oluşturmak için:

```bash
cp .env.example .env
```

`.env.example` içindeki değişkenler:

| Değişken | Açıklama |
|---|---|
| `REDIS_URL` | Redis bağlantı adresi (`redis://...`). Boş bırakılırsa in-memory mod |
| `PORT` | Sunucu portu (varsayılan: 3000) |
| `WC_EMAIL` | worldcup26.ir API hesap e-postası (canlı skor için) |
| `WC_PASSWORD` | worldcup26.ir API şifresi (canlı skor için) |

> `WC_EMAIL` / `WC_PASSWORD` girilmezse canlı skor ve otomatik fikstür güncelleme devre dışı kalır; diğer tüm özellikler çalışmaya devam eder.

## Senkronizasyon Testi (İki Tarayıcı)

1. `npm start` ile sunucuyu başlat
2. **Tarayıcı 1**'i `http://localhost:3000` adresinde aç, kayıt ol / giriş yap
3. **Tarayıcı 2**'yi gizli sekmede aynı adrese aç, farklı bir hesapla giriş yap
4. Her iki tarayıcıda da bir bayrağa tıkla
5. En geç 1 saniye içinde diğer tarayıcıda sayaçların güncellendiğini göreceksin

## Yük Testi

```bash
# 10 saniye boyunca ~200 istek/sn gönderir
node scripts/loadtest.js http://localhost:3000 10
```

Beklenen sonuç: hız sınırı (~15 tık/sn/cihaz) devreye girer, sunucu düşmez.

## Günün Maçlarını Manuel Güncelleme

`WC_EMAIL` tanımlıysa fikstürler API'den otomatik güncellenir. Manuel güncelleme için:

`data/fixtures.json` dosyasını elle düzenle — sunucuyu yeniden başlatmana gerek yok, her 5 dakikada bir okunur.

```json
{
  "date": "2026-06-15",
  "fixtures": [
    { "id": "m5", "a": "BRA", "b": "ARG", "ko": "21:00" }
  ]
}
```

Ülke kodları için `data/teams.json` dosyasına bak.

## API Endpoint'leri

| Yöntem | Yol | Açıklama |
|---|---|---|
| GET | `/healthz` | Sağlık kontrolü |
| GET | `/api/state` | Tüm skor durumu snapshot'ı |
| POST | `/api/register` | Kullanıcı kaydı (device, name, password, email) |
| POST | `/api/login` | Giriş (device, name/email, password) |
| POST | `/api/clicks` | Toplu tık gönder |
| GET | `/api/stream` | SSE akışı (canlı durum güncellemeleri) |
| GET | `/api/profile` | Kullanıcı profili |
| GET | `/api/chat/:fixtureId` | Maç sohbet geçmişi (son 50) |
| POST | `/api/chat/:fixtureId` | Sohbete mesaj gönder |
| POST | `/api/race/create` | Yarış oluştur |
| GET | `/api/races/open` | Bekleyen açık yarışları listele |
| POST | `/api/race/:id/join` | Yarışa katıl |
| POST | `/api/race/:id/force-start` | Kurucu erken başlatır |
| POST | `/api/race/:id/click` | Yarış tıkı gönder |
| GET | `/api/race/:id/state` | Yarış durumunu al |
| GET | `/api/race/:id/stream` | Yarış SSE akışı |

## Railway Deploy

1. [railway.app](https://railway.app) hesabı aç, yeni proje oluştur
2. GitHub reposunu bağla (veya `railway up` CLI ile push et)
3. **Redis eklentisi** ekle: Railway Dashboard → "Add Service" → "Redis"
4. Ortam değişkenlerini ayarla:
   - `REDIS_URL` → `${{Redis.REDIS_URL}}` (Railway otomatik çözer)
   - `WC_EMAIL` ve `WC_PASSWORD` → canlı skor için
   - `PORT` → Railway otomatik sağlar, bırakabilirsin
5. Deploy tamamlandıktan sonra kontrol et:
   ```
   curl https://senin-domain.railway.app/healthz
   # {"ok":true}
   ```

## GoDaddy Domain Bağlama

1. Railway Dashboard → Settings → Domains → "Custom Domain" ekle
2. Verilen `*.railway.app` alt domainini kopyala
3. GoDaddy DNS yönetimine gir:
   - Tip: **CNAME** | Ad: `www` | Değer: Railway'in `*.up.railway.app` adresi | TTL: 600
4. DNS yayılması 10–30 dakika sürer; Railway otomatik SSL oluşturur

> **Not:** GoDaddy kök domain CNAME desteklemez. Kök domain için "Forwarding" ile `www`'yi yönlendir ya da Cloudflare'e taşı.

## Proje Yapısı

```
clickrusher/
├── server.js          # Fastify sunucusu, tüm HTTP/SSE route'ları
├── lib/
│   ├── auth.js        # Kayıt / giriş (scrypt şifre hash'i)
│   ├── counters.js    # Redis tık sayaçları ve liderlik tabloları
│   ├── races.js       # Tık yarışı iş mantığı
│   ├── scores.js      # Canlı skor API entegrasyonu
│   ├── ratelimit.js   # Sliding window + ritim + burst sınırlama
│   ├── badwords.js    # Küfür filtresi (TR/EN, leet-speak dahil)
│   └── redis.js       # Redis istemcisi (in-memory fallback)
├── public/            # Statik ön yüz dosyaları
│   ├── index.html     # Ana sayfa (ülke tablosu, maçlar, küre)
│   ├── race.html      # Yarış odası
│   ├── profile.html   # Kullanıcı profili
│   └── js/            # İstemci tarafı modüller
├── data/
│   ├── teams.json     # 48 ülke kodu ve ağırlıkları
│   ├── team_ids.json  # API ID → ülke kodu eşlemesi
│   └── fixtures.json  # Manuel fikstür dosyası (yedek)
├── scripts/
│   └── loadtest.js    # Yük testi aracı
├── railway.json       # Railway deploy yapılandırması
└── .env.example       # Ortam değişkeni şablonu
```
