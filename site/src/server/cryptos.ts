// Top ten coins by market cap (CoinGecko). Server-only.

import type { CryptoRow, CryptosResult } from "../lib/types";
import { getJson } from "./http";

type Market = { id?: string; symbol?: string; name?: string; current_price?: number; price_change_percentage_24h?: number | null };

let cache: { at: number; rows: CryptoRow[] } | null = null;

export async function cryptosResult(): Promise<CryptosResult> {
  if (cache && Date.now() - cache.at < 60_000) return { ok: true, rows: cache.rows, asOf: cache.at };
  try {
    const data = await getJson<Market[]>(
      "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1",
      { headers: { accept: "application/json" } },
    );
    const rows: CryptoRow[] = (Array.isArray(data) ? data : [])
      .filter((coin) => coin.id && coin.symbol && coin.name && typeof coin.current_price === "number")
      .map((coin) => ({
        id: coin.id!,
        symbol: coin.symbol!.toUpperCase(),
        name: coin.name!,
        usd: coin.current_price!,
        change24h: typeof coin.price_change_percentage_24h === "number" ? coin.price_change_percentage_24h : null,
      }));
    if (rows.length === 0) throw new Error("empty");
    cache = { at: Date.now(), rows };
    return { ok: true, rows, asOf: cache.at };
  } catch (error) {
    console.warn(`[par] CoinGecko: ${error instanceof Error ? error.message : "request failed"}`);
    if (cache) return { ok: true, rows: cache.rows, asOf: cache.at };
    return { ok: false, rows: [], asOf: Date.now(), message: "Crypto prices paused." };
  }
}
