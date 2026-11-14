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
7. **Holder check** ("Would this wallet get the text?") adds up every token account of the $PAR mint (`PAR_MINT`). The bot only reads the associated token account. Until the official address is filled in (`PAR_MINT`, launch day), both answer "not live yet".
8. **Short dollar amounts ("$51M").** The published code wrote "$51.0M" when it ran in Node and "$51M" in a browser, so a page rendered on the server did not match the browser and React redrew it (an error on every /ranking load). Since 18 Oct 2026 both write "$51M"; the golden test drops that trailing ".0" from the recorded answers (`tests/logic.test.ts`).

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

- **Pages from the cache, honestly marked** (`LIVE_PAGE_CACHE`, `SHELL_PAGE_CACHE` in `src/lib/site.ts`). The desk and the name pages are shared by Netlify's CDN for 10 s as before, but after that the last copy keeps being served for up to a day while one background call refreshes it (`stale-while-revalidate=86400`, durable cache, cleared on every deploy). A visitor after a quiet spell no longer waits 5 to 7 s for the function to start and read Nasdaq (measured before the change in Netlify's request logs: about 2.5 s for the function to start, 3 to 4 s for the Nasdaq round). A copy whose prices are over a minute old is marked before it is drawn (`components/StaleMark.tsx`: a one-line script compares the page's price time with the visitor's clock): the numbers fade, the verdicts and gap meters are hidden, and a line says "Refreshing the prices (the last ones are N min old)". The page then asks for prices alone first (no buy rotation, the fastest answer), and the mark lifts when they land. Answers older than what is on screen are ignored. /portfolio has no server data in its page, so it is simply served from the cache. The data functions set their own, shorter CDN rule only when the browser calls them (`cdnCache` in `server/functions.ts`): during server rendering the loader runs them inside the page's request, and their header used to replace the page's rule (the desk got the 10 s + 20 s data rule, a name page the 30 s venues rule).
- **Shared desk state** (`server/deskShare.ts`, rules in `lib/shared.ts`, tests in `tests/shared.test.ts`). Every copy of the function shares, in Netlify Blobs (store `desk`, strong consistency): the newest $1,000 buy per name (`buys`), the last Nasdaq round (`prints`) and the names visitors want first (`wanted`). A fresh copy starts with what the others quoted, every answer (the first page too) carries all of them, and Nasdaq is read once every 3 minutes for all copies instead of once per copy. A round where Nasdaq answered nothing is not shared. If Blobs cannot be reached, each copy works from its own memory as before.
- **Names you care about first** (`useWantBuys`, server function `wantBuys`). The page asks for the buys of the visitor's favourites, the cards on screen (desk), the name being viewed (name page) and the stock tokens in the bag (portfolio): only names without a buy younger than 45 s, at most every 8 s, and only while the tab is visible. The request only marks the names (no Jupiter call) and is cached by the CDN for 15 s, so many visitors asking for the same names cost one call. The rotation still makes 4 quotes per refresh: up to 2 go to wanted names that are due, oldest first, the rest to the oldest of the list, so every name keeps moving. Thin pools are never quoted, and /portfolio now says so ("Pool too thin to quote $1,000") instead of "loading".
- **Buys from @ONPAR_BOT** (`netlify/edge-functions/share-buys.ts`, POST `/api/share-buys`; bot side `../src/services/shareBuys.ts`). The bot quotes every name about once a minute with its own Jupiter allowance (keyless, counted for the server's IP), the same $1,000 USDC buy priced per share the same way: on 18 Oct 2026 the share multiplier and decimals the bot reads on chain equalled Jupiter's for all 25 names. After each round it posts the fresh quotes here; the Edge Function checks the shared secret (`SHARE_BUYS_SECRET`, the same value in Netlify and in the bot's `.env`, compared in constant time), keeps only well-formed quotes under 2 minutes old (at most 40), and merges them into the shared buys blob, newest per name. Without the variable it answers 404 and the site quotes alone; the name must be exactly `SHARE_BUYS_SECRET` (a first try as `SHARE_BUY_SECRET` left it off), and Netlify only applies a new or renamed variable to deploys built after it. Every shown buy, whoever quoted it, must pass `buyShown` (never for a pool under $25k, never 5x away from the last trade). An Edge Function costs one web request (2 credits per 10,000), so about 43,000 posts a month are about 9 credits. Measured before it, as the first visitor after 3 quiet minutes: the six cards on screen got their buys at 14 s (3), 34 s (5) and 54 s (6).
- **Names on screen sooner:** the page asks for its names 0.6 s after it opens, the rotation reads the wanted names just before picking (so that ask makes the first round), and up to 3 of each refresh's 4 quotes go to wanted names that are due.
- **GeckoTerminal** (the price fallback; Jupiter priced all 25 names on 18 Oct 2026) waits at most 5 s, so a slow answer can no longer hold up the desk for 12 s.
- **Portfolio look** (`components/portfolio/charts.tsx`, `BagMap.tsx`). The map's tiles have a sector colour strip, gradients and a key; they show their labels only when the labels fit (CSS container queries) and are taller on phones. Today's move is a pill; Cash has a share bar and Spread a 10-step meter. "At the real price" has a meter for the bag against the same shares at Nasdaq, and possible yield a bar per name. The mix has a donut with a key, sector bars in each sector's colour (`sectorAccent` in `lib/brand.ts`), a badge on every holding, stacked exposure bars (held directly, inside SPYx, inside QQQx) with company names, a two-sided SPY/QQQ chart, and country and currency bars. A part too small for 0.1% reads "<0.1%". Every number is the same as before; the shapes only draw it.

## Bag insights on /portfolio (18 Oct 2026)

- **Who can freeze your bag** (`lib/bagPowers.ts`, `server/powers.ts`, server function `getBagPowers`, `components/portfolio/BagPowers.tsx`). After a wallet is read, the page sends its tokens' mints (at most 40, largest lines first; native SOL has no mint) and the server reads them in one `getMultipleAccounts` call, judges each with the same rules as a name page's issuer powers (`lib/issuer.ts`) and keeps the answer for 10 minutes. The bag's value is added up three ways: what its issuer can freeze, pause or block (freeze authority, pause switch, transfer hook, new accounts frozen), what its issuer can move or burn out of the wallet (permanent delegate), and what no issuer can stop or move (native SOL, and mints with none of those powers). A token whose mint was not read shows as "Not read", never as safe. On 18 Oct 2026 every xStocks and Backpack mint Par tracks carried all six powers, and USDC carried freeze and mint. The panel says these are powers, not events.
- **Your bag's flows** (`components/portfolio/BagSupply.tsx`): for each stock token held, its value on Solana and how many tokens were created or burned since the daily supply reading (the same data as a name page's supply card), and where the bot's large-flow alerts are (/flows, and texts for $PAR holders who watch the bag).
- **Since you last looked** (`lib/lastLook.ts`, `components/portfolio/LastLook.tsx`): the wallet's change since this device last showed it, split into price moves (the earlier amounts at today's prices) and balance changes (tokens added or removed, and rebases), so a deposit never reads as a gain. The earlier view is kept only in this browser (`par-last-look`, at most 5 wallets), compared from 10 minutes on and replaced at most once an hour; reading the same wallet again on the same visit keeps the same comparison. Disconnect or Forget clears it. Price moves plus balance changes always equal the change in value (checked on 500 random bags in `tests/bagInsights.test.ts`).
- **Watch this bag** now says the bot also texts when a large batch of a held name is created or burned.

