# Par desk (site source)

The website at https://onpar.site (Netlify project `xstocks-tracker`; the old https://xstocks-tracker.netlify.app forwards there): is a tokenized stock on Solana at the share price?

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

1. **Jupiter rate limits.** Every Jupiter call goes through `src/server/jupiter.ts`: one request every 2.1 s, a pause when Jupiter's `x-ratelimit-remaining` reaches 0, and a pause after an HTTP 429. Jupiter enforces 1 request every 2 s (5 per 10 s window) both keyless and on the free plan (portal Billing page and response headers, 17 Oct 2026). Buy quotes are refreshed 4 per load, oldest first (SpaceX, which has no Nasdaq print, is not quoted), and only by the browser's polling, so the first page load stays fast; the page keeps the newest buy per name it has seen. The bot does the same in `../src/services/jupiter.ts`.
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

## Brand, the bot page, name pages and history (17 Oct 2026, third pass)

- **Mark:** two lines, the token price (gold) and the stock price (pale), meeting at one point. One source in `../tools/brand/mark.mjs`; the site draws it in `src/components/Logo.tsx` (a test keeps both equal). `cd ../tools/brand && npm install && npm run images` re-renders `public/favicon.svg`, `favicon.ico`, `apple-touch-icon.png`, `icon-512.png`, `og.png`, `og/bot.png`, `og/s/<SYMBOL>.png`, `qr-bot.svg` and `../tools/brand/out/bot-avatar.png` (for @BotFather). Link previews carry no prices on purpose: chat apps cache them for days.
- **Hero:** the moon, stars and birds are gone. The hero draws one name at a time as the mark draws it, with live numbers: gold is the token (the $1,000 buy, or the last trade while it loads), pale the Nasdaq print, the dot the gap; the lines start further apart the bigger the gap. The page background is a faint grid.
- **/bot:** what @ONPAR_BOT does, with a phone showing a real card built from the live desk (`src/lib/botText.ts` writes it the way the bot does), three steps, free versus holder features, commands, the verdict colours, questions and a QR code. Whether $PAR is live comes from `getFlags` (TOKEN_MINT set or not), so the page needs no edit when the coin launches.
- **/s/<SYMBOL>:** one page per name, live (`useLiveQuotes`), with its own preview image, Buy, Share, Watch in Telegram, the size check, its Kamino offers and a week of gap history.
- **Favourites:** a star on every card, kept on the device; the Favourites filter offers one Telegram link that watches them all (`?start=w-NVDAx-TSLAx`, up to 8 names).
- **Share:** on cards, name pages and size checks. Phones get the system share sheet; elsewhere copy, X or Telegram. The text is built from the numbers on screen at that moment.
- **Gap history:** `netlify/functions/record-gaps.mts`, a scheduled function (every 15 minutes, 12:00 to 21:45 UTC, Monday to Friday), stores each name's last trade and Nasdaq print in one Netlify Blob per UTC day (store `gap-history`). `getHistory` reads the last 7 days. About 880 runs a month, roughly 10 of the free plan's 300 credits. The $1,000 buy is not recorded: 18 quotes at Jupiter's free pace take longer than a scheduled function may run.

## Portfolio upgrade (17 Oct 2026, fourth pass)

/portfolio was rebuilt around one question: what is this bag really worth? The logic lives in `src/lib/bag.ts` (pure, tested in `tests/portfolio.test.ts`); the sections are in `src/components/portfolio/`.

