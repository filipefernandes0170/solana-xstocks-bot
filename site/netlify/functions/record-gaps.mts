// Scheduled: every 15 minutes, 12:00 to 21:45 UTC, Monday to Friday (US pre-market to after the close).
// Records each name's last trade on Solana (Jupiter's per-share usdPrice) and its Nasdaq print into one
// Netlify Blob per UTC day, for the gap history on /s/<symbol>. One Jupiter request and one Nasdaq request per company
// per run; about 880 runs a month, roughly 10 of the free plan's 300 credits.

import { getStore } from "@netlify/blobs";
import { HISTORY_STORE, dayKey, type Snapshot } from "../../src/lib/history";
import { ETF_UNDERLYINGS, TOKENS } from "../../src/lib/tokens";

async function json<T>(url: string, headers: Record<string, string>): Promise<T | null> {
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(12_000) });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

export default async () => {
  const key = (process.env.JUPITER_API_KEY ?? "").trim();
  const ids = TOKENS.map((token) => token.mint).join(",");
  const prices = await json<Record<string, { usdPrice?: number }>>(
    `${key ? "https://api.jup.ag" : "https://lite-api.jup.ag"}/price/v3?ids=${ids}`,
    key ? { accept: "application/json", "x-api-key": key } : { accept: "application/json" },
  );
  if (!prices) {
    console.warn("[par] record-gaps: no Jupiter prices this run");
    return;
  }

  const symbols = [...new Set(TOKENS.map((token) => token.underlying))];
  const prints = new Map<string, { price: number; state: string }>();
  await Promise.all(
    symbols.map(async (symbol) => {
      const data = await json<{ data?: { primaryData?: { lastSalePrice?: string }; marketStatus?: string } }>(
        `https://api.nasdaq.com/api/quote/${symbol}/info?assetclass=${ETF_UNDERLYINGS.has(symbol) ? "etf" : "stocks"}`,
        { accept: "application/json", "user-agent": "Mozilla/5.0" },
      );
      const price = Number(String(data?.data?.primaryData?.lastSalePrice ?? "").replace(/[$,]/g, ""));
      if (Number.isFinite(price) && price > 0) prints.set(symbol, { price, state: String(data?.data?.marketStatus ?? "") });
    }),
  );

  const now = Date.now();
  const rows: Snapshot["rows"] = {};
  for (const token of TOKENS) {
    const usd = prices[token.mint]?.usdPrice;
    const print = prints.get(token.underlying);
    if (typeof usd === "number" && usd > 0 && print) rows[token.symbol] = [usd, print.price];
  }
  if (Object.keys(rows).length === 0) {
    console.warn("[par] record-gaps: nothing to record this run");
    return;
  }
  const state = [...prints.values()].find((print) => print.state)?.state ?? "";
  const snapshot: Snapshot = { t: now, state, rows };

  const store = getStore(HISTORY_STORE);
  const today = dayKey(now);
  const day = ((await store.get(today, { type: "json" })) as Snapshot[] | null) ?? [];
  day.push(snapshot);
  await store.setJSON(today, day);
  console.log(`[par] record-gaps: ${Object.keys(rows).length} names, ${day.length} readings today`);
};

export const config = {
  schedule: "*/15 12-21 * * 1-5",
};
