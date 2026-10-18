// A page that arrives as an old cached copy starts fetching fresh prices from its one-line script (StaleMark), before the
// page's own code has loaded; the page's first refresh then takes that answer instead of asking again. A slow phone
// needs a few seconds to start the page's code (about 3 s on the usual mobile test profile, measured 18 Oct 2026), so
// the fresh prices land that much sooner.

import type { QuotesResult } from "./types";

/** Where the script leaves its request: window[EARLY_QUOTES_KEY]. */
export const EARLY_QUOTES_KEY = "__parQuotes";
/** The prices as plain JSON (routes/api.quotes.ts). */
export const EARLY_QUOTES_URL = "/api/quotes";

/** A well-formed prices answer. */
export function isQuotesResult(value: unknown): value is QuotesResult {
  const result = value as Partial<QuotesResult> | null;
  return (
    !!result &&
    typeof result === "object" &&
    typeof result.ok === "boolean" &&
    Array.isArray(result.quotes) &&
    typeof result.asOf === "number" &&
    Number.isFinite(result.asOf)
  );
}

/** The early request's answer, once: later calls get null. Null too when there was none, it failed or it is malformed. */
export async function takeEarlyQuotes(): Promise<QuotesResult | null> {
  if (typeof window === "undefined") return null;
  const holder = window as unknown as Record<string, unknown>;
  const early = holder[EARLY_QUOTES_KEY];
  delete holder[EARLY_QUOTES_KEY];
  if (!early || typeof (early as { then?: unknown }).then !== "function") return null;
  try {
    const value = await (early as Promise<unknown>);
    return isQuotesResult(value) ? value : null;
  } catch {
    return null;
  }
}
