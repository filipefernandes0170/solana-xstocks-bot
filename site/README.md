# Par desk (site source)

The website at https://xstocks-tracker.netlify.app (Netlify project `xstocks-tracker`): is a tokenized stock on Solana at the share price?

**This is a rebuild.** The original was built by Grok Bot and its source was lost: Netlify has no API to download an uploaded source zip, the site ships no source maps, and the server code is not public. This folder recreates it from the published files (`../published-site/`) and the bot's own logic (`../src/services/desk.ts`, `verdict.ts`). Rebuilt on 17 Oct 2026.

## How it was checked

- **Logic (verdict, formatters, market clock, plain-language line):** 346,455 random and edge-case comparisons against the original functions taken from the live bundle, with 0 differences. `tests/golden.json` holds 540 of those original answers, and `npm test` checks them on every run.
- **Server data:** the quotes, offers and crypto lists were compared field by field with the live site's server functions, read seconds apart. Same 19 tokens in the same order and with the same fields. Nasdaq print, share multiplier and issuer mark are identical; token prices are within 0.04% (they move between reads). Offers and the top ten coins are identical.
- **Wallet reads:** same response shapes and the same error text ("That does not look like a Solana address."). Checked with public protocol addresses (the Kamino lending-market authorities), never personal wallets.
- **Look:** desktop and mobile screenshots side by side with the live site: same layout, fonts, colours, sky animation, cards and chart. The client bundles are close in size to the original (portfolio 21.0 KB in both).

## Intentional differences from the published site

1. **ETF prints fixed.** Nasdaq's quote API rejects SPY, QQQ and GLD as `assetclass=stocks` (HTTP 400), so the original never showed a Nasdaq print for SPYx, QQQx or GLDx. Here they use `assetclass=etf`. The bot had the same bug in `src/services/desk.ts`; it was fixed on 17 Oct 2026 (`src/services/nasdaq.ts`).
2. **Cash valued.** On /portfolio, USDC and USDT were often worth $0 because Jupiter's price API leaves them out. Here they fall back to $1.
3. **Prices per share, everywhere.** Wallet amounts and Jupiter's `usdPrice` already include the token's multiplier (one shown token tracks one share; checked on 17 Oct 2026: NFLXx supply reads ×10 after its split, and `usdPricePrescaled` = `usdPrice` × multiplier). The original divided by the multiplier a second time ("per share" and holdings ten times too low on NFLXx) and compared the $1,000 buy, which Jupiter quotes in on-chain units, with the per-share Nasdaq print, so every gap was off by the multiplier (+0.17% on NVDAx, +0.33% on AAPLx, and NFLXx never got a buy quote). Now the buy is converted to a per-share price and holdings are amount × `usdPrice`.
4. **More tokens priced on /portfolio.** The original's rule for which other tokens get priced is unknown. Here it prices up to 150 tokens, 50 per Jupiter request, one request at a time. Anything left without a price is counted in "N tokens had no price".
5. **No Grok preview bridge.** The original carried Grok's editor bridge (a `postMessage` listener plus the zod library) and a link to `/__grok/manifest.webmanifest`, which returned 404. Neither did anything for visitors, so neither is here.
6. **GLDx counts as an ETF** on /portfolio. This is not verified against the original, which was never seen holding GLDx.
7. **Holder check** ("Would this wallet get the text?") adds up every token account of `TOKEN_MINT`. The bot only reads the associated token account. Today `TOKEN_MINT` is empty, so both answer "not live yet".

## Changes after the rebuild (17 Oct 2026)

