import axios from "axios";
import { config } from "../config/index.js";
import { TOKENIZED_STOCKS } from "../config/tokens.js";
import { jupiterGet, jupiterPaused } from "./jupiter.js";
import { nasdaqQuoteUrl } from "./nasdaq.js";
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

type Buy ={ price: number; impactPct: number; at: number };

// The latest $1,000 buy quote per mint. Filled one request at a time in the background, so a
// price lookup never waits for twenty quotes. A quote older than BUY_KEEP_MS is not shown.
const buys = new Map<string, Buy>();
const BUY_KEEP_MS = 90_000;
let buyRefresh: Promise<void> | null = null;
let buysPrimed = false;

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
  return jupiterGet<Record<string, { usdPrice?: number; stockData?: { price?: number; updatedAt?: string } }>>(
    "/price/v3",
    { ids },
    { maxWaitMs: 6000, timeoutMs: 12_000 },
  );
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
        const { data } = await axios.get(nasdaqQuoteUrl(symbol), {
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

async function oneBuy(mint: string, decimals: number, usdPrice: number | null): Promise<Buy | null> {
  const data = await jupiterGet<{ outAmount?: string; priceImpactPct?: string }>(
    "/swap/v1/quote",
    { inputMint: USDC_MINT, outputMint: mint, amount: "1000000000", slippageBps: "50" },
    { maxWaitMs: 6000, timeoutMs: 8_000 },
  );
  const out = Number(data?.outAmount);
  const impactFrac = Number(data?.priceImpactPct);
  if (!Number.isFinite(out) || out <= 0 || !Number.isFinite(impactFrac) || impactFrac < 0) return null;
  const tokens = out / 10 ** decimals;
  const price = 1000 / tokens;
  if (!Number.isFinite(tokens) || tokens <= 0 || !Number.isFinite(price) || price <= 0) return null;
  if (usdPrice != null && usdPrice > 0 && (price > usdPrice * 5 || price < usdPrice / 5)) return null;
  return { price, impactPct: impactFrac * 100, at: Date.now() };
}

/** Quotes every name once, one request at a time, oldest quote first. Stops when Jupiter answers 429. */
async function refreshBuys(quotes: DeskQuote[], mints: Map<string, { decimals: number | null }>) {
  const order = [...quotes].sort((a, b) => (buys.get(a.mint)?.at ?? 0) - (buys.get(b.mint)?.at ?? 0));
  for (const quote of order) {
    if (jupiterPaused()) break;
    const decimals = mints.get(quote.mint)?.decimals;
    if (typeof decimals !== "number") continue;
    const buy = await oneBuy(quote.mint, decimals, quote.usdPrice);
    if (buy) buys.set(quote.mint, buy);
  }
}

function startBuyRefresh(quotes: DeskQuote[], mints: Map<string, { decimals: number | null }>) {
  if (!buyRefresh) {
    buyRefresh = refreshBuys(quotes, mints)
      .catch((err) => console.error("Buy quotes failed:", err instanceof Error ? err.message : err))
      .finally(() => {
        buyRefresh = null;
      });
  }
  return buyRefresh;
}

/** Puts the latest buy quotes on the rows; a quote older than BUY_KEEP_MS is left off. */
function withBuys(quotes: DeskQuote[]): DeskQuote[] {
  const now = Date.now();
  return quotes.map((quote) => {
    const buy = buys.get(quote.mint);
    const usable = buy && now - buy.at <= BUY_KEEP_MS ? buy : null;
    return {
      ...quote,
      buyPrice: usable?.price ?? null,
      buyImpactPct: usable?.impactPct ?? null,
      buyAt: usable?.at ?? null,
    };
  });
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
  const refresh = startBuyRefresh(base, rebases);
  // Right after a restart there are no buy quotes yet; wait for the first round (at most a minute)
  // so the first verdicts are judged on real buy prices.
  if (!buysPrimed) {
    buysPrimed = true;
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([refresh, new Promise((resolve) => (timer = setTimeout(resolve, 60_000)))]);
    clearTimeout(timer);
  }
  if (!base.some((quote) => quote.usdPrice != null)) {
    if (cache) return cache.quotes;
    return [];
  }
  cache = { at: Date.now(), quotes: base };
  return base;
}

/** Every tracked name, with prices cached for 45 s and the newest buy quotes added on each call. */
export async function getDeskQuotes() {
  if (cache && Date.now() - cache.at < 45_000) return withBuys(cache.quotes);
  if (!inflight) {
    inflight = loadQuotes().finally(() => {
      inflight = null;
    });
  }
  return withBuys(await inflight);
}

export async function getDeskQuote(symbol: string) {
  const quotes = await getDeskQuotes();
  return quotes.find((quote) => quote.symbol === symbol) ?? null;
}

export function describe(quote: DeskQuote) {
  return tradeVerdict(quote);
}
