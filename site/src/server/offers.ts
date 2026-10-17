// Yield and collateral offers: Kamino's two xStock lending markets (live), plus Kraken's vault (static text).
// Server-only.

import { TOKEN_BY_MINT, TOKEN_BY_SYMBOL } from "../lib/tokens";
import type { Offer, OffersResult } from "../lib/types";
import { getJson } from "./http";

/**
 * Kamino's two xStock markets, and the stablecoin each one lends against the tokens (checked in Kamino's API on
 * 17 Oct 2026: USDC in the xStocks market, PYUSD in Sentora's). A token's own borrow rate is what it costs to borrow
 * that token, so the "borrow" figure shown is the stablecoin's rate, read from its row in the same market.
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

const COLLATERAL_NOTE =
  "Deposit the token and keep the stock exposure. You can borrow stablecoins against it instead of selling.";

const KRAKEN_VAULT = {
  symbols: ["SPYx", "QQQx", "NVDAx"],
  venue: "Kraken vault",
  note: "Kraken's published target is up to about 2% a year, paid in the same token. That is their stated target, not a live rate from Par.",
  href: "https://www.kraken.com/pro/tokenized-equities/vaults",
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

let cache: { at: number; offers: Offer[] } | null = null;

function num(value: number | string | undefined) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * The page for one token in one market on Kamino ("Borrow NVDAx Reserve (xStocks Market)", checked 17 Oct 2026),
 * where the visitor deposits or borrows themselves. Kamino's lending overview when the reserve address is missing.
 */
export function kaminoReserveUrl(marketId: string, reserve: string | undefined) {
  return reserve && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(reserve) ? `https://kamino.com/borrow/reserve/${marketId}/${reserve}` : "https://kamino.com/borrow";
}

/** One market's rows as offers for the tracked tokens. Pure, so the tests can feed it Kamino's own answer. */
export function offersFromRows(rows: ReserveMetrics[], market: Market): Offer[] {
  const stable = rows.find((row) => row.liquidityTokenMint === market.stable.mint);
  const stableBorrowApy = stable ? num(stable.borrowApy) : null;
  const offers: Offer[] = [];
  for (const row of rows) {
    const token = (row.liquidityTokenMint && TOKEN_BY_MINT.get(row.liquidityTokenMint)) || TOKEN_BY_SYMBOL.get(row.liquidityToken ?? "");
    if (!token) continue;
    offers.push({
      symbol: token.symbol,
      venue: market.venue,
      kind: "Collateral",
      supplyApy: num(row.supplyApy),
      borrowAsset: stable ? market.stable.symbol : null,
      borrowApy: stableBorrowApy,
      maxLtv: num(row.maxLtv),
      depositsUsd: num(row.totalSupplyUsd),
      note: COLLATERAL_NOTE,
      href: kaminoReserveUrl(market.id, row.reserve),
    });
  }
  return offers;
}

async function marketOffers(market: Market): Promise<Offer[]> {
  const rows = await getJson<ReserveMetrics[]>(
    `https://api.kamino.finance/kamino-market/${market.id}/reserves/metrics?env=mainnet-beta`,
    { headers: { accept: "application/json" } },
  );
  if (!Array.isArray(rows)) throw new Error("Kamino answered without a list");
  return offersFromRows(rows, market);
}

export async function offersResult(): Promise<OffersResult> {
  if (cache && Date.now() - cache.at < 60_000) return { ok: true, offers: cache.offers };
  const settled = await Promise.allSettled(KAMINO_MARKETS.map((market) => marketOffers(market)));
  settled.forEach((result, index) => {
    if (result.status === "rejected") {
      const reason = result.reason instanceof Error ? result.reason.message : "request failed";
      console.warn(`[par] Kamino ${KAMINO_MARKETS[index].venue}: ${reason}`);
    }
  });
  const live = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  if (settled.every((result) => result.status === "rejected")) {
    if (cache) return { ok: true, offers: cache.offers };
    return { ok: false, offers: [], message: "Yield markets unavailable." };
  }
  const kraken: Offer[] = KRAKEN_VAULT.symbols.map((symbol) => ({
    symbol,
    venue: KRAKEN_VAULT.venue,
    kind: "Vault",
    supplyApy: null,
    borrowAsset: null,
    borrowApy: null,
    maxLtv: null,
    depositsUsd: null,
    note: KRAKEN_VAULT.note,
    href: KRAKEN_VAULT.href,
  }));
  const offers = [...live, ...kraken];
  cache = { at: Date.now(), offers };
  return { ok: true, offers };
}
