import { getTokenizedStockHoldings, Holding } from "./solana.js";
import { getPrices } from "./prices.js";

export interface PortfolioPosition extends Holding {
  usdValue: number;
  price: number;
  change24h: number | null;
}

export interface PortfolioSummary {
  wallet: string;
  totalUsd: number;
  positions: PortfolioPosition[];
  change24hUsd: number | null;
  change24hPct: number | null;
}

export async function buildPortfolio(wallet: string): Promise<PortfolioSummary> {
  const holdings = await getTokenizedStockHoldings(wallet);
  if (holdings.length === 0) {
    return { wallet, totalUsd: 0, positions: [], change24hUsd: null, change24hPct: null };
  }

  const mints = holdings.map(h => h.mint);
  const prices = await getPrices(mints);

  let totalUsd = 0;
  let weightedChange = 0;
  let hasChange = false;

  const positions: PortfolioPosition[] = holdings.map(h => {
    const p = prices.get(h.mint);
    const price = p?.usdPrice ?? 0;
    const usdValue = h.amount * price;
    totalUsd += usdValue;

    if (p?.priceChange24h != null) {
      weightedChange += usdValue * (p.priceChange24h / 100);
      hasChange = true;
    }

    return {
      ...h,
      usdValue,
      price,
      change24h: p?.priceChange24h ?? null,
    };
  });

  positions.sort((a, b) => b.usdValue - a.usdValue);

  return {
    wallet,
    totalUsd,
    positions,
    change24hUsd: hasChange ? weightedChange : null,
    change24hPct: hasChange && totalUsd > 0 ? (weightedChange / totalUsd) * 100 : null,
  };
}
