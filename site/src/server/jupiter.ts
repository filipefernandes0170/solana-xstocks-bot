// Every Jupiter API call goes through here. Server-only.
//
// Jupiter's limits, as enforced (checked 17 Oct 2026 in the portal's Billing page and in the
// x-ratelimit headers): 1 request every 2 seconds, counted over 10 s windows (5 per window), both
// without a key (counted per IP) and on the free plan (counted per organisation). The docs table that
// says 1 request/s on the free plan does not match what the portal enforces. A key still helps on
// Netlify, where the function's IP is shared with other sites: with a key the window is ours alone.
// Do not give the bot the same key: they would then share one window instead of having one each.
// Bursts are refused with HTTP 429. This module spaces requests out inside one function instance, reads
// Jupiter's counters to stop before the limit, and after a 429 stops calling until the window has passed.

import { env } from "./http";

// 2.1 s apart: 1 request every 2 seconds, with a little room. The same with or without a key (see above).
const GAP_MS = 2100;
const DEFAULT_COOL_DOWN_MS = 10_000;

let nextSlotAt = 0;
let coolDownUntil = 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function hasJupiterKey() {
  return env("JUPITER_API_KEY") !== "";
}

export function jupiterGapMs() {
  return GAP_MS;
}

/** api.jup.ag needs a key; lite-api.jup.ag is the keyless host. */
export function jupiterUrl(pathAndQuery: string) {
  return `${hasJupiterKey() ? "https://api.jup.ag" : "https://lite-api.jup.ag"}${pathAndQuery}`;
}

/**
 * Reserves the next request slot. Returns false without waiting when Jupiter recently answered 429,
 * or when the slot is further away than maxWaitMs (the caller then uses what it already has).
 */
export async function takeSlot(maxWaitMs: number, now = Date.now()): Promise<boolean> {
  if (now < coolDownUntil) return false;
  const start = Math.max(now, nextSlotAt);
  if (start - now > maxWaitMs) return false;
  nextSlotAt = start + jupiterGapMs();
  if (start > now) await sleep(start - now);
  return true;
}

/** How long to stay away after a 429. Accepts seconds, or an epoch time in seconds or milliseconds. */
export function coolDownMs(headers: Headers, now = Date.now()) {
  const raw = headers.get("x-ratelimit-reset") ?? headers.get("retry-after");
  const value = Number(raw);
  if (raw == null || !Number.isFinite(value) || value <= 0) return DEFAULT_COOL_DOWN_MS;
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
  console.log(`[par] Jupiter window: ${used} used, ${left} left (limit about ${used + left} per window)${hasJupiterKey() ? ", with key" : ", keyless"}`);
}

/** GET a Jupiter endpoint as JSON. Returns null (and logs why) instead of throwing. */
export async function jupiterGet<T>(pathAndQuery: string, options: { maxWaitMs?: number; timeoutMs?: number } = {}): Promise<T | null> {
  const { maxWaitMs = 4000, timeoutMs = 8000 } = options;
  if (!(await takeSlot(maxWaitMs))) return null;
  const headers: Record<string, string> = { accept: "application/json" };
  const key = env("JUPITER_API_KEY");
  if (key) headers["x-api-key"] = key;
  const label = pathAndQuery.split("?")[0];
  try {
    const response = await fetch(jupiterUrl(pathAndQuery), { headers, signal: AbortSignal.timeout(timeoutMs) });
    const current = response.headers.get("x-ratelimit-current");
    const remaining = response.headers.get("x-ratelimit-remaining");
    logLimitOnce(current, remaining);
    if (response.status === 429) {
      const wait = coolDownMs(response.headers);
      coolDownUntil = Date.now() + wait;
      console.warn(
        `[par] Jupiter ${label}: rate limited (429, ${current ?? "?"} used, ${remaining ?? "?"} left), pausing ${Math.round(wait / 1000)} s${hasJupiterKey() ? "" : " (no JUPITER_API_KEY set)"}`,
      );
      return null;
    }
    if (windowNearlyFull(remaining)) coolDownUntil = Math.max(coolDownUntil, Date.now() + coolDownMs(response.headers));
    if (!response.ok) {
      console.warn(`[par] Jupiter ${label}: HTTP ${response.status}`);
      return null;
    }
    return (await response.json()) as T;
  } catch (error) {
    console.warn(`[par] Jupiter ${label}: ${error instanceof Error ? error.name : "request failed"}`);
    return null;
  }
}

/** Test hook: forget the slot and the cool-down. */
export function resetJupiterLimiter() {
  nextSlotAt = 0;
  coolDownUntil = 0;
}
