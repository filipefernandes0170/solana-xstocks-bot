// Supply on Solana: today's supply of every mint (from the shared mint read) against an earlier daily reading kept in
// Netlify Blobs. netlify/functions/record-supply.mts writes one reading a day; this also writes today's reading when
// it is missing, so the history starts with the first visit. Server-only, read-only on chain.

import { getStore } from "@netlify/blobs";
import { multiplierAt } from "../lib/events";
import {
  SUPPLY_STORE,
  baseReading,
  supplyKey,
  supplyKeys,
  supplyRows,
  type SupplyNow,
  type SupplyReading,
  type SupplyResult,
} from "../lib/supply";
import { mintStates } from "./mints";
import { logMessage } from "./solana";

const READINGS_FRESH_MS = 10 * 60_000;
let readingsCache: { at: number; readings: SupplyReading[] } | null = null;

function validReading(value: unknown): value is SupplyReading {
  const reading = value as SupplyReading | null;
  return !!reading && typeof reading.t === "number" && !!reading.rows && typeof reading.rows === "object";
}

async function readings(now: number) {
  if (readingsCache && now - readingsCache.at < READINGS_FRESH_MS) return readingsCache.readings;
  const store = getStore(SUPPLY_STORE);
  const found = await Promise.all(supplyKeys(now).map((key) => store.get(key, { type: "json" }).catch(() => null)));
  const list = found.filter(validReading);
  readingsCache = { at: now, readings: list };
  return list;
}

export async function supplyResult(): Promise<SupplyResult> {
  const now = Date.now();
  const [chain, stored] = await Promise.all([mintStates(now), readings(now).catch((error) => {
    console.warn(`[par] Supply readings: ${logMessage(error)}`);
    return [] as SupplyReading[];
  })]);
  if (!chain) return { ok: false, rows: [], since: null, firstReading: null, asOf: now };

  const current = new Map<string, SupplyNow>();
  const rows: SupplyReading["rows"] = {};
  for (const state of chain.states) {
    const multiplier = multiplierAt(state, now);
    if (state.supplyRaw == null || state.decimals == null || multiplier == null) continue;
    current.set(state.symbol, { raw: state.supplyRaw, decimals: state.decimals, multiplier });
    rows[state.symbol] = { raw: state.supplyRaw, decimals: state.decimals };
  }

  // Today's reading, if the daily recorder has not written one yet.
  const list = [...stored];
  if (Object.keys(rows).length > 0 && !list.some((reading) => supplyKey(reading.t) === supplyKey(chain.at))) {
    const reading: SupplyReading = { t: chain.at, rows };
    list.push(reading);
    readingsCache = { at: now, readings: list };
    try {
      await getStore(SUPPLY_STORE).setJSON(supplyKey(chain.at), reading);
    } catch (error) {
      console.warn(`[par] Supply write: ${logMessage(error)}`);
    }
  }

  const base = baseReading(list, now);
  const firstReading = list.length > 0 ? Math.min(...list.map((reading) => reading.t)) : null;
  return { ok: true, rows: supplyRows(current, base), since: base?.t ?? null, firstReading, asOf: now };
}
