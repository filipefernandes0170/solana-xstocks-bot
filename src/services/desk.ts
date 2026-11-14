import axios from "axios";
import { config } from "../config/index.js";
import { TOKENIZED_STOCKS, type TokenizedStock } from "../config/tokens.js";
import { jupiterGet, jupiterPauseLeft, jupiterPaused } from "./jupiter.js";
import { nasdaqQuoteUrl } from "./nasdaq.js";
import { shareBuys } from "./shareBuys.js";
import { THIN_POOL_USD, currentMultiplier, pendingRebase, perShareFill, tradeVerdict, type Rebase, type VerdictInput } from "./verdict.js";

export type DeskQuote = VerdictInput & {
  name: string;
  issuer: TokenizedStock["issuer"];
  mint: string;
  rebase: Rebase | null;
  change24h: number | null;
  /** The token's multiplier: splits and reinvested dividends added to balances since launch. */
  sharesPerToken: number | null;
  /** The token's pool liquidity in dollars, from Jupiter. Under THIN_POOL_USD no $1,000 buy is quoted. */
  poolUsd: number | null;
};


/**
 * `paused`: the issuer has paused every transfer (Token-2022 pausable extension); null when the mint was not read.
 * `supplyRaw`: the mint's total supply in on-chain units, as a decimal string (it can exceed 2^53).
 */
type MintInfo = { rebase: Rebase | null; decimals: number | null; multiplier: number | null; paused: boolean | null; supplyRaw: string | null };

let cache: { at: number; quotes: DeskQuote[] } | null = null;
type StockPrint = { price: number; state: string };

// Nasdaq prints by symbol, each with the time it was read. A symbol whose request fails keeps its last
// good print for PRINT_KEEP_MS, so one dropped request does not blank a card for minutes.
const prints = new Map<string, StockPrint & { at: number }>();
let printsReadAt = 0;
const PRINTS_TTL_MS = 180_000;
const PRINT_KEEP_MS = 30 * 60_000;
let inflight: Promise<DeskQuote[]> | null = null;
let rebaseCache: { at: number; rows: Map<string, MintInfo> } | null = null;

type Buy = { price: number; impactPct: number; at: number };

// The latest $1,000 buy quote per mint. Filled one request at a time in the background, so a
// price lookup never waits for twenty quotes. A quote older than BUY_KEEP_MS is not shown.
const buys = new Map<string, Buy>();
const BUY_KEEP_MS = 90_000;
let buyRefresh: Promise<void> | null = null;
// True once the first round of buy quotes after a restart has finished. Pings wait for it, so they never
// judge a verdict without buy prices; lookups do not wait.
let firstBuyRoundDone = false;

export function buysReady() {
  return firstBuyRoundDone;
}

// Every mint in one call, kept 5 minutes: multipliers rarely change, and a pause is noticed within minutes.
async function mintRebases() {
  if (rebaseCache && Date.now() - rebaseCache.at < 5 * 60_000) return rebaseCache.rows;
  const urls = [config.rpcUrl, "https://api.mainnet-beta.solana.com"];
  for (const url of urls) {
    try {
      const { data } = await axios.post(
        url,
        {
          jsonrpc: "2.0",
          id: 1,
          method: "getMultipleAccounts",
          params: [TOKENIZED_STOCKS.map((token) => token.mint), { encoding: "jsonParsed" }],
        },
        { timeout: 12_000, headers: { "content-type": "application/json" } },
      );
      const value = data?.result?.value as
        | Array<{
            data?: {
              parsed?: {
                info?: {
                  decimals?: number;
                  supply?: string;
                  extensions?: Array<{
                    extension?: string;
                    state?: {
                      multiplier?: string;
                      newMultiplier?: string;
                      newMultiplierEffectiveTimestamp?: number;
                      paused?: boolean;
                    };
                  }>;
                };
              };
            };
          } | null>
        | undefined;
      if (!Array.isArray(value)) continue;
      const nowSec = Date.now() / 1000;
      const rows = new Map<string, MintInfo>();
      TOKENIZED_STOCKS.forEach((token, index) => {
        const info = value[index]?.data?.parsed?.info;
        const scaled = info?.extensions?.find((ext) => ext.extension === "scaledUiAmountConfig")?.state;
        const pausable = info?.extensions?.find((ext) => ext.extension === "pausableConfig")?.state;
        rows.set(token.mint, {
          rebase: pendingRebase(scaled, nowSec),
          decimals: typeof info?.decimals === "number" ? info.decimals : null,
          multiplier: info ? currentMultiplier(scaled, nowSec) : null,
          // A mint without the pause extension cannot be paused.
          paused: info ? pausable?.paused === true : null,
          supplyRaw: typeof info?.supply === "string" && /^\d+$/.test(info.supply) ? info.supply : null,
        });
      });
      rebaseCache = { at: Date.now(), rows };
      return rows;
    } catch {
      continue;
    }
  }
  return rebaseCache?.rows ?? new Map();
}

