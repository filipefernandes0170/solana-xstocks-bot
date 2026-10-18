// Events for the names Par tracks: company filings at the SEC, balance changes (rebases) and transfer pauses read from
// each token's mint on Solana, and US market days off. Pure, so the /events page, /api/events (which @ONPAR_BOT reads)
// and the tests share it. Par lists what official sources publish; it never says how a price will move.

import { CALENDAR_SOURCES, EARLY_CLOSE_LABEL, MARKET_DAYS, addDays, atNewYork, newYorkToUtc, nyDate, weekdayOf } from "./calendar";
import { multiplierLabel } from "./format";
import { TOKENS, TOKEN_BY_SYMBOL } from "./tokens";
import { numberFormat, dateFormat } from "./intl";

/** Filings stay on the page for this many days. */
export const FILING_DAYS = 14;
/** Balance changes that already happened stay this long too. */
export const PAST_REBASE_DAYS = 14;
/** Market days off are shown this far ahead. */
export const MARKET_DAYS_AHEAD = 90;

/**
 * SEC company numbers (CIK) by ticker, from sec.gov/files/company_tickers.json (checked 17 Oct 2026). SPY, QQQ and GLD
 * are funds, not companies, so they have no filings here.
 */
export const SEC_CIK: Record<string, string> = {
  NVDA: "0001045810",
  TSLA: "0001318605",
  AAPL: "0000320193",
  MSFT: "0000789019",
  GOOGL: "0001652044",
  AMZN: "0001018724",
  META: "0001326801",
  CRCL: "0001876042",
  MSTR: "0001050446",
  COIN: "0001679788",
  SPCX: "0001181412",
  PLTR: "0001321655",
  AMD: "0000002488",
  HOOD: "0001783879",
  NFLX: "0001065280",
  MCD: "0000063908",
  MU: "0000723125",
  TTWO: "0000946581",
  SKHY: "0002120882",
  DJT: "0001849635",
};

export type EventKind = "filing" | "rebase" | "market" | "pause";

/** What a filing is about, for its icon and colour. */
export type Topic = "results" | "deals" | "people" | "warnings" | "reports" | "other";

export type ParEvent = {
  /** Stable across reads: "sec:<accession>", "rebase:<symbol>:<seconds>", "market:<date>", "pause:<symbol>". */
  id: string;
  kind: EventKind;
  topic: Topic | null;
  /** When it happens or happened, in ms. For a day off, midnight in New York. */
  at: number;
  allDay: boolean;
  /** The New York date the page groups it under. */
  day: string;
  /** Token symbols it concerns; empty for market days, which concern every name. */
  symbols: string[];
  /** The company or fund, such as "NVIDIA"; null for market days. */
  company: string | null;
  title: string;
  line: string;
  tags: string[];
  /** Filings worth a text to holders (results, deals, leadership, warnings). Other kinds are always marked major. */
  major: boolean;
  source: { label: string; url: string };
};

export type EventsResult = {
  ok: boolean;
  asOf: number;
  events: ParEvent[];
  /** When the oldest company feed was read, so the page can say how fresh filings are; null before any read. */
  filingsAt: number | null;
  /** When the mints were last read on Solana; null if never. */
  chainAt: number | null;
  /** Tickers whose filings have not been read yet (only right after a first deploy). */
  missing: string[];
  notes: string[];
};

// ---------------------------------------------------------------------------------------------------------------
// SEC filings
//
// The list comes from the SEC's submissions API (data.sec.gov), which answers fast. Its acceptance times are not
// used: on 17 Oct 2026 some were four hours off the filing pages. Each filing's own header file (.hdr.sgml) gives the
// exact time; a filing never changes, so that time is read once and kept.

/** The SEC's list of one company's recent filings. */
export function submissionsUrl(cik: string) {
  return `https://data.sec.gov/submissions/CIK${cik}.json`;
}

