// Desk quotes: token price (Jupiter, GeckoTerminal fallback), Nasdaq print, issuer mark,
// share multiplier and pending rebase, and a live $1,000 USDC buy quote. Server-only.
// The logic follows the bot's src/services/desk.ts, with two additions the desk shows:
// the 24h change and the shares-per-token multiplier (both from Jupiter's price API).
//
// Buy quotes are refreshed in rotation, a few per load and the oldest first, because Jupiter's
// rate limit cannot take 19 quotes at once (see jupiter.ts). Only loads asked for by the browser's
// polling refresh them; the server-rendered first page uses what is already there, so it stays fast.

import { ETF_UNDERLYINGS, NO_PRINT_UNDERLYING, TOKEN_BY_SYMBOL, TOKENS, USDC_MINT } from "../lib/tokens";
import type { Quote, QuotesResult, Rebase, SizeCheck } from "../lib/types";
import { getJson } from "./http";
import { hasJupiterKey, jupiterGet } from "./jupiter";

type JupiterPrice = {
  usdPrice?: number;
  priceChange24h?: number;
  decimals?: number;
  stockData?: { price?: number; updatedAt?: string };
  scaledUiConfig?: { multiplier?: number; newMultiplier?: number; newMultiplierEffectiveAt?: string };
};

type StockPrint = { price: number; state: string };
export type Buy = { price: number; impactPct: number; at: number };

const QUOTES_TTL_MS = 8_000;
const BUY_KEEP_MS = 120_000;

let quotesCache: { at: number; quotes: Quote[] } | null = null;
let inflight: Promise<Quote[]> | null = null;
// Nasdaq prints by symbol, each with the time it was read. A symbol whose request fails keeps its last
// good print for PRINT_KEEP_MS, so one dropped request does not blank a card. Same rule as the bot.
const prints = new Map<string, StockPrint & { at: number }>();
let printsReadAt = 0;
const PRINTS_TTL_MS = 180_000;
const PRINT_KEEP_MS = 30 * 60_000;
const buys = new Map<string, Buy>();
const decimalsByMint = new Map<string, number>();

/**
 * Buy quotes per refresh: 5 with a Jupiter key (1 request/s), 3 without (0.5 request/s). With a key, 18 names
 * take 4 refreshes (about 80 s at one refresh per ~20 s), inside the 90 s a buy stays usable. Budget, per
 * minute: at most 6 refreshes x (1 price + 5 buys) = 36 for the site, plus about 19 for the bot, under the 60
 * a free key allows for the whole organisation.
 */
export function buysPerRefresh() {
  return hasJupiterKey() ? 5 : 3;
}

/** The mints whose buy quote is oldest (missing first), limited to `count`. */
export function stalestMints(mints: string[], current: Map<string, Buy>, count: number) {
  return [...mints].sort((a, b) => (current.get(a)?.at ?? 0) - (current.get(b)?.at ?? 0)).slice(0, Math.max(0, count));
}

export async function jupiterPrices(mints: string[], maxWaitMs = 5000): Promise<Record<string, JupiterPrice> | null> {
  return jupiterGet<Record<string, JupiterPrice>>(`/price/v3?ids=${mints.join(",")}`, { maxWaitMs });
}

async function geckoPrices() {
  const ids = TOKENS.map((token) => token.mint).join(",");
  const data = await getJson<{ data?: { attributes?: { token_prices?: Record<string, string> } } }>(
    `https://api.geckoterminal.com/api/v2/simple/networks/solana/token_price/${ids}`,
    { headers: { accept: "application/json", "user-agent": "ParDesk/1.0" } },
  );
  return data?.data?.attributes?.token_prices ?? null;
}

