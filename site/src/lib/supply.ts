// Supply on Solana: how many of each token exist on Solana, and how many were created or destroyed since an earlier
// reading. Created or destroyed is measured on the raw on-chain supply, which only minting and burning change; a
// rebase (the multiplier) changes every balance without creating a token, so it is left out. Shares are the raw
// supply times today's multiplier, the same units wallets and the desk show. Pure, shared by the pages, /api/supply
// (read by @ONPAR_BOT) and the tests. Only Solana is counted: the same stocks exist on other chains too.

export const SUPPLY_STORE = "supply";
/** Readings older than this are not used; the change is measured against the oldest reading inside it. */
export const SUPPLY_WINDOW_DAYS = 7;
/** A base reading must be at least this old, so a change is never measured over minutes. */
export const SUPPLY_MIN_AGE_MS = 20 * 60 * 60_000;

/** One reading of every mint: raw supply (an integer as text) and decimals, by symbol. */
export type SupplyReading = { t: number; rows: Record<string, { raw: string; decimals: number }> };

export type SupplyNow = { raw: string; decimals: number; multiplier: number };

export type SupplyRow = {
  symbol: string;
  /** Shares on Solana now: raw supply times today's multiplier. */
  shares: number;
  /** Shares created (positive) or destroyed (negative) since `since`, at today's multiplier; null without a base. */
  change: number | null;
  /** The same change as a share of the earlier raw supply, in percent. */
  changePct: number | null;
};

export type SupplyResult = {
  ok: boolean;
  rows: SupplyRow[];
  /** When the base reading was taken; null until a reading is old enough. */
  since: number | null;
  /** The first reading Par has, so the page can say when the change starts. */
  firstReading: number | null;
  asOf: number;
};

/** "day/2026-10-18" in UTC: one reading a day is kept. */
export function supplyKey(ms: number) {
  return `day/${new Date(ms).toISOString().slice(0, 10)}`;
}

/** The keys of the last `days` UTC days, oldest first. */
export function supplyKeys(now: number, days = SUPPLY_WINDOW_DAYS + 1) {
  return Array.from({ length: days }, (_, i) => supplyKey(now - (days - 1 - i) * 86_400_000));
}

/** Whole tokens from a raw integer amount, exact for any size: "1066712345678" with 8 decimals is 10667.12345678. */
export function tokensFromRaw(raw: string, decimals: number): number | null {
  if (!/^\d+$/.test(raw) || !Number.isInteger(decimals) || decimals < 0 || decimals > 18) return null;
  const big = BigInt(raw);
  const unit = 10n ** BigInt(decimals);
  return Number(big / unit) + Number(big % unit) / Number(unit);
}

/** The oldest reading that is at least SUPPLY_MIN_AGE_MS old, among readings no older than the window. */
export function baseReading(readings: SupplyReading[], now: number) {
  const oldest = now - (SUPPLY_WINDOW_DAYS + 1) * 86_400_000;
  return (
    readings
      .filter((reading) => reading.t >= oldest && now - reading.t >= SUPPLY_MIN_AGE_MS)
      .sort((a, b) => a.t - b.t)[0] ?? null
  );
}

/** Today's supply against the base reading, for every name read now, in the order given. */
export function supplyRows(now: Map<string, SupplyNow>, base: SupplyReading | null): SupplyRow[] {
  const rows: SupplyRow[] = [];
  for (const [symbol, current] of now) {
    const tokens = tokensFromRaw(current.raw, current.decimals);
    if (tokens == null || !(current.multiplier > 0)) continue;
    const before = base?.rows[symbol];
    const earlier = before && before.decimals === current.decimals ? tokensFromRaw(before.raw, before.decimals) : null;
    const created = earlier != null ? tokens - earlier : null;
    rows.push({
      symbol,
      shares: tokens * current.multiplier,
      change: created != null ? created * current.multiplier : null,
      changePct: created != null && earlier != null && earlier > 0 ? (created / earlier) * 100 : null,
    });
  }
  return rows;
}

/** Biggest creations first, then the rest, then names with no change data. */
export function byChange(rows: SupplyRow[], price: (symbol: string) => number | null) {
  const value = (row: SupplyRow) => {
    const usd = price(row.symbol);
    return row.change != null && usd != null ? row.change * usd : null;
  };
  return [...rows].sort((a, b) => (value(b) ?? Number.NEGATIVE_INFINITY) - (value(a) ?? Number.NEGATIVE_INFINITY));
}