1. **Jupiter rate limits.** Every Jupiter call goes through `src/server/jupiter.ts`: one request every 2.1 s without a key, every 1.1 s with one, and a pause after an HTTP 429. Buy quotes are refreshed a few at a time, oldest first (3 per load without a key, 4 with one), and only by the browser's polling, so the first page load stays fast. The bot does the same in `../src/services/jupiter.ts`.
2. **CDN cache.** The desk page and the public data (quotes, offers, coins) are cached on Netlify's CDN for 10 s (`Netlify-CDN-Cache-Control`), so many visitors cost about one function call every 10 s. /portfolio's page is cached for 5 minutes; wallet lookups are POST and never cached. Price polling stops while the tab is hidden, unless a saved alert can still ping this browser.
3. **Accessibility.** A visible keyboard focus ring everywhere, darker red and gold text on the light cards (WCAG AA contrast), `aria-pressed` on the tab and filter buttons, and a status line that only announces "live" or "reconnecting" instead of every second.
4. **Speed.** The Gap tab's chart library loads only when that tab is opened; the header logo is a 2 KB image instead of 138 KB.
5. **Security headers** on every page: no framing, no plugins, strict referrer, and no camera, microphone, location or payment access.
6. **Footer** on both pages: not financial advice, the data sources, and that Par never holds funds or asks for a signature.
7. **Link previews:** Open Graph and Twitter tags with a 1200×630 image (`public/og.png`), canonical URLs and an Apple touch icon.
8. **A styled "Page not found"** page, served with HTTP 404.
9. **Long coin symbols** (such as FIGR_HELOC) are cut with an ellipsis instead of running into the name.
10. **Small phones:** the five section tabs fit a 360 px screen without scrolling.
11. **`robots.txt` and `sitemap.xml`.**
12. **Server logs** (`[par] …` lines in Netlify's function logs) say which source failed and why. They never contain wallet addresses, keys or the RPC address.
13. **Fund weights:** /portfolio says the SPYx and QQQx top-ten weights may have changed once they are more than 90 days old (`HOLDINGS_AS_OF` in `src/lib/etf-holdings.ts`).

## Redesign and new features (17 Oct 2026, second pass)

- **Look:** a running price tape, a hero with the live counts, four live tiles (Nasdaq, Fair now, widest gap, next balance change), cards with a ticker badge per sector and a gap meter (−2% to +2%, fair band shaded), a list view and sorting (gap, 24h move, A–Z; remembered on the device), a tab bar that sticks while its content is on screen, and a new holder section.
- **Size check (new):** pick a name and an amount ($10 to $250,000) for a live Jupiter quote at that size: shares, price per share, gap versus Nasdaq, dollars over or under the print, pool impact and a call (Fair / Close / Far, same thresholds as the verdict). Buy is hidden when the price is far off. One quote per name and amount is shared for 20 s. Server function `checkSize` (POST, never cached by the CDN).
- **Holder section:** what $PAR unlocks in @ONPAR_BOT (Fair pings, the new morning brief, open bell, bag watch) with a deep link that turns the brief on, and the read-only wallet check.

## Run it

```bash
cd site
npm ci
npm run dev          # http://localhost:3000 (vite dev with Netlify emulation)
npm run dev:windows  # the same, trusting the Windows certificate store (needed when an antivirus inspects HTTPS)
npm test             # logic vs the published desk, plus the Jupiter limiter
npm run typecheck
npm run build        # dist/client (static) + the Netlify Function
```

Node 22.12 or newer.

## Environment variables (names only, all optional)

| Name | What it does |
|---|---|
| `SOLANA_RPC_URL` | RPC for wallet reads (default: the public mainnet RPC, which is rate-limited) |
| `JUPITER_API_KEY` | A free key from developers.jup.ag. With it: api.jup.ag at 1 request/s. Without it: lite-api.jup.ag at 0.5 request/s. The limit is per Jupiter organisation, so the bot and the site share it when they use the same key |
| `TOKEN_MINT` | The project coin for the holder check. Empty means "the coin is not live yet" |
| `HOLDER_MIN_TOKENS` | Minimum whole tokens to count as a holder (0 or empty means any amount) |

Set them in Netlify (Project configuration → Environment variables) and redeploy. Never commit values.

## Deploying

The repo-root `netlify.toml` builds this folder (`base = "site"`, `npm run build`, publish `dist/client`, Node 22). Netlify skips the build when a push changes nothing in `site/`, so bot-only pushes never touch the site.

Safe order, with labels from Netlify's docs:
1. Netlify → the project → **Deploys** → **Lock to stop auto publishing**. New builds stop going live by themselves.
2. Netlify → **Project configuration → Developer settings → Continuous deployment → Repository**: the repo `filipefernandes0170/solana-xstocks-bot` must be linked (**Link repository** if not; **Configure Netlify on GitHub** if the private repo is not in the list).
3. A push that changes `site/` builds a new deploy that is not published. Test its own address (`<deploy-id>--xstocks-tracker.netlify.app`) side by side with the live site.
4. When it is good: open that deploy → **Publish Deploy**. Rolling back is the same button on an older deploy (Grok's original is `6aced2a4bac172109cf9f9c3`).

## Layout

```
src/
  routes/        __root.tsx (head, fonts, security headers, 404), index.tsx (desk + loader), portfolio.tsx
  components/    Sky, SiteFooter, NotFound, desk/* (Desk, Ticker, StatStrip, StockCard, StockList, SizeCheck, crypto, gap chart, yield, glossary, why-hold)
  lib/           site (URL, titles, cache and security headers), brand (badge colours, gap scale), size, tokens, types, format, session (Nasdaq clock), verdict, wallet-standard, etf-holdings
  server/        functions.ts (the 6 server functions) + jupiter (rate limiter), quotes, offers, cryptos, solana, wallet, http
tests/           logic.test.ts + golden.json (answers from the published desk), jupiter.test.ts, features.test.ts
```
