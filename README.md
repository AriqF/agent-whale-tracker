# Ocean Eyes — Whale Signal Agent

Telegram bot untuk memantau posisi whale di **Hyperliquid** via [HyperTracker](https://hypertracker.io) API. Bot menerima slash command dan pertanyaan natural language (Bahasa Indonesia / English), merutekan intent dengan LLM, lalu menghasilkan laporan deterministik — tanpa LLM untuk isi report.

## Fitur

- **Signal snapshot** — bias agregat whale & smart money per cohort
- **Trend** — momentum akumulasi / distribusi (7 hari)
- **Positions** — entry price, dominasi LONG/SHORT, top wallet, PnL, liq cluster
- **Composite briefing** — gabungan signal + positions + trend dalam satu ringkasan
- **Natural language routing** — LLM hanya untuk intent parsing (1 call per pesan NL)
- **Slash commands** — deterministik, tanpa LLM
- **Format brief & full** — ringkas atau lengkap sesuai intent

## Tech stack

| Layer | Teknologi |
|-------|-----------|
| Runtime | Node.js 20+, TypeScript |
| Bot | `node-telegram-bot-api` (polling) |
| Data | HyperTracker REST API |
| LLM | 9router (OpenAI-compatible) — intent routing only |
| Package manager | pnpm |

## Quick start

### Prasyarat

- Node.js >= 20
- pnpm 9.x (`corepack enable`)
- Telegram Bot Token ([@BotFather](https://t.me/BotFather))
- HyperTracker API key
- 9router base URL + API key

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
| `HYPERTRACKER_API_KEY` | Ya | API key HyperTracker |
| `9ROUTER_BASE_URL` | Ya | Base URL 9router (dengan atau tanpa `/v1`) |
| `9ROUTER_API_KEY` | Ya | API key 9router |
| `LLM_MODEL` | Ya | Model ID, mis. `gpt-4o-mini` |
| `ALLOWED_CHAT_IDS` | Tidak | Chat ID Telegram (comma-separated). Kosong = terbuka untuk semua |

> Env var `9ROUTER_*` diawali angka — valid di file `.env` (dotenv), tapi tidak bisa di-`export` langsung di bash.

## Perintah Telegram

### Slash commands

| Command | Deskripsi |
|---------|-----------|
| `/start` | Intro & contoh penggunaan |
| `/help` | Panduan lengkap |
| `/signal {coin}` | Snapshot bias whale |
| `/positions {coin}` | Detail posisi & entry |
| `/trend {coin}` | Trend bias 7 hari |
| `/top` | Leaderboard (coming soon) |

Contoh: `/signal BTC`, `/positions ETH`, `/trend SOL`

### Natural language

Bot merutekan intent via LLM, lalu fetch data & format report:

- _"Gimana posisi whale ETH sekarang?"_ → signal
- _"Brief position BTC"_ → positions (ringkas)
- _"Momentum trend BTC gimana?"_ → trend
- _"Overview BTC: bias + entry whale"_ → composite briefing

## Arsitektur

```
User (Telegram)
    │
    ▼
handlers.ts ──► runAgent()
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
```

**Tier 0 design:** isi laporan 100% template/code — LLM tidak menulis narasi report.

## Struktur project

```
src/
├── bot/           # Telegram handlers & entry point
├── agent/         # Router, intent parser, report runners & formatters
├── api/           # HyperTracker client
├── llm/           # LLM providers (nineRouter, types)
├── positions/     # Position aggregation & formatting
├── signal/        # Signal logic (bias, divergence, trend)
├── cache/         # API response cache
└── utils/         # Markdown, API logging
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

## Deployment

Bot memakai **Telegram polling** — tidak perlu expose port HTTP.

Panduan deploy ke VM tanpa Docker (nvm + PM2 + GitHub Actions):

→ [`notes/deployment-setup.md`](notes/deployment-setup.md)

**Penting:** hanya **satu instance** bot per `TELEGRAM_BOT_TOKEN`. Jangan jalankan dev lokal dan production VM bersamaan.

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

## Disclaimer

Bot ini **bukan financial advice**. Data whale position bersifat informatif — selalu DYOR.

## License

Private project.
