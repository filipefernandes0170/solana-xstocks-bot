// Small visual helpers shared by the desk: sector colours for the ticker badges, and the gap scale.

/** Badge colours per sector: a dark tile with light text (contrast well above 7:1). */
const SECTOR_COLOURS: Record<string, { bg: string; fg: string }> = {
  Semiconductors: { bg: "#1f3a5f", fg: "#cfe3ff" },
  Autos: { bg: "#3b2f5c", fg: "#e2d9ff" },
  "Consumer tech": { bg: "#2c4a3e", fg: "#d4f2e4" },
  Index: { bg: "#5a4a1f", fg: "#ffe9b8" },
  Software: { bg: "#1f4a57", fg: "#cdeff7" },
  Internet: { bg: "#4a2540", fg: "#f7d4ea" },
  Consumer: { bg: "#4b3621", fg: "#f8e1c7" },
  Fintech: { bg: "#213f4f", fg: "#d0ecfa" },
  Treasury: { bg: "#4f3a12", fg: "#ffe3a8" },
  Exchange: { bg: "#1e3d6b", fg: "#d3e3ff" },
  Commodity: { bg: "#5c4b14", fg: "#fff0b8" },
  Aerospace: { bg: "#2b2f45", fg: "#dde2ff" },
  Brokerage: { bg: "#2a4d2a", fg: "#d9f5cf" },
  Media: { bg: "#5a1f24", fg: "#ffd6d9" },
  Restaurants: { bg: "#5c3412", fg: "#ffe0c2" },
  Gaming: { bg: "#3a2a5c", fg: "#e6dcff" },
};

const FALLBACK = { bg: "#143240", fg: "#e7f3ee" };

export function sectorColours(sector: string) {
  return SECTOR_COLOURS[sector] ?? FALLBACK;
}

/**
 * Pools under this many dollars are too thin for a $1,000 buy to mean anything (it would move the price by
 * percents), so they are not quoted: the rotation's few requests go to the names a buy can judge.
 */
export const THIN_POOL_USD = 25_000;

/** "$4.4k" */
export function poolLabel(usd: number) {
  return usd >= 1_000_000 ? `$${(usd / 1_000_000).toFixed(1)}M` : usd >= 1_000 ? `$${(usd / 1_000).toFixed(1)}k` : `$${Math.round(usd)}`;
}

/** The gap scale on each card runs from -2% to +2%; the fair band is the 0.4% the verdict uses. */
export const GAP_SCALE = 2;
export const FAIR_BAND = 0.4;

/** Where a gap sits on the scale, from 0 (left) to 100 (right), and whether it ran off either end. */
export function gapPosition(gap: number) {
  const clamped = Math.max(-GAP_SCALE, Math.min(GAP_SCALE, gap));
  return { left: ((clamped + GAP_SCALE) / (2 * GAP_SCALE)) * 100, off: gap > GAP_SCALE ? "right" : gap < -GAP_SCALE ? "left" : null };
}

/** Dollars paid over (positive) or under (negative) the same number of shares at the Nasdaq print. */
export function premiumUsd(usd: number, shares: number, stockPrice: number | null) {
  return stockPrice == null ? null : usd - shares * stockPrice;
}