async function onePrint(symbol: string): Promise<StockPrint | string> {
  try {
    const assetClass = ETF_UNDERLYINGS.has(symbol) ? "etf" : "stocks";
    const data = await getJson<{ data?: { primaryData?: { lastSalePrice?: string }; marketStatus?: string } }>(
      `https://api.nasdaq.com/api/quote/${symbol}/info?assetclass=${assetClass}`,
      { headers: { accept: "application/json", "user-agent": "Mozilla/5.0" } },
    );
    const price = Number(String(data?.data?.primaryData?.lastSalePrice ?? "").replace(/[$,]/g, ""));
    if (!Number.isFinite(price) || price <= 0) return "no price in the answer";
    return { price, state: String(data?.data?.marketStatus ?? "") };
  } catch (error) {
    return error instanceof Error ? error.message : "request failed";
  }
}

/** Prints still young enough to show: read within PRINT_KEEP_MS. */
export function freshPrints(rows: Map<string, StockPrint & { at: number }>, now: number, keepMs = PRINT_KEEP_MS) {
  const out: Record<string, StockPrint> = {};
  for (const [symbol, row] of rows) if (now - row.at <= keepMs) out[symbol] = { price: row.price, state: row.state };
  return out;
}

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
  const symbols = [...new Set(TOKENS.map((token) => token.underlying))].filter((symbol) => symbol !== NO_PRINT_UNDERLYING);
  let failed = await fetchPrints(symbols);
  if (failed.length > 0) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    failed = await fetchPrints(failed.map((row) => row.symbol));
  }
  if (failed.length > 0) console.warn(`[par] Nasdaq: no print this round for ${failed.map((row) => `${row.symbol} (${row.reason})`).join(", ")}`);
}

/** Nasdaq prints, refreshed every 3 minutes. */
async function stockPrints() {
  if (Date.now() - printsReadAt < PRINTS_TTL_MS) return freshPrints(prints, Date.now());
  printsReadAt = Date.now();
  await refreshPrints();
  return freshPrints(prints, Date.now());
}

/**
 * Multiplier in force now, and the next change if it is still ahead. Same rule as the bot's pendingRebase.
 * Jupiter leaves scaledUiConfig out for tokens whose multiplier never changed, so no config means 1 share per token
 * (the published desk showed 1 for those too).
 */
function multiplierNow(config: JupiterPrice["scaledUiConfig"], now: number): { shares: number | null; rebase: Rebase | null } {
  if (!config) return { shares: 1, rebase: null };
  const current = Number(config.multiplier);
  const next = Number(config.newMultiplier);
  const atMs = Date.parse(config.newMultiplierEffectiveAt ?? "");
  const validCurrent = Number.isFinite(current) && current > 0;
  const validNext = Number.isFinite(next) && next > 0;
  if (!validCurrent) return { shares: validNext && Number.isFinite(atMs) && atMs <= now ? next : null, rebase: null };
  if (!validNext || !Number.isFinite(atMs)) return { shares: current, rebase: null };
  if (atMs <= now) return { shares: next, rebase: null };
  if (Math.abs(next - current) / current < 1e-8) return { shares: current, rebase: null };
  return {
    shares: current,
    rebase: { at: Math.floor(atMs / 1000), next, current, direction: next > current ? "up" : "down" },
  };
}

/**
 * Shares received and the price paid per share. The pool trades on-chain units; a wallet shows each unit
 * multiplied by the token's multiplier (splits and reinvested dividends), and one shown token tracks one share.
 * Jupiter's usdPrice and the Nasdaq print are per share too, so this is what the buy is compared with.
 */
export function perShareFill(usd: number, outRaw: number, decimals: number, multiplier: number | null) {
  const shares = (outRaw / 10 ** decimals) * (multiplier != null && multiplier > 0 ? multiplier : 1);
  const price = usd / shares;
  return Number.isFinite(shares) && shares > 0 && Number.isFinite(price) && price > 0 ? { shares, price } : null;
}

export type Fill = Buy & { shares: number };

