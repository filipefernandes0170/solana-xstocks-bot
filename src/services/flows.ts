// Issuer flows: large batches of tokens created (minted) or burned on Solana, read from each mint's supply.
//
// The bot already reads every tracked mint about every 5 minutes (desk.ts, for rebases and pauses); the supply comes
// with it, so this costs no extra request. Each reading is kept for a day (supply_log). A flow is the change in the
// raw supply against the newest reading at least an hour old (at most 80 minutes old, so a gap in readings never
// stretches the window), or against the last flow already reported for that name, whichever is later. Raw supply
// does not move on a rebase (the multiplier does), so a split or a dividend is never mistaken for a flow.
//
// A flow is "large" when it is worth at least $500,000 and at least 1% of the name's supply. Calibrated on chain on
// 18 Oct 2026: the xStocks mint authority creates tokens in batches, about 5 to 7 transactions a day across all of
// its tokens (for example 50,000 MSTRx, about $6.9M or 9% of its supply, on 16 Oct 2026).
// Large flows are listed by /flows (free) and texted to $PAR holders for the names they hold or watch (pings.ts):
// at most 3 a day, once per name every 6 hours, only while the flow is under 30 minutes old.
// Par only reads the supply: it does not know who is behind a flow, and a flow is not a buy or sell signal.

import { Markup } from "telegraf";
import type { InlineKeyboardMarkup } from "telegraf/types";
import { TOKENIZED_STOCKS, type TokenizedStock } from "../config/tokens.js";
import {
  addFlowEvent,
  lastFlowEvent,
  oldestSupplyAt,
  pruneFlowEvents,
  pruneSupplyLog,
  recordSupply,
  supplyReadings,
  type FlowEventRow,
} from "../db/index.js";
import { getDeskQuotes, mintSupplies } from "./desk.js";
import { DESK_URL } from "./messages.js";
import { escapeHtml } from "./verdict.js";

export const FLOW_WINDOW_MS = 60 * 60_000;
/** The baseline reading may be at most this much older than the window (readings come about every 5 minutes). */
export const FLOW_WINDOW_SLACK_MS = 20 * 60_000;
export const FLOW_MIN_USD = 500_000;
export const FLOW_MIN_PCT = 1;
export const FLOW_TEXTS_PER_DAY = 3;
export const FLOW_TEXT_EVERY_MS = 6 * 60 * 60_000;
/** A flow older than this is no longer texted (for example after the bot was down for a while). */
export const FLOW_TEXT_MAX_AGE_MS = 30 * 60_000;
const SUPPLY_KEEP_MS = 26 * 60 * 60_000;
const FLOWS_KEEP_MS = 14 * 24 * 60 * 60_000;

export type SupplyReading = { at: number; raw: bigint };
export type Flow = {
  symbol: string;
  /** When the supply was read after the flow. */
  at: number;
  /** When the baseline reading was taken. */
  since: number;
  rawBefore: bigint;
  rawAfter: bigint;
  /** Shares created (positive) or burned (negative): raw units times the current multiplier. */
  shares: number;
  usd: number;
  /** The change as a percent of the supply before it. */
  pct: number;
  /** The supply on Solana after the flow, in dollars. */
  supplyUsd: number;
};

/**
 * What to compare the newest reading with: the newest reading taken at least FLOW_WINDOW_MS before it (and no more than
 * FLOW_WINDOW_MS + FLOW_WINDOW_SLACK_MS), or the supply right after the last reported flow when that is later.
 * Null when there is no such reading yet (the first hour after the bot starts reading).
 */
export function flowBaseline(readings: SupplyReading[], current: SupplyReading, lastFlow: { at: number; rawAfter: bigint } | null) {
  let base: SupplyReading | null = null;
  for (const reading of readings) {
    const age = current.at - reading.at;
    if (age >= FLOW_WINDOW_MS && age <= FLOW_WINDOW_MS + FLOW_WINDOW_SLACK_MS && (!base || reading.at > base.at)) base = reading;
  }
  if (lastFlow && lastFlow.at < current.at && (!base || lastFlow.at > base.at) && current.at - lastFlow.at <= FLOW_WINDOW_MS + FLOW_WINDOW_SLACK_MS) {
    return { at: lastFlow.at, raw: lastFlow.rawAfter };
  }
  return base;
}

/**
 * A large flow for one name, or null. `readings` are that mint's readings, oldest first, the last one being the newest.
 * `multiplier` turns on-chain units into shares; `usdPrice` is Jupiter's per-share price.
 */
