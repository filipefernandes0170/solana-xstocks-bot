// The desk's verdict: is a $1,000 buy of this token at the Nasdaq print?
// Same rules as the published desk and as the bot (src/services/verdict.ts in the repo root).

import { impactHint } from "./format";
import { isSessionOpen } from "./session";
import { AROUND_THE_CLOCK, NO_PRINT_UNDERLYING } from "./tokens";
import type { Quote, Rebase, Verdict, VerdictId } from "./types";

/** Percent difference of a versus b. */
export function gapPct(a: number | null | undefined, b: number | null | undefined) {
  return a == null || b == null || b === 0 ? null : ((a - b) / b) * 100;
}

/** The issuer mark is usable if it is from the future, or at most 20 min old (open) / 36 h old (closed). */
export function issuerUsable(updatedAt: number | null | undefined, now: number, open: boolean) {
  if (updatedAt == null || !Number.isFinite(updatedAt)) return false;
  const age = now - updatedAt;
  return age < 0 ? true : open ? age <= 20 * 60_000 : age <= 36 * 60 * 60_000;
}

/** The $1,000 buy quote is usable from 60 s ahead to 90 s old. */
export function buyUsable(at: number | null | undefined, now: number) {
  if (at == null || !Number.isFinite(at)) return false;
  const age = now - at;
  return age >= -60_000 && age <= 90_000;
}

/**
 * Keeps the newest $1,000 buy per name across polled answers. Netlify can serve two copies of the function,
 * each holding only the buys it quoted itself, so one answer may carry fewer; a buy already held stays while
 * it is still usable (90 s) unless the new answer has a newer one. Every buy kept is a real quote with its time.
 */
export function mergeBuys(previous: Quote[], next: Quote[], now: number): Quote[] {
  const held = new Map(previous.map((quote) => [quote.mint, quote]));
  return next.map((quote) => {
    const old = held.get(quote.mint);
    if (!old || old.buyAt == null || !buyUsable(old.buyAt, now)) return quote;
    if (quote.buyAt != null && quote.buyAt >= old.buyAt) return quote;
    return { ...quote, buyPrice: old.buyPrice, buyImpactPct: old.buyImpactPct, buyAt: old.buyAt };
  });
}

export type Legs = { pool: number | null; poolVersusIssuer: number | null; issuerVersusStock: number | null };

export function legs(buy: number | null, issuer: number | null, stock: number | null): Legs {
  return { pool: gapPct(buy, stock), poolVersusIssuer: gapPct(buy, issuer), issuerVersusStock: gapPct(issuer, stock) };
}

/** The buy looks close only because the pool and the issuer mark miss in opposite directions. */
export function legsCancel(l: Legs) {
  if (l.pool == null || l.poolVersusIssuer == null || l.issuerVersusStock == null) return false;
  return Math.abs(l.pool) < 0.4 && (Math.abs(l.poolVersusIssuer) >= 0.4 || Math.abs(l.issuerVersusStock) >= 0.4);
}

export function rebaseLine(symbol: string, rebase: Rebase) {
  const when = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(rebase.at * 1000));
  return `${symbol} rebases ${when} UTC. ${rebase.direction === "up" ? "Your balance goes up." : "The multiplier drops."} Don't trade through it.`;
}

export type VerdictRow = {
  symbol: string;
  underlying: string;
  usdPrice: number | null;
  stockPrice: number | null;
  marketState: string | null;
  buyPrice: number | null;
  buyImpactPct: number | null;
  buyAt: number | null;
  issuerPrice: number | null;
  issuerAt: number | null;
};

