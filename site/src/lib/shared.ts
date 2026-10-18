// Rules for the state the desk function's copies share (server/deskShare.ts) and for which $1,000 buys to quote next.
// Pure, so the tests can check every rule. The browser uses dueSymbols to ask for the names a visitor cares about.

import { THIN_POOL_USD } from "./brand";
import { TOKEN_BY_SYMBOL } from "./tokens";
import type { Quote } from "./types";

export type Buy = { price: number; impactPct: number; at: number };
export type PrintRow = { price: number; state: string; at: number };
export type SharedPrints = { readAt: number; rows: Record<string, PrintRow> };

/** A visitor's request for a name counts for 2 minutes; the browser repeats it every 20 s while the page is open. */
export const WANT_KEEP_MS = 120_000;
/** A wanted name is quoted again once its buy is 45 s old, so it stays inside the 90 s a buy is shown. */
export const WANT_REQUOTE_MS = 45_000;
/** At most 3 of each refresh's 4 buys go to wanted names, so the rest of the list keeps moving too. */
export const WANTED_PER_REFRESH = 3;

const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SYMBOL = /^[A-Z][A-Z0-9.]{0,9}$/;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function entries(raw: unknown, field: string): [string, unknown][] {
  const inner = raw && typeof raw === "object" ? (raw as Record<string, unknown>)[field] : null;
  return inner && typeof inner === "object" && !Array.isArray(inner) ? Object.entries(inner as Record<string, unknown>) : [];
}

/** The shared buys blob, keeping only well-formed entries (anything else is skipped, never trusted). */
export function parseBuys(raw: unknown): Map<string, Buy> {
  const out = new Map<string, Buy>();
  for (const [mint, value] of entries(raw, "buys")) {
    const buy = value as Partial<Buy> | null;
    if (!MINT.test(mint) || !buy || typeof buy !== "object") continue;
    if (finite(buy.price) && buy.price > 0 && finite(buy.impactPct) && buy.impactPct >= 0 && finite(buy.at) && buy.at > 0) {
      out.set(mint, { price: buy.price, impactPct: buy.impactPct, at: buy.at });
    }
  }
  return out;
}

export function parsePrints(raw: unknown): SharedPrints | null {
  const readAt = raw && typeof raw === "object" ? (raw as { readAt?: unknown }).readAt : null;
  if (!finite(readAt) || readAt <= 0) return null;
  const rows: Record<string, PrintRow> = {};
  for (const [symbol, value] of entries(raw, "rows")) {
    const row = value as Partial<PrintRow> | null;
    if (!SYMBOL.test(symbol) || !row || typeof row !== "object") continue;
    if (finite(row.price) && row.price > 0 && typeof row.state === "string" && finite(row.at) && row.at > 0) {
      rows[symbol] = { price: row.price, state: row.state.slice(0, 40), at: row.at };
    }
  }
  return { readAt, rows };
}

export function parseWanted(raw: unknown): Map<string, number> {
  const out = new Map<string, number>();
  for (const [mint, at] of entries(raw, "wanted")) if (MINT.test(mint) && finite(at) && at > 0) out.set(mint, at);
  return out;
}

/** The newest buy per mint from both maps, without the ones older than `keepMs`. */
export function mergeBuyMaps(a: Map<string, Buy>, b: Map<string, Buy>, now: number, keepMs: number) {
  const out = new Map<string, Buy>();
  for (const source of [a, b]) {
    for (const [mint, buy] of source) {
      if (now - buy.at > keepMs) continue;
      const held = out.get(mint);
      if (!held || buy.at > held.at) out.set(mint, buy);
    }
  }
  return out;
}

/** Takes the shared prints that are newer than the ones in `target`, symbol by symbol. */
export function mergePrintRows(target: Map<string, PrintRow>, rows: Record<string, PrintRow>) {
  for (const [symbol, row] of Object.entries(rows)) {
    const held = target.get(symbol);
    if (!held || row.at > held.at) target.set(symbol, row);
  }
}

