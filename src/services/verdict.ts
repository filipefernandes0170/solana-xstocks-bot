/**
 * Same buy / wait rule as the desk.
 * Fair means Nasdaq is open, the token is within 0.4% of the print,
 * and selling $1,000 is under 1% of the deepest pool.
 */

export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/** Kraken Pro names that keep a quote around the clock. Source: Kraken xStocks FAQ, September 2026. */
export const AROUND_THE_CLOCK = new Set([
  "TSLAx",
  "QQQx",
  "SPYx",
  "NVDAx",
  "CRCLx",
  "AAPLx",
  "HOODx",
  "MSTRx",
  "GLDx",
  "GOOGLx",
]);

export type VerdictId = "fair" | "overnight" | "wait" | "near" | "checking" | "unpriced" | "split";

export type Verdict = { id: VerdictId; title: string; line: string };

export type VerdictInput = {
  symbol: string;
  underlying: string;
  usdPrice: number | null;
  stockPrice: number | null;
  marketState: string | null;
  buyPrice?: number | null;
  buyImpactPct?: number | null;
  buyAt?: number | null;
  issuerPrice?: number | null;
  issuerAt?: number | null;
};

export type DeskSnap = {
  symbol: string;
  verdictId: VerdictId;
  gap: number | null;
  open: boolean;
  thin: boolean;
};

const SIGNAL: ReadonlySet<VerdictId> = new Set(["fair", "overnight", "wait", "near", "split"]);

export function basisPct(token: number | null, stock: number | null) {
  if (token == null || stock == null || stock === 0) return null;
  return ((token - stock) / stock) * 100;
}

export function isSessionOpen(state: string | null) {
  return (state ?? "").trim().toLowerCase() === "open";
}

export function poolSliceUsd(impactPct: number | null) {
  if (impactPct == null || !Number.isFinite(impactPct) || impactPct <= 0) return null;
  const usd = 1000 / impactPct;
  return Number.isFinite(usd) && usd > 0 ? usd : null;
}

export type Rebase = { at: number; next: number; current: number; direction: "up" | "down" };

export function pendingRebase(
  state:
    | {
        multiplier?: string | number | null;
        newMultiplier?: string | number | null;
        newMultiplierEffectiveTimestamp?: string | number | null;
      }
    | null
    | undefined,
  nowSec: number,
): Rebase | null {
  if (!state) return null;
  let at = Number(state.newMultiplierEffectiveTimestamp);
  const next = Number(state.newMultiplier);
  const current = Number(state.multiplier);
  if (!Number.isFinite(at) || !Number.isFinite(next) || !Number.isFinite(current)) return null;
  if (at > 1e12) at = Math.floor(at / 1000);
  if (at <= nowSec) return null;
  if (current <= 0 || next <= 0) return null;
  if (Math.abs(next - current) / current < 1e-8) return null;
  return { at, next, current, direction: next > current ? "up" : "down" };
}

export function issuerUsable(updatedAt: number | null, now: number, open: boolean) {
  if (updatedAt == null || !Number.isFinite(updatedAt)) return false;
  const age = now - updatedAt;
  if (age < 0) return true;
  return open ? age <= 20 * 60_000 : age <= 36 * 60 * 60_000;
}

export function buyUsable(at: number | null, now: number) {
  if (at == null || !Number.isFinite(at)) return false;
  const age = now - at;
  return age >= -60_000 && age <= 90_000;
}

export function rebaseDue(atSec: number, nowMs: number) {
  if (!Number.isFinite(atSec) || !Number.isFinite(nowMs)) return false;
  const at = atSec * 1000;
  if (at <= nowMs) return false;
  const event = new Date(at);
  const sendAt = Date.UTC(event.getUTCFullYear(), event.getUTCMonth(), event.getUTCDate() - 1, 20, 0, 0);
  return nowMs >= sendAt;
}

