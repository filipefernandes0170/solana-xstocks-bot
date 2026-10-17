// The portfolio's live layer: the bag re-marked with the desk's live quotes, the same shares at the Nasdaq print,
// what a sale would return, the possible yield at live Kamino rates, coming rebases, and the Telegram link.
// Pure functions, so the page and the tests share them.

import type { ExitCheck, Offer, PortfolioLine, Quote, Rebase, Verdict } from "./types";
import { buyUsable, gapPct, verdict } from "./verdict";

/** The desk's key: a wallet read on the desk's Portfolio tab opens here too, and the other way round. */
export const WALLET_KEY = "xstocks-wallet";

const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Exit checks run one at a time; only the largest positions are checked, so a full run stays under half a minute. */
export const EXIT_LIMIT = 10;

export function isAddress(value: string) {
  return ADDRESS.test(value.trim());
}

export function readSavedWallet() {
  try {
    const saved = (localStorage.getItem(WALLET_KEY) ?? "").trim();
    return isAddress(saved) ? saved : "";
  } catch {
    return "";
  }
}

export function saveWallet(address: string) {
  try {
    localStorage.setItem(WALLET_KEY, address.trim());
  } catch {
    // Private windows can refuse storage; the wallet then lasts for this visit.
  }
}

export function forgetWallet() {
  try {
    localStorage.removeItem(WALLET_KEY);
  } catch {
    // Nothing was stored.
  }
}

/**
 * Opens @ONPAR_BOT with this public address: the bot shows the bag and follows it for the bag texts.
 * "p-" and a 44-character address fit Telegram's 64-character start parameter. Null for anything else.
 */
export function bagWatchLink(address: string) {
  const wallet = address.trim();
  return isAddress(wallet) ? `https://t.me/ONPAR_BOT?start=p-${wallet}` : null;
}

export function isXStock(line: PortfolioLine) {
  return line.kind === "Stock" || line.kind === "ETF";
}

/** Positions worth under half a cent show as $0.00; the page leaves them out and counts them. */
export const DUST_USD = 0.005;

/** Splits off dust: lines worth under half a cent (the bot's bag does the same). */
export function withoutDust(lines: PortfolioLine[]) {
  const kept = lines.filter((line) => line.usdValue >= DUST_USD);
  return { lines: kept, dust: lines.filter((line) => line.usdValue > 0 && line.usdValue < DUST_USD).length };
}

/** xStock lines re-marked at the live last trade (the wallet read is a snapshot). Other lines stay as read. */
export function liveLines(lines: PortfolioLine[], quotes: Quote[]): PortfolioLine[] {
  const bySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
  return lines.map((line) => {
    if (!isXStock(line)) return line;
    const quote = bySymbol.get(line.symbol);
    if (quote?.usdPrice == null) return line;
    return { ...line, usdValue: line.amount * quote.usdPrice, change24h: quote.change24h ?? line.change24h };
  });
}

export type RealPriceRow = {
  line: PortfolioLine;
  quote: Quote;
  /** The shares at the last trade on Solana. */
  marked: number;
  /** The same shares at the Nasdaq print. Null while the print is not in. */
  atNasdaq: number | null;
  /** Last trade versus the print, in percent. */
  tokenGap: number | null;
  /** The live $1,000 buy versus the print, in percent, and the desk's verdict on it. */
  buyGap: number | null;
  verdict: Verdict;
};

/** One row per xStock held, with a live quote. */
export function realPriceRows(lines: PortfolioLine[], quotes: Quote[], now: number): RealPriceRow[] {
  const bySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
  const rows: RealPriceRow[] = [];
  for (const line of lines) {
    if (!isXStock(line) || !(line.amount > 0)) continue;
    const quote = bySymbol.get(line.symbol);
    if (!quote || quote.usdPrice == null) continue;
    rows.push({
      line,
      quote,
      marked: line.amount * quote.usdPrice,
      atNasdaq: quote.stockPrice == null ? null : line.amount * quote.stockPrice,
      tokenGap: gapPct(quote.usdPrice, quote.stockPrice),
      buyGap: gapPct(buyUsable(quote.buyAt, now) ? quote.buyPrice : null, quote.stockPrice),
      verdict: verdict(quote, now),
    });
  }
  return rows;
}