/**
 * Each mint as last read on chain (at most 5 minutes old), and when that read happened (null before the first read).
 * The issuer flow alerts (services/flows.ts) take the supply from here, so they cost no extra request.
 */
export async function mintSupplies(): Promise<{ at: number | null; rows: Map<string, MintInfo> }> {
  const rows = await mintRebases();
  return { at: rebaseCache?.at ?? null, rows };
}

/** Whether each token's transfers are paused on chain, by symbol; null for a mint that could not be read. */
export async function pauseFlags(): Promise<Map<string, boolean | null>> {
  const rows = await mintRebases();
  return new Map(TOKENIZED_STOCKS.map((token) => [token.symbol, rows.get(token.mint)?.paused ?? null]));
}

async function jupiterMap() {
  const ids = TOKENIZED_STOCKS.map((token) => token.mint).join(",");
  return jupiterGet<Record<string, { usdPrice?: number; liquidity?: number; priceChange24h?: number; stockData?: { price?: number; updatedAt?: string } }>>(
    "/price/v3",
    { ids },
    { maxWaitMs: 6000, timeoutMs: 12_000 },
  );
}

async function geckoPrices() {
  const ids = TOKENIZED_STOCKS.map((token) => token.mint).join(",");
  const { data } = await axios.get(
    `https://api.geckoterminal.com/api/v2/simple/networks/solana/token_price/${ids}`,
    { headers: { accept: "application/json", "user-agent": "xStocksDesk/1.0" }, timeout: 12_000 },
  );
  return (data?.data?.attributes?.token_prices ?? null) as Record<string, string> | null;
}

async function onePrint(symbol: string): Promise<StockPrint | string> {
  try {
    const { data } = await axios.get(nasdaqQuoteUrl(symbol), {
      headers: { accept: "application/json", "user-agent": "Mozilla/5.0" },
      timeout: 12_000,
    });
    const price = Number(String(data?.data?.primaryData?.lastSalePrice ?? "").replace(/[$,]/g, ""));
    if (!Number.isFinite(price) || price <= 0) return "no price in the answer";
    return { price, state: String(data?.data?.marketStatus ?? "") };
  } catch (err) {
    return axios.isAxiosError(err) && err.response ? `HTTP ${err.response.status}` : err instanceof Error ? err.message : "request failed";
  }
}

/** Prints still young enough to show: read within PRINT_KEEP_MS. */
export function freshPrints(rows: Map<string, StockPrint & { at: number }>, now: number, keepMs = PRINT_KEEP_MS) {
  const out: Record<string, StockPrint> = {};
  for (const [symbol, row] of rows) if (now - row.at <= keepMs) out[symbol] = { price: row.price, state: row.state };
  return out;
}

let printsRefresh: Promise<void> | null = null;

/** Asks Nasdaq for every symbol at once (each answer takes about 3 s, so one by one would be slow). Returns the failures. */
async function fetchPrints(symbols: string[]) {
  const rows = await Promise.all(symbols.map((symbol) => onePrint(symbol)));
  const failed: { symbol: string; reason: string }[] = [];
  rows.forEach((row, index) => {
    if (typeof row === "string") failed.push({ symbol: symbols[index], reason: row });
    else prints.set(symbols[index], { ...row, at: Date.now() });
  });
  return failed;
}

/** One round of prints; symbols that fail are asked once more a second later. */
async function refreshPrints() {
  const symbols = [...new Set(TOKENIZED_STOCKS.map((token) => token.underlying).filter(Boolean))] as string[];
  let failed = await fetchPrints(symbols);
  if (failed.length > 0) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    failed = await fetchPrints(failed.map((row) => row.symbol));
  }
  if (failed.length > 0) console.warn(`Nasdaq: no print this round for ${failed.map((row) => `${row.symbol} (${row.reason})`).join(", ")}`);
}

