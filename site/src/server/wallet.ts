// Wallet reads for the desk: xStock holdings, the full portfolio, and the holder check. Server-only, read-only.
//
// Two intentional fixes versus the published desk (Oct 2026):
// - Holdings value = wallet amount x Jupiter's usdPrice. Both are per share: the RPC's UI amount already
//   includes the token's multiplier, and so does Jupiter's usdPrice (its raw-unit price is usdPricePrescaled).
//   The published desk divided by the multiplier a second time, which undervalued NFLXx tenfold after its split.
// - USDC and USDT are valued at Jupiter's price, or at $1 when Jupiter returns none. The published
//   portfolio showed $0 for them whenever Jupiter left them out.

import { ETF_UNDERLYINGS, TOKEN_BY_MINT, USDC_MINT, USDT_MINT } from "../lib/tokens";
import type { HolderStatus, Holding, HoldingsResult, PortfolioLine, PortfolioResult, Quote } from "../lib/types";
import { PAR_MINT, holderMinimum } from "../lib/holder";
import { env } from "./http";
import { deskQuotes, jupiterPrices } from "./quotes";
import { logMessage, rpc, solBalance, tokenBalances } from "./solana";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const CASH = new Map([
  [USDC_MINT, "USDC"],
  [USDT_MINT, "USDT"],
]);
// Jupiter allows 1 request a second with a key (0.5 without), so pricing is capped at 3 batches of 50.
// Tokens past the cap are counted in "had no price" rather than slowing the page down.
const MAX_PRICED_MINTS = 150;
const PRICE_BATCH = 50;

async function quotesByMint() {
  const quotes = await deskQuotes().catch(() => [] as Quote[]);
  return new Map(quotes.map((quote) => [quote.mint, quote]));
}

/** Jupiter prices for many mints, 50 per request, one request at a time (see jupiter.ts). */
async function priceMany(mints: string[]) {
  const prices = new Map<string, { usdPrice: number; change24h: number | null }>();
  for (let i = 0; i < mints.length; i += PRICE_BATCH) {
    const batch = mints.slice(i, i + PRICE_BATCH);
    const data = await jupiterPrices(batch, 8000);
    for (const mint of batch) {
      const row = data?.[mint];
      if (typeof row?.usdPrice === "number" && Number.isFinite(row.usdPrice) && row.usdPrice > 0) {
        prices.set(mint, {
          usdPrice: row.usdPrice,
          change24h: typeof row.priceChange24h === "number" ? row.priceChange24h : null,
        });
      }
    }
  }
  return prices;
}

export async function lookupHoldings(wallet: string): Promise<HoldingsResult> {
  const [balances, quotes] = await Promise.all([tokenBalances(wallet), quotesByMint()]);
  const holdings: Holding[] = [];
  for (const [mint, amount] of balances) {
    const token = TOKEN_BY_MINT.get(mint);
    if (!token) continue;
    const quote = quotes.get(mint);
    const perShare = quote?.usdPrice ?? null;
    holdings.push({
      symbol: token.symbol,
      name: token.name,
      amount,
      usdPrice: quote?.usdPrice ?? null,
      usdValue: perShare == null ? 0 : amount * perShare,
      change24h: quote?.change24h ?? null,
    });
  }
  holdings.sort((a, b) => b.usdValue - a.usdValue);
  const totalUsd = holdings.reduce((sum, h) => sum + h.usdValue, 0);
  const moved = holdings.reduce((sum, h) => (h.change24h == null || h.usdValue <= 0 ? sum : sum + h.usdValue * (h.change24h / 100)), 0);
  return { holdings, totalUsd, change24hPct: totalUsd > 0 ? (moved / totalUsd) * 100 : null };
}

