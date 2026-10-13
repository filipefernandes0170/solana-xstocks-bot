import axios from "axios";
import { config } from "../config/index.js";
import { TOKENIZED_STOCKS } from "../config/tokens.js";
import { pendingRebase, tradeVerdict, type Rebase, type VerdictInput } from "./verdict.js";

export type DeskQuote = VerdictInput & {
  name: string;
  mint: string;
  rebase: Rebase | null;
};

let cache: { at: number; quotes: DeskQuote[] } | null = null;
let stockCache: { at: number; stocks: Record<string, { price: number; state: string }> } | null = null;
let inflight: Promise<DeskQuote[]> | null = null;
let rebaseCache: { at: number; rows: Map<string, { rebase: Rebase | null; decimals: number | null }> } | null = null;
let buyCache: { at: number; rows: Map<string, { price: number; impactPct: number; at: number }> } | null = null;

async function mintRebases() {
  if (rebaseCache && Date.now() - rebaseCache.at < 10 * 60_000) return rebaseCache.rows;
  const urls = [config.rpcUrl, "https://api.mainnet-beta.solana.com"];
  for (const url of urls) {
    try {
      const { data } = await axios.post(
        url,
        {
          jsonrpc: "2.0",
          id: 1,
          method: "getMultipleAccounts",
          params: [TOKENIZED_STOCKS.map((token) => token.mint), { encoding: "jsonParsed" }],
        },
        { timeout: 12_000, headers: { "content-type": "application/json" } },
      );
      const value = data?.result?.value as
        | Array<{
            data?: {
              parsed?: {
                info?: {
                  decimals?: number;
                  extensions?: Array<{
                    extension?: string;
                    state?: {
                      multiplier?: string;
                      newMultiplier?: string;
                      newMultiplierEffectiveTimestamp?: number;
                    };
                  }>;
                };
              };
            };
          } | null>
        | undefined;
      if (!Array.isArray(value)) continue;
      const nowSec = Date.now() / 1000;
      const rows = new Map<string, { rebase: Rebase | null; decimals: number | null }>();
      TOKENIZED_STOCKS.forEach((token, index) => {
        const info = value[index]?.data?.parsed?.info;
        const scaled = info?.extensions?.find((ext) => ext.extension === "scaledUiAmountConfig")?.state;
        rows.set(token.mint, {
          rebase: pendingRebase(scaled, nowSec),
          decimals: typeof info?.decimals === "number" ? info.decimals : null,
        });
      });
      rebaseCache = { at: Date.now(), rows };
      return rows;
    } catch {
      continue;
    }
  }
  return rebaseCache?.rows ?? new Map();
}

async function jupiterMap() {
  const ids = TOKENIZED_STOCKS.map((token) => token.mint).join(",");
  const hosts = ["https://api.jup.ag/price/v3", "https://lite-api.jup.ag/price/v3"];
  for (const host of hosts) {
    try {
      const headers: Record<string, string> = { accept: "application/json" };
      if (config.jupiterApiKey && host.includes("api.jup.ag")) headers["x-api-key"] = config.jupiterApiKey;
      const { data } = await axios.get(host, { params: { ids }, headers, timeout: 12_000 });
      return data as Record<
        string,
        { usdPrice?: number; stockData?: { price?: number; updatedAt?: string } }
      >;
    } catch {
      continue;
    }
  }
  return null;
}

async function geckoPrices() {
  const ids = TOKENIZED_STOCKS.map((token) => token.mint).join(",");
  const { data } = await axios.get(
    `https://api.geckoterminal.com/api/v2/simple/networks/solana/token_price/${ids}`,
    { headers: { accept: "application/json", "user-agent": "xStocksDesk/1.0" }, timeout: 12_000 },
  );
  return (data?.data?.attributes?.token_prices ?? null) as Record<string, string> | null;
}

async function stockPrints() {
  if (stockCache && Date.now() - stockCache.at < 180_000) return stockCache.stocks;
  const symbols = [...new Set(TOKENIZED_STOCKS.map((token) => token.underlying).filter(Boolean))]
    .filter((symbol) => symbol !== "SPCX") as string[];
  const rows = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const { data } = await axios.get(`https://api.nasdaq.com/api/quote/${symbol}/info?assetclass=stocks`, {
          headers: { accept: "application/json", "user-agent": "Mozilla/5.0" },
          timeout: 12_000,
        });
        const price = Number(String(data?.data?.primaryData?.lastSalePrice ?? "").replace(/[$,]/g, ""));
        if (!Number.isFinite(price) || price <= 0) return null;
        return [symbol, { price, state: String(data?.data?.marketStatus ?? "") }] as const;
      } catch {
        return null;
      }
    }),
  );
  const stocks = Object.fromEntries(rows.filter((row) => row != null)) as Record<
    string,
    { price: number; state: string }
  >;
  if (Object.keys(stocks).length > 0) stockCache = { at: Date.now(), stocks };
  return Object.keys(stocks).length > 0 ? stocks : (stockCache?.stocks ?? {});
}

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

