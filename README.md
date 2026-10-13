# Par — Telegram bot for tokenized stocks on Solana

Bot: [@ONPAR_BOT](https://t.me/ONPAR_BOT)

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
| `/prices` | Live prices of major xStocks |
| `/yield` | Current yield opportunities |
| `/alert` | Set % price alerts |
| `/watch` | Ping when a name turns Fair, or trades rich while Nasdaq is closed |
| `/bell` | One message at the Nasdaq open, listing whatever is Fair |
| `/hold` | Wallet that holds the project coin |
| `/help` | Full help |

Type a ticker (`nvda`) for one card: token price, Nasdaq price, gap, verdict, and a Buy button.

Pings (`/watch`, `/bell`, and bag changes) send only while that wallet still holds `TOKEN_MINT`. The lookup itself stays free. Buy opens Jupiter on that stock. The bot does not charge a fee.

## Quick Start

```bash
# 1. Clone / unzip
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
| `TOKEN_MINT` | For pings | Your coin's mint. Blank disables pings, not lookups |
| `HOLDER_MIN_TOKENS` | No | `0` means any balance. `1` means at least one token |

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

### Own VM (Debian/Ubuntu, e.g. Google Cloud e2-micro)

```bash
git clone https://github.com/filipefernandes0170/solana-xstocks-bot
cd solana-xstocks-bot
sudo bash deploy/setup.sh          # Node 22, swap, build, systemd service "par-bot"
sudo nano /opt/par-bot/.env        # set TELEGRAM_BOT_TOKEN (and SOLANA_RPC_URL)
sudo systemctl restart par-bot
sudo journalctl -u par-bot -f      # live logs
```

Update later: `git pull && sudo bash deploy/setup.sh` (keeps `.env` and the database in `/opt/par-bot/data`).
Run only one copy of the bot per token. A second copy makes Telegram return `409 Conflict`.

## Tech Stack

- Telegraf (Telegram)
- @solana/web3.js + @solana/spl-token
- Jupiter Price API v3
- better-sqlite3
- node-cron
- TypeScript + tsx

## License

MIT
