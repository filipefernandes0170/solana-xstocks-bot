// Gap history: every 15 minutes during US trading hours, the last trade of each name against its Nasdaq print.
// netlify/functions/record-gaps.mts writes one Netlify Blob per UTC day; getHistory reads the last few days.
// The $1,000 buy is not recorded: quoting 25 names would take longer than a scheduled function may run.

import { gapPct } from "./verdict";

export const HISTORY_STORE = "gap-history";
export const HISTORY_DAYS = 7;

/** One reading: time, Nasdaq session state, and per symbol [token price, Nasdaq print]. */
export type Snapshot = { t: number; state: string; rows: Record<string, [number, number]> };

export type HistoryPoint = { t: number; gap: number; open: boolean };

export function dayKey(ms: number) {
  return `day/${new Date(ms).toISOString().slice(0, 10)}`;
}

/** The blob keys for the last `days` UTC days, oldest first. */
export function recentDayKeys(now: number, days = HISTORY_DAYS) {
  return Array.from({ length: days }, (_, i) => dayKey(now - (days - 1 - i) * 86_400_000));
}

/** One name's readings across snapshots, as the gap of the last trade versus the print. */
export function seriesFor(symbol: string, snapshots: Snapshot[]): HistoryPoint[] {
  const points: HistoryPoint[] = [];
  for (const snap of snapshots) {
    const row = snap.rows[symbol];
    if (!row) continue;
    const gap = gapPct(row[0], row[1]);
    if (gap == null || !Number.isFinite(gap)) continue;
    points.push({ t: snap.t, gap, open: snap.state.trim().toLowerCase() === "open" });
  }
  return points.sort((a, b) => a.t - b.t);
}

/** While Nasdaq was open: how many readings sat within `band` percent of the print. */
export function withinBand(points: HistoryPoint[], band = 0.4) {
  const open = points.filter((p) => p.open);
  return { open: open.length, within: open.filter((p) => Math.abs(p.gap) < band).length };
}
