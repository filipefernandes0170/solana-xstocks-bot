// The desk's seventeen server functions. Handlers run only on the server (a Netlify Function in production);
// the browser gets small RPC stubs that call /_serverFn/…

import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl, setResponseHeader } from "@tanstack/react-start/server";
import { EVENTS_CACHE, PUBLIC_DATA_CACHE, STATIC_PAGE_CACHE, VENUES_CACHE, WANT_CACHE } from "../lib/site";
import { wantedSymbols } from "../lib/shared";
import { cryptosResult } from "./cryptos";
import { eventsResult } from "./events";
import { historyResult, rankingResult } from "./history";
import { issuerResult } from "./issuer";
import { offersResult } from "./offers";
import { exitCheck, quotesResult, sizeCheck, wantNames } from "./quotes";
import { supplyResult } from "./supply";
import { venuesResult } from "./venues";
import { env } from "./http";
import { walletInput } from "./solana";
import { holderStatus, lookupHoldings, readPortfolio } from "./wallet";
import { submitProof } from "./walletProof";

/** Where the browser calls a server function (TanStack Start's default base). */
const SERVER_FN_PATH = "/_serverFn/";

/**
 * Sets how long Netlify's CDN may share this function's answer. Only when the browser called the function itself: while
 * a page is rendered on the server, its loader runs these same functions inside the page's own request, and a header
 * set there would replace the page's rule (for example the desk's LIVE_PAGE_CACHE) with the data's shorter one.
 */
function cdnCache(rule: string) {
  if (getRequestUrl().pathname.startsWith(SERVER_FN_PATH)) setResponseHeader("Netlify-CDN-Cache-Control", rule);
}

/**
 * Public market data: every visitor gets the same answer, so Netlify's CDN may share it for a few seconds.
 * This keeps function calls (and Jupiter requests) flat however many people have the desk open.
 */
function sharePublicData() {
  cdnCache(PUBLIC_DATA_CACHE);
}

/** `refreshBuys: true` comes from the browser's polling and moves the buy-quote rotation on (see quotes.ts). */
export const getQuotes = createServerFn({ method: "GET" })
  .validator((input: unknown) => ({ refreshBuys: (input as { refreshBuys?: unknown } | undefined)?.refreshBuys === true }))
  .handler(async ({ data }) => {
    sharePublicData();
    return quotesResult({ refreshBuys: data.refreshBuys });
  });

/**
 * "Quote these first": the names a visitor starred, has on screen or holds, up to 8 known symbols, sorted so the same
 * list from many visitors is one cached request. It only marks the names in the shared rotation (no Jupiter call here);
 * the next refresh quotes them before the others.
 */
export const wantBuys = createServerFn({ method: "GET" })
  .validator((input: unknown) => ({ symbols: wantedSymbols((input as { symbols?: unknown } | undefined)?.symbols) }))
  .handler(async ({ data }) => {
    cdnCache(WANT_CACHE);
    await wantNames(data.symbols);
    return { ok: true as const };
  });

export const getOffers = createServerFn({ method: "GET" }).handler(async () => {
  sharePublicData();
  return offersResult();
});

/** One name's gap history (last trade versus Nasdaq, every 15 minutes in US hours). Shared for 5 minutes. */
export const getHistory = createServerFn({ method: "GET" })
  .validator((input: unknown) => ({ symbol: String((input as { symbol?: unknown } | undefined)?.symbol ?? "") }))
  .handler(async ({ data }) => {
    cdnCache(STATIC_PAGE_CACHE);
    return historyResult(data.symbol);
  });

/** The last week's ranking: which names stayed closest to their Nasdaq print. Shared for 5 minutes. */
export const getRanking = createServerFn({ method: "GET" }).handler(async () => {
  cdnCache(STATIC_PAGE_CACHE);
  return rankingResult();
});

/** What one name's issuer can still do, read from its mint account. Shared for 5 minutes. */
export const getIssuer = createServerFn({ method: "GET" })
  .validator((input: unknown) => ({ symbol: String((input as { symbol?: unknown } | undefined)?.symbol ?? "") }))
  .handler(async ({ data }) => {
    cdnCache(STATIC_PAGE_CACHE);
    return issuerResult(data.symbol);
  });

/** Filings, balance changes, pauses and market days for /events. Shared by the CDN for a minute. */
export const getEvents = createServerFn({ method: "GET" }).handler(async () => {
  cdnCache(EVENTS_CACHE);
  return eventsResult();
});

/** Where else one name can be bought, and what $1,000 pays there (Kraken, Backpack Exchange). Shared for 30 s. */
export const getVenues = createServerFn({ method: "GET" })
  .validator((input: unknown) => ({ symbol: String((input as { symbol?: unknown } | undefined)?.symbol ?? "") }))
  .handler(async ({ data }) => {
    cdnCache(VENUES_CACHE);
    return venuesResult(data.symbol);
  });

/** Supply on Solana: tokens of each name, and how many were created or destroyed lately. Shared for a minute. */
export const getSupply = createServerFn({ method: "GET" }).handler(async () => {
  cdnCache(EVENTS_CACHE);
  return supplyResult();
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

/**
 * Wallet proof for @ONPAR_BOT (/verify): a signature of the proof message. Checked here and kept for 15 minutes
 * for the bot, which checks it again. POST, never cached. A message signature cannot move funds.
 */
export const submitWalletProof = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const raw = input as { nonce?: unknown; address?: unknown; signature?: unknown } | undefined;
    const text = (value: unknown) => (typeof value === "string" ? value.trim().slice(0, 200) : "");
    return { nonce: text(raw?.nonce), address: text(raw?.address), signature: text(raw?.signature) };
  })
  .handler(({ data }) => submitProof(data));
