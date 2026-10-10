/**
 * Yield opportunities for tokenized stocks.
 * Curated list – easy to update or replace with live Kamino API later.
 */

export interface YieldOpportunity {
  protocol: string;
  asset: string;
  apy: number;
  type: "supply" | "vault" | "collateral";
  description: string;
  link?: string;
  risk: "low" | "medium" | "high";
}

const YIELD_OPPORTUNITIES: YieldOpportunity[] = [
  {
    protocol: "Kamino",
    asset: "SPYx / QQQx / NVDAx",
    apy: 1.5,
    type: "vault",
    description: "Kraken × Kamino yield vaults for major xStocks. Auto-compounding.",
    link: "https://app.kamino.finance",
    risk: "medium",
  },
  {
    protocol: "Kamino Lend",
    asset: "Selected xStocks",
    apy: 0.8,
    type: "supply",
    description: "Supply xStocks as collateral or earn supply APY on supported markets.",
    link: "https://app.kamino.finance/lending",
    risk: "medium",
  },
  {
    protocol: "Jupiter",
    asset: "Major xStocks",
    apy: 0,
    type: "collateral",
    description: "Use xStocks as margin collateral on Jupiter Perps / Lend (check current markets).",
    link: "https://jup.ag",
    risk: "high",
  },
  {
    protocol: "Kraken Pro",
    asset: "SPYx, NVDAx, TSLAx + more",
    apy: 0,
    type: "collateral",
    description: "Use xStocks as collateral for futures & margin (up to 3x).",
    link: "https://pro.kraken.com",
    risk: "medium",
  },
];

export async function getYieldOpportunities(userSymbols?: string[]): Promise<YieldOpportunity[]> {
  if (!userSymbols || userSymbols.length === 0) return YIELD_OPPORTUNITIES;

  return YIELD_OPPORTUNITIES.filter(y =>
    y.asset === "Any xStock" ||
    userSymbols.some(s => y.asset.toUpperCase().includes(s.toUpperCase()))
  );
}
