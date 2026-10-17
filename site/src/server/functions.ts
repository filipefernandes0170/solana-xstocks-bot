// The desk's six server functions. Handlers run only on the server (a Netlify Function in production);
// the browser gets small RPC stubs that call /_serverFn/…

import { createServerFn } from "@tanstack/react-start";
import { cryptosResult } from "./cryptos";
import { offersResult } from "./offers";
import { quotesResult } from "./quotes";
import { walletInput } from "./solana";
import { holderStatus, lookupHoldings, readPortfolio } from "./wallet";

export const getQuotes = createServerFn({ method: "GET" }).handler(() => quotesResult());

export const getOffers = createServerFn({ method: "GET" }).handler(() => offersResult());

export const getCryptos = createServerFn({ method: "GET" }).handler(() => cryptosResult());

/** "Would this wallet get the text?" */
export const checkHolder = createServerFn({ method: "POST" })
  .validator(walletInput)
  .handler(async ({ data }) => ({ status: await holderStatus(data.wallet) }));

/** xStock holdings for the Portfolio tab on the desk. */
export const getHoldings = createServerFn({ method: "POST" })
  .validator(walletInput)
  .handler(({ data }) => lookupHoldings(data.wallet));

/** Everything the wallet holds, for /portfolio. */
export const getPortfolio = createServerFn({ method: "POST" })
  .validator(walletInput)
  .handler(({ data }) => readPortfolio(data.wallet));