## Fixes and speed (18 Oct 2026)

Found by reading Netlify's request logs for a day and loading every page in a browser.

- **/ranking no longer errors** on load: see item 8 above (`formatCompactUsd` in `lib/format.ts`).
- **/events opens at once** (`EVENTS_PAGE_CACHE` in `lib/site.ts`). After a few quiet minutes it used to take about 5 s while the SEC and the chain were read. Netlify now serves the last copy for up to a day while one call refreshes it, and a copy older than 3 minutes asks for the newest list as soon as it opens ("Checking for newer events…"). The data behind it, and `/api/events` for the bot, keep their 1-minute rule.
- **No Nasdaq wait while Nasdaq has no session** (`quietSince` in `lib/session.ts`, `printsSettled` in `lib/shared.ts`, `server/quotes.ts`). A Nasdaq round takes about 3 s (measured 18 Oct 2026; Jupiter's price call about 0.1 s, GeckoTerminal about 0.3 s), and it was repeated every 3 minutes even on weekends. From the end of after hours (20:00 ET, 17:00 on an early close) to the next pre-market (4:00 ET on the next trading day), so weekday nights, weekends and holidays, the prints are now read once, at least 15 minutes into that stretch, and reused while every one of them still says "Closed". Nasdaq plans an overnight session (target December 2026, pending approval); once it runs, `quietSince` must change.
- **The gap is a plain number while Nasdaq is closed** (`GapPill` and `GapMeter` in `components/desk/parts.tsx`, the hero and the "Widest gap" tile). It used to say "-1.40% cheap" in green next to a red "Wait". With Nasdaq closed the print is the last one, so the card now says "Buy versus last Nasdaq print" and shows "-1.40%" in grey; the verdicts are unchanged. The meter's description for screen readers also read "+0.60% rich above Nasdaq" for any gap; it now says "0.60% above the Nasdaq print".
- **/favicon.png** exists (48 px, rendered by `tools/brand` with the other icons). Some apps and crawlers ask for it whatever the page links to; it used to be a 404 handled by the server function.

## Faster on phones (18 Oct 2026)

Measured on the live site with the usual mobile test profile (4x slower CPU, 150 ms, 1.6 Mbps): pages show their first content in 1.5 to 2.4 s and weigh 150 to 200 KB, but a phone needs about 3 s to start the page's code, so the desk only asked for live prices 6 to 7 s after opening. On an old cached copy, "Refreshing the prices" then stayed up to about 12 to 13 s (once 26 s).

- **Fresh prices requested at once** (`lib/earlyQuotes.ts`, `StaleMark` `prefetch`, route `/api/quotes`). When the desk or a name page arrives as a copy older than a minute, its one-line script (the one that marks the copy stale) also starts fetching the prices from `/api/quotes`, plain JSON shared by the CDN like the data functions. The page's first refresh takes that answer instead of asking again, so the prices are usually there by the time the page's code runs. A fresh copy asks for nothing early.
- **Older $1,000 buys stay on the card** (`BUY_SHOWN_MS`, `olderBuy` in `lib/verdict.ts`; `GapMeter`, `GapPill`). A buy is used by the verdict up to 90 s old, as before. Jupiter's free rate limit lets the bot quote all names only about once every one to two minutes, and the CDN adds up to 20 s, so many cards kept falling back to "Loading the $1,000 buy" (4 to 22 of 25 cards showed a gap at any moment on 18 Oct 2026). A buy between 90 s and 3 minutes old is now drawn in grey with its age ("Last $1,000 quote 1 min old. A newer one is on its way."); it never counts for the verdict. The server and the edge function keep buys for 3 minutes (`BUY_KEEP_MS`, `KEEP_MS`) so a new visitor gets them too.
- **Formatters made once** (`lib/intl.ts`). A CPU profile of the desk on the same profile showed a new `Intl.NumberFormat` for every price (`formatUsd`, 0.84 s) and a new `Intl.DateTimeFormat` for every clock reading (`newYorkParts`, 0.43 s), during the start and again every second. Every formatter is now made once per set of options and reused; the text is the same (the golden tests are unchanged). The page code's own work in the first 13 s went from 2.85 s to 1.68 s.
- **Measured on the Deploy Preview** (stale cached copy, same profile, two runs each): fresh prices at 11.2 s and 11.7 s with the early request, against 20.8 s and over 25 s with it blocked.

## Calm animations (19 Oct 2026)

A Chrome trace on the mobile test profile (4x CPU) showed the desk keeping the main thread about 99% busy, and a name page about 98%, for as long as they stayed open: mostly painting. Switching animations off one at a time showed the cause: the hero's endless light (`stroke-dashoffset` on SVG paths) and breathing halo, about 60% on their own, then the price tape and the hero's pulsing dot.

- **Hero** (`styles.css`, `HeroLines.tsx`): the lines still draw in. The first time the hero is on screen (an IntersectionObserver adds `.in-view`; on a phone the hero is below the first screen), the light runs three times and fades out while still moving, and the halo breathes twice; then it rests. Name pages key the hero on the name, so it plays again when moving between names.
- **Hero dot**: pulses once each time new prices land (keyed on their time) instead of looping.
- **Price tape** (`Ticker.tsx`): moved with `will-change: transform`, and paused while scrolled out of view.
- **Reduced motion** still stops everything (the `.in-view` rules are listed there too).
- **Not kept: `content-visibility` on cards.** An independent review (three lenses, each finding checked by three skeptics) showed it made "back" from a name page land one to three cards too high, leaked onto /events (same class) and put the Share menu under the tab bar. `tests/calm.test.ts` guards all of this, including which animations may loop for ever.
- **Measured** (same profile, 6 s windows, two runs each, live site vs Deploy Preview): desk at the top 99% busy, now 25-26%; desk at the hero after its opening 99%, now 35-42%; name page 98%, now under 2% at the hero (16% in one run at the top, during a price update); desk load, first 14 s, 13.7 s busy, now 7.2 to 8.4 s. First and largest content times are unchanged within noise.
- **Seen in review, older than this change, left for later:** coming back from a name page while Nasdaq is closed lands about half a card low (the closed-session note and the longer header line appear one render after the router restores the scroll); a card's Share menu is cut off on the left at 375 px.

## Dark dashboard look (8 Nov 2026)

Filipe asked for the look of a dashboard picture he sent, keeping only the data Par already has and Par's own logo.

- **Theme** (`styles.css`): near-black page, dark panels with a hairline border, gold actions, Inter for text and headings. The colour names were kept so every page switched at once: `card` is now the dark panel, `ink` its light text, `field` the raised surface for inputs and meters. Light-surface classes were moved to `field`, and dark buttons to gold with dark text.
- **Shared pieces** (`components/ui.tsx`): page title, panel, number tile, underline tabs, chips and button styles.
- **Top bar** (`SiteNav.tsx`): the Par mark, the four pages with a gold underline, a search that opens a name's page (only the names Par follows), and "Connect wallet" (opens /portfolio).
- **Desk**: title with the Nasdaq session box and "View events"; four tiles (names followed, fair now, widest gap, next balance change); a featured name (`DeskTop.tsx`: token price, Nasdaq print, $1,000 buy versus Nasdaq, and the hero lines drawn for that name) next to its gap analysis (verdict, pool, what a $1,000 buy moves, how fresh the prices are); the table is now the default view (cards one click away). Clicking a name in the table, the ticker or a tile features it.
- **Events**: two columns, days on the left with time, event, type and names, the chosen event's details on the right (inline on phones).
- **Bot**: the bot, real example commands and live example messages side by side, the rest below.
- **Portfolio**: wallet panel and tiles (value, versus Nasdaq, positions, possible yield), holdings table with allocation bars (drawn against the largest holding, labelled with the true share) and "Since you last looked", yield and rebases on the right.
- **Not taken from the picture**, because Par has no such data or would break its rules: total volume, a 3M/1Y price chart, impact ratings and future earnings dates, average price and P/L, a "Claim" button, invented commands.
- Checked: types, 122 tests, production build, a readability scan of every page and desk view (no text under 4.5:1, 3:1 for large text), desktop and 390 px phone screenshots.

## Launch hardening (14 Nov 2026)

Two independent reviews four days before $PAR (the site, and the bot with its backend) found these; each was reproduced before it was fixed, and each has a test (`src/services/hardening.test.ts`, `tests/proof.test.ts`, `tests/launchUi.test.ts`).

- **A wallet proof could be forged.** The eight Ed25519 points of small order (14 ways to write them) are valid Solana addresses nobody owns, and one fixed "signature" passes Node's check against them. Anyone could have "proven" such an address after sending it 250,000 $PAR. Both verifiers now refuse those keys (`isSmallOrderKey`, the bot's and the site's lists equal by test). A proven wallet also counts for one Telegram account only: the one that proved it last.
- **One pasted address could take the bot down for good.** The bot read every token account a wallet owns; for an exchange or pool address that is hundreds of megabytes (845 MB measured), and the address was saved before it was read, so the bot read it again after every restart. Wallets are now read from the tracked names' own token accounts only (50 small accounts per wallet, `src/services/solana.ts`), with a time and size limit on every RPC call (`src/services/rpc.ts`), and a wallet is saved only after it was read. The trade-off: stock tokens kept outside a wallet's usual (associated) token account are not seen. The site's lookups cap the answer at 6 MB (`readJsonCapped`) and say so.
- **The minute loop read every saved wallet, one request each.** Bags are now read for $PAR holders only, two wallets per request, each at most every 90 s, within 20 s per round; a non-holder's bag memory is dropped, so a later holder starts clean.
- **A few size checks a minute starved the $1,000 round.** People's quotes are rationed (6 a minute for everyone, one per person every 10 s, only when a Jupiter slot is free within 3.5 s), the same name and amount is answered from a 20 s cache, and a $1,000 check is answered from the round's own quote.
- **One slow request held up everyone.** Each Telegram update is now handled on its own instead of batch by batch.
- **Nothing checked the $PAR address.** The address lives in one place per side (`src/config/par.ts`, `src/lib/holder.ts`, equal by test; `TOKEN_MINT` is no longer read). `npm run check:par` (repo root) reads it on chain before it is published, the bot does the same at start and texts the admin, and /ca stays off for an address that is not a token.
- **Proving a wallet failed in normal use.** Every holder reply made a new code and "I signed it" checked only the newest. Codes are reused for five minutes, each button carries its own code, an expired code answers with a fresh button, and `?start=hold` opens the proof message from the site.
- **A failed holder read looked like "you hold too little".** The last good answer stands for 15 minutes, and the note says when the chain could not be read.
- **Site:** a $PAR strip under the nav on every page (the official address once it exists), the phone table shows each name's price and verdict, the holder steps are spelled out ("What $PAR unlocks"), "texts" became "Telegram alerts", and the Where-to-buy gap is grey while Nasdaq is closed.
- **Left for after launch** (found in the same reviews): Fair judged on a Nasdaq print up to 30 minutes old when Nasdaq's API fails mid-session; the bot in a group chat; a rate limit on the site's POST functions; link-preview images in the old colours; the length of /bot on phones.

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
| `TOKEN_MINT` | No longer read (14 Nov 2026). The official $PAR address lives in `src/lib/holder.ts` (`PAR_MINT`, same as the bot's `src/config/par.ts`, checked by a test); empty there means "the coin is not live yet" |
| `HOLDER_MIN_TOKENS` | Emergency override only. Empty or 0 means the launch minimum, 250,000 $PAR (`PAR_HOLDER_MIN` in `src/lib/holder.ts`) |
| `SHARE_BUYS_SECRET` | 64 hex characters (`openssl rand -hex 32`), secret, Functions scope. The same value goes in the bot's `.env`; the bot then posts its $1,000 buys to `/api/share-buys`. Empty means off. Changing it needs a new deploy |

Set them in Netlify (Project configuration → Environment variables) and redeploy. Never commit values.

## Deploying

The repo-root `netlify.toml` builds this folder (`base = "site"`, `npm run build`, publish `dist/client`, Node 22). Netlify skips the build when a push changes nothing in `site/`, so bot-only pushes never touch the site.

Safe order, with labels from Netlify's docs:
1. Netlify → the project → **Deploys** → **Lock to stop auto publishing**. New builds stop going live by themselves.
2. Netlify → **Project configuration → Developer settings → Continuous deployment → Repository**: the repo `filipefernandes0170/solana-xstocks-bot` must be linked (**Link repository** if not; **Configure Netlify on GitHub** if the private repo is not in the list).
3. A push that changes `site/` builds a new deploy that is not published. Test its own address (`<deploy-id>--xstocks-tracker.netlify.app`) side by side with the live site.
   **Credits:** on the free credit plan (300 credits a month, a hard limit: when they run out every site is paused) each successful production deploy costs 15 credits, published or not, while Deploy Previews cost nothing. So test on a pull request's Deploy Preview first, and merge to `main` once per release.
4. When it is good: open that deploy → **Publish Deploy**. Rolling back is the same button on an older deploy (Grok's original is `6aced2a4bac172109cf9f9c3`).

## Layout

```
src/
  routes/        __root.tsx (head, fonts, security headers, 404), index.tsx (desk + loader), bot.tsx, s.$symbol.tsx, portfolio.tsx,
                 ranking.tsx, api.ranking.ts (JSON for the bot), verify.tsx (wallet proof), api.proof.ts (proof for the bot),
                 events.tsx, api.events.ts (JSON for the bot)
  components/    Logo, Backdrop, SiteNav, SiteFooter, ShareButton, NotFound, bot/PhoneDemo, stock/* (GapHistory, IssuerPowers, OtherTokens),
                 ranking/saveImage, share/* (canvas, cardImage),
                 portfolio/* (RealPrice, BagMap, BagYield, BagEvents, BagPowers, BagSupply, LastLook, WatchBag, BagPromise, charts),
                 desk/* (Desk, HeroLines, Ticker, StatStrip, StockCard, StockList, SizeCheck, SizeSheet, crypto, gap chart, yield, glossary, why-hold)
  lib/           site (URL, titles, cache and security headers), brand (badge colours, gap scale), size, share, history, botText,
                 useFavourites, useLiveQuotes, bag, treemap, issuer, ranking, walletProof, tokens, types, format, session (Nasdaq clock), verdict,
                 calendar (market days), events (SEC, mints, timeline), bagPowers, lastLook, shared, supply, venues,
                 wallet-standard, etf-holdings
  server/        functions.ts (the 18 server functions) + jupiter (rate limiter), quotes, history (and the ranking), issuer, walletProof, events, offers,
                 cryptos, solana, wallet, http, deskShare, mints, supply, venues, powers
netlify/functions/record-gaps.mts   the scheduled gap recorder
tests/           logic.test.ts + golden.json (answers from the published desk), jupiter.test.ts, features.test.ts, brand.test.ts, portfolio.test.ts,
                 launch.test.ts, proof.test.ts, share.test.ts, events.test.ts, yield.test.ts, venues.test.ts, shared.test.ts, shareBuys.test.ts,
                 bagInsights.test.ts, polish.test.ts, phone.test.ts
```