/**
 * Nasdaq prints, refreshed every 3 minutes in the background. Only the first read after a restart waits
 * for them; later reads answer at once with the prints already held while the refresh runs.
 */
async function stockPrints() {
  if (Date.now() - printsReadAt >= PRINTS_TTL_MS && !printsRefresh) {
    printsReadAt = Date.now();
    printsRefresh = refreshPrints().finally(() => {
      printsRefresh = null;
    });
  }
  const held = freshPrints(prints, Date.now());
  if (Object.keys(held).length === 0 && printsRefresh) {
    await printsRefresh;
    return freshPrints(prints, Date.now());
  }
  return held;
}

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export type Fill = Buy & { shares: number };

/**
 * A USDC buy of `usd` dollars, priced per share. Jupiter's outAmount is in on-chain units; a wallet shows
 * them times the multiplier, and one shown token tracks one share (the same unit as Jupiter's usdPrice
 * and the Nasdaq print). Null when Jupiter has no route or is rate limited.
 */
async function quoteBuy(mint: string, usd: number, info: MintInfo, maxWaitMs: number): Promise<Fill | null> {
  if (typeof info.decimals !== "number") return null;
  const data = await jupiterGet<{ outAmount?: string; priceImpactPct?: string }>(
    "/swap/v1/quote",
    { inputMint: USDC_MINT, outputMint: mint, amount: String(Math.round(usd * 1e6)), slippageBps: "50" },
    { maxWaitMs, timeoutMs: 8_000 },
  );
  const impactFrac = Number(data?.priceImpactPct);
  const fill = perShareFill(usd, Number(data?.outAmount), info.decimals, info.multiplier);
  if (!fill || !Number.isFinite(impactFrac) || impactFrac < 0) return null;
  return { price: fill.price, shares: fill.shares, impactPct: impactFrac * 100, at: Date.now() };
}

/** The $1,000 buy the verdict uses. Null when the answer is more than 5x away from the last trade. */
async function oneBuy(quote: DeskQuote, info: MintInfo, maxWaitMs = 6000): Promise<Buy | null> {
  const fill = await quoteBuy(quote.mint, 1000, info, maxWaitMs);
  if (!fill) return null;
  const usdPrice = quote.usdPrice;
  if (usdPrice != null && usdPrice > 0 && (fill.price > usdPrice * 5 || fill.price < usdPrice / 5)) return null;
  return { price: fill.price, impactPct: fill.impactPct, at: fill.at };
}

/** A round's pace: a little slower than Jupiter's 2.1 s, so a /size or a card asked meanwhile still finds a slot. */
const ROUND_GAP_MS = 2_600;
/** A longer pause (after a 429) ends the round; the next round, a minute later, starts again from the oldest quote. */
const ROUND_MAX_PAUSE_MS = 30_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Quotes every name once, one request at a time, oldest quote first, about a minute per round. When Jupiter's 10 s window
 * is used up the round waits for it to reopen and carries on (it used to stop there, so a round covered only about four
 * names). Each fresh quote is offered to the site as the round goes (shareBuys sends at most every 25 s).
 */
async function refreshBuys(quotes: DeskQuote[], mints: Map<string, MintInfo>) {
  const order = [...quotes].sort((a, b) => (buys.get(a.mint)?.at ?? 0) - (buys.get(b.mint)?.at ?? 0));
  for (const quote of order) {
    if (quote.poolUsd != null && quote.poolUsd < THIN_POOL_USD) continue;
    const info = mints.get(quote.mint);
    if (!info || typeof info.decimals !== "number") continue;
    const pause = jupiterPauseLeft();
    if (pause > ROUND_MAX_PAUSE_MS) break;
    if (pause > 0) await sleep(pause);
    const started = Date.now();
    const buy = await oneBuy(quote, info);
    if (buy) {
      buys.set(quote.mint, buy);
      void shareBuys(buys);
    }
    const rest = ROUND_GAP_MS - (Date.now() - started);
    if (rest > 0) await sleep(rest);
  }
}