/** A USDC → token quote for `usd` dollars, priced per share. Null when Jupiter has none or is rate limited. */
async function quoteBuy(mint: string, usd: number, decimals: number, multiplier: number | null, maxWaitMs: number): Promise<Fill | null> {
  const params = new URLSearchParams({ inputMint: USDC_MINT, outputMint: mint, amount: String(Math.round(usd * 1e6)), slippageBps: "50" });
  const data = await jupiterGet<{ outAmount?: string; priceImpactPct?: string }>(`/swap/v1/quote?${params}`, { maxWaitMs });
  if (!data) return null;
  const impactFrac = Number(data.priceImpactPct);
  const fill = perShareFill(usd, Number(data.outAmount), decimals, multiplier);
  if (!fill || !Number.isFinite(impactFrac) || impactFrac < 0) return null;
  return { price: fill.price, shares: fill.shares, impactPct: impactFrac * 100, at: Date.now() };
}

/** The $1,000 buy the verdict uses. Null when the answer is more than 5x away from the last trade. */
async function oneBuy(quote: Quote): Promise<Buy | null> {
  const fill = await quoteBuy(quote.mint, 1000, decimalsByMint.get(quote.mint) as number, quote.sharesPerToken, 3000);
  if (!fill) return null;
  const usdPrice = quote.usdPrice;
  if (usdPrice != null && usdPrice > 0 && (fill.price > usdPrice * 5 || fill.price < usdPrice / 5)) return null;
  return { price: fill.price, impactPct: fill.impactPct, at: fill.at };
}

/** Refreshes the oldest few buy quotes, one after another so Jupiter's per-second limit holds. */
async function rotateBuys(base: Quote[]) {
  const byMint = new Map(base.map((quote) => [quote.mint, quote]));
  // SpaceX has no Nasdaq print, so its buy could never be compared; it is not quoted.
  const candidates = base
    .filter((quote) => quote.usdPrice != null && quote.underlying !== NO_PRINT_UNDERLYING && decimalsByMint.has(quote.mint))
    .map((quote) => quote.mint);
  for (const mint of stalestMints(candidates, buys, buysPerRefresh())) {
    const buy = await oneBuy(byMint.get(mint) as Quote);
    if (buy) buys.set(mint, buy);
  }
  const now = Date.now();
  for (const [mint, buy] of buys) if (now - buy.at > BUY_KEEP_MS) buys.delete(mint);
}

async function loadQuotes(refreshBuys: boolean): Promise<Quote[]> {
  const [jupiter, gecko, stocks] = await Promise.all([
    jupiterPrices(TOKENS.map((token) => token.mint)),
    geckoPrices().catch(() => {
      console.warn("[par] GeckoTerminal: no prices this round");
      return null;
    }),
    stockPrints().catch(() => freshPrints(prints, Date.now())),
  ]);
  const now = Date.now();
  const sessionState = Object.values(stocks).find((row) => row.state)?.state ?? null;

  const base: Quote[] = TOKENS.map((token) => {
    const jup = jupiter?.[token.mint];
    const geckoPrice = gecko?.[token.mint] != null ? Number(gecko[token.mint]) : null;
    const issuerRaw = Number(jup?.stockData?.price);
    const issuerAt = Date.parse(jup?.stockData?.updatedAt ?? "");
    if (typeof jup?.decimals === "number") decimalsByMint.set(token.mint, jup.decimals);
    const { shares, rebase } = jup ? multiplierNow(jup.scaledUiConfig, now) : { shares: null, rebase: null };
    const usdPrice =
      typeof jup?.usdPrice === "number"
        ? jup.usdPrice
        : geckoPrice != null && Number.isFinite(geckoPrice)
          ? geckoPrice
          : null;
    const print = token.underlying === NO_PRINT_UNDERLYING ? undefined : stocks[token.underlying];
    return {
      symbol: token.symbol,
      name: token.name,
      sector: token.sector,
      underlying: token.underlying,
      mint: token.mint,
      usdPrice,
      change24h: typeof jup?.priceChange24h === "number" ? jup.priceChange24h : null,
      stockPrice: print?.price ?? null,
      marketState: print?.state || sessionState,
      sharesPerToken: shares,
      buyPrice: null,
      buyImpactPct: null,
      buyAt: null,
      issuerPrice: Number.isFinite(issuerRaw) && issuerRaw > 0 ? issuerRaw : null,
      issuerAt: Number.isFinite(issuerAt) ? issuerAt : null,
      rebase,
    };
  });

  if (refreshBuys) await rotateBuys(base);
  const quotes = base.map((quote) => {
    const buy = buys.get(quote.mint);
    return { ...quote, buyPrice: buy?.price ?? null, buyImpactPct: buy?.impactPct ?? null, buyAt: buy?.at ?? null };
  });
  if (!quotes.some((quote) => quote.usdPrice != null)) {
    console.warn("[par] Quotes: no token price from Jupiter or GeckoTerminal");
    if (quotesCache) return quotesCache.quotes;
    return [];
  }
  quotesCache = { at: Date.now(), quotes };
  return quotes;
}

