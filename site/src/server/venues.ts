// The exchange side of "Where to buy": Kraken's and Backpack Exchange's public order books. Server-only, read-only,
// public endpoints only (no account, no key). Kept briefly in memory so a busy page does not hammer either API.

import { TOKEN_BY_SYMBOL } from "../lib/tokens";
import {
  BACKPACK_URL,
  KRAKEN_ASSET_CLASS,
  KRAKEN_XSTOCKS_URL,
  averageFill,
  backpackMarket,
  krakenPair,
  krakenState,
  parseLevels,
  venueLabel,
  type VenueQuote,
  type VenuesResult,
} from "../lib/venues";
import { getJson } from "./http";
import { logMessage } from "./solana";

const LIST_FRESH_MS = 10 * 60_000;
const BOOK_FRESH_MS = 30_000;

let krakenPairs: { at: number; status: Map<string, string> } | null = null;
let backpackMarkets: { at: number; open: Set<string> } | null = null;
const books = new Map<string, { at: number; quote: VenueQuote }>();

/** Every Kraken tokenized-stock pair and its status, by altname ("NVDAxUSD" → "online"). */
async function krakenStatus() {
  if (krakenPairs && Date.now() - krakenPairs.at < LIST_FRESH_MS) return krakenPairs.status;
  const body = await getJson<{ error?: string[]; result?: Record<string, { altname?: string; status?: string }> }>(
    `https://api.kraken.com/0/public/AssetPairs?aclass_base=${KRAKEN_ASSET_CLASS}`,
    { headers: { accept: "application/json" } },
    8_000,
  );
  if (body.error?.length || !body.result) throw new Error(`Kraken pairs: ${body.error?.join(", ") || "no result"}`);
  const status = new Map<string, string>();
  for (const pair of Object.values(body.result)) if (pair.altname && pair.status) status.set(pair.altname, pair.status);
  krakenPairs = { at: Date.now(), status };
  return status;
}

/** Backpack Exchange's spot markets whose book is open ("SPCX.US_USDC"). Perpetual futures are not tokens, so they are left out. */
async function backpackOpen() {
  if (backpackMarkets && Date.now() - backpackMarkets.at < LIST_FRESH_MS) return backpackMarkets.open;
  const list = await getJson<{ symbol?: string; marketType?: string; orderBookState?: string }[]>(
    "https://api.backpack.exchange/api/v1/markets",
    { headers: { accept: "application/json" } },
    8_000,
  );
  if (!Array.isArray(list)) throw new Error("Backpack markets: no list");
  const open = new Set(list.filter((m) => m.marketType === "SPOT" && m.orderBookState === "Open" && m.symbol).map((m) => m.symbol as string));
  backpackMarkets = { at: Date.now(), open };
  return open;
}

function cached(key: string) {
  const hit = books.get(key);
  return hit && Date.now() - hit.at < BOOK_FRESH_MS ? hit.quote : null;
}

async function krakenQuote(pair: string): Promise<VenueQuote | null> {
  const key = `kraken:${pair}`;
  const hit = cached(key);
  if (hit) return hit;
  const base = { venue: "kraken" as const, name: venueLabel("kraken"), market: `${pair.slice(0, -3)}/USD`, quoteCurrency: "USD" as const, href: KRAKEN_XSTOCKS_URL };
  let quote: VenueQuote;
  try {
    const status = (await krakenStatus()).get(pair);
    if (!status) return null;
    if (krakenState(status) === "limited") {
      quote = { ...base, state: "limited", price: null, bestAsk: null, at: Date.now() };
    } else {
      const body = await getJson<{ error?: string[]; result?: Record<string, { asks?: unknown }> }>(
        `https://api.kraken.com/0/public/Depth?pair=${pair}&count=100&asset_class=${KRAKEN_ASSET_CLASS}`,
        { headers: { accept: "application/json" } },
        8_000,
      );
      if (body.error?.length || !body.result) throw new Error(`Kraken book: ${body.error?.join(", ") || "no result"}`);
      const asks = parseLevels(Object.values(body.result)[0]?.asks);
      const price = averageFill(asks);
      quote = { ...base, state: price == null ? "thin" : "open", price, bestAsk: asks.length ? Math.min(...asks.map((a) => a[0])) : null, at: Date.now() };
    }
  } catch (error) {
    console.warn(`[par] Kraken ${pair}: ${logMessage(error)}`);
    quote = { ...base, state: "error", price: null, bestAsk: null, at: Date.now() };
  }
  books.set(key, { at: Date.now(), quote });
  return quote;
}

async function backpackQuote(market: string): Promise<VenueQuote | null> {
  const key = `backpack:${market}`;
  const hit = cached(key);
  if (hit) return hit;
  const base = { venue: "backpack" as const, name: venueLabel("backpack"), market: market.replace("_", "/"), quoteCurrency: "USDC" as const, href: BACKPACK_URL };
  let quote: VenueQuote;
  try {
    if (!(await backpackOpen()).has(market)) return null;
    const body = await getJson<{ asks?: unknown }>(`https://api.backpack.exchange/api/v1/depth?symbol=${encodeURIComponent(market)}`, {
      headers: { accept: "application/json" },
    }, 8_000);
    const asks = parseLevels(body?.asks);
    const price = averageFill(asks);
    quote = { ...base, state: price == null ? "thin" : "open", price, bestAsk: asks.length ? Math.min(...asks.map((a) => a[0])) : null, at: Date.now() };
  } catch (error) {
    console.warn(`[par] Backpack ${market}: ${logMessage(error)}`);
    quote = { ...base, state: "error", price: null, bestAsk: null, at: Date.now() };
  }
  books.set(key, { at: Date.now(), quote });
  return quote;
}

/** The exchanges that sell this name, with a $1,000 buy priced from their books. An empty list when none does. */
export async function venuesResult(symbol: string): Promise<VenuesResult> {
  const token = TOKEN_BY_SYMBOL.get(symbol);
  if (!token) return { symbol, venues: [], asOf: Date.now() };
  const pair = krakenPair(token);
  const market = backpackMarket(token);
  const venues = await Promise.all([pair ? krakenQuote(pair) : null, market ? backpackQuote(market) : null]);
  return { symbol: token.symbol, venues: venues.filter((venue): venue is VenueQuote => venue != null), asOf: Date.now() };
}
