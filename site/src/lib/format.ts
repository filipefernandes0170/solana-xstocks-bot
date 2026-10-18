import { USDC_MINT } from "./tokens";

/** "$214.21" (2 decimals at or above $100, up to 4 below), or "—". */
export function formatUsd(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 2 : 4,
  }).format(value);
}

/** "+1.25%" / "-0.40%", or "—". */
export function formatPct(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

/** Gap label: "+0.12% rich", "-0.05% cheap", "+0.01% flat" (flat within 0.02%). */
export function formatGap(value: number | null | undefined) {
  if (value == null) return "—";
  const sign = value > 0 ? "+" : "";
  const word = value > 0.02 ? "rich" : value < -0.02 ? "cheap" : "flat";
  return `${sign}${value.toFixed(2)}% ${word}`;
}

/**
 * The gap as a number alone: "+0.12%", "-1.40%", or "—". Used while Nasdaq is closed: the print is then the last one,
 * so Par does not call the buy cheap or rich against it.
 */
export function gapNumber(value: number | null | undefined) {
  if (value == null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function formatAmount(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(value);
}

/** Shares per token as text: "1" when the multiplier is 1, else 4 decimals. Null when unknown. */
export function multiplierLabel(multiplier: number | null | undefined) {
  if (multiplier == null || !Number.isFinite(multiplier) || multiplier <= 0) return null;
  return Math.abs(multiplier - 1) < 1e-6 ? "1" : multiplier.toFixed(4);
}

/**
 * Price per share from a price per on-chain unit (a pool or swap price): divide by the multiplier.
 * Jupiter's usdPrice and wallet UI amounts are already per share, so they never go through this.
 */
export function perSharePrice(usdPrice: number | null | undefined, multiplier: number | null | undefined) {
  if (usdPrice == null || !Number.isFinite(usdPrice)) return null;
  if (multiplier == null || !Number.isFinite(multiplier) || multiplier <= 0) return usdPrice;
  return usdPrice / multiplier;
}

/** APY fraction as "6.37%". */
export function formatRate(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(2)}%`;
}

/**
 * "$4.4M", "$51M". The minimum is set on purpose: without it Node writes "$51.0M" while browsers write "$51M", and a
 * server-rendered page that differs from the browser's makes React redraw it (seen on /ranking, 18 Oct 2026).
 */
export function formatCompactUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value);
}

/** Price impact with more decimals as it gets smaller. */
export function formatImpact(value: number) {
  return value >= 0.1 ? value.toFixed(2) : value >= 0.01 ? value.toFixed(3) : value.toFixed(4);
}

/** Dollars that reach 1% impact, scaled in a straight line from the $1,000 buy. */
export function onePercentUsd(impactPct: number | null | undefined) {
  if (impactPct == null || !Number.isFinite(impactPct) || impactPct <= 0) return null;
  const usd = 1000 / impactPct;
  return Number.isFinite(usd) && usd > 0 ? usd : null;
}

export function impactHint(impactPct: number | null | undefined) {
  const usd = onePercentUsd(impactPct);
  return usd == null ? "" : `About $${Math.round(usd).toLocaleString("en-US")} reaches 1% impact.`;
}

/** Jupiter swap page: sell USDC, buy the xStock. */
export function jupiterBuyUrl(mint: string) {
  return `https://jup.ag/swap?${new URLSearchParams({ sell: USDC_MINT, buy: mint }).toString()}`;
}

/** How old a snapshot is, in words: "40 s", "3 min", "2 h", "1 day". Never negative. */
export function ageLabel(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}