/**
 * Cached for 8 s; concurrent callers share one load. `refreshBuys` (the browser's polling) also moves
 * the buy-quote rotation on; without it the load only reads prices and reuses the buy quotes it has.
 */
export async function deskQuotes(options: { refreshBuys?: boolean } = {}): Promise<Quote[]> {
  if (quotesCache && Date.now() - quotesCache.at < QUOTES_TTL_MS) return quotesCache.quotes;
  if (inflight) return inflight;
  inflight = loadQuotes(options.refreshBuys === true).finally(() => {
    inflight = null;
  });
  return inflight;
}

export const SIZE_MIN_USD = 10;
export const SIZE_MAX_USD = 250_000;
const SIZE_CACHE_MS = 20_000;
const sizeCache = new Map<string, { at: number; result: SizeCheck }>();

/**
 * Size check: what a buy of `usd` dollars of one name really costs per share, from a live Jupiter quote at that size.
 * Answers are shared for 20 s per name and amount, so repeated clicks do not use up Jupiter's rate limit.
 */
export async function sizeCheck(symbol: string, usd: number): Promise<SizeCheck> {
  const token = TOKEN_BY_SYMBOL.get(symbol);
  if (!token) return { ok: false, message: "Pick one of the names on the desk." };
  const amount = Math.round(usd);
  if (!Number.isFinite(amount) || amount < SIZE_MIN_USD || amount > SIZE_MAX_USD) {
    return { ok: false, message: "Pick an amount from $10 to $250,000." };
  }
  const key = `${token.mint}:${amount}`;
  const cached = sizeCache.get(key);
  if (cached && Date.now() - cached.at < SIZE_CACHE_MS) return cached.result;

  const quote = (await deskQuotes()).find((row) => row.mint === token.mint);
  const decimals = decimalsByMint.get(token.mint);
  if (!quote || quote.usdPrice == null || decimals == null) {
    return { ok: false, message: "Prices are still loading. Try again in a few seconds." };
  }
  const fill = await quoteBuy(token.mint, amount, decimals, quote.sharesPerToken, 4000);
  if (!fill) return { ok: false, message: "Jupiter is busy or has no route for this size. Try again in a few seconds." };
  const result: SizeCheck = {
    ok: true,
    symbol: token.symbol,
    usd: amount,
    shares: fill.shares,
    price: fill.price,
    impactPct: fill.impactPct,
    lastTrade: quote.usdPrice,
    stockPrice: token.underlying === NO_PRINT_UNDERLYING ? null : quote.stockPrice,
    marketState: quote.marketState,
    at: fill.at,
  };
  const now = Date.now();
  for (const [entry, value] of sizeCache) if (now - value.at >= SIZE_CACHE_MS) sizeCache.delete(entry);
  sizeCache.set(key, { at: now, result });
  return result;
}

export async function quotesResult(options: { refreshBuys?: boolean } = {}): Promise<QuotesResult> {
  try {
    const quotes = await deskQuotes(options);
    if (quotes.length === 0) return { ok: false, quotes: [], asOf: Date.now(), message: "Price feed paused." };
    return { ok: true, quotes, asOf: Date.now() };
  } catch (error) {
    console.warn(`[par] Quotes failed: ${error instanceof Error ? error.message : "unknown error"}`);
    return { ok: false, quotes: [], asOf: Date.now(), message: "Price feed paused." };
  }
}