export function legsCancel(token: number | null, issuer: number | null, stock: number | null) {
  const pool = basisPct(token, stock);
  const poolVersusIssuer = basisPct(token, issuer);
  const issuerVersusStock = basisPct(issuer, stock);
  if (pool == null || poolVersusIssuer == null || issuerVersusStock == null) return false;
  return Math.abs(pool) < 0.4 && (Math.abs(poolVersusIssuer) >= 0.4 || Math.abs(issuerVersusStock) >= 0.4);
}

export function tradeVerdict(row: VerdictInput, now = Date.now()): Verdict {
  if (row.stockPrice == null || (row.usdPrice == null && row.buyPrice == null)) {
    return {
      id: "unpriced",
      title: "No print",
      line: "There is no public stock price to judge this against.",
    };
  }
  if (!row.marketState?.trim()) {
    return {
      id: "checking",
      title: "Checking",
      line: "The US session is still loading, so this is not a buy signal yet.",
    };
  }
  const open = isSessionOpen(row.marketState);
  const clock = AROUND_THE_CLOCK.has(row.symbol);
  const buy = buyUsable(row.buyAt ?? null, now) ? (row.buyPrice ?? null) : null;
  const impact = buy != null && row.buyImpactPct != null && row.buyImpactPct > 0 ? row.buyImpactPct : null;
  const usable = issuerUsable(row.issuerAt ?? null, now, open);

  if (buy == null) {
    if (!open && row.usdPrice != null) {
      const lastGap = Math.abs(basisPct(row.usdPrice, row.stockPrice) ?? 0);
      if (clock && lastGap < 1) {
        return {
          id: "overnight",
          title: "Overnight",
          line: "The $1,000 buy is still loading. Kraken quotes this name around the clock. It is still not the Nasdaq print.",
        };
      }
      return {
        id: "wait",
        title: "Wait",
        line: "The market is closed and the $1,000 buy is still loading.",
      };
    }
    return {
      id: "checking",
      title: "Checking",
      line: "The $1,000 buy is still loading, so this is not called fair yet.",
    };
  }

  const gap = Math.abs(basisPct(buy, row.stockPrice) ?? 0);
  const cheap = impact != null && impact < 1;
  const thin = impact != null && impact >= 2;

  if (usable && legsCancel(buy, row.issuerPrice ?? null, row.stockPrice)) {
    return {
      id: "split",
      title: "Split",
      line: "A $1,000 buy sits near the stock because the pool and the issuer mark cancel. The buy only catches the pool.",
    };
  }

  if (open && gap < 0.4 && cheap) {
    if (row.issuerPrice == null || !usable) {
      return {
        id: "checking",
        title: "Checking",
        line:
          row.issuerPrice == null
            ? "The issuer mark is still loading, so this is not called fair yet."
            : "The issuer mark is stale, so this is not called fair yet.",
      };
    }
    const size = poolSliceUsd(impact);
    return {
      id: "fair",
      title: "Fair",
      line: `A $1,000 buy is the stock price, and it agrees with the issuer.${size != null ? ` About $${Math.round(size).toLocaleString("en-US")} reaches 1% impact.` : ""}`,
    };
  }
  if (!open && clock && gap < 1 && cheap) {
    return {
      id: "overnight",
      title: "Overnight",
      line: "Kraken quotes this name around the clock. It is still not the Nasdaq print.",
    };
  }
  if (!open && (gap >= 1 || thin)) {
    return {
      id: "wait",
      title: "Wait",
      line: "The market is closed and this price is a guess. The next open usually pulls it back.",
    };
  }
  if (!open && !clock) {
    return {
      id: "wait",
      title: "Wait",
      line: "This name has no around-the-clock quote. Wait for Nasdaq to open.",
    };
  }
  if (!open && impact == null) {
    return {
      id: "checking",
      title: "Checking",
      line: "The session is closed. Exit cost is still loading, so this is not a buy signal yet.",
    };
  }
  if (!open) {
    return {
      id: "wait",
      title: "Wait",
      line: "The market is closed. Stay small until the print is live again.",
    };
  }
  if (gap >= 1 || thin) {
    return {
      id: "wait",
      title: "Careful",
      line: thin
        ? "Nasdaq is open, but a $1,000 buy moves the price by more than 2%."
        : "Nasdaq is open, but a $1,000 buy is away from the print.",
    };
  }
  if (impact == null) {
    return {
      id: "checking",
      title: "Checking",
      line: "A $1,000 buy is near the stock. Its impact is still loading.",
    };
  }
  return {
    id: "near",
    title: "Near",
    line: "A $1,000 buy is close to the stock. Look at the gap before a larger order.",
  };
}

