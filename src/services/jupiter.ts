// Every Jupiter API call the bot makes goes through here.
//
// Jupiter's limits (developers.jup.ag/docs/portal/rate-limits, checked 17 Oct 2026): without a key,
// 0.5 requests per second (30 a minute); with a free key, 1 per second (60 a minute), counted per
// organisation, so the bot and the Par site share it when they use the same key. Bursts are refused
// with HTTP 429. Requests are spaced out here, and after a 429 the bot stops calling until the
// window has passed.

import axios from "axios";
import { config } from "../config/index.js";

const GAP_WITH_KEY_MS = 1100;
const GAP_KEYLESS_MS = 2100;
const DEFAULT_COOL_DOWN_MS = 10_000;

let nextSlotAt = 0;
let coolDownUntil = 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function hasJupiterKey() {
  return Boolean(config.jupiterApiKey);
}

export function jupiterGapMs() {
  return hasJupiterKey() ? GAP_WITH_KEY_MS : GAP_KEYLESS_MS;
}

/** api.jup.ag needs a key; lite-api.jup.ag is the keyless host. */
export function jupiterBase() {
  return hasJupiterKey() ? "https://api.jup.ag" : "https://lite-api.jup.ag";
}

/** True while the bot is staying away after a 429. */
export function jupiterPaused(now = Date.now()) {
  return now < coolDownUntil;
}

/**
 * Reserves the next request slot. Returns false without waiting when Jupiter recently answered 429,
 * or when the slot is further away than maxWaitMs (the caller then uses what it already has).
 */
export async function takeSlot(maxWaitMs: number, now = Date.now()): Promise<boolean> {
  if (jupiterPaused(now)) return false;
  const start = Math.max(now, nextSlotAt);
  if (start - now > maxWaitMs) return false;
  nextSlotAt = start + jupiterGapMs();
  if (start > now) await sleep(start - now);
  return true;
}

/** How long to stay away after a 429. Accepts seconds, or an epoch time in seconds or milliseconds. */
export function coolDownMs(raw: unknown, now = Date.now()) {
  const value = Number(raw);
  if (raw == null || raw === "" || !Number.isFinite(value) || value <= 0) return DEFAULT_COOL_DOWN_MS;
  const ms = value > 1e12 ? value - now : value > 1e9 ? value * 1000 - now : value * 1000;
  return Math.min(Math.max(ms, 1000), 60_000);
}

/** GET a Jupiter endpoint as JSON. Returns null (and logs why) instead of throwing. */
export async function jupiterGet<T>(
  path: string,
  params: Record<string, string>,
  options: { maxWaitMs?: number; timeoutMs?: number } = {},
): Promise<T | null> {
  const { maxWaitMs = 4000, timeoutMs = 8000 } = options;
  if (!(await takeSlot(maxWaitMs))) return null;
  const headers: Record<string, string> = { accept: "application/json" };
  if (config.jupiterApiKey) headers["x-api-key"] = config.jupiterApiKey;
  try {
    const { data } = await axios.get(`${jupiterBase()}${path}`, { params, headers, timeout: timeoutMs });
    return data as T;
  } catch (err) {
    const response = axios.isAxiosError(err) ? err.response : undefined;
    if (response?.status === 429) {
      const wait = coolDownMs(response.headers?.["x-ratelimit-reset"] ?? response.headers?.["retry-after"]);
      coolDownUntil = Date.now() + wait;
      console.warn(
        `Jupiter ${path}: rate limited (429), pausing ${Math.round(wait / 1000)} s${hasJupiterKey() ? "" : " (no JUPITER_API_KEY set)"}`,
      );
      return null;
    }
    console.warn(`Jupiter ${path}: ${response ? `HTTP ${response.status}` : err instanceof Error ? err.message : "request failed"}`);
    return null;
  }
}

/** Test hook: forget the slot and the cool-down. */
export function resetJupiterLimiter() {
  nextSlotAt = 0;
  coolDownUntil = 0;
}
