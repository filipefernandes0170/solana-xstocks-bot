/**
 * Yield and collateral offers for the tracked xStocks: Kamino's two xStock lending markets, read live,
 * plus Kraken's vault, which only has a published target (not a live rate). Same sources as the Par site.
 * This replaces a hard-coded list whose rates were not live.
 */

import axios from "axios";
import { MINT_TO_TOKEN, SYMBOL_TO_TOKEN } from "../config/tokens.js";

export const KAMINO_MARKETS = [
  { id: "5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua", venue: "Kamino xStocks" },
  { id: "8BNUWRSibVasaAmhYpBCFpGgMisGKfVAf9ho3Cmf6vjr", venue: "Sentora on Kamino" },
];

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
  borrowApy: number | null;
  maxLtv: number | null;
  depositsUsd: number | null;
  href: string;
};

type ReserveMetrics = {
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

async function marketOffers(market: (typeof KAMINO_MARKETS)[number]): Promise<LendingOffer[]> {
  const { data } = await axios.get(`https://api.kamino.finance/kamino-market/${market.id}/reserves/metrics`, {
    params: { env: "mainnet-beta" },
    headers: { accept: "application/json" },
    timeout: 12_000,
  });
  if (!Array.isArray(data)) throw new Error("Kamino answered without a list");
  const offers: LendingOffer[] = [];
  for (const row of data as ReserveMetrics[]) {
    const token =
      (row.liquidityTokenMint && MINT_TO_TOKEN.get(row.liquidityTokenMint)) || SYMBOL_TO_TOKEN.get((row.liquidityToken ?? "").toUpperCase());
    if (!token) continue;
    offers.push({
      symbol: token.symbol,
      venue: market.venue,
      supplyApy: num(row.supplyApy),
      borrowApy: num(row.borrowApy),
      maxLtv: num(row.maxLtv),
      depositsUsd: num(row.totalSupplyUsd),
      href: `https://kamino.com/lend/${market.id}`,
    });
  }
  return offers;
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
