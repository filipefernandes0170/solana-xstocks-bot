// Desk quotes: token price (Jupiter, GeckoTerminal fallback), Nasdaq print, issuer mark,
// share multiplier and pending rebase, and a live $1,000 USDC buy quote. Server-only.
// The logic follows the bot's src/services/desk.ts, with two additions the desk shows:
// the 24h change and the shares-per-token multiplier (both from Jupiter's price API).

import { ETF_UNDERLYINGS, NO_PRINT_UNDERLYING, TOKENS, USDC_MINT } from "../lib/tokens";
import type { Quote, QuotesResult, Rebase } from "../lib/types";
import { getJson, jupiterHeaders, jupiterHosts } from "./http";

type JupiterPrice = {
  usdPrice?: number;
  priceChange24h?: number;
  decimals?: number;
  stockData?: { price?: number; updatedAt?: string };
  scaledUiConfig?: { multiplier?: number; newMultiplier?: number; newMultiplierEffectiveAt?: string };
};

type StockPrint = { price: number; state: string };
type Buy = { price: number; impactPct: number; at: number };

let quotesCache: { at: number; quotes: Quote[] } | null = null;
let inflight: Promise<Quote[]> | null = null;
let stockCache: { at: number; stocks: Record<string, StockPrint> } | null = null;
let buyCache: { at: number; rows: Map<string, Buy> } | null = null;

export async function jupiterPrices(mints: string[]): Promise<Record<string, JupiterPrice> | null> {
  const ids = mints.join(",");
  for (const url of jupiterHosts("/price/v3")) {
    try {
      return await getJson<Record<string, JupiterPrice>>(`${url}?ids=${ids}`, { headers: jupiterHeaders(url) });
    } catch {
      continue;
    }
  }
  return null;
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

async function oneBuy(mint: string, decimals: number, usdPrice: number | null): Promise<Buy | null> {
  for (const url of jupiterHosts("/swap/v1/quote")) {
    try {
      const params = new URLSearchParams({ inputMint: USDC_MINT, outputMint: mint, amount: "1000000000", slippageBps: "50" });
      const data = await getJson<{ outAmount?: string; priceImpactPct?: string }>(
        `${url}?${params}`,
        { headers: jupiterHeaders(url) },
        8_000,
      );
      const out = Number(data?.outAmount);
      const impactFrac = Number(data?.priceImpactPct);
      if (!Number.isFinite(out) || out <= 0 || !Number.isFinite(impactFrac) || impactFrac < 0) continue;
      const tokens = out / 10 ** decimals;
      const price = 1000 / tokens;
      if (!Number.isFinite(tokens) || tokens <= 0 || !Number.isFinite(price) || price <= 0) continue;
      if (usdPrice != null && usdPrice > 0 && (price > usdPrice * 5 || price < usdPrice / 5)) continue;
      return { price, impactPct: impactFrac * 100, at: Date.now() };
    } catch {
      continue;
    }
  }
  return null;
}

async function buyQuotes(base: Quote[], decimals: Map<string, number>) {
  if (buyCache && Date.now() - buyCache.at < 60_000) return buyCache.rows;
  const fresh = new Map<string, Buy>();
  let cursor = 0;
  async function worker() {
    while (cursor < base.length) {
      const quote = base[cursor++];
      const places = decimals.get(quote.mint);
      if (typeof places !== "number") continue;
      const buy = await oneBuy(quote.mint, places, quote.usdPrice);
      if (buy) fresh.set(quote.mint, buy);
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, base.length) }, () => worker()));
  const now = Date.now();
  const rows = new Map<string, Buy>();
  for (const quote of base) {
    const next = fresh.get(quote.mint);
    const prev = buyCache?.rows.get(quote.mint);
    if (next) rows.set(quote.mint, next);
    else if (prev && now - prev.at <= 90_000) rows.set(quote.mint, prev);
  }
  if (rows.size > 0) buyCache = { at: now, rows };
  return rows;
}

async function loadQuotes(): Promise<Quote[]> {
  const [jupiter, gecko, stocks] = await Promise.all([
    jupiterPrices(TOKENS.map((token) => token.mint)).catch(() => null),
    geckoPrices().catch(() => null),
    stockPrints().catch(() => stockCache?.stocks ?? {}),
  ]);
  const now = Date.now();
  const sessionState = Object.values(stocks).find((row) => row.state)?.state ?? null;
  const decimals = new Map<string, number>();

  const base: Quote[] = TOKENS.map((token) => {
    const jup = jupiter?.[token.mint];
    const geckoPrice = gecko?.[token.mint] != null ? Number(gecko[token.mint]) : null;
    const issuerRaw = Number(jup?.stockData?.price);
    const issuerAt = Date.parse(jup?.stockData?.updatedAt ?? "");
    if (typeof jup?.decimals === "number") decimals.set(token.mint, jup.decimals);
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

  const buys = await buyQuotes(base, decimals);
  const quotes = base.map((quote) => {
    const buy = buys.get(quote.mint);
    return { ...quote, buyPrice: buy?.price ?? null, buyImpactPct: buy?.impactPct ?? null, buyAt: buy?.at ?? null };
  });
  if (!quotes.some((quote) => quote.usdPrice != null)) {
    if (quotesCache) return quotesCache.quotes;
    return [];
  }
  quotesCache = { at: Date.now(), quotes };
  return quotes;
}

/** Cached for 45 s; concurrent callers share one load. */
export async function deskQuotes(): Promise<Quote[]> {
  if (quotesCache && Date.now() - quotesCache.at < 45_000) return quotesCache.quotes;
  if (inflight) return inflight;
  inflight = loadQuotes().finally(() => {
    inflight = null;
  });
  return inflight;
}

export async function quotesResult(): Promise<QuotesResult> {
  try {
    const quotes = await deskQuotes();
    if (quotes.length === 0) return { ok: false, quotes: [], asOf: Date.now(), message: "Price feed paused." };
    return { ok: true, quotes, asOf: Date.now() };
  } catch {
    return { ok: false, quotes: [], asOf: Date.now(), message: "Price feed paused." };
  }
}
