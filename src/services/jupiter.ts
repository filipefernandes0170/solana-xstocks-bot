// Every Jupiter API call the bot makes goes through here.
//
// Jupiter's limits, as enforced (checked 17 Oct 2026 in the portal's Billing page and in the
// x-ratelimit headers): 1 request every 2 seconds, counted over 10 s windows (5 per window), both
// without a key (counted per IP) and on the free plan (counted per organisation). The docs table that
// says 1 request/s on the free plan does not match what the portal enforces. A key still helps on
// Netlify, where the function's IP is shared with other sites: with a key the window is ours alone.
// Do not give the bot the same key: they would then share one window instead of having one each.
// Bursts are refused with HTTP 429. Requests are spaced out here, the counters are read to stop before
// the limit, and after a 429 the bot stops calling until the window has passed.

import axios from "axios";
import { config } from "../config/index.js";

// 2.1 s apart: 1 request every 2 seconds, with a little room. The same with or without a key (see above).
const GAP_MS = 2100;
const DEFAULT_COOL_DOWN_MS = 10_000;

let nextSlotAt = 0;
let coolDownUntil = 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function hasJupiterKey() {
  return Boolean(config.jupiterApiKey);
}

export function jupiterGapMs() {
  return GAP_MS;
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

let limitLogged = false;

/**
 * Jupiter sends x-ratelimit-remaining and x-ratelimit-reset on 200 and 429 answers. When nothing is left in
 * the window, the limiter pauses until the reset, so it stops before a 429 instead of after one. Remaining can
 * be negative when over the limit.
 */
export function windowNearlyFull(remaining: unknown) {
  if (remaining == null || remaining === "") return false;
  const value = Number(remaining);
  return Number.isFinite(value) && value <= 0;
}

/** Logs the window once per process, so the plan Jupiter applies to this key shows in the logs. */
function logLimitOnce(current: unknown, remaining: unknown) {
  if (limitLogged || current == null || remaining == null) return;
  limitLogged = true;
  const used = Number(current);
  const left = Number(remaining);
  console.log(`Jupiter window: ${used} used, ${left} left (limit about ${used + left} per window)${hasJupiterKey() ? ", with key" : ", keyless"}`);
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
    const { data, headers: answer } = await axios.get(`${jupiterBase()}${path}`, { params, headers, timeout: timeoutMs });
    logLimitOnce(answer["x-ratelimit-current"], answer["x-ratelimit-remaining"]);
    if (windowNearlyFull(answer["x-ratelimit-remaining"])) {
      coolDownUntil = Math.max(coolDownUntil, Date.now() + coolDownMs(answer["x-ratelimit-reset"]));
    }
    return data as T;
  } catch (err) {
    const response = axios.isAxiosError(err) ? err.response : undefined;
    if (response?.status === 429) {
      const wait = coolDownMs(response.headers?.["x-ratelimit-reset"] ?? response.headers?.["retry-after"]);
      coolDownUntil = Date.now() + wait;
      console.warn(
        `Jupiter ${path}: rate limited (429, ${response.headers?.["x-ratelimit-current"] ?? "?"} used, ${response.headers?.["x-ratelimit-remaining"] ?? "?"} left), pausing ${Math.round(wait / 1000)} s${hasJupiterKey() ? "" : " (no JUPITER_API_KEY set)"}`,
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
