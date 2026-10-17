// The week's ranking: which names stayed closest to their Nasdaq print, from the gap history
// (last trade versus print, every 15 minutes in US hours). Only readings taken while Nasdaq was open count.

import { FAIR_BAND } from "./brand";
import { seriesFor, type Snapshot } from "./history";

/** A name needs this many open-session readings (two hours) before it is ranked. */
export const MIN_OPEN_READINGS = 8;

export type RankRow = {
  symbol: string;
  /** Open-session readings. */
  readings: number;
  /** Share of those readings within the fair band (0.4%) of the print, from 0 to 1. */
  near: number;
  /** The typical (median) distance from the print, in percent. */
  typicalGap: number;
  /** The latest open-session gap, in percent (positive: the token was above the print). */
  lastGap: number;
};

export type Ranking = { rows: RankRow[]; readings: number; from: number | null; to: number | null };

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Names ranked closest first: most time near the print, then the smaller typical gap, then by name. */
export function rankNames(snapshots: Snapshot[], symbols: string[], minReadings = MIN_OPEN_READINGS): Ranking {
  const rows: RankRow[] = [];
  for (const symbol of symbols) {
    const points = seriesFor(symbol, snapshots).filter((point) => point.open);
    if (points.length < minReadings) continue;
    const gaps = points.map((point) => Math.abs(point.gap));
    rows.push({
      symbol,
      readings: points.length,
      near: gaps.filter((gap) => gap < FAIR_BAND).length / points.length,
      typicalGap: median(gaps),
      lastGap: points[points.length - 1].gap,
    });
  }
  rows.sort((a, b) => b.near - a.near || a.typicalGap - b.typicalGap || a.symbol.localeCompare(b.symbol));
  const open = snapshots.filter((snap) => snap.state.trim().toLowerCase() === "open").map((snap) => snap.t);
  return { rows, readings: new Set(open).size, from: open.length ? Math.min(...open) : null, to: open.length ? Math.max(...open) : null };
}

/** "92%" */
export function nearLabel(near: number) {
  return `${Math.round(near * 100)}%`;
}

/** The share text: the closest and the furthest name, in plain words. */
export function rankingShareText(ranking: Ranking) {
  const best = ranking.rows[0];
  const worst = ranking.rows[ranking.rows.length - 1];
  if (!best || !worst || best === worst) return "Which tokenized stocks stayed at the Nasdaq price this week? The ranking on Par.";
  return `This week on Par: ${best.symbol} sat within 0.4% of Nasdaq ${nearLabel(best.near)} of the time. ${worst.symbol} only ${nearLabel(worst.near)}. Is the price real?`;
}