/** Two rounds never start closer together than this, whatever ended the first one early. */
const ROUND_MIN_MS = 30_000;
let roundTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Starts a round unless one is running. When a round ends the next one follows by itself (14 Nov 2026). Before, a new
 * round began only when prices were reloaded, once a minute and only if the last round had finished: a round takes
 * about a minute, so the next usually missed its turn, rounds ran every 100 to 140 s, and for part of that time most
 * buys were older than the 90 s a verdict accepts. Now each name is quoted about once a minute.
 */
function startBuyRefresh(quotes: DeskQuote[], mints: Map<string, MintInfo>) {
  if (!buyRefresh) {
    const startedAt = Date.now();
    if (roundTimer) clearTimeout(roundTimer);
    roundTimer = null;
    buyRefresh = refreshBuys(quotes, mints)
      .catch((err) => console.error("Buy quotes failed:", err instanceof Error ? err.message : err))
      .finally(() => {
        buyRefresh = null;
        firstBuyRoundDone = true;
        // The site shows these too (services/shareBuys.ts); it never throws and never holds up the next round.
        void shareBuys(buys);
        // The next round: after Jupiter's pause if there is one, and only while prices are still being loaded
        // (a bot that stopped loading prices stops quoting too).
        const wait = Math.max(1_000, ROUND_MIN_MS - (Date.now() - startedAt), jupiterPauseLeft());
        roundTimer = setTimeout(() => {
          roundTimer = null;
          if (cache && rebaseCache && Date.now() - cache.at < STALE_OK_MS) void startBuyRefresh(cache.quotes, rebaseCache.rows);
        }, wait);
        roundTimer.unref();
      });
  }
  return buyRefresh;
}

/** Puts the latest buy quotes on the rows; a quote older than BUY_KEEP_MS is left off. */
function withBuys(quotes: DeskQuote[]): DeskQuote[] {
  const now = Date.now();
  return quotes.map((quote) => {
    const buy = buys.get(quote.mint);
    const usable = buy && now - buy.at <= BUY_KEEP_MS ? buy : null;
    return {
      ...quote,
      buyPrice: usable?.price ?? null,
      buyImpactPct: usable?.impactPct ?? null,
      buyAt: usable?.at ?? null,
    };
  });
}

async function loadQuotes(): Promise<DeskQuote[]> {
  const [jupiter, gecko, stocks, rebases] = await Promise.all([
    jupiterMap().catch(() => null),
    geckoPrices().catch(() => null),
    stockPrints().catch(() => freshPrints(prints, Date.now())),
    mintRebases().catch(() => rebaseCache?.rows ?? new Map()),
  ]);
  const state = Object.values(stocks).find((row) => row.state)?.state ?? null;
  const base: DeskQuote[] = TOKENIZED_STOCKS.map((token) => {
    const fromJup = jupiter?.[token.mint];
    const geckoPrice = gecko?.[token.mint] != null ? Number(gecko[token.mint]) : null;
    const issuerRaw = Number(fromJup?.stockData?.price);
    const issuerAt = Date.parse(fromJup?.stockData?.updatedAt ?? "");
    const usdPrice =
      typeof fromJup?.usdPrice === "number"
        ? fromJup.usdPrice
        : geckoPrice != null && Number.isFinite(geckoPrice)
          ? geckoPrice
          : null;
    return {
      symbol: token.symbol,
      name: token.name.replace(/ (xStock|by Backpack)$/, ""),
      issuer: token.issuer,
      mint: token.mint,
      underlying: token.underlying ?? token.symbol,
      usdPrice,
      stockPrice: token.underlying ? (stocks[token.underlying]?.price ?? null) : null,
      // When that print was read: a verdict does not rest on one older than PRINT_STALE_MS (verdict.ts).
      printAt: token.underlying && stocks[token.underlying] ? (prints.get(token.underlying)?.at ?? null) : null,
      marketState: (token.underlying && stocks[token.underlying]?.state) || state,
      issuerPrice: Number.isFinite(issuerRaw) && issuerRaw > 0 ? issuerRaw : null,
      issuerAt: Number.isFinite(issuerAt) ? issuerAt : null,
      buyPrice: null,
      buyImpactPct: null,
      buyAt: null,
      rebase: rebases.get(token.mint)?.rebase ?? null,
      poolUsd: typeof fromJup?.liquidity === "number" && Number.isFinite(fromJup.liquidity) ? fromJup.liquidity : null,
      change24h: typeof fromJup?.priceChange24h === "number" ? fromJup.priceChange24h : null,
      sharesPerToken: rebases.get(token.mint)?.multiplier ?? null,
    };
  });
  void startBuyRefresh(base, rebases);
  if (!base.some((quote) => quote.usdPrice != null)) {
    if (cache) return cache.quotes;
    return [];
  }
  cache = { at: Date.now(), quotes: base };
  return base;
}

