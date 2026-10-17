# Par — Telegram bot for tokenized stocks on Solana

Bot: [@ONPAR_BOT](https://t.me/ONPAR_BOT)

Clean, production-ready Telegram bot to monitor tokenized stocks (RWAs) on Solana: **NVDAx, AAPLx, SPYx, TSLAx, QQQx** and more.

- A card per name: last trade, a live $1,000 buy priced per share, the Nasdaq print, the gap and a verdict
- Size check: what any order really costs, from a live Jupiter quote at that size
- Morning brief for $PAR holders, before the Nasdaq open
- Wallet portfolio, valued per share, with each name's verdict
- Live lending rates from Kamino
- One-off price alerts

## Features

| Command | Description |
|---------|-------------|
| `/start` | Welcome, with buttons. `?start=brief` turns the brief on; `?start=w-NVDAx-TSLAx` (the site's Favourites link) watches those names |
| `/prices` | The whole desk: verdict, price, gap and 24h move for every name |
| `/size NVDAx 5000` | Size check: shares, price per share, gap and pool impact at that size |
| `/portfolio` or `/p` | Holdings per share, total value, each name's verdict |
| `/yield`, `/yield NVDAx` | Live Kamino lending rates (Kraken's vault shown as its published target) |
| `/alert NVDAx up 5` | One-off move alert; `/alert list`, `/alert clear` |
| `/watch` | Ping when a name turns Fair, or trades rich while Nasdaq is closed |
| `/brief` | Morning brief, weekdays 9:00–9:29 New York time, trading days only |
| `/bell` | One message at the Nasdaq open, listing whatever is Fair |
| `/hold` | Wallet that holds the project coin |
| `/help` | Full help |

Type a ticker (`nvda`) for one card, with Buy, three size checks and Watch buttons.

Pings (`/watch`, `/brief`, `/bell`, and bag changes) send only while that wallet still holds `TOKEN_MINT`. Lookups, `/prices`, `/size`, `/portfolio` and `/yield` stay free. Buy opens Jupiter on that stock. The bot does not charge a fee.

Prices are per share: wallet amounts and Jupiter's `usdPrice` already include the token's multiplier (splits and reinvested dividends), and swap quotes are converted from on-chain units with the mint's `scaledUiAmountConfig`.

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
| `JUPITER_API_KEY` | No | Leave empty. Jupiter's free plan is 1 request every 2 s per organisation, the same as keyless (per IP); sharing the site's key would halve both |
| `DATABASE_PATH` | No | Default `./data/bot.db` (SQLite) |
| `TOKEN_MINT` | For pings | Your coin's mint. Blank disables pings, not lookups |
| `HOLDER_MIN_TOKENS` | No | `0` means any balance. `1` means at least one token |
| `BRIEF_CHANNEL_ID` | No | A public channel (`@name` or `-100…`) for a short brief teaser. The bot must be an admin there |

## Adding New Tokenized Stocks

Edit `src/config/tokens.ts` and append:

```ts
{ symbol: "NEWTx", name: "New Token xStock", mint: "ExactMintAddress", decimals: 8, underlying: "NEWT", issuer: "xStocks" },
```

Everything else (portfolio, prices, alerts) picks it up automatically.

## Yield sources

`src/services/yield.ts` reads Kamino's two xStock markets live (the same sources as the Par site). Add a market to `KAMINO_MARKETS`. Never add a fixed rate: show a source's published target only as a target, like Kraken's vault.

## Project Structure

```
src/
├── bot/           # Telegraf commands & handlers
├── config/        # Env + token registry
├── db/            # SQLite (users, alerts, price history)
├── services/      # desk quotes, Jupiter limiter, messages, pings and brief, Solana, portfolio, yield, alerts
└── index.ts       # Entry point, cron, command menu, clean shutdown
```

## Deployment (Free Tiers)

- **Railway / Render / Fly.io** – best for always-on Node + SQLite volume
- **Vercel** – possible with serverless + external DB (Supabase free)

Recommended: Railway free tier + Helius free RPC.

### Own VM (Debian/Ubuntu, e.g. Google Cloud e2-micro)

The repository has been private since 17 Oct 2026. On the VM, `git clone` and `git pull` need GitHub access, for example a read-only deploy key. Never paste a token into a chat or a file in the repo.

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