/** A print read this long after Nasdaq's last session ended is final: late reports have had time to land. */
export const SETTLE_AFTER_MS = 15 * 60_000;

/**
 * Whether the prints can be shown without asking Nasdaq again. `quietFrom` is when the current stretch with no Nasdaq
 * trading began (session.ts quietSince), or null while a session runs. Every symbol needs a print read at least
 * SETTLE_AFTER_MS into that stretch with Nasdaq saying "Closed": nothing can change it before the next pre-market.
 */
export function printsSettled(rows: Map<string, PrintRow>, symbols: string[], quietFrom: number | null) {
  if (quietFrom == null || symbols.length === 0) return false;
  return symbols.every((symbol) => {
    const row = rows.get(symbol);
    return row != null && row.at >= quietFrom + SETTLE_AFTER_MS && row.state.trim().toLowerCase() === "closed";
  });
}

/**
 * The mints whose buy quote is oldest (missing first), limited to `count`. Ties (above all, the names a fresh copy of
 * the function has never quoted) go in list order starting at `start`: Netlify runs several copies, and a clock-based
 * start keeps them from all quoting the first names of the list.
 */
export function stalestMints(mints: string[], current: Map<string, Buy>, count: number, start = 0) {
  const n = mints.length;
  const place = new Map(mints.map((mint, index) => [mint, n > 0 ? (((index - start) % n) + n) % n : 0]));
  return [...mints]
    .sort((a, b) => (current.get(a)?.at ?? 0) - (current.get(b)?.at ?? 0) || (place.get(a) ?? 0) - (place.get(b) ?? 0))
    .slice(0, Math.max(0, count));
}

/**
 * The buys to quote this refresh: first up to WANTED_PER_REFRESH names a visitor asked for in the last 2 minutes whose
 * buy is missing or 45 s old, oldest first; then the oldest of the rest. Never the same mint twice.
 */
export function pickBuys(mints: string[], current: Map<string, Buy>, wanted: Map<string, number>, now: number, count: number, start = 0) {
  const due = mints.filter((mint) => {
    const askedAt = wanted.get(mint);
    if (askedAt == null || now - askedAt > WANT_KEEP_MS) return false;
    const quotedAt = current.get(mint)?.at;
    return quotedAt == null || now - quotedAt >= WANT_REQUOTE_MS;
  });
  const first = stalestMints(due, current, Math.min(count, WANTED_PER_REFRESH), start);
  const rest = stalestMints(
    mints.filter((mint) => !first.includes(mint)),
    current,
    count - first.length,
    start,
  );
  return [...first, ...rest];
}

/** What wantBuys accepts: up to 8 known symbols, without repeats, sorted (so many visitors share one cached request). */
export function wantedSymbols(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw.filter((symbol): symbol is string => typeof symbol === "string" && TOKEN_BY_SYMBOL.has(symbol)) : [];
  return [...new Set(list)].sort().slice(0, 8);
}

/** A buy shown on the page is asked for again once it is this old (the same 45 s the server uses). */
export const DUE_AFTER_MS = WANT_REQUOTE_MS;

/**
 * Of `symbols` (in the visitor's order), the ones worth asking the server for: priced, not in a pool too thin to quote,
 * and without a buy younger than 45 s. At most `limit`.
 */
export function dueSymbols(symbols: string[], quotes: Quote[], now: number, limit = 8) {
  const bySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
  const out: string[] = [];
  for (const symbol of symbols) {
    if (out.length >= limit || out.includes(symbol)) continue;
    const quote = bySymbol.get(symbol);
    if (!quote || quote.usdPrice == null) continue;
    if (quote.poolUsd != null && quote.poolUsd < THIN_POOL_USD) continue;
    if (quote.buyAt != null && now - quote.buyAt < DUE_AFTER_MS) continue;
    out.push(symbol);
  }
  return out;
}
