// Every Jupiter API call goes through here. Server-only.
//
// Jupiter's limits (developers.jup.ag/docs/portal/rate-limits, checked 17 Oct 2026): without a key,
// 0.5 requests per second (30 a minute); with a free key, 1 per second (60 a minute), counted per
// organisation, so the bot and the site share it when they use the same key. Bursts are refused
// with HTTP 429. This module spaces requests out inside one function instance, and after a 429 it
// stops calling until the window has passed.

import { env } from "./http";

const GAP_WITH_KEY_MS = 1100;
const GAP_KEYLESS_MS = 2100;
const DEFAULT_COOL_DOWN_MS = 10_000;

let nextSlotAt = 0;
let coolDownUntil = 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function hasJupiterKey() {
  return env("JUPITER_API_KEY") !== "";
}

export function jupiterGapMs() {
  return hasJupiterKey() ? GAP_WITH_KEY_MS : GAP_KEYLESS_MS;
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
    if (response.status === 429) {
      const wait = coolDownMs(response.headers);
      coolDownUntil = Date.now() + wait;
      console.warn(`[par] Jupiter ${label}: rate limited (429), pausing ${Math.round(wait / 1000)} s${hasJupiterKey() ? "" : " (no JUPITER_API_KEY set)"}`);
      return null;
    }
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
