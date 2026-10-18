// What every copy of the desk function shares, in Netlify Blobs (store "desk"). Server-only.
//
// Netlify runs several copies of the function, and each one used to keep its own $1,000 buys and Nasdaq prints in
// memory, so a fresh copy started empty and one answer only carried the buys its own copy had quoted. Here the copies
// share three small JSON blobs:
//   "buys"    the newest $1,000 buy per mint, each with the time it was quoted,
//   "prints"  the last Nasdaq round: when it was read, and each symbol's print with its own time,
//   "wanted"  names a visitor starred, has on screen or holds, with when they asked, so the rotation quotes those first.
// Reads use strong consistency, so a copy sees what another wrote a moment ago. Everything here is best effort: when
// Blobs cannot be reached (the tests, a local run without Netlify), reads return nothing and writes do nothing, and the
// desk works from its own memory as before.

import { getStore } from "@netlify/blobs";
import { mergeBuyMaps, parseBuys, parsePrints, parseWanted, type Buy, type SharedPrints } from "../lib/shared";

const STORE = "desk";
let warned = false;

function store() {
  return getStore({ name: STORE, consistency: "strong" });
}

function warnOnce(error: unknown) {
  if (warned) return;
  warned = true;
  console.warn(`[par] Shared desk state unavailable, using this copy's memory: ${error instanceof Error ? error.message : "Blobs error"}`);
}

async function readKey(key: string): Promise<unknown> {
  try {
    return await store().get(key, { type: "json" });
  } catch (error) {
    warnOnce(error);
    return null;
  }
}

async function writeKey(key: string, value: unknown) {
  try {
    await store().setJSON(key, value);
  } catch (error) {
    warnOnce(error);
  }
}

export async function readSharedBuys(): Promise<Map<string, Buy>> {
  return parseBuys(await readKey("buys"));
}

/**
 * Adds this copy's buys to the shared ones: the newest per mint wins, and buys older than `keepMs` are dropped.
 * The shared blob is read again just before writing, so a buy another copy wrote in between is kept. Returns the merge.
 */
export async function shareBuys(local: Map<string, Buy>, now: number, keepMs: number) {
  const merged = mergeBuyMaps(await readSharedBuys(), local, now, keepMs);
  await writeKey("buys", { v: 1, buys: Object.fromEntries(merged) });
  return merged;
}

export async function readSharedPrints(): Promise<SharedPrints | null> {
  return parsePrints(await readKey("prints"));
}

export async function sharePrints(prints: SharedPrints) {
  await writeKey("prints", { v: 1, readAt: prints.readAt, rows: prints.rows });
}

export async function readWanted(): Promise<Map<string, number>> {
  return parseWanted(await readKey("wanted"));
}

/** Marks these mints as wanted now and forgets requests older than `keepMs`. */
export async function addWanted(mints: string[], now: number, keepMs: number) {
  if (mints.length === 0) return;
  const wanted = await readWanted();
  for (const mint of mints) wanted.set(mint, now);
  for (const [mint, at] of wanted) if (now - at > keepMs) wanted.delete(mint);
  await writeKey("wanted", { v: 1, wanted: Object.fromEntries(wanted) });
}