function filingFolder(cik: string, accession: string) {
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replace(/-/g, "")}`;
}

/** The filing's page at the SEC, with every document in it. */
export function filingIndexUrl(cik: string, accession: string) {
  return `${filingFolder(cik, accession)}/${accession}-index.htm`;
}

/** The filing's header file, about 1 KB, with the time the SEC accepted it. */
export function filingHeaderUrl(cik: string, accession: string) {
  return `${filingFolder(cik, accession)}/${accession}.hdr.sgml`;
}

export type RawFiling = {
  accession: string;
  form: string;
  /** The filing date, a New York date. */
  filed: string;
  /** 8-K item numbers, such as "2.02". */
  items: string[];
  url: string;
};

type Submissions = {
  filings?: { recent?: { accessionNumber?: unknown[]; form?: unknown[]; filingDate?: unknown[]; items?: unknown[] } };
};

/** The filings in a submissions answer filed on or after `since` (a New York date). */
export function parseSubmissions(json: unknown, cik: string, since: string): RawFiling[] {
  const recent = (json as Submissions | null)?.filings?.recent;
  const accessions = Array.isArray(recent?.accessionNumber) ? recent.accessionNumber : [];
  const filings: RawFiling[] = [];
  for (let i = 0; i < accessions.length; i++) {
    const accession = String(accessions[i] ?? "");
    const form = String(recent?.form?.[i] ?? "").trim();
    const filed = String(recent?.filingDate?.[i] ?? "");
    if (!/^\d{10}-\d{2}-\d{6}$/.test(accession) || !form || !/^\d{4}-\d{2}-\d{2}$/.test(filed) || filed < since) continue;
    const items = String(recent?.items?.[i] ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter((item) => /^\d\.\d{2}$/.test(item));
    filings.push({ accession, form, filed, items, url: filingIndexUrl(cik, accession) });
  }
  return filings;
}

/** When the SEC accepted a filing, from its header: "<ACCEPTANCE-DATETIME>20261016173016" is New York time. */
export function parseAcceptance(header: string): number | null {
  const match = header.match(/<ACCEPTANCE-DATETIME>(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
  return newYorkToUtc(year, month, day, hour, minute) + second * 1000;
}

/** 8-K items in plain words, by the SEC's item number. */
export const ITEM_LABELS: Record<string, { label: string; line: string; topic: Topic; major: boolean }> = {
  "1.01": { label: "Major agreement signed", line: "A major agreement was signed", topic: "deals", major: true },
  "1.02": { label: "Major agreement ended", line: "A major agreement ended", topic: "deals", major: true },
  "1.03": { label: "Bankruptcy or receivership", line: "Bankruptcy or receivership", topic: "warnings", major: true },
  "1.04": { label: "Mine safety", line: "A mine safety report", topic: "other", major: false },
  "1.05": { label: "Cybersecurity incident", line: "A material cybersecurity incident", topic: "warnings", major: true },
  "2.01": { label: "Acquisition or sale completed", line: "An acquisition or a sale of assets was completed", topic: "deals", major: true },
  "2.02": { label: "Results", line: "Results of operations and financial condition", topic: "results", major: true },
  "2.03": { label: "New debt", line: "A new debt or financial obligation", topic: "other", major: false },
  "2.04": { label: "Debt trigger", line: "An event that speeds up or increases a debt", topic: "warnings", major: false },
  "2.05": { label: "Restructuring costs", line: "Costs of an exit or a restructuring", topic: "warnings", major: true },
  "2.06": { label: "Impairment", line: "A material impairment", topic: "warnings", major: true },
  "3.01": { label: "Listing notice", line: "A notice about the stock's listing", topic: "warnings", major: true },
  "3.02": { label: "Unregistered share sale", line: "Shares sold without registration", topic: "other", major: false },
  "3.03": { label: "Shareholder rights changed", line: "A change to shareholders' rights", topic: "other", major: false },
  "4.01": { label: "Auditor change", line: "A change of auditor", topic: "other", major: false },
  "4.02": { label: "Past financials not reliable", line: "Past financial statements can no longer be relied on", topic: "warnings", major: true },
  "5.01": { label: "Change in control", line: "A change in control of the company", topic: "deals", major: true },
  "5.02": { label: "Board or executives", line: "Directors or officers leaving or joining, or their pay", topic: "people", major: true },
  "5.03": { label: "Bylaws or fiscal year change", line: "Changes to the charter, the bylaws or the fiscal year", topic: "other", major: false },
  "5.04": { label: "Benefit plan blackout", line: "A pause in trading in employee benefit plans", topic: "other", major: false },
  "5.05": { label: "Code of ethics change", line: "A change to, or a waiver of, the code of ethics", topic: "other", major: false },
  "5.06": { label: "Shell status change", line: "A change in shell company status", topic: "other", major: false },
  "5.07": { label: "Shareholder vote results", line: "The results of a shareholder vote", topic: "other", major: false },
  "5.08": { label: "Director nominations", line: "Shareholder director nominations", topic: "other", major: false },
  "7.01": { label: "Public disclosure", line: "Information shared under Regulation FD", topic: "other", major: false },
  "8.01": { label: "Other events", line: "Other events the company chose to report", topic: "other", major: false },
  "9.01": { label: "Exhibits", line: "Financial statements and exhibits", topic: "other", major: false },
};

/** Which item names the filing when it has several: the most consequential first. */
const ITEM_ORDER = [
  "1.03", "4.02", "5.01", "2.02", "2.01", "1.01", "1.02", "5.02", "1.05", "3.01", "2.06", "2.05", "2.04", "3.03", "2.03", "3.02",
  "4.01", "5.03", "5.07", "5.08", "5.04", "5.05", "5.06", "1.04", "8.01", "7.01", "9.01",
];

/** The other forms shown, in plain words. Anything else (prospectus supplements, merger letters…) is left out. */
const FORMS: Record<string, { title: string; line: string; topic: Topic; major: boolean }> = {
  "6-K": {
    title: "Company report",
    line: "Companies based outside the US file a 6-K for news they publish at home, such as results.",
    topic: "reports",
    major: true,
  },
  "10-Q": { title: "Quarterly report", line: "The full quarterly report, with the financial statements.", topic: "reports", major: false },
  "10-K": { title: "Annual report", line: "The full annual report, with the financial statements and the risks.", topic: "reports", major: false },
  "20-F": { title: "Annual report", line: "The annual report of a company based outside the US.", topic: "reports", major: false },
  "S-1": { title: "Share sale registration", line: "A registration to sell new shares.", topic: "other", major: false },
  "F-1": { title: "Share sale registration", line: "A registration to sell new shares, by a company based outside the US.", topic: "other", major: false },
  "S-4": { title: "Merger registration", line: "A registration for shares issued in a merger or an exchange offer.", topic: "deals", major: false },
  "F-4": { title: "Merger registration", line: "A registration for shares issued in a merger or an exchange offer.", topic: "deals", major: false },
  "DEF 14A": { title: "Shareholder meeting", line: "The proxy statement for a shareholder meeting: the votes, the board and pay.", topic: "other", major: false },
};

/** True for the forms the page shows (8-K, 6-K, the reports…); the server reads acceptance times only for these. */
export function shownForm(form: string) {
  const base = form.endsWith("/A") ? form.slice(0, -2) : form;
  return base === "8-K" || base in FORMS;
}

/** The token name for a ticker ("NVIDIA"), and the token symbols that track it. */
export function companyFor(underlying: string) {
  const tokens = TOKENS.filter((token) => token.underlying === underlying);
  return { name: tokens[0]?.name ?? underlying, symbols: tokens.map((token) => token.symbol) };
}

/**
 * One filing as an event, or null for a form the page does not show. `at` is when the SEC accepted it; while that
 * is unknown the filing sits under its filing date with no time, and it is never texted.
 */
export function filingEvent(raw: RawFiling, underlying: string, at: number | null): ParEvent | null {
  if (!shownForm(raw.form)) return null;
  const { name, symbols } = companyFor(underlying);
  const base = {
    id: `sec:${raw.accession}`,
    kind: "filing" as const,
    at: at ?? atNewYork(raw.filed, 0),
    allDay: at == null,
    day: at != null ? nyDate(at) : raw.filed,
    symbols,
    company: name,
  };
  const source = { label: "SEC filing", url: raw.url };
  const amended = raw.form.endsWith("/A");

  if (raw.form === "8-K" || raw.form === "8-K/A") {
    const codes = [...new Set(raw.items)];
    const main = ITEM_ORDER.find((code) => codes.includes(code)) ?? codes[0] ?? null;
    const info = main ? ITEM_LABELS[main] : undefined;
    const others = codes.filter((code) => code !== main && code !== "9.01").map((code) => ITEM_LABELS[code]?.label ?? `Item ${code}`);
    const lines = codes
      .filter((code) => code !== "9.01" || codes.length === 1)
      .map((code) => ITEM_LABELS[code]?.line)
      .filter((line): line is string => !!line);
    return {
      ...base,
      topic: info?.topic ?? "other",
      title: `${info?.label ?? (main ? `Item ${main}` : "Current report")}${amended ? " (amended)" : ""}`,
      line: lines.length > 0 ? `${lines.join(". ")}.` : "A current report to the SEC.",
      tags: [main ? `${raw.form} · Item ${main}` : raw.form, ...others],
      major: !amended && codes.some((code) => ITEM_LABELS[code]?.major === true),
      source,
    };
  }

  const form = FORMS[amended ? raw.form.slice(0, -2) : raw.form];
  return {
    ...base,
    topic: form.topic,
    title: `${form.title}${amended ? " (amended)" : ""}`,
    line: form.line,
    tags: [raw.form],
    major: form.major && !amended,
    source,
  };
}

/** A company's filings from the last FILING_DAYS days as events, newest first. `accepted` maps accession to time. */
export function filingEvents(raws: RawFiling[], underlying: string, accepted: Record<string, number>, now: number) {
  const since = now - FILING_DAYS * 86_400_000;
  const sinceDay = nyDate(since);
  return raws
    .map((raw) => {
      const at = typeof accepted[raw.accession] === "number" ? accepted[raw.accession] : null;
      if (at != null ? at < since || at > now + 60_000 : raw.filed < sinceDay) return null;
      return filingEvent(raw, underlying, at);
    })
    .filter((event): event is ParEvent => event != null)
    .sort((a, b) => b.at - a.at);
}

// ---------------------------------------------------------------------------------------------------------------
// The mints on Solana: balance changes and pauses

export type MintState = {
  symbol: string;
  /** True when the issuer has paused every transfer; null when the mint could not be read. */
  paused: boolean | null;
  multiplier: number | null;
  newMultiplier: number | null;
  /** When newMultiplier takes over, in ms; null when no change was ever set. */
  effectiveAt: number | null;
  /** False when the mint has no multiplier at all (one token is one share). */
  scaled: boolean;
  /** The raw supply on Solana (an integer as text) and the mint's decimals; null when not read. */
  supplyRaw: string | null;
  decimals: number | null;
};

type Extension = { extension?: string; state?: Record<string, unknown> };
export type MintAccount = { data?: { parsed?: { type?: string; info?: { extensions?: Extension[]; supply?: string; decimals?: number } } } } | null;

function positive(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** What one jsonParsed mint account says about pauses and multipliers. */
export function parseMintState(symbol: string, account: MintAccount | undefined): MintState {
  const parsed = account?.data?.parsed;
  if (!parsed || parsed.type !== "mint") {
    return { symbol, paused: null, multiplier: null, newMultiplier: null, effectiveAt: null, scaled: false, supplyRaw: null, decimals: null };
  }
  const extensions = parsed.info?.extensions ?? [];
  const find = (name: string) => extensions.find((entry) => entry.extension === name)?.state ?? null;
  const pausable = find("pausableConfig");
  const scaled = find("scaledUiAmountConfig");
  let at = Number(scaled?.newMultiplierEffectiveTimestamp);
  if (Number.isFinite(at) && at > 1e12) at = Math.floor(at / 1000);
  return {
    symbol,
    // A mint without the pause extension cannot be paused at all.
    paused: pausable ? pausable.paused === true : false,
    multiplier: positive(scaled?.multiplier),
    newMultiplier: positive(scaled?.newMultiplier),
    effectiveAt: Number.isFinite(at) && at > 0 ? at * 1000 : null,
    scaled: scaled != null,
    supplyRaw: typeof parsed.info?.supply === "string" && /^\d+$/.test(parsed.info.supply) ? parsed.info.supply : null,
    decimals: Number.isInteger(parsed.info?.decimals) ? (parsed.info?.decimals as number) : null,
  };
}

/**
 * The multiplier in force at `now`: the new one once its time has come. 1 for a mint without a multiplier; null when
 * the mint has one but it could not be read (never guessed).
 */
export function multiplierAt(state: MintState, now: number) {
  if (!state.scaled) return state.paused == null ? null : 1;
  if (state.newMultiplier != null && state.effectiveAt != null && state.effectiveAt <= now) return state.newMultiplier;
  return state.multiplier;
}

function explorer(mint: string) {
  return { label: "Mint on Solana Explorer", url: `https://explorer.solana.com/address/${mint}` };
}

