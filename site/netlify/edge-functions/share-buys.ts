// Edge Function, POST /api/share-buys: @ONPAR_BOT shares its $1,000 buy quotes with the site.
//
// The bot runs on its own server with its own Jupiter allowance and quotes every name about once a minute: the same
// $1,000 USDC buy the site makes, priced per share the same way (checked on 18 Oct 2026: the share multiplier and
// decimals the bot reads on chain equal Jupiter's for all 25 names). It sends them here after each round, and they go
// into the buys blob every copy of the site already shares (store "desk", key "buys", src/server/deskShare.ts), so the
// desk shows fresh buys even for the first visitor after a quiet spell. The site still quotes on its own as before.
//
// Only a request carrying the shared secret is accepted: SHARE_BUYS_SECRET, the same value in Netlify and in the bot's
// .env. Without it this answers 404 and nothing changes. Every value is checked; the site also never shows a buy for a
// thin pool or one more than 5x away from the last trade (buyShown in src/server/quotes.ts).
// An Edge Function is billed as one web request (2 credits per 10,000 on the free plan), not as function compute.
// Self-contained on purpose: Edge Functions run on Deno and only import the npm package below.

import { getStore } from "@netlify/blobs";

const STORE = "desk";
const KEY = "buys";
/** The same as BUY_KEEP_MS in src/server/quotes.ts (BUY_SHOWN_MS in src/lib/verdict.ts). */
const KEEP_MS = 180_000;
const MAX_BODY = 20_000;
const MAX_ENTRIES = 40;
const MIN_SECRET = 32;
const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export type SharedBuy = { price: number; impactPct: number; at: number };

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Compares in constant time, so the answer time does not tell how much of a guess was right. */
export function sameSecret(given: string, expected: string) {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}

/** A well-formed buy that is recent: quoted at most KEEP_MS ago and at most a minute ahead (clocks differ a little). */
function validBuy(value: unknown, now: number): SharedBuy | null {
  const buy = value as Partial<SharedBuy> | null;
  if (!buy || typeof buy !== "object") return null;
  if (!finite(buy.price) || buy.price <= 0 || buy.price > 10_000_000) return null;
  if (!finite(buy.impactPct) || buy.impactPct < 0 || buy.impactPct > 100) return null;
  if (!finite(buy.at) || buy.at < now - KEEP_MS || buy.at > now + 60_000) return null;
  return { price: buy.price, impactPct: buy.impactPct, at: buy.at };
}

/** The buys in a request from the bot: { v: 1, buys: [{ mint, price, impactPct, at }] }, newest per mint. */
export function acceptBuys(raw: unknown, now: number): Map<string, SharedBuy> {
  const out = new Map<string, SharedBuy>();
  const body = raw as { v?: unknown; buys?: unknown } | null;
  if (!body || body.v !== 1 || !Array.isArray(body.buys) || body.buys.length > MAX_ENTRIES) return out;
  for (const row of body.buys) {
    const mint = (row as { mint?: unknown } | null)?.mint;
    if (typeof mint !== "string" || !MINT.test(mint)) continue;
    const buy = validBuy(row, now);
    const held = out.get(mint);
    if (buy && (!held || buy.at > held.at)) out.set(mint, buy);
  }
  return out;
}

/** The blob as stored ({ v: 1, buys: { mint: buy } }), keeping only what is still valid. */
export function heldBuys(raw: unknown, now: number): Map<string, SharedBuy> {
  const out = new Map<string, SharedBuy>();
  const buys = (raw as { buys?: unknown } | null)?.buys;
  if (!buys || typeof buys !== "object" || Array.isArray(buys)) return out;
  for (const [mint, value] of Object.entries(buys as Record<string, unknown>)) {
    const buy = MINT.test(mint) ? validBuy(value, now) : null;
    if (buy) out.set(mint, buy);
  }
  return out;
}

/** The newest buy per mint from both. */
export function mergeShared(held: Map<string, SharedBuy>, incoming: Map<string, SharedBuy>) {
  const out = new Map(held);
  for (const [mint, buy] of incoming) {
    const old = out.get(mint);
    if (!old || buy.at > old.at) out.set(mint, buy);
  }
  return out;
}

function secretFromEnv() {
  const netlify = (globalThis as { Netlify?: { env?: { get?: (name: string) => string | undefined } } }).Netlify;
  return (netlify?.env?.get?.("SHARE_BUYS_SECRET") ?? "").trim();
}

function answer(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

/** Reads, merges and writes the shared buys. Strong consistency where the platform offers it, as the site reads. */
async function store(incoming: Map<string, SharedBuy>, now: number) {
  for (const consistency of ["strong", "eventual"] as const) {
    try {
      const blobs = getStore({ name: STORE, consistency });
      const merged = mergeShared(heldBuys(await blobs.get(KEY, { type: "json" }), now), incoming);
      await blobs.setJSON(KEY, { v: 1, buys: Object.fromEntries(merged) });
      return true;
    } catch (error) {
      if (consistency === "eventual") console.warn(`[par] share-buys: Blobs ${error instanceof Error ? error.message : "error"}`);
    }
  }
  return false;
}

export default async (request: Request) => {
  if (request.method !== "POST") return answer({ ok: false, message: "Use POST." }, 405);
  const secret = secretFromEnv();
  if (secret.length < MIN_SECRET) return answer({ ok: false, message: "Not enabled." }, 404);
  if (!sameSecret(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) return answer({ ok: false, message: "Unauthorized." }, 401);
  const body = await request.text();
  if (body.length > MAX_BODY) return answer({ ok: false, message: "Too large." }, 413);
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return answer({ ok: false, message: "Not JSON." }, 400);
  }
  const now = Date.now();
  const incoming = acceptBuys(raw, now);
  if (incoming.size === 0) return answer({ ok: true, stored: 0 });
  return (await store(incoming, now)) ? answer({ ok: true, stored: incoming.size }) : answer({ ok: false, message: "Storage unavailable." }, 503);
};

export const config = { path: "/api/share-buys" };
