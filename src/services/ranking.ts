// The week's ranking, read from the Par site (GET /api/ranking). The site builds it from its gap history:
// how often each name's last trade sat within 0.4% of its Nasdaq print while Nasdaq was open, over 7 days.

import { DESK_URL } from "./messages.js";

export type RankRow = { symbol: string; readings: number; near: number; typicalGap: number; lastGap: number };
export type Ranking = { rows: RankRow[]; readings: number };

function validRow(row: unknown): row is RankRow {
  const r = row as Partial<RankRow> | null;
  return (
    typeof r?.symbol === "string" &&
    /^[A-Za-z0-9.]{1,12}$/.test(r.symbol) &&
    [r.readings, r.near, r.typicalGap, r.lastGap].every((value) => typeof value === "number" && Number.isFinite(value))
  );
}

/** Keeps only well-formed rows from the site's answer. Null when the answer is not a ranking. */
export function parseRanking(data: unknown): Ranking | null {
  const body = data as { rows?: unknown; readings?: unknown } | null;
  if (!body || !Array.isArray(body.rows)) return null;
  return { rows: body.rows.filter(validRow), readings: typeof body.readings === "number" ? body.readings : 0 };
}

/** The ranking from the site, or null when the site cannot be reached. */
export async function fetchRanking(timeoutMs = 8000): Promise<Ranking | null> {
  try {
    const response = await fetch(`${DESK_URL}/api/ranking`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return null;
    return parseRanking(await response.json());
  } catch {
    return null;
  }
}
