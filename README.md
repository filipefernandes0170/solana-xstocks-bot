# xStocks Tracker – Solana Tokenized Stocks Telegram Bot

Clean, production-ready Telegram bot to monitor tokenized stocks (RWAs) on Solana: **NVDAx, AAPLx, SPYx, TSLAx, QQQx** and more.

- Live prices (Jupiter Price API)
- Wallet portfolio tracking
- Yield / collateral opportunities (Kamino, Jupiter, Kraken…)
- Smart price alerts
- Extremely simple UX (mobile-first)

## Features

| Command | Description |
|---------|-------------|
| `/start` | Welcome + instructions |
| `/portfolio` or `/p` | Show holdings + total USD value |
| `/prices` | Live prices of major tokenized stocks |
| `/yield` | Current yield opportunities |
| `/alert` | Set % price alerts |
| `/help` | Full help |

Just paste any Solana wallet address to track it instantly.

## Quick Start

```bash
# 1. Clone
git clone https://github.com/filipefernandes0170/solana-xstocks-bot.git
cd solana-xstocks-bot

# 2. Install
npm install

# 3. Configure
cp .env.example .env
# Edit .env → set TELEGRAM_BOT_TOKEN (from @BotFather)

# 4. Run
npm run dev
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | From @BotFather |
| `SOLANA_RPC_URL` | No | Default: public mainnet. Prefer Helius free tier |
| `JUPITER_API_KEY` | No | Higher rate limits (developers.jup.ag) |
| `DATABASE_PATH` | No | Default `./data/bot.db` (SQLite) |

## Adding New Tokenized Stocks

Edit `src/config/tokens.ts` and append:

```ts
{ symbol: "NEWTx", name: "New Token xStock", mint: "ExactMintAddress", decimals: 8, underlying: "NEWT", issuer: "xStocks" },
```

Everything else (portfolio, prices, alerts) picks it up automatically.

## Adding New Yield Protocols

Edit the array in `src/services/yield.ts`. Later you can replace it with live calls to:

- Kamino API: `https://api.kamino.finance`
- Jupiter Lend / Perps endpoints

## Project Structure

```
src/
├── bot/           # Telegraf commands & handlers
├── config/        # Env + token registry
├── db/            # SQLite (users, alerts, price history)
├── services/      # Solana, prices, portfolio, yield, alerts
├── utils/         # Formatting helpers
└── index.ts       # Entry point + cron
```

## Deployment (Free Tiers)

- **Railway / Render / Fly.io** – best for always-on Node + SQLite volume
- **Vercel** – possible with serverless + external DB (Supabase free)

Recommended: Railway free tier + Helius free RPC.

## Tech Stack

- Telegraf (Telegram)
- @solana/web3.js + @solana/spl-token
- Jupiter Price API v3
- better-sqlite3
- node-cron
- TypeScript + tsx

## License

MIT