export function toSnap(row: VerdictInput, now = Date.now()): DeskSnap {
  const verdict = tradeVerdict(row, now);
  const judged = buyUsable(row.buyAt ?? null, now) ? (row.buyPrice ?? null) : row.usdPrice;
  const gap = basisPct(judged, row.stockPrice);
  return {
    symbol: row.symbol,
    verdictId: verdict.id,
    gap,
    open: isSessionOpen(row.marketState),
    thin: row.buyImpactPct != null && row.buyImpactPct >= 2,
  };
}

export function hasSignal(id: VerdictId) {
  return SIGNAL.has(id);
}

/** True only when a real earlier reading was not Fair and this one is. */
export function fairFlip(prev: DeskSnap | null, next: DeskSnap) {
  if (!prev || !hasSignal(prev.verdictId)) return false;
  return prev.verdictId !== "fair" && next.verdictId === "fair";
}

/** Token is at least 1% above the stock while Nasdaq is closed, and it was not already. */
export function richWhileClosed(prev: DeskSnap | null, next: DeskSnap) {
  if (!prev || !hasSignal(prev.verdictId)) return false;
  const rich = !next.open && next.gap != null && next.gap >= 1;
  if (!rich) return false;
  const was = !prev.open && prev.gap != null && prev.gap >= 1;
  return !was;
}

export function signalChanged(prev: DeskSnap | null, next: DeskSnap) {
  if (!prev || !hasSignal(prev.verdictId) || !hasSignal(next.verdictId)) return false;
  return prev.verdictId !== next.verdictId;
}

export function buyHref(mint: string) {
  const params = new URLSearchParams({ sell: USDC_MINT, buy: mint });
  return `https://jup.ag/swap?${params.toString()}`;
}

export function money(n: number | null) {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n >= 100 ? 2 : 4,
  }).format(n);
}

export function gapLabel(value: number | null) {
  if (value == null) return "no print";
  const sign = value > 0 ? "+" : "";
  const side = value > 0.02 ? "rich" : value < -0.02 ? "cheap" : "flat";
  return `${sign}${value.toFixed(2)}% ${side}`;
}

export function etParts(ms: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    weekday: get("weekday"),
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

/** Weekday window from 9:30 to 10:00 America/New_York. Late starts still send the bell once. */
export function inBellWindow(now: number) {
  const wall = etParts(now);
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weekday = names.indexOf(wall.weekday.slice(0, 3));
  if (weekday < 1 || weekday > 5) return false;
  const mins = wall.hour * 60 + wall.minute;
  return mins >= 9 * 60 + 30 && mins <= 10 * 60;
}

export function etDay(now: number) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "\u0026amp;")
    .replace(/</g, "\u0026lt;")
    .replace(/>/g, "\u0026gt;");
}

/**
 * The multiplier in force now, from the mint's scaledUiAmountConfig. Wallets show on-chain units times this,
 * and one shown token tracks one share, so a pool price per on-chain unit is divided by it.
 * No config means the multiplier never changed: 1.
 */
export function currentMultiplier(
  state:
    | {
        multiplier?: string | number | null;
        newMultiplier?: string | number | null;
        newMultiplierEffectiveTimestamp?: string | number | null;
      }
    | null
    | undefined,
  nowSec: number,
) {
  if (!state) return 1;
  const current = Number(state.multiplier);
  const next = Number(state.newMultiplier);
  let at = Number(state.newMultiplierEffectiveTimestamp);
  if (at > 1e12) at = Math.floor(at / 1000);
  if (Number.isFinite(next) && next > 0 && Number.isFinite(at) && at <= nowSec) return next;
  return Number.isFinite(current) && current > 0 ? current : null;
}

