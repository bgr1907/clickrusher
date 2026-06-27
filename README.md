# ClickRusher

A real-time fan click-battle site running throughout the 2026 World Cup.

Users can click for their country, pick a side in live matches, create individual or team custom races, and join the match chat room.

## Features

- **Country click leaderboard** — Real-time ranking for all 48 teams, each with their own Top 10
- **Click Battle tab** — Pick home or away side in active fixtures and compete in a live click race
- **Custom click races** — Individual or team mode, target-click or time-based win condition, public or private
- **Live scores** — Automatic score updates via the worldcup26.ir API
- **Tournament bracket** — Group tables and knockout bracket viewer pulled from the worldcup26.ir API
- **Match chat** — Real-time chat per fixture (profanity filtered)
- **User profile** — Total clicks, country stats, race history
- **Bot protection** — Sliding-window rate limit, rhythm analysis, burst penalty, honeypot field
- **Profanity filter** — Turkish + English, including leet-speak and bypass attempts
- **WebGL 3D Globe** — Interactive Three.js globe showing all 48 nations as coloured dots
- **Match notifications** — Browser push notifications for upcoming fixture kick-off times
- **Language selector** — UI language toggle in the header
- **Email-based registration** — Two-step sign-up flow; email address is required and must be unique

## Tech Stack

| Layer | Technology |
|---|---|
| Server | Node.js ≥ 20, Fastify 5 |
| Persistent data | Redis (ioredis) |
| Dev mode | In-memory fake Redis (no Redis installation required) |
| Real-time | Server-Sent Events (SSE) |
| Frontend | Vanilla HTML / JS (no framework) |
| 3D Globe | Three.js r128 (WebGL) |
| Profanity | obscenity + naughty-words |
| Deploy | Railway + Redis add-on |

## Local Setup

```bash
# Install dependencies
npm install

# Start the server — runs in in-memory mode if REDIS_URL is not set
npm start
# → http://localhost:3000

# Development (auto-restarts on file changes)
npm run dev
```

To create a `.env` file:

```bash
cp .env.example .env
```

Environment variables in `.env.example`:

| Variable | Description |
|---|---|
| `REDIS_URL` | Redis connection URL (`redis://...`). Omit for in-memory mode |
| `PORT` | Server port (default: 3000) |
| `WC_EMAIL` | worldcup26.ir API account email (required for live scores) |
| `WC_PASSWORD` | worldcup26.ir API password (required for live scores) |

> If `WC_EMAIL` / `WC_PASSWORD` are not provided, live scores and automatic fixture updates are disabled; all other features continue to work.

## Sync Test (Two Browsers)

1. Start the server with `npm start`
2. Open **Browser 1** at `http://localhost:3000`, register / log in
3. Open **Browser 2** in a private/incognito tab at the same address, log in with a different account
4. Click a flag in both browsers
5. Counters in the other browser update within 1 second

## Load Test

```bash
# Sends ~200 requests/sec for 10 seconds
node scripts/loadtest.js http://localhost:3000 10
```

Expected result: the rate limiter (~15 clicks/sec/device) kicks in; the server stays up.

## Manually Updating Today's Fixtures

If `WC_EMAIL` is set, fixtures are fetched from the API automatically. For manual overrides:

Edit `data/fixtures.json` directly — no server restart needed, the file is re-read every 5 minutes.

```json
{
  "date": "2026-06-15",
  "fixtures": [
    { "id": "m5", "a": "BRA", "b": "ARG", "ko": "21:00" }
  ]
}
```

See `data/teams.json` for country codes.

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/healthz` | Health check |
| GET | `/api/state` | Full score-state snapshot |
| POST | `/api/register` | Register (device, name, password, email, country?) |
| POST | `/api/login` | Login (device, name _or_ email, password) |
| POST | `/api/clicks` | Submit batched clicks |
| GET | `/api/stream` | SSE stream (live state updates) |
| GET | `/api/profile` | User profile |
| GET | `/api/chat/:fixtureId` | Match chat history (last 50 messages) |
| POST | `/api/chat/:fixtureId` | Send a chat message |
| POST | `/api/race/create` | Create a race |
| GET | `/api/races/open` | List open (waiting) races |
| POST | `/api/race/:id/join` | Join a race |
| POST | `/api/race/:id/force-start` | Creator force-starts early |
| POST | `/api/race/:id/click` | Submit race click |
| GET | `/api/race/:id/state` | Get race state |
| GET | `/api/race/:id/stream` | Race SSE stream |

### Login field note

The `/api/login` body uses the field name `name`, but it accepts either a username or an email address — the server checks for `@` to decide which lookup to perform.

## Railway Deploy

1. Create an account at [railway.app](https://railway.app) and start a new project
2. Connect your GitHub repo (or push with the `railway up` CLI)
3. Add a **Redis add-on**: Railway Dashboard → "Add Service" → "Redis"
4. Set environment variables:
   - `REDIS_URL` → `${{Redis.REDIS_URL}}` (Railway resolves this automatically)
   - `WC_EMAIL` and `WC_PASSWORD` → for live scores
   - `PORT` → Railway provides this automatically; you can leave it unset
5. After deploy, verify:
   ```
   curl https://your-domain.railway.app/healthz
   # {"ok":true}
   ```

## GoDaddy Domain Setup

1. Railway Dashboard → Settings → Domains → Add "Custom Domain"
2. Copy the provided `*.railway.app` subdomain
3. Go to GoDaddy DNS management:
   - Type: **CNAME** | Name: `www` | Value: Railway's `*.up.railway.app` address | TTL: 600
4. DNS propagation takes 10–30 minutes; Railway provisions SSL automatically

> **Note:** GoDaddy does not support CNAME on the root domain. For root-domain access, use GoDaddy's "Forwarding" to redirect to `www`, or migrate your DNS to Cloudflare.

## Project Structure

```
clickrusher/
├── server.js          # Fastify server, all HTTP/SSE routes
├── lib/
│   ├── auth.js        # Registration / login (scrypt password hashing)
│   ├── counters.js    # Redis click counters and leaderboards
│   ├── races.js       # Click race business logic
│   ├── scores.js      # Live score API integration
│   ├── ratelimit.js   # Sliding window + rhythm + burst limiting
│   ├── badwords.js    # Profanity filter (TR/EN, leet-speak included)
│   └── redis.js       # Redis client (in-memory fallback)
├── public/            # Static frontend files
│   ├── index.html     # Main page (country table, matches, globe)
│   ├── race.html      # Race room
│   ├── profile.html   # User profile
│   ├── flags.js       # Flag data / utilities
│   └── js/
│       ├── backend.js    # Client state, API calls, SSE connection
│       ├── ui.js         # Nation grid, tab switching, modals
│       ├── globe.js      # WebGL 3D globe (Three.js)
│       ├── game-gun.js   # Click Battle tab logic
│       ├── game-misc.js  # Tournament bracket viewer, match notifications
│       └── wizard.js     # Race creation wizard + auto-login on startup
├── data/
│   ├── teams.json     # 48 country codes and weights
│   ├── team_ids.json  # API ID → country code mapping
│   └── fixtures.json  # Manual fixture file (fallback)
├── scripts/
│   └── loadtest.js    # Load testing tool
├── railway.json       # Railway deploy configuration
└── .env.example       # Environment variable template
```