/** Totals over the rows that have a print: the mark, the same shares at Nasdaq, and the difference. */
export function realPriceTotals(rows: RealPriceRow[]) {
  const priced = rows.filter((row) => row.atNasdaq != null);
  const marked = priced.reduce((sum, row) => sum + row.marked, 0);
  const atNasdaq = priced.reduce((sum, row) => sum + (row.atNasdaq ?? 0), 0);
  return { marked, atNasdaq, diffUsd: marked - atNasdaq, diffPct: gapPct(marked, atNasdaq), unprinted: rows.length - priced.length };
}

type ExitOk = Extract<ExitCheck, { ok: true }>;

/** A sale quote against the mark and against the same shares at Nasdaq, both from the same moment. */
export function exitVersus(result: ExitOk) {
  const marked = result.lastTrade == null ? null : result.shares * result.lastTrade;
  const atNasdaq = result.stockPrice == null ? null : result.shares * result.stockPrice;
  return {
    marked,
    atNasdaq,
    vsMarkUsd: marked == null ? null : result.usd - marked,
    vsMarkPct: gapPct(result.usd, marked),
    vsNasdaqUsd: atNasdaq == null ? null : result.usd - atNasdaq,
    vsNasdaqPct: gapPct(result.price, result.stockPrice),
  };
}

/** Sums the sale quotes that came back. Nasdaq totals only cover the names with a print. */
export function exitTotals(results: ExitOk[]) {
  const usd = results.reduce((sum, result) => sum + result.usd, 0);
  const marked = results.reduce((sum, result) => sum + (result.lastTrade == null ? 0 : result.shares * result.lastTrade), 0);
  const printed = results.filter((result) => result.stockPrice != null);
  const printedUsd = printed.reduce((sum, result) => sum + result.usd, 0);
  const atNasdaq = printed.reduce((sum, result) => sum + result.shares * (result.stockPrice ?? 0), 0);
  return {
    usd,
    marked,
    vsMarkUsd: usd - marked,
    vsMarkPct: gapPct(usd, marked),
    vsNasdaqUsd: printed.length > 0 ? printedUsd - atNasdaq : null,
    vsNasdaqPct: printed.length > 0 ? gapPct(printedUsd, atNasdaq) : null,
  };
}

export type YieldRow = { line: PortfolioLine; offer: Offer; perYear: number };

/**
 * The best live Kamino supply rate for each xStock held, times its value: what lending it would pay in a year at
 * today's rate. Rates of 0 and Kraken's stated vault target are not counted (the target is not a live rate).
 */
export function yieldIdeas(lines: PortfolioLine[], offers: Offer[]) {
  const rows: YieldRow[] = [];
  const vaults: string[] = [];
  for (const line of lines) {
    if (!isXStock(line) || !(line.usdValue > 0)) continue;
    const live = offers.filter((offer) => offer.symbol === line.symbol && offer.kind === "Collateral" && offer.supplyApy != null && offer.supplyApy > 0);
    const best = live.sort((a, b) => (b.supplyApy ?? 0) - (a.supplyApy ?? 0))[0];
    if (best) rows.push({ line, offer: best, perYear: line.usdValue * (best.supplyApy ?? 0) });
    if (offers.some((offer) => offer.symbol === line.symbol && offer.kind === "Vault")) vaults.push(line.symbol);
  }
  rows.sort((a, b) => b.perYear - a.perYear);
  const lent = rows.reduce((sum, row) => sum + row.line.usdValue, 0);
  const perYear = rows.reduce((sum, row) => sum + row.perYear, 0);
  return { rows, perYear, lent, rate: lent > 0 ? perYear / lent : null, vaults };
}

export type BagEvent = { line: PortfolioLine; rebase: Rebase; at: number; amountAfter: number };

/** Rebases still ahead for the names held, soonest first. The balance shown scales by next / current. */
export function bagEvents(lines: PortfolioLine[], quotes: Quote[], now: number): BagEvent[] {
  const bySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
  const events: BagEvent[] = [];
  for (const line of lines) {
    if (!isXStock(line)) continue;
    const rebase = bySymbol.get(line.symbol)?.rebase;
    if (!rebase || rebase.at * 1000 <= now || !(rebase.current > 0)) continue;
    events.push({ line, rebase, at: rebase.at * 1000, amountAfter: (line.amount * rebase.next) / rebase.current });
  }
  return events.sort((a, b) => a.at - b.at);
}
