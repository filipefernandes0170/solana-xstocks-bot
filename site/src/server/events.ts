// The /events data: SEC filings, balance changes and pauses (one read of every mint on Solana) and the market
// calendar. Server-only and read-only.
//
// SEC: each company's list from the submissions API, then each new filing's header file for the exact time it was
// accepted (read once: a filing never changes). The SEC asks for a declared User-Agent and at most 10 requests a
// second; this stays at 5 a second or less per instance, and keeps what it read in Netlify Blobs for every instance.

import { getStore } from "@netlify/blobs";
import { addDays, nyDate } from "../lib/calendar";
import {
  FILING_DAYS,
  SEC_CIK,
  filingEvents,
  filingHeaderUrl,
  marketEvents,
  parseAcceptance,
  parseSubmissions,
  pauseEvents,
  rebaseEvents,
  shownForm,
  submissionsUrl,
  type EventsResult,
  type RawFiling,
} from "../lib/events";
import { mintStates } from "./mints";
import { logMessage } from "./solana";

const STORE = "events";
const KEY = "sec-filings";
const SEC_USER_AGENT = "Par desk https://onpar.site";
/** A company's list is read again once it is this old. */
const LIST_FRESH_MS = 5 * 60_000;
const LISTS_PER_CALL = 10;
const HEADERS_PER_CALL = 12;
const SPACING_MS = 200;

type Stored = {
  companies: Record<string, { at: number; filings: RawFiling[] }>;
  /** When the SEC accepted each filing, by accession number. */
  accepted: Record<string, number>;
};

let memory: { at: number; stored: Stored } | null = null;
let refreshing: Promise<Stored> | null = null;
// After a round where the SEC answered nothing, this instance waits a minute before asking again.
let pauseUntil = 0;

function empty(): Stored {
  return { companies: {}, accepted: {} };
}

async function readStored(): Promise<Stored> {
  if (memory && Date.now() - memory.at < 30_000) return memory.stored;
  try {
    const value = (await getStore(STORE).get(KEY, { type: "json" })) as Stored | null;
    const stored = value && typeof value === "object" ? { companies: value.companies ?? {}, accepted: value.accepted ?? {} } : empty();
    memory = { at: Date.now(), stored };
    return stored;
  } catch (error) {
    console.warn(`[par] Events store: ${logMessage(error)}`);
    return memory?.stored ?? empty();
  }
}

async function secGet(url: string) {
  const response = await fetch(url, { headers: { "User-Agent": SEC_USER_AGENT }, signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`SEC answered ${response.status}`);
  return response;
}

/** Runs the jobs SPACING_MS apart (they overlap once started), so the SEC sees at most 5 requests a second. */
async function spaced<T, R>(jobs: T[], run: (job: T) => Promise<R>) {
  return Promise.all(
    jobs.map(async (job, index) => {
      await new Promise((resolve) => setTimeout(resolve, index * SPACING_MS));
      return run(job);
    }),
  );
}

async function refresh(now: number): Promise<Stored> {
  const current = await readStored();
  const stored: Stored = { companies: { ...current.companies }, accepted: { ...current.accepted } };
  if (now < pauseUntil) return stored;
  const since = addDays(nyDate(now), -(FILING_DAYS + 1));

  // 1. The stalest company lists.
  const due = Object.keys(SEC_CIK)
    .map((ticker) => ({ ticker, at: stored.companies[ticker]?.at ?? 0 }))
    .filter((entry) => now - entry.at >= LIST_FRESH_MS)
    .sort((a, b) => a.at - b.at)
    .slice(0, LISTS_PER_CALL);
  const lists = await spaced(due, async ({ ticker }) => {
    try {
      const json = await (await secGet(submissionsUrl(SEC_CIK[ticker]))).json();
      return { ticker, filings: parseSubmissions(json, SEC_CIK[ticker], since) };
    } catch (error) {
      console.warn(`[par] SEC list ${ticker}: ${logMessage(error)}`);
      return { ticker, filings: null };
    }
  });
  let changed = false;
  for (const { ticker, filings } of lists) {
    if (!filings) continue;
    stored.companies[ticker] = { at: Date.now(), filings };
    changed = true;
  }

  // 2. The exact time of each filing shown that has none yet, newest first.
  const missing = Object.entries(stored.companies)
    .flatMap(([ticker, entry]) => entry.filings.filter((filing) => shownForm(filing.form) && stored.accepted[filing.accession] == null).map((filing) => ({ ticker, filing })))
    .sort((a, b) => (a.filing.filed < b.filing.filed ? 1 : -1))
    .slice(0, HEADERS_PER_CALL);
  const headers = await spaced(missing, async ({ ticker, filing }) => {
    try {
      const at = parseAcceptance(await (await secGet(filingHeaderUrl(SEC_CIK[ticker], filing.accession))).text());
      return { accession: filing.accession, at };
    } catch (error) {
      console.warn(`[par] SEC header ${ticker}: ${logMessage(error)}`);
      return { accession: filing.accession, at: null };
    }
  });
  for (const { accession, at } of headers) {
    if (at == null) continue;
    stored.accepted[accession] = at;
    changed = true;
  }

  const asked = lists.length + headers.length;
  if (asked > 0 && lists.every((list) => !list.filings) && headers.every((header) => header.at == null)) pauseUntil = Date.now() + 60_000;
  if (!changed) return stored;

  // Keep only the times of filings still listed.
  const listed = new Set(Object.values(stored.companies).flatMap((entry) => entry.filings.map((filing) => filing.accession)));
  for (const accession of Object.keys(stored.accepted)) if (!listed.has(accession)) delete stored.accepted[accession];
  memory = { at: Date.now(), stored };
  try {
    await getStore(STORE).setJSON(KEY, stored);
  } catch (error) {
    console.warn(`[par] Events store write: ${logMessage(error)}`);
  }
  return stored;
}

/** One refresh at a time per instance; a failure keeps the last copy. */
async function currentFilings(now: number) {
  refreshing ??= refresh(now).finally(() => {
    refreshing = null;
  });
  try {
    return await refreshing;
  } catch (error) {
    console.warn(`[par] SEC: ${logMessage(error)}`);
    return readStored();
  }
}

export async function eventsResult(): Promise<EventsResult> {
  const now = Date.now();
  const [stored, mints] = await Promise.all([currentFilings(now), mintStates(now)]);
  const notes: string[] = [];

  const tickers = Object.keys(SEC_CIK);
  const missing = tickers.filter((ticker) => !stored.companies[ticker]);
  const readTimes = tickers.map((ticker) => stored.companies[ticker]?.at).filter((at): at is number => typeof at === "number");
  const filingsAt = readTimes.length > 0 ? Math.min(...readTimes) : null;
  if (missing.length === tickers.length) notes.push("SEC filings could not be read just now. They appear on the next visit.");
  else if (filingsAt != null && now - filingsAt > 30 * 60_000) notes.push("The SEC has not answered lately, so the newest filings may be missing.");
  if (!mints) notes.push("Solana did not answer, so balance changes and pauses are missing for now.");

  const events = [
    ...tickers.flatMap((ticker) => filingEvents(stored.companies[ticker]?.filings ?? [], ticker, stored.accepted, now)),
    ...(mints ? rebaseEvents(mints.states, now) : []),
    ...(mints ? pauseEvents(mints.states, mints.at) : []),
    ...marketEvents(now),
  ];
  return { ok: notes.length === 0, asOf: now, events, filingsAt, chainAt: mints?.at ?? null, missing, notes };
}
