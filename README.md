# Par — Telegram bot for tokenized stocks on Solana

Bot: [@ONPAR_BOT](https://t.me/ONPAR_BOT)

Clean, production-ready Telegram bot to monitor tokenized stocks (RWAs) on Solana: 19 xStocks (**NVDAx, AAPLx, SPYx, TSLAx, QQQx** and more) and 6 Backpack Securities tokens (**SPCX, MU, TTWO, SKHY, DJT, AMD**).

- A card per name: last trade, a live $1,000 buy priced per share, the Nasdaq print, the gap and a verdict
- Size check: what any order really costs, from a live Jupiter quote at that size
- Morning brief for $PAR holders, before the Nasdaq open
- Wallet portfolio, valued per share, with each name's verdict
- Live lending rates from Kamino
- One-off price alerts

## Features

| Command | Description |
|---------|-------------|
| `/start` | Welcome, with buttons; someone without a proven wallet gets "🔐 Prove my $PAR wallet" first (and under every holder feature). `?start=brief` turns the brief on; `?start=w-NVDAx-TSLAx` (the site's Favourites link) watches those names; `?start=p-<wallet>` (the portfolio's "Watch this bag") saves that address and shows its bag |
| `/prices` | The whole desk: verdict, price, gap and 24h move for every name |
| `/events` | The next 7 days: Nasdaq days off and early closes (`services/calendar.ts`), balance changes and paused tokens read on chain, and the key SEC filings of the last 7 days (from the site's `/api/events`). `?start=events` (the site's Events page) answers it. `/events on`, `/events off`: the filing texts (holders) |
| `/week` | The last 7 days' ranking from the Par site: which names stayed closest to their Nasdaq print |
| `/pairs` | Same company, two tokens (SpaceX, AMD): each $1,000 buy and which is cheaper. `/pairs on` (holders): a text when one is 0.5 points cheaper, at most once a day per company |
| `/sizealert NVDAx 5000` | Holders: a one-off text when a buy of that size costs at most 0.4% over the Nasdaq print while Nasdaq is open. Up to 3; `/sizealert` lists, `/sizealert off [name]` clears |
| `/size NVDAx 5000` | Size check: shares, price per share, gap and pool impact at that size |
| `/portfolio` or `/p` | Holdings per share, total value, each name's verdict |
| `/yield`, `/yield NVDAx` | Live Kamino lending rates: what lending the token earns, and what borrowing the market's stablecoin against it costs (USDC or PYUSD, not the token's own borrow rate), with a link to that token's own Kamino page. Kraken's vault is shown as its published target |
| `/alert NVDAx up 5` | One-off move alert; `/alert list`, `/alert clear` |
| `/watch` | Ping when a name turns Fair, or trades rich while Nasdaq is closed |
| `/brief` | Morning brief, weekdays 9:00–9:29 New York time, trading days only |
| `/bell` | One message at the Nasdaq open, listing whatever is Fair |
| `/hold` | Prove the wallet that holds $PAR: a link to the site, where the wallet signs one plain message (not a transaction). `/hold check` confirms, `/hold off` forgets |
| `/help` | Full help |

Type a ticker (`nvda`) for one card, with Buy, three size checks and Watch buttons. When a company has two tokens, a plain ticker (`amd`) means the xStock and Backpack's naming (`amd.us`) means Backpack's; each card names the other one. A pool under $25,000 (AMDx, NFLXx today) gets no $1,000 buy quote; its card says the pool is too thin.

With `BRIEF_CHANNEL_ID` set, the week's ranking also goes to that channel on Fridays between 16:15 and 16:59 New York time.

**Events** (every 3 minutes, `EVENTS_CHECK_CRON`), for proven holders:
- **Filing texts:** key SEC filings (8-K results, deals, board or executive changes, warnings; 6-K reports) for the names in the user's bag wallet, proven wallet or watch list. The bot reads them from the site's `/api/events` (the site reads the SEC), texts only filings from the last 2 hours, each once, at most 5 a day per user (`event_log`). On by default; `/events off` stops them.
- **Pause alerts:** the bot reads each mint's `pausableConfig.paused` with the multipliers (every 5 minutes) and keeps the last state in `pause_state`. When a token a holder holds or watches is paused, they get a text at once, and a "resumed" text when it lifts. No switch: it is about their funds. The first reading after a deploy only records the state.
- **The brief** notes a day off or an early close before the next session.

Pings (`/watch`, `/brief`, `/bell`, `/sizealert`, `/pairs on`, event texts and bag changes) send only while the user's **proven** wallet (`/hold`) still holds `TOKEN_MINT`. A typed address no longer counts: anyone can paste someone else's public address. The proof is checked twice, on the site and again by the bot, and each code works once, for one Telegram user, for 15 minutes. Size alerts quote Jupiter at the user's size, at most 2 quotes a minute and each alert at most every 5 minutes, and only when the $1,000 buy is not already over 0.4%. Lookups, `/prices`, `/size`, `/portfolio` and `/yield` stay free. Buy opens Jupiter on that stock. The bot does not charge a fee.

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
