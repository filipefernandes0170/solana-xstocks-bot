// Shapes shared by the server functions and the pages.
// Field names and order match the published desk's responses (checked 17 Oct 2026).

export type Rebase = { at: number; next: number; current: number; direction: "up" | "down" };

export type Quote = {
  symbol: string;
  name: string;
  sector: string;
  underlying: string;
  mint: string;
  usdPrice: number | null;
  change24h: number | null;
  stockPrice: number | null;
  marketState: string | null;
  sharesPerToken: number | null;
  buyPrice: number | null;
  buyImpactPct: number | null;
  buyAt: number | null;
  issuerPrice: number | null;
  issuerAt: number | null;
  rebase: Rebase | null;
};

export type QuotesResult =
  | { ok: true; quotes: Quote[]; asOf: number }
  | { ok: false; quotes: Quote[]; asOf: number; message: string };

export type Offer = {
  symbol: string;
  venue: string;
  kind: "Collateral" | "Vault";
  supplyApy: number | null;
  borrowApy: number | null;
  maxLtv: number | null;
  depositsUsd: number | null;
  note: string;
  href: string;
};

export type OffersResult = { ok: true; offers: Offer[] } | { ok: false; offers: Offer[]; message: string };

export type CryptoRow = { id: string; symbol: string; name: string; usd: number; change24h: number | null };

export type CryptosResult =
  | { ok: true; rows: CryptoRow[]; asOf: number }
  | { ok: false; rows: CryptoRow[]; asOf: number; message: string };

export type Holding = {
  symbol: string;
  name: string;
  amount: number;
  usdPrice: number | null;
  usdValue: number;
  change24h: number | null;
};

export type HoldingsResult = { holdings: Holding[]; totalUsd: number; change24hPct: number | null };

export type LineKind = "Stock" | "ETF" | "Crypto" | "Cash";

export type PortfolioLine = {
  symbol: string;
  name: string;
  kind: LineKind;
  sector: string;
  country: string;
  currency: string;
  underlying: string;
  amount: number;
  usdValue: number;
  change24h: number | null;
};

export type PortfolioResult = { lines: PortfolioLine[]; unpriced: number; spyChange: number | null };

export type HolderStatus = "unminted" | "holds" | "absent" | "error";

export type Verdict = { id: VerdictId; title: string; line: string };
export type VerdictId = "fair" | "near" | "wait" | "overnight" | "split" | "checking" | "unpriced";
