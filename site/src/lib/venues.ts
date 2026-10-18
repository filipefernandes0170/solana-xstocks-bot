// Where else a name can be bought, and what $1,000 pays there: Kraken's order book for the xStocks, Backpack
// Exchange's for Backpack's own tokens. Pure, so the page, /api/venues (which @ONPAR_BOT reads) and the tests share it.
//
// Checked 18 Oct 2026: both books quote a price per share (Kraken's NVDAx ask $212.27 against Jupiter's per-share
// $212.30; per raw token it would be about $212.66), so they compare directly with the desk's per-share prices.
// Exchange prices are before the exchange's own trading fee; Jupiter's quote already includes the pools' fees.

import { TOKEN_BY_SYMBOL, type StockToken } from "./tokens";

/** Kraken's tokenized-stock pairs need this class on every public call (without it: "Unknown asset pair"). */
export const KRAKEN_ASSET_CLASS = "tokenized_asset";
/** Kraken's own xStocks page; it sends each region to the company that serves it. */
export const KRAKEN_XSTOCKS_URL = "https://www.kraken.com/xstocks";
/** Backpack's stock markets are not shown in every region, so the link is to the exchange, not one market. */
export const BACKPACK_URL = "https://backpack.exchange";

export const VENUE_ORDER_USD = 1000;

export type VenueId = "kraken" | "backpack";

export type VenueQuote = {
  venue: VenueId;
  name: string;
  /** What the venue lists the name as: "NVDAx/USD", "SPCX.US/USDC". */
  market: string;
  /**
   * open: a $1,000 market buy can fill now; limited: the market takes only some orders right now (for example
   * resting limit orders on a weekend); thin: the asks hold less than $1,000; error: the venue did not answer.
   */
  state: "open" | "limited" | "thin" | "error";
  /** Average price per share for $1,000 (in the market's quote currency), when state is "open". */
  price: number | null;
  bestAsk: number | null;
  quoteCurrency: "USD" | "USDC";
  href: string;
  at: number;
};

export type VenuesResult = { symbol: string; venues: VenueQuote[]; asOf: number };

/** "NVDAxUSD" for an xStock (Kraken lists all 19), null for anything Kraken does not sell. */
export function krakenPair(token: StockToken) {
  return token.issuer === "xStocks" ? `${token.symbol}USD` : null;
}

/** "SPCX.US_USDC" for a Backpack token (Backpack Exchange lists some of them), null otherwise. */
export function backpackMarket(token: StockToken) {
  return token.issuer === "Backpack" ? `${token.underlying}.US_USDC` : null;
}

/**
 * The average price of a market buy of `usd` against asks [price, size], cheapest first. Null when the book holds
 * less than `usd` (a buy would not fill), or when a level is malformed.
 */
export function averageFill(asks: [number, number][], usd = VENUE_ORDER_USD): number | null {
  const levels = asks.filter(([price, size]) => Number.isFinite(price) && Number.isFinite(size) && price > 0 && size > 0).sort((a, b) => a[0] - b[0]);
  let spent = 0;
  let shares = 0;
  for (const [price, size] of levels) {
    const take = Math.min(size, (usd - spent) / price);
    spent += take * price;
    shares += take;
    if (usd - spent < 1e-9) return usd / shares;
  }
  return null;
}

/** An order book side from an API answer: [["212.27", "0.035", 1792274164], …] or [["212.27", "0.035"], …]. */
export function parseLevels(raw: unknown): [number, number][] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((level) => (Array.isArray(level) ? ([Number(level[0]), Number(level[1])] as [number, number]) : null))
    .filter((level): level is [number, number] => level != null && Number.isFinite(level[0]) && Number.isFinite(level[1]));
}

/** Kraken's pair status: only "online" takes market orders; "post_only", "cancel_only" and the rest do not. */
export function krakenState(status: unknown): "open" | "limited" {
  return status === "online" ? "open" : "limited";
}

export function venueLabel(venue: VenueId) {
  return venue === "kraken" ? "Kraken" : "Backpack Exchange";
}

/** The token a venue row belongs to, for the page. */
export function venueToken(symbol: string) {
  return TOKEN_BY_SYMBOL.get(symbol) ?? null;
}