- **At the real price** (`RealPrice`): each xStock held, marked at the live last trade and set next to the same number of shares at the Nasdaq print, with the difference, the token-versus-print gap and the desk's verdict on a $1,000 buy. The page polls the same CDN-cached quotes as the desk (`useLiveQuotes`), but only once a wallet is read.
- **Exit price:** on a click, one live Jupiter sell quote (token → USDC) per position, the 10 largest, one at a time. `checkExit` (POST, never cached by the CDN) sells `shares / multiplier` on-chain units (`sellUnits` in `server/quotes.ts`), skips positions under $1 or over $1,000,000, rejects answers more than 5x from the last trade, and shares each answer for 20 s. Live polling pauses while the checks run, so they get Jupiter's whole rate limit. Nothing is signed or sent.
- **New look:** the page backdrop and light panels of the desk, a large total with today's move, and a map of every position sized by value and coloured by sector (`BagMap`, a squarified treemap in `src/lib/treemap.ts`; xStock tiles open their name page). Holdings are cards on phones. Before a wallet is read, six tiles say what the page will show.
- **Watch this bag in Telegram** (`WatchBag`): `t.me/ONPAR_BOT?start=p-<address>` (46 characters, inside Telegram's 64). The bot saves that public address and shows the bag; its existing bag texts (verdict changes, a thin pool, the evening before a rebase) then follow it for $PAR holders. A second link watches the held names for a Fair ping (`?start=w-…`).
- **Possible yield** (`BagYield`): each xStock's best live Kamino supply rate above 0%, times its value, summed per year. Kraken's vault target is shown as text, not counted.
- **Coming up** (`BagEvents`): rebases still ahead for the names held (from Jupiter's `scaledUiConfig`), with the balance after, plus the Nasdaq session.
- **Saved wallet:** a wallet read on /portfolio or on the desk's Portfolio tab is kept on the device (`xstocks-wallet`, the desk's key) and offered as one button next time. Disconnect or Forget clears it. The address never goes in the page URL.
- **Desk:** the Portfolio tab keeps its quick summary and links to the full page.

## Before launch (17 Oct 2026, fifth pass)

A look at the competition (Stocks on Solana lists 2,011 tokenized stocks with the last trade against the issuer's mark; RWA.xyz and RWA Trails chart the market; Trojan and Bankr trade) left Par's edge as the price you would actually pay or get, against Nasdaq, with a verdict. This pass sharpens that.

- **SpaceX has a print.** SPCX has traded on Nasdaq since 12 June 2026, so SPCXx is judged like any name. A name is left unjudged only when its print is missing (stockPrice null), never by ticker. The 44 golden cases that encoded the old rule are skipped on purpose and a test checks SpaceX is judged exactly like any other name.
- **Desk redesign:** the cards come right after the hero and the stat tiles (the Size check is a dialog, `SizeSheet`, opened by Size on a card or in the hero); cards are short, with the legs, impact and multiplier under Details; while Nasdaq is closed one banner says so (`closedLine`: "It opens Monday at 9:30 ET") and each card's line moves under Details; a missing $1,000 buy shimmers instead of printing a sentence; three columns from 1280 px. On a phone the first card is about a third higher and each card about half as tall.
- **What the issuer can do** (`/s/<SYMBOL>`, `IssuerPowers`): one read of the mint account (`getIssuer`, cached 10 minutes) lists the Token-2022 powers: a permanent delegate (can move or burn tokens from any wallet), freeze, pause (and whether transfers are paused now), a transfer hook, the multiplier and the mint authority, each with the address that holds it.
- **The week's ranking** (`/ranking`, `lib/ranking.ts`): from the gap history, the share of open-market readings each name spent within 0.4% of its print over 7 days, closest first; names need two hours of readings. Share, "Save image" (a 1200 × 675 PNG drawn in the browser, nothing uploaded), a teaser on the desk and a footer link. `/api/ranking` serves the same as JSON for the bot (`/week`, and a Friday post to `BRIEF_CHANNEL_ID`).
- **Backpack Securities:** six tokens beside the 19 xStocks: SPCX, MU, TTWO, SKHY, DJT and AMD. Every mint is the one Backpack's own exchange API lists under "<SYMBOL>.US" (`api.backpack.exchange/api/v1/assets`, checked 17 Oct 2026); all share Backpack's issuer authority on chain and trade about 1:1 with the share. Cards and pages name the issuer; when one company has two tokens (SpaceX, AMD) the name page compares the two $1,000 buys (`OtherTokens`).
- **Thin pools:** a pool under $25,000 (`THIN_POOL_USD`; AMDx and NFLXx today) gets no $1,000 buy quote; its card says the pool is too thin instead of loading. That keeps the rotation at 23 quoted names, 6 refreshes.

## Holder features (17 Oct 2026, sixth pass)

Reasons to hold $PAR are tools for traders; none is a return on the coin.

- **Wallet proof** (`/verify`, `lib/walletProof.ts`, `server/walletProof.ts`): the bot's /hold makes a one-time code (128 random bits) and a button to `/verify?n=<code>`. The wallet signs a plain-text message (Wallet Standard `solana:signMessage`) that names the site, says it is not a transaction and carries the code. `submitWalletProof` (POST) checks the Ed25519 signature and keeps { address, signature } in Netlify Blobs (store `wallet-proofs`) for 15 minutes; `/api/proof?n=<code>` hands it to the bot (never cached). "Back to Telegram" opens `?start=v-<code>`; the bot checks the signature itself and that the code is this user's, fresh and unused before it saves the wallet. Holder status now uses only a proven wallet, since anyone can type someone else's public address. On a phone without a wallet the page offers "Open in Phantom" and "Open in Solflare" (their own browse links). A wallet that answers for other bytes than the message is refused.
- **Size alerts** and **two-token pings** live in the bot (see the root README); the site's /bot page and the desk's "Why hold $PAR" list them.
- **Share images:** the Share menu on every card and name page has "Save image": the card drawn in the browser (`components/share/cardImage.ts`, 1200 × 675) with the verdict, both prices, the gap meter, a plain sentence and the time in UTC. Phones also get "Share…" for the system sheet. The ranking image uses the same helpers (`components/share/canvas.ts`).

## Events (17 Oct 2026, seventh pass)

- **The page** (`/events`, `lib/events.ts`, `server/events.ts`): a timeline grouped by New York day, "Coming up" and "Last 14 days", with four cards on top (next day off, next balance change, transfers, latest key filing), filters (kind, company, favourites, key filings only) and a legend. Each item has its time (ET) and a link to its source. `?name=NVDAx` opens it on one company; every name page links there.
- **SEC filings:** each company's list from `data.sec.gov/submissions` (fast), then each new filing's header file (`.hdr.sgml`, about 1 KB) for the exact time the SEC accepted it. The submissions JSON's own acceptance times were not used: on 17 Oct 2026 some were four hours off the filing pages. The per-company Atom feed (`cgi-bin/browse-edgar`) was tried and dropped: it took 10 to 60 seconds an answer. User-Agent `Par desk https://onpar.site`, at most 5 requests a second, 10 lists and 12 headers a call, kept in Netlify Blobs (store `events`, key `sec-filings`); a list is read again after 5 minutes. CIKs come from `sec.gov/files/company_tickers.json` (`SEC_CIK`); SPY, QQQ and GLD are funds and have none. Shown: 8-K (named by its most consequential item), 6-K, 10-Q, 10-K, 20-F, S-1, F-1, S-4, F-4, DEF 14A and amendments. Insider trades, prospectus supplements and merger letters are left out. "Key" (texted by the bot): 8-K items 1.01, 1.02, 1.03, 1.05, 2.01, 2.02, 2.05, 2.06, 3.01, 4.02, 5.01, 5.02, and 6-K.
- **On chain:** one `getMultipleAccounts` for every mint (kept 2 minutes): `scaledUiAmountConfig` gives balance changes ahead and those of the last 14 days, `pausableConfig.paused` gives pauses.
- **Market days:** `lib/calendar.ts`, Nasdaq's 2026 schedule and NYSE's 2027–2028 list (the bot keeps the same list; a bot test compares them, and a site test fails when fewer than 12 months are left). The Nasdaq clock (`lib/session.ts`) now skips holidays and knows the 1:00 PM early closes.
- `/api/events` serves the same list as JSON for the bot (CDN: 60 s, stale up to 120 s).
- **/bot** now explains how the bot works and every feature, with its commands.

## Yield fix (17 Oct 2026)

- "Borrow" on the yield cards is now the market's stablecoin rate (USDC in Kamino xStocks, PYUSD in Sentora), read from that stablecoin's row in the same market. Before, it showed the token's own borrow rate (what borrowing NVDAx costs) under the label "Borrow USDC".
- Every "Open on Kamino" link opens the token's own page, `kamino.com/borrow/reserve/<market>/<reserve>` (checked in a browser). The old `kamino.com/lend/<market>` now lands on an unrelated Earn vault page.
- Today the stock tokens themselves earn almost nothing when lent (0.00 to 0.18% on 17 Oct 2026), so "Possible yield" is usually about $0. That is the real figure.

## Where to buy and supply on Solana (18 Oct 2026)

- **Where to buy** (`lib/venues.ts`, `server/venues.ts`, `components/stock/Venues.tsx`, `/api/venues?symbol=`): on a name's page, the live $1,000 buy on Jupiter next to what $1,000 pays on the exchanges that list the same token: Kraken for the 19 xStocks (public order book, `asset_class=tokenized_asset`; only pairs with status `online` take a market buy, so `post_only` on weekends shows "takes only some orders"), Backpack Exchange for Backpack's tokens it lists on spot (SPCX, MU, SKHY on 18 Oct 2026; perpetual futures are not tokens and are left out). Both books quote per share (checked against Jupiter's per-share price). The average fill walks the asks; a book with under $1,000 says so. Exchange prices are before their fee; the lowest is marked "lowest right now, before exchange fees". Backpack's stock markets did not open from Portugal, so the link goes to the exchange, not the market; Kraken's goes to its xStocks page, which picks the company for each region. Hidden for names no exchange lists.
- **Supply on Solana** (`lib/supply.ts`, `server/supply.ts`, `server/mints.ts`, `netlify/functions/record-supply.mts`, `/api/supply`): each mint's raw supply, one reading a day in Netlify Blobs (store `supply`, key `day/<UTC date>`), written at 00:20 UTC and also on the first visit of a day. Created or destroyed is the raw supply against the oldest reading at least 20 hours old within 8 days, so rebases never count; shares use today's multiplier. On every name page and as a table on /ranking; the bot's /week lists the biggest creations and burns.
- **Weekend check** (tokens over the weekend against Monday's open) was left for later: the desk and the Monday brief already show the weekend gap, and the scorecard needs a week of recorded prices (history starts Monday 19 Oct), so it can first be checked against real data on 26 Oct.

## Faster first load, more $1,000 buys, a new portfolio look (18 Oct 2026)

- **Pages from the cache, honestly marked** (`LIVE_PAGE_CACHE`, `SHELL_PAGE_CACHE` in `src/lib/site.ts`). The desk and the name pages are shared by Netlify's CDN for 10 s as before, but after that the last copy keeps being served for up to a day while one background call refreshes it (`stale-while-revalidate=86400`, durable cache, cleared on every deploy). A visitor after a quiet spell no longer waits 5 to 7 s for the function to start and read Nasdaq (measured before the change in Netlify's request logs: about 2.5 s for the function to start, 3 to 4 s for the Nasdaq round). A copy whose prices are over a minute old is marked before it is drawn (`components/StaleMark.tsx`: a one-line script compares the page's price time with the visitor's clock): the numbers fade, the verdicts and gap meters are hidden, and a line says "Refreshing the prices (the last ones are N min old)". The page then asks for prices alone first (no buy rotation, the fastest answer), and the mark lifts when they land. Answers older than what is on screen are ignored. /portfolio has no server data in its page, so it is simply served from the cache.
- **Shared desk state** (`server/deskShare.ts`, rules in `lib/shared.ts`, tests in `tests/shared.test.ts`). Every copy of the function shares, in Netlify Blobs (store `desk`, strong consistency): the newest $1,000 buy per name (`buys`), the last Nasdaq round (`prints`) and the names visitors want first (`wanted`). A fresh copy starts with what the others quoted, every answer (the first page too) carries all of them, and Nasdaq is read once every 3 minutes for all copies instead of once per copy. A round where Nasdaq answered nothing is not shared. If Blobs cannot be reached, each copy works from its own memory as before.
- **Names you care about first** (`useWantBuys`, server function `wantBuys`). The page asks for the buys of the visitor's favourites, the cards on screen (desk), the name being viewed (name page) and the stock tokens in the bag (portfolio): only names without a buy younger than 45 s, at most every 8 s, and only while the tab is visible. The request only marks the names (no Jupiter call) and is cached by the CDN for 15 s, so many visitors asking for the same names cost one call. The rotation still makes 4 quotes per refresh: up to 2 go to wanted names that are due, oldest first, the rest to the oldest of the list, so every name keeps moving. Thin pools are never quoted, and /portfolio now says so ("Pool too thin to quote $1,000") instead of "loading".
- **GeckoTerminal** (the price fallback; Jupiter priced all 25 names on 18 Oct 2026) waits at most 5 s, so a slow answer can no longer hold up the desk for 12 s.
- **Portfolio look** (`components/portfolio/charts.tsx`, `BagMap.tsx`). The map's tiles have a sector colour strip, gradients and a key; they show their labels only when the labels fit (CSS container queries) and are taller on phones. Today's move is a pill; Cash has a share bar and Spread a 10-step meter. "At the real price" has a meter for the bag against the same shares at Nasdaq, and possible yield a bar per name. The mix has a donut with a key, sector bars in each sector's colour (`sectorAccent` in `lib/brand.ts`), a badge on every holding, stacked exposure bars (held directly, inside SPYx, inside QQQx) with company names, a two-sided SPY/QQQ chart, and country and currency bars. A part too small for 0.1% reads "<0.1%". Every number is the same as before; the shapes only draw it.

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
| `JUPITER_API_KEY` | A free key from developers.jup.ag (set, secret, Functions scope). Same pace as keyless (1 request every 2 s), but counted for our organisation instead of the function's shared Netlify IP. Do not give the bot this key: they would share one limit |
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
  routes/        __root.tsx (head, fonts, security headers, 404), index.tsx (desk + loader), bot.tsx, s.$symbol.tsx, portfolio.tsx,
                 ranking.tsx, api.ranking.ts (JSON for the bot), verify.tsx (wallet proof), api.proof.ts (proof for the bot),
                 events.tsx, api.events.ts (JSON for the bot)
  components/    Logo, Backdrop, SiteNav, SiteFooter, ShareButton, NotFound, bot/PhoneDemo, stock/* (GapHistory, IssuerPowers, OtherTokens),
                 ranking/saveImage, share/* (canvas, cardImage),
                 portfolio/* (RealPrice, BagMap, BagYield, BagEvents, WatchBag, BagPromise),
                 desk/* (Desk, HeroLines, Ticker, StatStrip, StockCard, StockList, SizeCheck, SizeSheet, crypto, gap chart, yield, glossary, why-hold)
  lib/           site (URL, titles, cache and security headers), brand (badge colours, gap scale), size, share, history, botText,
                 useFavourites, useLiveQuotes, bag, treemap, issuer, ranking, walletProof, tokens, types, format, session (Nasdaq clock), verdict,
                 calendar (market days), events (SEC, mints, timeline),
                 wallet-standard, etf-holdings
  server/        functions.ts (the 14 server functions) + jupiter (rate limiter), quotes, history (and the ranking), issuer, walletProof, events, offers,
                 cryptos, solana, wallet, http
netlify/functions/record-gaps.mts   the scheduled gap recorder
tests/           logic.test.ts + golden.json (answers from the published desk), jupiter.test.ts, features.test.ts, brand.test.ts, portfolio.test.ts,
                 launch.test.ts, proof.test.ts, share.test.ts, events.test.ts
```