const FRESH_MS = 45_000;
const STALE_OK_MS = 5 * 60_000;

/**
 * Every tracked name, with prices cached for 45 s and the newest buy quotes added on each call.
 * `allowStale` (chat lookups) answers at once with prices up to 5 minutes old and refreshes in the
 * background; the ping loop leaves it off and waits for fresh prices. The cron refreshes every minute,
 * so lookups normally see prices under a minute old.
 */
export async function getDeskQuotes(options: { allowStale?: boolean } = {}) {
  const age = cache ? Date.now() - cache.at : Number.POSITIVE_INFINITY;
  if (cache && age < FRESH_MS) return withBuys(cache.quotes);
  if (!inflight) {
    inflight = loadQuotes().finally(() => {
      inflight = null;
    });
  }
  if (options.allowStale && cache && age < STALE_OK_MS) {
    inflight.catch(() => {});
    return withBuys(cache.quotes);
  }
  return withBuys(await inflight);
}

/** One name for a chat lookup: answers at once when recent prices are held. */
export async function getDeskQuote(symbol: string) {
  const quotes = await getDeskQuotes({ allowStale: true });
  return quotes.find((quote) => quote.symbol === symbol) ?? null;
}

/**
 * A rolling limit: at most `limit` grants in any `windowMs`. Pure, so the tests can play a busy minute.
 */
export function rollingLimit(limit: number, windowMs: number) {
  const times: number[] = [];
  return {
    take(now = Date.now()) {
      while (times.length > 0 && now - times[0] >= windowMs) times.shift();
      if (times.length >= limit) return false;
      times.push(now);
      return true;
    },
  };
}

/*
 * Quotes people ask for (a size check, a card whose $1,000 buy is not in yet) share Jupiter's one request every two
 * seconds with the background round, which needs 23 of the 28 slots in a minute. On 14 Nov 2026 a simulation showed
 * one size check every 2 s leaving the round 3 of its 70 quotes in three minutes: every verdict went to "Checking", Fair
 * pings stopped and the site lost the bot's buys. So people's quotes are rationed: USER_QUOTES_PER_MIN in any minute
 * for everyone together, one every USER_QUOTE_EVERY_MS per person (so one person takes at most a third of the ration),
 * and a slot must be free within USER_SLOT_WAIT_MS. That wait plus one gap (2.1 s) stays under the 6 s the round itself
 * waits, so the round never misses its slot.
 */
export const USER_QUOTES_PER_MIN = 6;
export const USER_QUOTE_EVERY_MS = 30_000;
const USER_SLOT_WAIT_MS = 3_500;
const userQuotes = rollingLimit(USER_QUOTES_PER_MIN, 60_000);
const lastUserQuote = new Map<number, number>();

const CARD_BUY_WAIT_MS = USER_SLOT_WAIT_MS;

/**
 * One name for a card. When its $1,000 buy is not fresh (the background round has not reached it), it is quoted right
 * away, waiting at most CARD_BUY_WAIT_MS for a Jupiter slot, and kept for everything else too. Thin pools are never
 * quoted, nothing is asked while Jupiter is cooling down after a 429, and these quotes count toward the minute's
 * ration for people's quotes (the card then says the buy is still loading, as before).
 */
export async function getDeskQuoteNow(symbol: string) {
  const quote = await getDeskQuote(symbol);
  if (!quote || quote.buyAt != null || quote.usdPrice == null) return quote;
  if (quote.poolUsd != null && quote.poolUsd < THIN_POOL_USD) return quote;
  if (jupiterPaused()) return quote;
  const info = rebaseCache?.rows.get(quote.mint);
  if (!info || typeof info.decimals !== "number") return quote;
  if (!userQuotes.take()) return quote;
  const buy = await oneBuy(quote, info, CARD_BUY_WAIT_MS).catch(() => null);
  if (!buy) return quote;
  buys.set(quote.mint, buy);
  return { ...quote, buyPrice: buy.price, buyImpactPct: buy.impactPct, buyAt: buy.at };
}

