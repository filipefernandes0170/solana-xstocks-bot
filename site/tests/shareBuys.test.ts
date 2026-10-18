// The bot's $1,000 buys coming in through /api/share-buys (netlify/edge-functions/share-buys.ts), and the rule every shown
// buy must pass (buyShown in src/server/quotes.ts).
import assert from "node:assert/strict";
import { test } from "node:test";
import { acceptBuys, heldBuys, mergeShared, sameSecret } from "../netlify/edge-functions/share-buys";
import { parseBuys } from "../src/lib/shared";
import { TOKENS } from "../src/lib/tokens";
import { buyShown } from "../src/server/quotes";

const NOW = 1_792_300_000_000;
const [A, B, C] = TOKENS.map((token) => token.mint);

test("the secret must match exactly", () => {
  const secret = "a".repeat(64);
  assert.equal(sameSecret(`Bearer ${secret}`, `Bearer ${secret}`), true);
  assert.equal(sameSecret(`Bearer ${secret.slice(1)}b`, `Bearer ${secret}`), false);
  assert.equal(sameSecret(`Bearer ${secret}x`, `Bearer ${secret}`), false);
  assert.equal(sameSecret("", `Bearer ${secret}`), false);
  assert.equal(sameSecret(`bearer ${secret}`, `Bearer ${secret}`), false);
});

test("the bot's payload is read as sent, and anything odd is dropped", () => {
  // The exact shape the bot sends (src/services/shareBuys.ts in the repo root).
  const payload = {
    v: 1,
    buys: [
      { mint: A, price: 214.25, impactPct: 0.12, at: NOW - 30_000 },
      { mint: B, price: 352.1, impactPct: 0, at: NOW - 5_000 },
      { mint: B, price: 351.9, impactPct: 0.01, at: NOW - 50_000 },
      { mint: C, price: -1, impactPct: 0.1, at: NOW },
      { mint: "not a mint", price: 10, impactPct: 0.1, at: NOW },
      { mint: A, price: 1, impactPct: 0.1, at: NOW - 200_000 },
      { mint: A, price: 1, impactPct: 0.1, at: NOW + 120_000 },
      { mint: C, price: 10, impactPct: 150, at: NOW },
    ],
  };
  const accepted = acceptBuys(payload, NOW);
  assert.deepEqual([...accepted.keys()].sort(), [A, B].sort());
  assert.deepEqual(accepted.get(A), { price: 214.25, impactPct: 0.12, at: NOW - 30_000 });
  // Two buys for the same name: the newer one.
  assert.equal(accepted.get(B)?.price, 352.1);
  assert.equal(acceptBuys({ v: 2, buys: payload.buys }, NOW).size, 0);
  assert.equal(acceptBuys({ v: 1, buys: Array.from({ length: 41 }, () => payload.buys[0]) }, NOW).size, 0);
  assert.equal(acceptBuys("nope", NOW).size, 0);
});

test("stored buys keep the newest per name, in the format the site reads", () => {
  const held = heldBuys(
    { v: 1, buys: { [A]: { price: 200, impactPct: 0.1, at: NOW - 10_000 }, [B]: { price: 300, impactPct: 0.1, at: NOW - 100_000 }, [C]: { price: 5, impactPct: 0.1, at: NOW - 130_000 } } },
    NOW,
  );
  // Older than 2 minutes: dropped.
  assert.equal(held.has(C), false);
  const merged = mergeShared(
    held,
    new Map([
      [A, { price: 201, impactPct: 0.2, at: NOW - 20_000 }],
      [B, { price: 301, impactPct: 0.2, at: NOW - 1_000 }],
    ]),
  );
  // A: the site's own quote is newer and stays; B: the bot's is newer and replaces it.
  assert.equal(merged.get(A)?.price, 200);
  assert.equal(merged.get(B)?.price, 301);
  // What the edge function writes is exactly what every copy of the site reads back.
  const written = { v: 1, buys: Object.fromEntries(merged) };
  assert.deepEqual(parseBuys(JSON.parse(JSON.stringify(written))), merged);
});

test("a buy is never shown for a thin pool or far from the last trade", () => {
  const buy = { price: 100, impactPct: 0.1, at: NOW };
  assert.equal(buyShown(buy, { usdPrice: 101, poolUsd: 1_000_000 }), true);
  assert.equal(buyShown(buy, { usdPrice: 101, poolUsd: 14_000 }), false);
  assert.equal(buyShown(buy, { usdPrice: 19, poolUsd: 1_000_000 }), false);
  assert.equal(buyShown(buy, { usdPrice: 501, poolUsd: 1_000_000 }), false);
  // No last trade or no pool size: nothing to judge against, the buy stands.
  assert.equal(buyShown(buy, { usdPrice: null, poolUsd: null }), true);
});

test("the endpoint refuses everything but a correct, signed POST", async () => {
  const { default: handler } = await import("../netlify/edge-functions/share-buys");
  const g = globalThis as { Netlify?: unknown };
  const saved = g.Netlify;
  const secret = "f".repeat(64);
  const post = (auth: string | null, body: string) =>
    new Request("https://onpar.site/api/share-buys", { method: "POST", headers: auth ? { authorization: auth } : {}, body });
  const good = JSON.stringify({ v: 1, buys: [{ mint: A, price: 214.25, impactPct: 0.1, at: Date.now() }] });
  const realWarn = console.warn;
  console.warn = () => undefined;
  try {
    // No secret in Netlify: the feature is off.
    g.Netlify = { env: { get: () => undefined } };
    assert.equal((await handler(post(`Bearer ${secret}`, good))).status, 404);
    // A secret that is too short is treated as off too.
    g.Netlify = { env: { get: () => "short" } };
    assert.equal((await handler(post("Bearer short", good))).status, 404);
    g.Netlify = { env: { get: (name: string) => (name === "SHARE_BUYS_SECRET" ? secret : undefined) } };
    assert.equal((await handler(new Request("https://onpar.site/api/share-buys"))).status, 405);
    assert.equal((await handler(post(null, good))).status, 401);
    assert.equal((await handler(post(`Bearer ${"e".repeat(64)}`, good))).status, 401);
    assert.equal((await handler(post(`Bearer ${secret}`, "{not json"))).status, 400);
    assert.equal((await handler(post(`Bearer ${secret}`, "x".repeat(20_001)))).status, 413);
    // Nothing valid in it: accepted, nothing stored, no storage touched.
    const empty = await handler(post(`Bearer ${secret}`, JSON.stringify({ v: 1, buys: [] })));
    assert.equal(empty.status, 200);
    assert.deepEqual(await empty.json(), { ok: true, stored: 0 });
    // Valid, but no Netlify Blobs here (a test run): it says storage is unavailable instead of failing.
    assert.equal((await handler(post(`Bearer ${secret}`, good))).status, 503);
  } finally {
    g.Netlify = saved;
    console.warn = realWarn;
  }
});
