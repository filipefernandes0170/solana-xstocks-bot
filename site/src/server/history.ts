// Reads the gap history that netlify/functions/record-gaps.mts writes. Server-only.

import { getStore } from "@netlify/blobs";
import { HISTORY_STORE, recentDayKeys, seriesFor, type HistoryPoint, type Snapshot } from "../lib/history";
import { rankNames, type Ranking } from "../lib/ranking";
import { TOKEN_BY_SYMBOL, TOKENS } from "../lib/tokens";

export type HistoryResult = { ok: true; symbol: string; points: HistoryPoint[] } | { ok: false; symbol: string; points: []; message: string };

export type RankingResult = ({ ok: true } & Ranking) | ({ ok: false; message: string } & Ranking);

/** Every snapshot of the last week, oldest day first. */
export async function recentSnapshots(now = Date.now()): Promise<Snapshot[]> {
  const store = getStore(HISTORY_STORE);
  const days = await Promise.all(recentDayKeys(now).map((key) => store.get(key, { type: "json" }) as Promise<Snapshot[] | null>));
  return days.flatMap((day) => day ?? []);
}

/** One name's last-trade gap over the last week. An empty list just means nothing has been recorded yet. */
export async function historyResult(symbol: string): Promise<HistoryResult> {
  if (!TOKEN_BY_SYMBOL.has(symbol)) return { ok: false, symbol, points: [], message: "Unknown name." };
  try {
    return { ok: true, symbol, points: seriesFor(symbol, await recentSnapshots()) };
  } catch (error) {
    console.warn(`[par] History: ${error instanceof Error ? error.message : "read failed"}`);
    return { ok: false, symbol, points: [], message: "History is unavailable right now." };
  }
}

/** The last week's ranking of every name. Names with under two hours of open-session readings are left out. */
export async function rankingResult(): Promise<RankingResult> {
  try {
    return { ok: true, ...rankNames(await recentSnapshots(), TOKENS.map((token) => token.symbol)) };
  } catch (error) {
    console.warn(`[par] Ranking: ${error instanceof Error ? error.message : "read failed"}`);
    return { ok: false, message: "The ranking is unavailable right now.", rows: [], readings: 0, from: null, to: null };
  }
}
