/**
 * Yield and collateral offers for the tracked xStocks: Kamino's two xStock lending markets, read live,
 * plus Kraken's vault, which only has a published target (not a live rate). Same sources as the Par site.
 * This replaces a hard-coded list whose rates were not live.
 */

import axios from "axios";
import { MINT_TO_TOKEN, SYMBOL_TO_TOKEN } from "../config/tokens.js";

/**
 * Kamino's two xStock markets, and the stablecoin each one lends against the tokens (checked in Kamino's API on
 * 17 Oct 2026: USDC in the xStocks market, PYUSD in Sentora's). A token's own borrow rate is what it costs to borrow
 * that token, so the "borrow" figure shown is the stablecoin's rate, read from its row in the same market.
 * Same as the Par site (site/src/server/offers.ts).
 */
export const KAMINO_MARKETS = [
  {
    id: "5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua",
    venue: "Kamino xStocks",
    stable: { symbol: "USDC", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
  },
  {
    id: "8BNUWRSibVasaAmhYpBCFpGgMisGKfVAf9ho3Cmf6vjr",
    venue: "Sentora on Kamino",
    stable: { symbol: "PYUSD", mint: "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo" },
  },
];

type Market = (typeof KAMINO_MARKETS)[number];

export const KRAKEN_VAULT = {
  symbols: ["SPYx", "QQQx", "NVDAx"],
  venue: "Kraken vault",
  note: "Kraken's published target is up to about 2% a year, paid in the same token. That is their stated target, not a live rate.",
  href: "https://www.kraken.com/pro/tokenized-equities/vaults",
};

export type LendingOffer = {
  symbol: string;
  venue: string;
  supplyApy: number | null;
  /** The stablecoin this market lends against the token (USDC, PYUSD); null when it has none. */
  borrowAsset: string | null;
  /** What borrowing borrowAsset costs a year in this market. Not the token's own borrow rate. */
  borrowApy: number | null;
  maxLtv: number | null;
  depositsUsd: number | null;
  /** The token's own page on Kamino, where the user deposits or borrows themselves. */
  href: string;
};

export type ReserveMetrics = {
  reserve?: string;
  liquidityToken?: string;
  liquidityTokenMint?: string;
  maxLtv?: number | string;
  borrowApy?: number | string;
  supplyApy?: number | string;
  totalSupplyUsd?: number | string;
};

let cache: { at: number; offers: LendingOffer[] } | null = null;

function num(value: number | string | undefined) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * The page for one token in one market on Kamino ("Borrow NVDAx Reserve (xStocks Market)", checked 17 Oct 2026).
 * Kamino's lending overview when the reserve address is missing.
 */
export function kaminoReserveUrl(marketId: string, reserve: string | undefined) {
  return reserve && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(reserve) ? `https://kamino.com/borrow/reserve/${marketId}/${reserve}` : "https://kamino.com/borrow";
}

/** One market's rows as offers for the tracked tokens. Pure, so the tests can feed it Kamino's own answer. */
export function offersFromRows(rows: ReserveMetrics[], market: Market): LendingOffer[] {
  const stable = rows.find((row) => row.liquidityTokenMint === market.stable.mint);
  const stableBorrowApy = stable ? num(stable.borrowApy) : null;
  const offers: LendingOffer[] = [];
  for (const row of rows) {
    const token =
      (row.liquidityTokenMint && MINT_TO_TOKEN.get(row.liquidityTokenMint)) || SYMBOL_TO_TOKEN.get((row.liquidityToken ?? "").toUpperCase());
    if (!token) continue;
    offers.push({
      symbol: token.symbol,
      venue: market.venue,
      supplyApy: num(row.supplyApy),
      borrowAsset: stable ? market.stable.symbol : null,
      borrowApy: stableBorrowApy,
      maxLtv: num(row.maxLtv),
      depositsUsd: num(row.totalSupplyUsd),
      href: kaminoReserveUrl(market.id, row.reserve),
    });
  }
  return offers;
}

async function marketOffers(market: Market): Promise<LendingOffer[]> {
  const { data } = await axios.get(`https://api.kamino.finance/kamino-market/${market.id}/reserves/metrics`, {
    params: { env: "mainnet-beta" },
    headers: { accept: "application/json" },
    timeout: 12_000,
  });
  if (!Array.isArray(data)) throw new Error("Kamino answered without a list");
  return offersFromRows(data as ReserveMetrics[], market);
}

/** Live Kamino offers for every tracked xStock, cached for a minute. Null when both markets fail and nothing is cached. */
export async function getLendingOffers(): Promise<LendingOffer[] | null> {
  if (cache && Date.now() - cache.at < 60_000) return cache.offers;
  const settled = await Promise.allSettled(KAMINO_MARKETS.map((market) => marketOffers(market)));
  settled.forEach((result, index) => {
    if (result.status === "rejected") {
      console.warn(`Kamino ${KAMINO_MARKETS[index].venue}: ${result.reason instanceof Error ? result.reason.message : "request failed"}`);
    }
  });
  if (settled.every((result) => result.status === "rejected")) return cache?.offers ?? null;
  const offers = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  cache = { at: Date.now(), offers };
  return offers;
}
