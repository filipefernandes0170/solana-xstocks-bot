# Par desk (site source)

The website at https://xstocks-tracker.netlify.app (Netlify project `xstocks-tracker`): is a tokenized stock on Solana at the share price?

**This is a rebuild.** The original was built by Grok Bot and its source was lost: Netlify has no API to download an uploaded source zip, the site ships no source maps, and the server code is not public. This folder recreates it from the published files (`../published-site/`) and the bot's own logic (`../src/services/desk.ts`, `verdict.ts`). Rebuilt on 17 Oct 2026.

## How it was checked

- **Logic (verdict, formatters, market clock, plain-language line):** 346,455 random and edge-case comparisons against the original functions taken from the live bundle, with 0 differences. `tests/golden.json` holds 540 of those original answers, and `npm test` checks them on every run.
- **Server data:** the quotes, offers and crypto lists were compared field by field with the live site's server functions, read seconds apart. Same 19 tokens in the same order and with the same fields. Nasdaq print, share multiplier and issuer mark are identical; token prices are within 0.04% (they move between reads). Offers and the top ten coins are identical.
- **Wallet reads:** same response shapes and the same error text ("That does not look like a Solana address."). Checked with public protocol addresses (the Kamino lending-market authorities), never personal wallets.
- **Look:** desktop and mobile screenshots side by side with the live site: same layout, fonts, colours, sky animation, cards and chart. The client bundles are close in size to the original (portfolio 21.0 KB in both).

## Intentional differences from the published site

1. **ETF prints fixed.** Nasdaq's quote API rejects SPY, QQQ and GLD as `assetclass=stocks` (HTTP 400), so the original never showed a Nasdaq print for SPYx, QQQx or GLDx. Here they use `assetclass=etf`. The bot's `src/services/desk.ts` has the same bug, and it is not changed here.
2. **Cash valued.** On /portfolio, USDC and USDT were often worth $0 because Jupiter's price API leaves them out. Here they fall back to $1.
3. **Holdings at price per share.** The desk's Portfolio tab lookup multiplied the raw-token price by the share amount. Here it divides by the multiplier, as /portfolio and the page itself already did. Nothing changes on screen.
4. **More tokens priced on /portfolio.** The original's rule for which other tokens get priced is unknown. Here it prices up to 1,000 tokens, 50 per Jupiter request. Anything Jupiter has no price for is counted in "N tokens had no price".
5. **No Grok preview bridge.** The original carried Grok's editor bridge (a `postMessage` listener plus the zod library) and a link to `/__grok/manifest.webmanifest`, which returned 404. Neither did anything for visitors, so neither is here.
6. **GLDx counts as an ETF** on /portfolio. This is not verified against the original, which was never seen holding GLDx.
7. **Holder check** ("Would this wallet get the text?") adds up every token account of `TOKEN_MINT`. The bot only reads the associated token account. Today `TOKEN_MINT` is empty, so both answer "not live yet".

## Run it

```bash
cd site
npm ci
npm run dev          # http://localhost:3000 (vite dev with Netlify emulation)
npm run dev:windows  # the same, trusting the Windows certificate store (needed when an antivirus inspects HTTPS)
npm test             # logic vs the published desk
npm run typecheck
npm run build        # dist/client (static) + the Netlify Function
```

Node 22.12 or newer.

## Environment variables (names only, all optional)

| Name | What it does |
|---|---|
| `SOLANA_RPC_URL` | RPC for wallet reads (default: the public mainnet RPC, which is rate-limited) |
| `JUPITER_API_KEY` | Uses api.jup.ag with the key; without it, lite-api.jup.ag |
| `TOKEN_MINT` | The project coin for the holder check. Empty means "the coin is not live yet" |
| `HOLDER_MIN_TOKENS` | Minimum whole tokens to count as a holder (0 or empty means any amount) |

Set them in Netlify (Project configuration → Environment variables) and redeploy. Never commit values.

## Deploying (not done; needs Filipe's OK)

The live site still runs the original Grok build. To replace it with this source, link the Netlify project to this private repo with **base directory `site`** (build settings come from `site/netlify.toml`: `npm run build`, publish `dist/client`). Check a deploy preview side by side with the live site before publishing it. The repo root `netlify.toml` skips builds on purpose, so bot pushes never touch the site.

## Layout

```
src/
  routes/        __root.tsx (head, fonts), index.tsx (desk + loader), portfolio.tsx
  components/    Sky, desk/* (Desk, cards, crypto, gap chart, yield, glossary, why-hold)
  lib/           tokens, types, format, session (Nasdaq clock), verdict, wallet-standard, etf-holdings
  server/        functions.ts (the 6 server functions) + quotes, offers, cryptos, solana, wallet, http
tests/           logic.test.ts + golden.json (answers from the published desk)
```