/** Shares received and the price per share for a buy of `usd`, from Jupiter's on-chain `outAmount`. */
export function perShareFill(usd: number, outRaw: number, decimals: number, multiplier: number | null) {
  const shares = (outRaw / 10 ** decimals) * (multiplier != null && multiplier > 0 ? multiplier : 1);
  const price = usd / shares;
  return Number.isFinite(shares) && shares > 0 && Number.isFinite(price) && price > 0 ? { shares, price } : null;
}

export type SizeTone = "fair" | "close" | "far" | "none";

/** The call for a buy of any size. Same thresholds as the verdict: 0.4% gap, 1% and 2% impact. Mirrors the site. */
export function sizeCall({ gap, impactPct, open }: { gap: number | null; impactPct: number; open: boolean }): {
  tone: SizeTone;
  title: string;
  line: string;
} {
  if (gap == null) return { tone: "none", title: "No stock price to compare", line: "This name has no public Nasdaq print." };
  const closedNote = open ? "" : " Nasdaq is closed, so the print is from the last session.";
  if (Math.abs(gap) >= 1 || impactPct >= 2) {
    return {
      tone: "far",
      title: "Far from the stock at this size",
      line: `${impactPct >= 2 ? "This order moves the pool by more than 2%." : "This price is more than 1% away from the print."}${closedNote}`,
    };
  }
  if (open && Math.abs(gap) < 0.4 && impactPct < 1) {
    return { tone: "fair", title: "Fair at this size", line: "This buy sits within 0.4% of the Nasdaq print and barely moves the pool." };
  }
  return {
    tone: "close",
    title: open ? "Close, but not fair" : "Close, but the market is closed",
    line: open ? "Within 1% of the print. Check the gap before you buy." : `Within 1% of the print.${closedNote}`,
  };
}

/** Weekday window from 9:00 to 9:29 America/New_York: the half hour before the open, when the brief goes out. */
export function inBriefWindow(now: number) {
  const wall = etParts(now);
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weekday = names.indexOf(wall.weekday.slice(0, 3));
  if (weekday < 1 || weekday > 5) return false;
  const mins = wall.hour * 60 + wall.minute;
  return mins >= 9 * 60 && mins < 9 * 60 + 30;
}

/** Pools under this many dollars are not quoted: a $1,000 buy there would move the price by percents. Same rule as the site. */
export const THIN_POOL_USD = 25_000;

/** Fridays from 16:15 to 16:59 New York time: after the close, when the week's ranking goes to the channel. */
export function inWeekWindow(now: number) {
  const wall = etParts(now);
  if (!wall.weekday.startsWith("Fri")) return false;
  const mins = wall.hour * 60 + wall.minute;
  return mins >= 16 * 60 + 15 && mins < 17 * 60;
}

/** Nasdaq says "Pre-Market" on trading days before 9:30; on holidays it stays "Closed". */
export function isPreMarket(state: string | null) {
  return (state ?? "").toLowerCase().includes("pre");
}

/** A text gap meter from -2% to +2%: "cheap ────┼─●── rich". The dot sits at either end when it runs off the scale. */
export function gapBar(gap: number | null) {
  if (gap == null) return null;
  const slots = 11;
  const center = (slots - 1) / 2;
  const clamped = Math.max(-2, Math.min(2, gap));
  const at = Math.round(((clamped + 2) / 4) * (slots - 1));
  const cells = Array.from({ length: slots }, (_, index) => (index === at ? "●" : index === center ? "┼" : "─"));
  return `cheap ${cells.join("")} rich`;
}

export const VERDICT_EMOJI: Record<VerdictId, string> = {
  fair: "🟢",
  near: "🟡",
  overnight: "🌙",
  wait: "🔴",
  split: "⚖️",
  checking: "⏳",
  unpriced: "⚪",
};
