import { TOKENIZED_STOCKS } from "../config/tokens.js";
import { savePriceSnapshot } from "../db/index.js";
import { jupiterGet } from "./jupiter.js";

export interface PriceData {
  symbol: string;
  mint: string;
  usdPrice: number;
  priceChange24h: number | null;
}

/**
 * Fetch live prices from Jupiter Price API v3, through the shared rate limiter.
 * Without a JUPITER_API_KEY this uses Jupiter's keyless host.
 */
export async function getPrices(mints?: string[]): Promise<Map<string, PriceData>> {
  const targetMints = mints ?? TOKENIZED_STOCKS.map(t => t.mint);
  const result = new Map<string, PriceData>();

  for (let i = 0; i < targetMints.length; i += 40) {
    const chunk = targetMints.slice(i, i + 40);
    try {
      const data = await jupiterGet<Record<string, { usdPrice?: number; priceChange24h?: number }>>(
        "/price/v3",
        { ids: chunk.join(",") },
        { maxWaitMs: 8000, timeoutMs: 10_000 },
      );
      if (!data) continue;

      for (const mint of chunk) {
        const p = data[mint];
        if (!p?.usdPrice) continue;

        const token = TOKENIZED_STOCKS.find(t => t.mint === mint);
        if (!token) continue;

        const priceData: PriceData = {
          symbol: token.symbol,
          mint,
          usdPrice: p.usdPrice,
          priceChange24h: p.priceChange24h ?? null,
        };
        result.set(mint, priceData);
        savePriceSnapshot(token.symbol, p.usdPrice);
      }
    } catch (err: any) {
      console.error("Jupiter price fetch failed:", err.message);
    }
  }

  return result;
}