export function detectFlow(input: {
  symbol: string;
  readings: SupplyReading[];
  lastFlow: { at: number; rawAfter: bigint } | null;
  decimals: number;
  multiplier: number | null;
  usdPrice: number | null;
}): Flow | null {
  const { readings, decimals, usdPrice } = input;
  if (readings.length < 2 || usdPrice == null || !(usdPrice > 0) || !Number.isInteger(decimals) || decimals < 0) return null;
  const current = readings[readings.length - 1];
  if (input.lastFlow && input.lastFlow.at >= current.at) return null;
  const base = flowBaseline(readings, current, input.lastFlow);
  if (!base || base.raw <= 0n) return null;
  const delta = current.raw - base.raw;
  if (delta === 0n) return null;
  const multiplier = input.multiplier != null && input.multiplier > 0 ? input.multiplier : 1;
  const unit = 10 ** decimals;
  const shares = (Number(delta) / unit) * multiplier;
  const usd = shares * usdPrice;
  const pct = (Number(delta) / Number(base.raw)) * 100;
  if (!Number.isFinite(usd) || !Number.isFinite(pct)) return null;
  if (Math.abs(usd) < FLOW_MIN_USD || Math.abs(pct) < FLOW_MIN_PCT) return null;
  return {
    symbol: input.symbol,
    at: current.at,
    since: base.at,
    rawBefore: base.raw,
    rawAfter: current.raw,
    shares,
    usd,
    pct,
    supplyUsd: (Number(current.raw) / unit) * multiplier * usdPrice,
  };
}

export function flowToRow(flow: Flow): FlowEventRow {
  return {
    symbol: flow.symbol,
    at: flow.at,
    since: flow.since,
    raw_before: flow.rawBefore.toString(),
    raw_after: flow.rawAfter.toString(),
    shares: flow.shares,
    usd: flow.usd,
    pct: flow.pct,
    supply_usd: flow.supplyUsd,
  };
}

export function flowFromRow(row: FlowEventRow): Flow {
  return {
    symbol: row.symbol,
    at: row.at,
    since: row.since,
    rawBefore: BigInt(row.raw_before),
    rawAfter: BigInt(row.raw_after),
    shares: row.shares,
    usd: row.usd,
    pct: row.pct,
    supplyUsd: row.supply_usd,
  };
}

function parseRaw(raw: string) {
  return /^\d+$/.test(raw) ? BigInt(raw) : null;
}

let lastPrune = 0;

/**
 * Saves the latest supply reading of every tracked mint and returns the large flows found in it (each saved once).
 * Called every few minutes by checkEvents; quiet when the chain or the prices cannot be read.
 */
export async function checkFlows(now = Date.now()): Promise<Flow[]> {
  const { at, rows } = await mintSupplies();
  if (at == null) return [];
  for (const token of TOKENIZED_STOCKS) {
    const raw = rows.get(token.mint)?.supplyRaw;
    if (raw) recordSupply(token.mint, at, raw);
  }
  const quotes = await getDeskQuotes({ allowStale: true }).catch(() => []);
  const prices = new Map(quotes.map((quote) => [quote.mint, quote.usdPrice]));
  const found: Flow[] = [];
  for (const token of TOKENIZED_STOCKS) {
    const info = rows.get(token.mint);
    const readings = supplyReadings(token.mint, at - FLOW_WINDOW_MS - FLOW_WINDOW_SLACK_MS - 60_000)
      .map((row) => ({ at: row.at, raw: parseRaw(row.raw) }))
      .filter((row): row is SupplyReading => row.raw != null && row.at <= at);
    const last = lastFlowEvent(token.symbol);
    const flow = detectFlow({
      symbol: token.symbol,
      readings,
      lastFlow: last ? { at: last.at, rawAfter: BigInt(last.raw_after) } : null,
      decimals: info?.decimals ?? token.decimals,
      multiplier: info?.multiplier ?? null,
      usdPrice: prices.get(token.mint) ?? null,
    });
    if (flow) {
      addFlowEvent(flowToRow(flow));
      found.push(flow);
    }
  }
  if (now - lastPrune > 60 * 60_000) {
    pruneSupplyLog(now - SUPPLY_KEEP_MS);
    pruneFlowEvents(now - FLOWS_KEEP_MS);
    lastPrune = now;
  }
  return found;
}