async function oneBuy(mint: string, decimals: number, usdPrice: number | null) {
  const hosts = ["https://api.jup.ag/swap/v1/quote", "https://lite-api.jup.ag/swap/v1/quote"];
  for (const host of hosts) {
    try {
      const headers: Record<string, string> = { accept: "application/json" };
      if (config.jupiterApiKey && host.includes("api.jup.ag")) headers["x-api-key"] = config.jupiterApiKey;
      const { data } = await axios.get(host, {
        params: { inputMint: USDC_MINT, outputMint: mint, amount: "1000000000", slippageBps: "50" },
        headers,
        timeout: 8_000,
      });
      const out = Number(data?.outAmount);
      const impactFrac = Number(data?.priceImpactPct);
      if (!Number.isFinite(out) || out <= 0 || !Number.isFinite(impactFrac) || impactFrac < 0) continue;
      const tokens = out / 10 ** decimals;
      const price = 1000 / tokens;
      if (!Number.isFinite(tokens) || tokens <= 0 || !Number.isFinite(price) || price <= 0) continue;
      if (usdPrice != null && usdPrice > 0 && (price > usdPrice * 5 || price < usdPrice / 5)) continue;
      return { price, impactPct: impactFrac * 100, at: Date.now() };
    } catch {
      continue;
    }
  }
  return null;
}

async function buyQuotes(
  quotes: DeskQuote[],
  mints: Map<string, { decimals: number | null }>,
) {
  if (buyCache && Date.now() - buyCache.at < 60_000) return buyCache.rows;
  const fresh = new Map<string, { price: number; impactPct: number; at: number }>();
  let cursor = 0;
  async function worker() {
    while (cursor < quotes.length) {
      const quote = quotes[cursor++];
      const decimals = mints.get(quote.mint)?.decimals;
      if (typeof decimals !== "number") continue;
      const buy = await oneBuy(quote.mint, decimals, quote.usdPrice);
      if (buy) fresh.set(quote.mint, buy);
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, quotes.length) }, () => worker()));
  const now = Date.now();
  const rows = new Map<string, { price: number; impactPct: number; at: number }>();
  for (const quote of quotes) {
    const next = fresh.get(quote.mint);
    const prev = buyCache?.rows.get(quote.mint);
    if (next) rows.set(quote.mint, next);
    else if (prev && now - prev.at <= 90_000) rows.set(quote.mint, prev);
  }
  if (rows.size > 0) buyCache = { at: now, rows };
  return rows;
}

async function loadQuotes(): Promise<DeskQuote[]> {
  const [jupiter, gecko, stocks, rebases] = await Promise.all([
    jupiterMap().catch(() => null),
    geckoPrices().catch(() => null),
    stockPrints().catch(() => stockCache?.stocks ?? {}),
    mintRebases().catch(() => rebaseCache?.rows ?? new Map()),
  ]);
  const state = Object.values(stocks).find((row) => row.state)?.state ?? null;
  const base: DeskQuote[] = TOKENIZED_STOCKS.map((token) => {
    const fromJup = jupiter?.[token.mint];
    const geckoPrice = gecko?.[token.mint] != null ? Number(gecko[token.mint]) : null;
    const issuerRaw = Number(fromJup?.stockData?.price);
    const issuerAt = Date.parse(fromJup?.stockData?.updatedAt ?? "");
    const usdPrice =
      typeof fromJup?.usdPrice === "number"
        ? fromJup.usdPrice
        : geckoPrice != null && Number.isFinite(geckoPrice)
          ? geckoPrice
          : null;
    return {
      symbol: token.symbol,
      name: token.name.replace(/ xStock$/, ""),
      mint: token.mint,
      underlying: token.underlying ?? token.symbol,
      usdPrice,
      stockPrice: token.underlying ? (stocks[token.underlying]?.price ?? null) : null,
      marketState: (token.underlying && stocks[token.underlying]?.state) || state,
      issuerPrice: Number.isFinite(issuerRaw) && issuerRaw > 0 ? issuerRaw : null,
      issuerAt: Number.isFinite(issuerAt) ? issuerAt : null,
      buyPrice: null,
      buyImpactPct: null,
      buyAt: null,
      rebase: rebases.get(token.mint)?.rebase ?? null,
    };
  });
  const buys = await buyQuotes(base, rebases);
  const quotes = base.map((quote) => {
    const buy = buys.get(quote.mint);
    return {
      ...quote,
      buyPrice: buy?.price ?? null,
      buyImpactPct: buy?.impactPct ?? null,
      buyAt: buy?.at ?? null,
    };
  });
  if (!quotes.some((quote) => quote.usdPrice != null)) {
    if (cache) return cache.quotes;
    return [];
  }
  cache = { at: Date.now(), quotes };
  return quotes;
}

export async function getDeskQuotes() {
  if (cache && Date.now() - cache.at < 45_000) return cache.quotes;
  if (inflight) return inflight;
  inflight = loadQuotes().finally(() => {
    inflight = null;
  });
  return inflight;
}

export async function getDeskQuote(symbol: string) {
  const quotes = await getDeskQuotes();
  return quotes.find((quote) => quote.symbol === symbol) ?? null;
}

export function describe(quote: DeskQuote) {
  return tradeVerdict(quote);
}
