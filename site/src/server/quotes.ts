// Desk quotes: token price (Jupiter, GeckoTerminal fallback), Nasdaq print, issuer mark,
// share multiplier and pending rebase, and a live $1,000 USDC buy quote. Server-only.
// The logic follows the bot's src/services/desk.ts, with two additions the desk shows:
// the 24h change and the shares-per-token multiplier (both from Jupiter's price API).
//
// Buy quotes are refreshed in rotation, a few per load and the oldest first, because Jupiter's
// rate limit cannot take 19 quotes at once (see jupiter.ts). Only loads asked for by the browser's
// polling refresh them; the server-rendered first page uses what is already there, so it stays fast.

import { ETF_UNDERLYINGS, NO_PRINT_UNDERLYING, TOKENS, USDC_MINT } from "../lib/tokens";
import type { Quote, QuotesResult, Rebase } from "../lib/types";
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
let stockCache: { at: number; stocks: Record<string, StockPrint> } | null = null;
const buys = new Map<string, Buy>();
const decimalsByMint = new Map<string, number>();

/** Buy quotes per refresh: 4 with a Jupiter key (1 request/s), 3 without (0.5 request/s). */
export function buysPerRefresh() {
  return hasJupiterKey() ? 4 : 3;
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

async function stockPrints() {
  if (stockCache && Date.now() - stockCache.at < 180_000) return stockCache.stocks;
  const symbols = [...new Set(TOKENS.map((token) => token.underlying))].filter((symbol) => symbol !== NO_PRINT_UNDERLYING);
  const rows = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const assetClass = ETF_UNDERLYINGS.has(symbol) ? "etf" : "stocks";
        const data = await getJson<{ data?: { primaryData?: { lastSalePrice?: string }; marketStatus?: string } }>(
          `https://api.nasdaq.com/api/quote/${symbol}/info?assetclass=${assetClass}`,
          { headers: { accept: "application/json", "user-agent": "Mozilla/5.0" } },
        );
        const price = Number(String(data?.data?.primaryData?.lastSalePrice ?? "").replace(/[$,]/g, ""));
        if (!Number.isFinite(price) || price <= 0) return null;
        return [symbol, { price, state: String(data?.data?.marketStatus ?? "") }] as const;
      } catch {
        return null;
      }
    }),
  );
  const stocks = Object.fromEntries(rows.filter((row) => row != null)) as Record<string, StockPrint>;
  if (Object.keys(stocks).length > 0) stockCache = { at: Date.now(), stocks };
  else console.warn("[par] Nasdaq: no prints this round");
  return Object.keys(stocks).length > 0 ? stocks : (stockCache?.stocks ?? {});
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

/** One $1,000 USDC → token quote. Null when Jupiter has none, is rate limited, or the answer looks wrong. */
async function oneBuy(mint: string, decimals: number, usdPrice: number | null): Promise<Buy | null> {
  const params = new URLSearchParams({ inputMint: USDC_MINT, outputMint: mint, amount: "1000000000", slippageBps: "50" });
  const data = await jupiterGet<{ outAmount?: string; priceImpactPct?: string }>(`/swap/v1/quote?${params}`, { maxWaitMs: 3000 });
  if (!data) return null;
  const out = Number(data.outAmount);
  const impactFrac = Number(data.priceImpactPct);
  if (!Number.isFinite(out) || out <= 0 || !Number.isFinite(impactFrac) || impactFrac < 0) return null;
  const tokens = out / 10 ** decimals;
  const price = 1000 / tokens;
  if (!Number.isFinite(tokens) || tokens <= 0 || !Number.isFinite(price) || price <= 0) return null;
  if (usdPrice != null && usdPrice > 0 && (price > usdPrice * 5 || price < usdPrice / 5)) return null;
  return { price, impactPct: impactFrac * 100, at: Date.now() };
}

/** Refreshes the oldest few buy quotes, one after another so Jupiter's per-second limit holds. */
async function rotateBuys(base: Quote[]) {
  const priceByMint = new Map(base.map((quote) => [quote.mint, quote.usdPrice]));
  const candidates = base.filter((quote) => quote.usdPrice != null && decimalsByMint.has(quote.mint)).map((quote) => quote.mint);
  for (const mint of stalestMints(candidates, buys, buysPerRefresh())) {
    const buy = await oneBuy(mint, decimalsByMint.get(mint) as number, priceByMint.get(mint) ?? null);
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
    stockPrints().catch(() => stockCache?.stocks ?? {}),
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
