# Ocean Eyes — Whale Signal Agent

Telegram bot untuk memantau posisi whale di **Hyperliquid** via [HyperTracker](https://hypertracker.io) API. Bot menerima slash command dan pertanyaan natural language (Bahasa Indonesia / English), merutekan intent dengan LLM, lalu menghasilkan laporan deterministik — tanpa LLM untuk isi report.

## Fitur

- **Signal snapshot** — bias agregat whale & smart money per cohort
- **Trend** — momentum akumulasi / distribusi dengan timeframe configurable (24h / 7d / 30d)
- **Positions** — entry price, dominasi LONG/SHORT, top wallet, PnL, liq cluster
- **Composite briefing** — gabungan signal + positions + trend dalam satu ringkasan
- **Natural language routing** — LLM hanya untuk intent parsing (1 call per pesan NL)
- **Slash commands** — deterministik, tanpa LLM
- **Format brief & full** — ringkas atau lengkap sesuai intent
- **Chat context (Redis)** — ingat coin/action terakhir per chat; follow-up seperti _"trend"_ tanpa ulang coin
- **BTC pulse monitor** — alert proaktif ke whitelisted users saat ada perubahan signifikan (interval 4 jam)

## Tech stack

| Layer | Teknologi |
|-------|-----------|
| Runtime | Node.js 20+, TypeScript |
| Bot | `node-telegram-bot-api` (polling) |
| Data | HyperTracker REST API |
| LLM | 9router (OpenAI-compatible) — intent routing only |
| Memory | Redis (chat context + monitor state) — optional, graceful degrade |
| Package manager | pnpm |

## Quick start

### Prasyarat

- Node.js >= 20
- pnpm 9.x (`corepack enable`)
- Telegram Bot Token ([@BotFather](https://t.me/BotFather))
- HyperTracker API key
- 9router base URL + API key
- Redis (opsional, untuk chat context & monitor state)

### Install & jalankan

```bash
git clone https://github.com/USERNAME/agent-whales-track.git
cd agent-whales-track
pnpm install
cp .env.example .env
# Edit .env — isi credential
pnpm dev          # development (hot reload)
# atau
pnpm build && pnpm start
```

## Environment variables

Copy dari [`.env.example`](.env.example):

| Variable | Wajib | Deskripsi |
|----------|-------|-----------|
| `TELEGRAM_BOT_TOKEN` | Ya | Token bot Telegram |
| `TELEGRAM_BOT_URL` | Tidak | URL bot untuk CTA landing page, mis. `https://t.me/YourBot` |
| `PORT` | Tidak | Port HTTP landing page (default `9006`) |
| `HYPERTRACKER_API_KEY` | Ya | API key HyperTracker |
| `9ROUTER_BASE_URL` | Ya | Base URL 9router (dengan atau tanpa `/v1`) |
| `9ROUTER_API_KEY` | Ya | API key 9router |
| `LLM_MODEL` | Ya | Model ID, mis. `gpt-4o-mini` |
| `ALLOWED_CHAT_IDS` | Tidak | Chat ID Telegram (comma-separated). Kosong = terbuka untuk semua |
| `WHITELIST_DEV_CONTACT` | Tidak | Kontak developer di pesan deny whitelist |
| `REDIS_URL` | Tidak | Redis URL, mis. `redis://localhost:6379`. Kosong = stateless |
| `CHAT_CONTEXT_TTL_HOURS` | Tidak | TTL context per chat (default `72`) |
| `MONITOR_ENABLED` | Tidak | `true` untuk aktifkan BTC pulse monitor |
| `MONITOR_COIN` | Tidak | Coin yang dimonitor (default `BTC`) |
| `MONITOR_INTERVAL_HOURS` | Tidak | Interval tick monitor (default `4`) |
| `MONITOR_BIAS_SHIFT_THRESHOLD` | Tidak | Min perubahan bias untuk alert (default `0.3`) |
| `MONITOR_STARTUP_DELAY_MS` | Tidak | Delay tick pertama setelah startup (default `300000`) |

> Env var `9ROUTER_*` diawali angka — valid di file `.env` (dotenv), tapi tidak bisa di-`export` langsung di bash.

## Perintah Telegram

### Slash commands

| Command | Deskripsi |
|---------|-----------|
| `/start` | Intro & contoh penggunaan |
| `/help` | Panduan lengkap |
| `/signal {coin} [timeframe]` | Snapshot bias whale (default `24h`) |
| `/positions {coin} [timeframe]` | Detail posisi & entry |
| `/trend {coin} [timeframe]` | Trend bias whale |
| `/top` | Leaderboard (coming soon) |

**Timeframe:** `24h`, `7d`, `30d`, atau alias `intraday` / `scalping` / `swing`. Default `24h` jika tidak disebut.

Contoh: `/signal BTC`, `/trend PENGU 7d`, `/positions ETH intraday`, `/trend SOL swing`

> Granularitas minimum HyperTracker: **24 jam** — bukan candle menit/jam. Positions detail tetap lookback API 3 hari; timeframe mempengaruhi signal/trend metrics.

### Natural language

Bot merutekan intent via LLM, lalu fetch data & format report:

- _"Gimana posisi whale ETH sekarang?"_ → signal
- _"Brief position BTC"_ → positions (ringkas)
- _"Momentum trend BTC gimana?"_ → trend
- _"Trend PENGU untuk scalping"_ → trend 24 jam
- _"Overview BTC: bias + entry whale"_ → composite briefing
- _"/positions PENGU 7d"_ lalu _"trend juga"_ → trend PENGU 7 hari (context dari Redis)

## Arsitektur

```
User (Telegram)
    │
    ▼
handlers.ts ──► runAgent()
                    │
                    ├─ loadChatContext (Redis) ──► intentParser + heuristic follow-up
                    │
                    ├─ slash command → intent deterministik (tanpa LLM)
                    │
                    └─ natural language → intentParser (LLM via nineRouter)
                              │
                              ├─ positions      → runPositionsReport
                              ├─ signal_*       → runSignalReport
                              └─ composite      → runCompositeReport
                                        │
                                        ▼
                              HyperTracker API (+ cache)
                                        │
                                        ▼
                              Formatter deterministik → MarkdownV2
                                        │
                                        ▼
                              saveChatContext (Redis)

scheduler.ts ──► runPulse (BTC monitor) ──► ALLOWED_CHAT_IDS only
```

**Tier 0 design:** isi laporan 100% template/code — LLM tidak menulis narasi report.

## Struktur project

```
src/
├── bot/           # Telegram handlers, access control & entry point
├── web/           # Landing page HTTP server (port 9006)
├── agent/         # Router, intent parser, report runners, monitor & scheduler
├── redis/         # Redis client + generic JSON KV
├── api/           # HyperTracker client
├── llm/           # LLM providers (nineRouter, types)
├── positions/     # Position aggregation & formatting
├── signal/        # Signal logic (bias, divergence, trend)
├── cache/         # API response cache
└── utils/         # Markdown, API logging
public/
└── landing.html   # Static landing page (Ocean Eyes)
```

### Swap LLM provider

Setiap provider di `src/llm/` mengekspor `chatCompletion` dengan signature sama. Ganti satu baris import di caller:

```typescript
import { chatCompletion } from '../llm/nineRouter';
// import { chatCompletion } from '../llm/openai';  // future
```

## Scripts

| Command | Fungsi |
|---------|--------|
| `pnpm dev` | Dev mode dengan hot reload (`tsx watch`) |
| `pnpm build` | Compile TypeScript → `dist/` |
| `pnpm start` | Jalankan production build |

## Landing page

Proses yang sama dengan bot Telegram juga serve **landing page statis** di port HTTP:

| Route | Fungsi |
|-------|--------|
| `GET /` | Halaman Ocean Eyes (info + CTA Telegram + link GitHub) |
| `GET /health` | Healthcheck JSON `{ "status": "ok" }` |

- Port: env `PORT` (default **9006**)
- CTA Telegram: `TELEGRAM_BOT_URL` (jika kosong, tombol Telegram disabled)
- GitHub: hardcoded di [`src/web/constants.ts`](src/web/constants.ts)

Polling Telegram tetap berjalan di proses yang sama — landing page tidak mengganggu bot.

## Deployment

Bot memakai **Telegram polling** (outbound ke Telegram). Landing page listen **inbound** di `PORT` (default 9006) — arahkan domain ke port tersebut.

Panduan deploy ke VM tanpa Docker (nvm + PM2 + GitHub Actions):

→ [`notes/deployment-setup.md`](notes/deployment-setup.md)

**Penting:** hanya **satu instance** bot per `TELEGRAM_BOT_TOKEN`. Jangan jalankan dev lokal dan production VM bersamaan. Monitor scheduler + polling harus share satu process.

## Docker (opsional)

[`Dockerfile`](Dockerfile) tersedia jika environment mendukung Docker. Untuk deploy tanpa sudo, gunakan panduan VM di atas.

```bash
docker build -t agent-ocean-eyes .
docker run -d --restart unless-stopped --env-file .env.prod agent-ocean-eyes
```

## Troubleshooting

| Masalah | Solusi |
|---------|--------|
| Bot tidak merespons | Cek `TELEGRAM_BOT_TOKEN`, log console, pastikan hanya 1 instance polling |
| `9ROUTER_API_KEY is not set` | Isi env di `.env` |
| Intent salah / selalu clarify | Cek koneksi 9router; slash command bypass LLM |
| `409 Conflict` dari Telegram | Dua process polling token yang sama — stop salah satunya |
| Redis unavailable | Bot tetap jalan stateless; log `[Redis] unavailable` |
| Monitor tidak kirim alert | Tick pertama hanya baseline; set `MONITOR_ENABLED=true` + `ALLOWED_CHAT_IDS` |

## Disclaimer

Bot ini **bukan financial advice**. Data whale position bersifat informatif — selalu DYOR.

## License

Private project.