export async function readPortfolio(wallet: string): Promise<PortfolioResult> {
  const [balances, sol, quotes] = await Promise.all([tokenBalances(wallet), solBalance(wallet), quotesByMint()]);
  const lines: PortfolioLine[] = [];
  let unpriced = 0;

  const others: string[] = [];
  for (const [mint, amount] of balances) {
    const token = TOKEN_BY_MINT.get(mint);
    if (!token) {
      others.push(mint);
      continue;
    }
    const quote = quotes.get(mint);
    const perShare = quote?.usdPrice ?? null;
    if (perShare == null) {
      unpriced += 1;
      continue;
    }
    lines.push({
      symbol: token.symbol,
      name: token.name,
      kind: ETF_UNDERLYINGS.has(token.underlying) ? "ETF" : "Stock",
      sector: token.sector,
      country: "United States",
      currency: "USD",
      underlying: token.underlying,
      amount,
      usdValue: amount * perShare,
      change24h: quote?.change24h ?? null,
    });
  }

  const toPrice = [...new Set([...(sol > 0 ? [SOL_MINT] : []), ...others])];
  const priced = toPrice.slice(0, MAX_PRICED_MINTS);
  const pricedSet = new Set(priced);
  unpriced += toPrice.length - priced.length;
  const prices = await priceMany(priced);

  for (const mint of others) {
    if (!pricedSet.has(mint)) continue;
    const amount = balances.get(mint) ?? 0;
    const price = prices.get(mint);
    const cash = CASH.get(mint);
    if (cash) {
      lines.push({
        symbol: cash,
        name: cash,
        kind: "Cash",
        sector: "Cash",
        country: "Not a country",
        currency: "USD",
        underlying: cash,
        amount,
        usdValue: amount * (price?.usdPrice ?? 1),
        change24h: price?.change24h ?? null,
      });
      continue;
    }
    if (!price) {
      unpriced += 1;
      continue;
    }
    lines.push({
      symbol: mint.slice(0, 4),
      name: "Token",
      kind: "Crypto",
      sector: "Crypto",
      country: "Not a country",
      currency: "Other",
      underlying: mint,
      amount,
      usdValue: amount * price.usdPrice,
      change24h: price.change24h,
    });
  }

  if (sol > 0) {
    const price = prices.get(SOL_MINT);
    if (price) {
      lines.push({
        symbol: "SOL",
        name: "Solana",
        kind: "Crypto",
        sector: "Crypto",
        country: "Not a country",
        currency: "SOL",
        underlying: "SOL",
        amount: sol,
        usdValue: sol * price.usdPrice,
        change24h: price.change24h,
      });
    } else {
      unpriced += 1;
    }
  }

  lines.sort((a, b) => b.usdValue - a.usdValue);
  const spy = [...quotes.values()].find((quote) => quote.symbol === "SPYx");
  return { lines, unpriced, spyChange: spy?.change24h ?? null };
}

/**
 * Would this wallet get the bot's texts? Same rule as the bot: it must hold the $PAR mint (lib/holder.ts) with at
 * least the holder minimum (250,000 $PAR, or HOLDER_MIN_TOKENS). No mint yet = "unminted".
 * Note: this sums every account of that mint; the bot reads only the associated token account.
 */
export async function holderStatus(wallet: string): Promise<HolderStatus> {
  const mint = PAR_MINT;
  if (!mint) return "unminted";
  try {
    const result = await rpc<{
      value: Array<{ account: { data: { parsed?: { info?: { tokenAmount?: { uiAmountString?: string } } } } } }>;
    }>("getTokenAccountsByOwner", [wallet, { mint }, { encoding: "jsonParsed", commitment: "confirmed" }]);
    const total = (result?.value ?? []).reduce(
      (sum, entry) => sum + Number(entry.account?.data?.parsed?.info?.tokenAmount?.uiAmountString ?? 0),
      0,
    );
    const minimum = holderMinimum(env("HOLDER_MIN_TOKENS"));
    const holds = minimum > 0 ? total >= minimum : total > 0;
    return holds ? "holds" : "absent";
  } catch (error) {
    console.warn(`[par] Holder check: ${logMessage(error)}`);
    return "error";
  }
}
