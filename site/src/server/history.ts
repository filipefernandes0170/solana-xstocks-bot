// Reads the gap history that netlify/functions/record-gaps.mts writes. Server-only.

import { getStore } from "@netlify/blobs";
import { HISTORY_STORE, recentDayKeys, seriesFor, type HistoryPoint, type Snapshot } from "../lib/history";
import { TOKEN_BY_SYMBOL } from "../lib/tokens";

export type HistoryResult = { ok: true; symbol: string; points: HistoryPoint[] } | { ok: false; symbol: string; points: []; message: string };

/** One name's last-trade gap over the last week. An empty list just means nothing has been recorded yet. */
export async function historyResult(symbol: string): Promise<HistoryResult> {
  if (!TOKEN_BY_SYMBOL.has(symbol)) return { ok: false, symbol, points: [], message: "Unknown name." };
  try {
    const store = getStore(HISTORY_STORE);
    const days = await Promise.all(recentDayKeys(Date.now()).map((key) => store.get(key, { type: "json" }) as Promise<Snapshot[] | null>));
    return { ok: true, symbol, points: seriesFor(symbol, days.flatMap((day) => day ?? [])) };
  } catch (error) {
    console.warn(`[par] History: ${error instanceof Error ? error.message : "read failed"}`);
    return { ok: false, symbol, points: [], message: "History is unavailable right now." };
  }
}
