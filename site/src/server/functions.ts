// The desk's six server functions. Handlers run only on the server (a Netlify Function in production);
// the browser gets small RPC stubs that call /_serverFn/…

import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { PUBLIC_DATA_CACHE } from "../lib/site";
import { cryptosResult } from "./cryptos";
import { offersResult } from "./offers";
import { quotesResult } from "./quotes";
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