/** When the bot started keeping supply readings (the oldest one kept), for /flows in its first hour. */
export function watchingSince() {
  return oldestSupplyAt();
}

/** "$4.20M", "$650k". */
export function flowMoney(usd: number) {
  const value = Math.abs(usd);
  return value >= 1_000_000 ? `$${(value / 1_000_000).toFixed(2)}M` : `$${Math.round(value / 1000).toLocaleString("en-US")}k`;
}

function shareCount(shares: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: Math.abs(shares) >= 100 ? 0 : 2 }).format(Math.abs(shares));
}

/** "4:05 PM ET" */
export function etTime(ms: number) {
  return `${new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(ms))} ET`;
}

function issuerName(token: TokenizedStock | undefined) {
  return token?.issuer === "Backpack" ? "Backpack" : token?.issuer === "xStocks" ? "xStocks (Backed)" : "the issuer";
}

/** The text for one large flow, sent to holders who hold or watch that name. */
export function flowText(flow: Flow) {
  const token = TOKENIZED_STOCKS.find((t) => t.symbol === flow.symbol);
  const created = flow.usd > 0;
  const symbol = escapeHtml(flow.symbol);
  return [
    `🏭 <b>Issuer flow · ${symbol}</b>`,
    created
      ? `<b>${flowMoney(flow.usd)}</b> of new ${symbol} created since ${etTime(flow.since)}: ${shareCount(flow.shares)} shares, +${flow.pct.toFixed(1)}% of its supply on Solana.`
      : `<b>${flowMoney(flow.usd)}</b> of ${symbol} burned since ${etTime(flow.since)}: ${shareCount(flow.shares)} shares, −${Math.abs(flow.pct).toFixed(1)}% of its supply on Solana.`,
    `Supply on Solana now: ${flowMoney(flow.supplyUsd)}.`,
    "",
    `<i>Tokens are created when ${issuerName(token)} issues new ones and burned when they are redeemed. Par reads the supply on chain; it does not know who is behind a flow, and a flow is not a buy or sell signal.</i>`,
    "/flows · the last 24 hours · /flows off stops these",
  ].join("\n");
}

/** One line of the /flows list. */
export function flowLine(flow: Flow, now: number) {
  const created = flow.usd > 0;
  const sameDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(flow.at)) ===
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(now));
  return `${created ? "🟢" : "🔴"} <b>${escapeHtml(flow.symbol)}</b> ${created ? "+" : "−"}${flowMoney(flow.usd)} ${created ? "created" : "burned"} · ${created ? "+" : "−"}${Math.abs(flow.pct).toFixed(1)}% · ${sameDay ? "" : "yesterday "}${etTime(flow.at)}`;
}

/** The /flows answer: the large flows of the last 24 hours, and how they are counted. */
export function flowsText(input: { flows: Flow[]; now: number; watchingSince: number | null; footer: string }) {
  const { flows, now } = input;
  const startedRecently = input.watchingSince == null || now - input.watchingSince < FLOW_WINDOW_MS;
  const list =
    flows.length > 0
      ? flows.map((flow) => flowLine(flow, now))
      : [
          startedRecently
            ? `No large flows yet. Par started reading the supply ${input.watchingSince == null ? "just now" : `at ${etTime(input.watchingSince)}`}; flows show from an hour after that.`
            : "No large flows in the last 24 hours.",
        ];
  return [
    "🏭 <b>Issuer flows</b> · the last 24 hours",
    "",
    ...list,
    "",
    `<i>A large flow is at least ${flowMoney(FLOW_MIN_USD)} and ${FLOW_MIN_PCT}% of a token's supply created or burned within about an hour. Par reads each token's supply on Solana every 5 minutes. It does not know who is behind a flow, and a flow is not a buy or sell signal.</i>`,
    "",
    input.footer,
  ].join("\n");
}

/** Under a flow text: that name's page on the Par site, which shows its supply on Solana. */
export function flowKeyboard(symbol: string): InlineKeyboardMarkup {
  return Markup.inlineKeyboard([[Markup.button.url(`📊 ${symbol} on Par`, `${DESK_URL}/s/${encodeURIComponent(symbol)}`)]]).reply_markup;
}

export const FLOWS_ON_TEXT = "🔔 <b>Flow texts on.</b> A text when a large batch of a name in your bag or watch list is created or burned: at most 3 a day, once per name every 6 hours.";
export const FLOWS_OFF_TEXT = "🔕 <b>Flow texts off.</b> /flows still lists the large flows. /flows on turns the texts back on.";
