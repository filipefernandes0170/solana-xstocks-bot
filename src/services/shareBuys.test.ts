// Sharing the bot's $1,000 buys with the site (services/shareBuys.ts). The site side is tested in
// site/tests/shareBuys.test.ts with the same payload shape.
import assert from "node:assert/strict";
import test from "node:test";

process.env.TELEGRAM_BOT_TOKEN ??= "test-token-not-real";
const SECRET = "0123456789abcdef".repeat(4);
process.env.SHARE_BUYS_SECRET = SECRET;

const { SEND_EVERY_MS, sharePayload, shareProblem, shareBuys } = await import("./shareBuys.js");
const { DESK_URL } = await import("./messages.js");

const NOW = Date.parse("2026-10-18T12:00:00Z");
const { TOKENIZED_STOCKS } = await import("../config/tokens.js");
const [NVDAX, TSLAX] = TOKENIZED_STOCKS.map((token) => token.mint);

test("only fresh, well-formed buys are sent, in the shape the site reads", () => {
  const buys = new Map([
    [NVDAX, { price: 214.25, impactPct: 0.12, at: NOW - 30_000 }],
    [TSLAX, { price: 352.1, impactPct: 0, at: NOW - 95_000 }],
    ["bad", { price: Number.NaN, impactPct: 0, at: NOW }],
  ]);
  const payload = sharePayload(buys, NOW);
  assert.deepEqual(payload, { v: 1, buys: [{ mint: NVDAX, price: 214.25, impactPct: 0.12, at: NOW - 30_000 }] });
  assert.deepEqual(Object.keys(payload.buys[0]).sort(), ["at", "impactPct", "mint", "price"]);
});

test("a refused request says which side to fix", () => {
  assert.match(shareProblem(401), /differs between the bot's \.env and Netlify/);
  assert.match(shareProblem(404), /missing in Netlify/);
  assert.equal(shareProblem(503), "the site answered HTTP 503");
});

test("sends to the site with the secret, at most every 25 s, and only with a newer quote", async () => {
  const realFetch = globalThis.fetch;
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ ok: true, stored: 1 }), { status: 200 });
  }) as typeof fetch;
  try {
    const now = Date.now();
    const buys = new Map([[NVDAX, { price: 214.25, impactPct: 0.12, at: now - 1_000 }]]);
    await shareBuys(buys, now);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${DESK_URL}/api/share-buys`);
    assert.equal(calls[0].init.method, "POST");
    assert.equal((calls[0].init.headers as Record<string, string>).authorization, `Bearer ${SECRET}`);
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), { v: 1, buys: [{ mint: NVDAX, price: 214.25, impactPct: 0.12, at: now - 1_000 }] });
    // A newer quote 5 s later: held back, at most one request every 25 s.
    buys.set(TSLAX, { price: 352.1, impactPct: 0, at: now + 4_000 });
    await shareBuys(buys, now + 5_000);
    assert.equal(calls.length, 1);
    // 25 s later it goes.
    assert.equal(SEND_EVERY_MS, 25_000);
    await shareBuys(buys, now + SEND_EVERY_MS);
    assert.equal(calls.length, 2);
    // Another 25 s, but nothing newer: no request.
    await shareBuys(buys, now + 2 * SEND_EVERY_MS);
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a network failure never throws", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("offline");
  }) as typeof fetch;
  const realWarn = console.warn;
  console.warn = () => undefined;
  try {
    const now = Date.now() + 10 * 60_000;
    await shareBuys(new Map([[NVDAX, { price: 1, impactPct: 0, at: now }]]), now);
  } finally {
    globalThis.fetch = realFetch;
    console.warn = realWarn;
  }
});
