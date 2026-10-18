// "Where to buy" and "Supply on Solana", read from the Par site (GET /api/venues?symbol=, GET /api/supply), so the
// bot shows the very numbers the site does. The site reads Kraken's and Backpack Exchange's public order books and
// every mint on Solana; see site/src/lib/venues.ts and site/src/lib/supply.ts.

import { DESK_URL } from "./messages.js";

export type BotVenue = {
  name: string;
  state: "open" | "limited" | "thin" | "error";
  /** Average price per share for a $1,000 buy, when the state is "open". */
  price: number | null;
  quoteCurrency: "USD" | "USDC";
};

export type BotSupplyRow = { symbol: string; shares: number; change: number | null; changePct: number | null };
export type BotSupply = { rows: BotSupplyRow[]; since: number | null };

const STATES = new Set(["open", "limited", "thin", "error"]);

/** The well-formed venues in the site's answer, at most a few. */
export function parseVenues(data: unknown): BotVenue[] {
  const venues = (data as { venues?: unknown } | null)?.venues;
  if (!Array.isArray(venues)) return [];
  return venues
    .map((raw) => {
      const venue = raw as Partial<BotVenue> | null;
      if (!venue || typeof venue.name !== "string" || !/^[A-Za-z ]{2,30}$/.test(venue.name) || !STATES.has(venue.state as string)) return null;
      const price = typeof venue.price === "number" && Number.isFinite(venue.price) && venue.price > 0 ? venue.price : null;
      return {
        name: venue.name,
        state: venue.state as BotVenue["state"],
        price: venue.state === "open" ? price : null,
        quoteCurrency: venue.quoteCurrency === "USDC" ? "USDC" : "USD",
      } satisfies BotVenue;
    })
    .filter((venue): venue is BotVenue => venue != null && !(venue.state === "open" && venue.price == null))
    .slice(0, 4);
}

/** The exchanges for one name, or [] when the site is slow or down (the card then simply leaves them out). */
export async function fetchVenues(symbol: string, timeoutMs = 3000): Promise<BotVenue[]> {
  try {
    const response = await fetch(`${DESK_URL}/api/venues?symbol=${encodeURIComponent(symbol)}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok ? parseVenues(await response.json()) : [];
  } catch {
    return [];
  }
}

/** The well-formed supply rows, or null when the answer is not a supply list. */
export function parseSupply(data: unknown): BotSupply | null {
  const body = data as { ok?: unknown; rows?: unknown; since?: unknown } | null;
  if (!body || body.ok !== true || !Array.isArray(body.rows)) return null;
  const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
  const rows = body.rows
    .map((raw) => {
      const row = raw as Partial<BotSupplyRow> | null;
      const shares = num(row?.shares);
      if (!row || typeof row.symbol !== "string" || !/^[A-Za-z.]{1,12}$/.test(row.symbol) || shares == null) return null;
      return { symbol: row.symbol, shares, change: num(row.change), changePct: num(row.changePct) };
    })
    .filter((row): row is BotSupplyRow => row != null);
  return { rows, since: num(body.since) };
}

export async function fetchSupply(timeoutMs = 8000): Promise<BotSupply | null> {
  try {
    const response = await fetch(`${DESK_URL}/api/supply`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
    return response.ok ? parseSupply(await response.json()) : null;
  } catch {
    return null;
  }
}