/** When each feed last came in, for the health checks (services/health.ts). */
export function deskHealth() {
  let printsAt: number | null = null;
  for (const row of prints.values()) if (printsAt == null || row.at > printsAt) printsAt = row.at;
  return { quotesAt: cache?.at ?? null, printsAt, mintsAt: rebaseCache?.at ?? null };
}

export function describe(quote: DeskQuote) {
  return tradeVerdict(quote);
}

export const SIZE_MIN_USD = 10;
export const SIZE_MAX_USD = 250_000;

export type SizeResult =
  | { ok: true; quote: DeskQuote; usd: number; shares: number; price: number; impactPct: number; at: number }
  | { ok: false; message: string };

/** The same name and amount asked again within this time gets the same answer, without asking Jupiter. */
const SIZE_CACHE_MS = 20_000;
const sizeCache = new Map<string, Fill>();
const sizeInflight = new Map<string, Promise<Fill | null>>();

/**
 * /size: what a buy of `usd` dollars of one name really costs per share, from a Jupiter quote.
 * `user`: the person asking (their Telegram ID); their quotes are rationed (see USER_QUOTES_PER_MIN), and a $1,000
 * check is answered from the background round's own quote while that is fresh. `live`: always a quote taken now
 * (size alerts, which must not fire on the round's quote).
 */
export async function sizeQuote(symbol: string, usd: number, options: { user?: number; live?: boolean } = {}): Promise<SizeResult> {
  const amount = Math.round(usd);
  if (!Number.isFinite(amount) || amount < SIZE_MIN_USD || amount > SIZE_MAX_USD) {
    return { ok: false, message: "Pick an amount from $10 to $250,000." };
  }
  const quote = await getDeskQuote(symbol);
  const info = (rebaseCache?.rows ?? (await mintRebases())).get(quote?.mint ?? "");
  if (!quote || quote.usdPrice == null || !info || typeof info.decimals !== "number") {
    return { ok: false, message: "Prices are still loading. Try again in a minute." };
  }
  const done = (fill: Fill): SizeResult => ({ ok: true, quote, usd: amount, shares: fill.shares, price: fill.price, impactPct: fill.impactPct, at: fill.at });
  const busy: SizeResult = { ok: false, message: "Jupiter is busy or has no route for this size. Try again in a minute." };
  const key = `${quote.mint}:${amount}`;
  const now = Date.now();

  const cached = sizeCache.get(key);
  if (cached && now - cached.at < SIZE_CACHE_MS) return done(cached);
  // $1,000 is the size the background round quotes for every name: while its quote is fresh, that is the answer.
  if (!options.live && amount === 1000 && quote.buyPrice != null && quote.buyPrice > 0 && quote.buyAt != null) {
    return done({ price: quote.buyPrice, shares: amount / quote.buyPrice, impactPct: quote.buyImpactPct ?? 0, at: quote.buyAt });
  }

  let pending = sizeInflight.get(key);
  if (!pending) {
    if (options.user != null) {
      const last = lastUserQuote.get(options.user);
      if (last != null && now - last < USER_QUOTE_EVERY_MS) {
        return { ok: false, message: `One live size check every ${USER_QUOTE_EVERY_MS / 1000} seconds. Try again in ${Math.max(1, Math.ceil((USER_QUOTE_EVERY_MS - (now - last)) / 1000))} s.` };
      }
      if (jupiterPaused(now)) return busy;
      if (!userQuotes.take(now)) return { ok: false, message: "A lot of size checks are being asked right now. Try again in a minute." };
      if (lastUserQuote.size > 5000) lastUserQuote.clear();
      lastUserQuote.set(options.user, now);
    }
    pending = quoteBuy(quote.mint, amount, info, options.user != null ? USER_SLOT_WAIT_MS : 10_000)
      .catch(() => null)
      .finally(() => sizeInflight.delete(key));
    sizeInflight.set(key, pending);
  }
  const fill = await pending;
  if (!fill) return busy;
  if (sizeCache.size > 500) sizeCache.clear();
  sizeCache.set(key, fill);
  return done(fill);
}
