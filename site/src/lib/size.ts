// Size check: how a buy of any size compares with the Nasdaq print. Pure, so it is tested on its own.

import { FAIR_BAND } from "./brand";

export const SIZE_PRESETS = [500, 1000, 5000, 25000, 100000];

export type SizeTone = "fair" | "close" | "far" | "none";

/** The one-line call for a quote at a given size. Same thresholds as the desk's verdict: 0.4% gap, 1% and 2% impact. */
export function sizeCall({ gap, impactPct, open }: { gap: number | null; impactPct: number; open: boolean }): {
  tone: SizeTone;
  title: string;
  line: string;
} {
  if (gap == null) return { tone: "none", title: "No stock price to compare", line: "The Nasdaq print is not in yet, so this size is not judged." };
  const closedNote = open ? "" : " Nasdaq is closed, so the print is from the last session.";
  if (Math.abs(gap) >= 1 || impactPct >= 2) {
    return {
      tone: "far",
      title: "Far from the stock at this size",
      line: `${impactPct >= 2 ? "This order moves the pool by more than 2%." : "This price is more than 1% away from the print."}${closedNote}`,
    };
  }
  if (open && Math.abs(gap) < FAIR_BAND && impactPct < 1) {
    return { tone: "fair", title: "Fair at this size", line: "This buy sits within 0.4% of the Nasdaq print and barely moves the pool." };
  }
  return {
    tone: "close",
    title: open ? "Close, but not fair" : "Close, but the market is closed",
    line: open ? "Within 1% of the print. Check the gap before you buy." : `Within 1% of the print.${closedNote}`,
  };
}

/** Parses "$5,000" or "5000.50" into dollars; null when it is not a number. */
export function parseUsd(text: string) {
  const value = Number(text.replace(/[$,\s]/g, ""));
  return Number.isFinite(value) && value > 0 ? value : null;
}
