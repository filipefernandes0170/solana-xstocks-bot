// The desk's ten server functions. Handlers run only on the server (a Netlify Function in production);
// the browser gets small RPC stubs that call /_serverFn/…

import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { PUBLIC_DATA_CACHE, STATIC_PAGE_CACHE } from "../lib/site";
import { cryptosResult } from "./cryptos";
import { historyResult } from "./history";
import { offersResult } from "./offers";
import { exitCheck, quotesResult, sizeCheck } from "./quotes";
import { env } from "./http";
import { walletInput } from "./solana";
import { holderStatus, lookupHoldings, readPortfolio } from "./wallet";

/**
 * Public market data: every visitor gets the same answer, so Netlify's CDN may share it for a few seconds.
 * This keeps function calls (and Jupiter requests) flat however many people have the desk open.
 */
function sharePublicData() {
  setResponseHeader("Netlify-CDN-Cache-Control", PUBLIC_DATA_CACHE);
}

/** `refreshBuys: true` comes from the browser's polling and moves the buy-quote rotation on (see quotes.ts). */
export const getQuotes = createServerFn({ method: "GET" })
  .validator((input: unknown) => ({ refreshBuys: (input as { refreshBuys?: unknown } | undefined)?.refreshBuys === true }))
  .handler(async ({ data }) => {
    sharePublicData();
    return quotesResult({ refreshBuys: data.refreshBuys });
  });

export const getOffers = createServerFn({ method: "GET" }).handler(async () => {
  sharePublicData();
  return offersResult();
});

/** One name's gap history (last trade versus Nasdaq, every 15 minutes in US hours). Shared for 5 minutes. */
export const getHistory = createServerFn({ method: "GET" })
  .validator((input: unknown) => ({ symbol: String((input as { symbol?: unknown } | undefined)?.symbol ?? "") }))
  .handler(async ({ data }) => {
    setResponseHeader("Netlify-CDN-Cache-Control", STATIC_PAGE_CACHE);
    return historyResult(data.symbol);
  });

/** Whether $PAR is live: the holder texts only work once TOKEN_MINT is set. Public, so shared like the prices. */
export const getFlags = createServerFn({ method: "GET" }).handler(async () => {
  sharePublicData();
  return { coinLive: env("TOKEN_MINT") !== "" };
});

export const getCryptos = createServerFn({ method: "GET" }).handler(async () => {
  sharePublicData();
  return cryptosResult();
});

/** "Would this wallet get the text?" POST, never cached. */
export const checkHolder = createServerFn({ method: "POST" })
  .validator(walletInput)
  .handler(async ({ data }) => ({ status: await holderStatus(data.wallet) }));

/** xStock holdings for the Portfolio tab on the desk. POST, never cached. */
export const getHoldings = createServerFn({ method: "POST" })
  .validator(walletInput)
  .handler(({ data }) => lookupHoldings(data.wallet));

/** Everything the wallet holds, for /portfolio. POST, never cached. */
export const getPortfolio = createServerFn({ method: "POST" })
  .validator(walletInput)
  .handler(({ data }) => readPortfolio(data.wallet));

/** Size check: a live buy quote at the amount the visitor picks. POST, never cached by the CDN. */
export const checkSize = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const raw = input as { symbol?: unknown; usd?: unknown } | undefined;
    return { symbol: typeof raw?.symbol === "string" ? raw.symbol : "", usd: typeof raw?.usd === "number" ? raw.usd : Number.NaN };
  })
  .handler(({ data }) => sizeCheck(data.symbol, data.usd));

/** Exit check for /portfolio: a live sell quote for the shares a wallet holds. POST, never cached by the CDN. */
export const checkExit = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const raw = input as { symbol?: unknown; shares?: unknown } | undefined;
    return { symbol: typeof raw?.symbol === "string" ? raw.symbol : "", shares: typeof raw?.shares === "number" ? raw.shares : Number.NaN };
  })
  .handler(({ data }) => exitCheck(data.symbol, data.shares));