export function verdict(row: VerdictRow, now: number): Verdict {
  if (row.underlying === NO_PRINT_UNDERLYING || row.stockPrice == null || (row.usdPrice == null && row.buyPrice == null)) {
    return { id: "unpriced", title: "No print", line: "There is no public stock price to judge this against." };
  }
  if (!row.marketState?.trim()) {
    return { id: "checking", title: "Checking", line: "The US session is still loading, so this is not a buy signal yet." };
  }
  const open = isSessionOpen(row.marketState);
  const aroundTheClock = AROUND_THE_CLOCK.has(row.symbol);
  const buy = buyUsable(row.buyAt, now) ? row.buyPrice : null;
  const impact = buy != null && row.buyImpactPct != null && row.buyImpactPct > 0 ? row.buyImpactPct : null;
  const issuerFresh = issuerUsable(row.issuerAt, now, open);

  if (buy == null) {
    if (!open && row.usdPrice != null) {
      const lastGap = Math.abs(gapPct(row.usdPrice, row.stockPrice) ?? 0);
      return aroundTheClock && lastGap < 1
        ? {
            id: "overnight",
            title: "Overnight",
            line: "The $1,000 buy is still loading. Kraken quotes this name around the clock. It is still not the Nasdaq print.",
          }
        : { id: "wait", title: "Wait", line: "The market is closed and the $1,000 buy is still loading." };
    }
    return { id: "checking", title: "Checking", line: "The $1,000 buy is still loading, so this is not called fair yet." };
  }

  const buyGap = Math.abs(gapPct(buy, row.stockPrice) ?? 0);
  const l = legs(buy, row.issuerPrice, row.stockPrice);
  const light = impact != null && impact < 1;
  const heavy = impact != null && impact >= 2;

  if (issuerFresh && legsCancel(l)) {
    return {
      id: "split",
      title: "Split",
      line: "A $1,000 buy sits near the stock because the pool and the issuer mark cancel. The buy only catches the pool.",
    };
  }
  if (open && buyGap < 0.4 && light) {
    if (row.issuerPrice == null || !issuerFresh) {
      return {
        id: "checking",
        title: "Checking",
        line:
          row.issuerPrice == null
            ? "The issuer mark is still loading, so this is not called fair yet."
            : "The issuer mark is stale, so this is not called fair yet.",
      };
    }
    return { id: "fair", title: "Fair", line: `A $1,000 buy is the stock price, and it agrees with the issuer. ${impactHint(impact)}`.trim() };
  }
  if (!open && aroundTheClock && buyGap < 1 && light) {
    return { id: "overnight", title: "Overnight", line: "Kraken quotes this name around the clock. It is still not the Nasdaq print." };
  }
  if (!open && (buyGap >= 1 || heavy)) {
    return { id: "wait", title: "Wait", line: "The market is closed and this price is a guess. The next open usually pulls it back." };
  }
  if (!open && !aroundTheClock) {
    return { id: "wait", title: "Wait", line: "This name has no around-the-clock quote. Wait for Nasdaq to open." };
  }
  if (!open && impact == null) {
    return {
      id: "checking",
      title: "Checking",
      line: "The session is closed. Exit cost is still loading, so this is not a buy signal yet.",
    };
  }
  if (open) {
    if (buyGap >= 1 || heavy) {
      return {
        id: "wait",
        title: "Careful",
        line: heavy
          ? "Nasdaq is open, but a $1,000 buy moves the price by more than 2%."
          : "Nasdaq is open, but a $1,000 buy is away from the print.",
      };
    }
    if (impact == null) {
      return { id: "checking", title: "Checking", line: "A $1,000 buy is near the stock. Its impact is still loading." };
    }
    return { id: "near", title: "Near", line: "A $1,000 buy is close to the stock. Look at the gap before a larger order." };
  }
  return { id: "wait", title: "Wait", line: "The market is closed. Stay small until the print is live again." };
}

/** Colours for the verdict pill. */
export function verdictPillClass(id: VerdictId) {
  return id === "fair"
    ? "bg-pine-soft text-pine"
    : id === "split"
      ? "bg-clay-soft text-clay"
      : id === "overnight"
        ? "bg-gold text-ink"
        : id === "wait"
          ? "bg-clay-soft text-clay"
          : "bg-foam text-ink";
}

/** Colour of the bar on the left of each card. */
export function verdictBarClass(id: VerdictId) {
  return id === "fair"
    ? "bg-pine"
    : id === "split"
      ? "bg-clay"
      : id === "overnight"
        ? "bg-gold"
        : id === "wait"
          ? "bg-clay"
          : id === "near"
            ? "bg-ink"
            : "bg-line";
}
