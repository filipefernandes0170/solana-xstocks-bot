// Published top-10 holdings of the two index funds, used to open SPYx and QQQx into companies.
// These are the figures the published desk used. Update HOLDINGS_AS_OF when you refresh them.

export const HOLDINGS_AS_OF = "13 October 2026";

type FundHolding = { symbol: string; name: string; weight: number };

export const FUNDS: Record<string, { name: string; holdings: FundHolding[] }> = {
  SPYx: {
    name: "S&P 500",
    holdings: [
      { symbol: "NVDA", name: "NVIDIA", weight: 0.0822 },
      { symbol: "AAPL", name: "Apple", weight: 0.0728 },
      { symbol: "MSFT", name: "Microsoft", weight: 0.0589 },
      { symbol: "AMZN", name: "Amazon", weight: 0.0382 },
      { symbol: "GOOGL", name: "Alphabet", weight: 0.0306 },
      { symbol: "AVGO", name: "Broadcom", weight: 0.0255 },
      { symbol: "GOOG", name: "Alphabet", weight: 0.0245 },
      { symbol: "META", name: "Meta", weight: 0.0235 },
      { symbol: "MU", name: "Micron", weight: 0.0172 },
      { symbol: "TSLA", name: "Tesla", weight: 0.016 },
    ],
  },
  QQQx: {
    name: "Nasdaq-100",
    holdings: [
      { symbol: "NVDA", name: "NVIDIA", weight: 0.0824 },
      { symbol: "AAPL", name: "Apple", weight: 0.0733 },
      { symbol: "MSFT", name: "Microsoft", weight: 0.0593 },
      { symbol: "MU", name: "Micron", weight: 0.0478 },
      { symbol: "AMZN", name: "Amazon", weight: 0.0422 },
      { symbol: "AMD", name: "AMD", weight: 0.0409 },
      { symbol: "META", name: "Meta", weight: 0.0319 },
      { symbol: "GOOGL", name: "Alphabet", weight: 0.0308 },
      { symbol: "TSLA", name: "Tesla", weight: 0.03 },
      { symbol: "SPCX", name: "SpaceX", weight: 0.0287 },
    ],
  },
};

// Alphabet's two share classes count as one company.
const ALIASES: Record<string, string> = { GOOG: "GOOGL" };

export function canonical(symbol: string) {
  return ALIASES[symbol] ?? symbol;
}

export type Exposure = { symbol: string; name: string; usd: number; direct: number; through: { fund: string; usd: number }[] };

/** Company exposure: direct stock tokens in full, plus each fund's share of its published top holdings. */
export function exposures(lines: { symbol: string; underlying: string; kind: string; usd: number }[]): Exposure[] {
  const byCompany = new Map<string, Exposure>();
  const entry = (symbol: string, name: string) => {
    const key = canonical(symbol);
    const existing = byCompany.get(key);
    if (existing) return existing;
    const created: Exposure = { symbol: key, name: key === "GOOGL" ? "Alphabet" : name, usd: 0, direct: 0, through: [] };
    byCompany.set(key, created);
    return created;
  };
  for (const line of lines) {
    if (!(line.usd > 0)) continue;
    if (line.kind === "Stock") {
      const company = entry(line.underlying, line.underlying);
      company.direct += line.usd;
      company.usd += line.usd;
      continue;
    }
    const fund = FUNDS[line.symbol];
    if (!fund) continue;
    for (const holding of fund.holdings) {
      const usd = line.usd * holding.weight;
      const company = entry(holding.symbol, holding.name);
      company.usd += usd;
      const via = company.through.find((t) => t.fund === line.symbol);
      if (via) via.usd += usd;
      else company.through.push({ fund: line.symbol, usd });
    }
  }
  return [...byCompany.values()].filter((c) => c.usd > 0).sort((a, b) => b.usd - a.usd);
}

/** Companies in both funds' top holdings, with their weight in each. */
export function overlap() {
  const spy = FUNDS.SPYx.holdings;
  const qqq = new Map(FUNDS.QQQx.holdings.map((h) => [canonical(h.symbol), h]));
  const seen = new Set<string>();
  const rows: { symbol: string; name: string; spy: number; qqq: number }[] = [];
  for (const holding of spy) {
    const key = canonical(holding.symbol);
    if (seen.has(key) || !qqq.get(key)) continue;
    seen.add(key);
    const spyWeight = spy.filter((h) => canonical(h.symbol) === key).reduce((sum, h) => sum + h.weight, 0);
    const qqqWeight = FUNDS.QQQx.holdings.filter((h) => canonical(h.symbol) === key).reduce((sum, h) => sum + h.weight, 0);
    rows.push({ symbol: key, name: key === "GOOGL" ? "Alphabet" : holding.name, spy: spyWeight, qqq: qqqWeight });
  }
  return rows.sort((a, b) => b.spy + b.qqq - (a.spy + a.qqq));
}