function amount(value: number) {
  return numberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function utcTime(ms: number) {
  return `${dateFormat("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms))} UTC`;
}

/** Balance changes still ahead, and those from the last PAST_REBASE_DAYS days. */
export function rebaseEvents(states: MintState[], now: number): ParEvent[] {
  const events: ParEvent[] = [];
  for (const state of states) {
    const token = TOKEN_BY_SYMBOL.get(state.symbol);
    const { multiplier: from, newMultiplier: to, effectiveAt: at } = state;
    if (!token || from == null || to == null || at == null) continue;
    if (Math.abs(to - from) / from < 1e-8) continue;
    const ahead = at > now;
    if (!ahead && now - at > PAST_REBASE_DAYS * 86_400_000) continue;
    const shown = amount((100 * to) / from);
    events.push({
      id: `rebase:${token.symbol}:${Math.floor(at / 1000)}`,
      kind: "rebase",
      topic: null,
      at,
      allDay: false,
      day: nyDate(at),
      symbols: [token.symbol],
      company: token.name,
      title: ahead ? "Balance change" : "Balance changed",
      line: ahead
        ? `The multiplier goes from ${multiplierLabel(from)} to ${multiplierLabel(to)}: 100 tokens will show as ${shown}. The price per token moves the other way, so the value should not change. Don't trade through it.`
        : `The multiplier went from ${multiplierLabel(from)} to ${multiplierLabel(to)}: 100 tokens now show as ${shown}. The price per token moved the other way.`,
      tags: [utcTime(at), to > from ? "Balance up" : "Balance down"],
      major: true,
      source: explorer(token.mint),
    });
  }
  return events;
}

/** A pause the chain shows right now, one per paused token. */
export function pauseEvents(states: MintState[], chainAt: number): ParEvent[] {
  return states.flatMap((state): ParEvent[] => {
    const token = TOKEN_BY_SYMBOL.get(state.symbol);
    if (!token || state.paused !== true) return [];
    return [
      {
        id: `pause:${token.symbol}`,
        kind: "pause",
        topic: null,
        at: chainAt,
        allDay: false,
        day: nyDate(chainAt),
        symbols: [token.symbol],
        company: token.name,
        title: "Transfers paused",
        line: "The issuer has paused every transfer of this token on chain. Until it lifts, nobody can send or sell it. Par reads the mint every few minutes.",
        tags: ["On chain now"],
        major: true,
        source: explorer(token.mint),
      },
    ];
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Market days

/** Market days off and early closes from today to MARKET_DAYS_AHEAD days ahead. */
export function marketEvents(now: number, daysAhead = MARKET_DAYS_AHEAD): ParEvent[] {
  const today = nyDate(now);
  const last = addDays(today, daysAhead);
  return MARKET_DAYS.filter((day) => day.date >= today && day.date <= last).map((day) => {
    const closed = day.kind === "closed";
    return {
      id: `market:${day.date}`,
      kind: "market",
      topic: null,
      at: atNewYork(day.date, closed ? 0 : 13 * 60),
      allDay: closed,
      day: day.date,
      symbols: [],
      company: null,
      title: closed ? "US markets closed" : `Early close at ${EARLY_CLOSE_LABEL}`,
      line: closed
        ? `${day.name}. There is no Nasdaq session, so no name is called Fair. Token pools on Solana keep trading.`
        : `${day.name}. Nasdaq's regular session ends at ${EARLY_CLOSE_LABEL} instead of 4:00 PM, so Fair calls stop early.`,
      tags: [day.name],
      major: true,
      source: CALENDAR_SOURCES[day.source],
    };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Reading the list

/** Soonest first for what is ahead (a pause still in force counts as ahead) and newest first for what is past. */
export function splitByTime(events: ParEvent[], now: number) {
  const today = nyDate(now);
  const ahead = events
    .filter((event) => event.kind === "pause" || (event.kind === "market" && event.allDay ? event.day >= today : event.at > now))
    .sort((a, b) => a.at - b.at);
  const ids = new Set(ahead.map((event) => event.id));
  const past = events.filter((event) => !ids.has(event.id)).sort((a, b) => b.at - a.at);
  return { ahead, past };
}

/** Consecutive events of the same New York day, in the order given. */
export function groupByDay(events: ParEvent[]) {
  const groups: { day: string; events: ParEvent[] }[] = [];
  for (const event of events) {
    const last = groups[groups.length - 1];
    if (last && last.day === event.day) last.events.push(event);
    else groups.push({ day: event.day, events: [event] });
  }
  return groups;
}

/** "Thu 26 Nov", with the year when it is not this year's. */
export function dayTitle(date: string, today: string) {
  const [year, month, day] = date.split("-").map(Number);
  // Spelled out, not by Intl: engines differ ("Sep" or "Sept", a comma before the year), and the bot must match.
  return `${WEEKDAYS[weekdayOf(date)]} ${day} ${MONTHS[month - 1]}${date.slice(0, 4) !== today.slice(0, 4) ? ` ${year}` : ""}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Today", "Tomorrow", "Yesterday", "In 40 days" or "3 days ago". */
export function relativeDay(date: string, today: string) {
  const [y1, m1, d1] = today.split("-").map(Number);
  const [y2, m2, d2] = date.split("-").map(Number);
  const days = Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return days > 0 ? `In ${days} days` : `${-days} days ago`;
}

/** "9:04 AM ET" */
export function etTime(ms: number) {
  return `${dateFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(ms))} ET`;
}

/** The underlying tickers an event concerns ("NVDA"), for the company filter. */
export function eventUnderlyings(event: ParEvent) {
  return [...new Set(event.symbols.map((symbol) => TOKEN_BY_SYMBOL.get(symbol)?.underlying).filter((u): u is string => !!u))];
}
