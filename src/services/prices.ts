import axios from "axios";
import { config } from "../config/index.js";
import { TOKENIZED_STOCKS } from "../config/tokens.js";
import { savePriceSnapshot } from "../db/index.js";

const JUPITER_PRICE_URL = "https://api.jup.ag/price/v3";

export interface PriceData {
  symbol: string;
  mint: string;
  usdPrice: number;
  priceChange24h: number | null;
}

/**
 * Fetch live prices from Jupiter Price API v3.
 * Free tier works without key for moderate volume.
 */
export async function getPrices(mints?: string[]): Promise<Map<string, PriceData>> {
  const targetMints = mints ?? TOKENIZED_STOCKS.map(t => t.mint);
  const result = new Map<string, PriceData>();

  for (let i = 0; i < targetMints.length; i += 40) {
    const chunk = targetMints.slice(i, i + 40);
    try {
      const headers: Record<string, string> = {};
      if (config.jupiterApiKey) headers["x-api-key"] = config.jupiterApiKey;

      const { data } = await axios.get(JUPITER_PRICE_URL, {
        params: { ids: chunk.join(",") },
        headers,
        timeout: 10_000,
      });

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

export async function getTopPrices(limit = 12): Promise<PriceData[]> {
  const prices = await getPrices();
  return Array.from(prices.values())
    .sort((a, b) => b.usdPrice - a.usdPrice)
    .slice(0, limit);
}
