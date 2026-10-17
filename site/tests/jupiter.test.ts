// The Jupiter limiter, the buy-quote rotation, the holdings date check and the server-log scrubbing.
import assert from "node:assert/strict";
import { test } from "node:test";
import { holdingsMayBeStale } from "../src/lib/etf-holdings";
import { TOKENS } from "../src/lib/tokens";
import { coolDownMs, jupiterGapMs, jupiterUrl, resetJupiterLimiter, takeSlot } from "../src/server/jupiter";
import { buysPerRefresh, stalestMints, type Buy } from "../src/server/quotes";
import { logMessage } from "../src/server/solana";

test("requests are spaced one gap apart", async () => {
  resetJupiterLimiter();
  const gap = jupiterGapMs();
  const now = Date.now();
  assert.equal(await takeSlot(10_000, now), true);
  // The next slot is one gap away: refused when the caller will not wait that long.
  assert.equal(await takeSlot(gap - 100, now), false);
  resetJupiterLimiter();
});

test("the host follows the key; the pace is 1 request per 2 s either way", () => {
  const saved = process.env.JUPITER_API_KEY;
  delete process.env.JUPITER_API_KEY;
  assert.equal(jupiterGapMs(), 2100);
  assert.equal(jupiterUrl("/price/v3?ids=x"), "https://lite-api.jup.ag/price/v3?ids=x");
  assert.equal(buysPerRefresh(), 4);
  process.env.JUPITER_API_KEY = "test-key-not-real";
  assert.equal(jupiterGapMs(), 2100);
  assert.equal(jupiterUrl("/price/v3?ids=x"), "https://api.jup.ag/price/v3?ids=x");
  assert.equal(buysPerRefresh(), 4);
  if (saved === undefined) delete process.env.JUPITER_API_KEY;
  else process.env.JUPITER_API_KEY = saved;
});

test("a full rotation of buy quotes fits inside the 90 s a buy quote stays usable", () => {
  // The browser polls every 10 s, so each name is quoted again within this many seconds.
  // SpaceX is not quoted (no Nasdaq print), so 18 names rotate, 4 per refresh: about 5 refreshes.
  assert.ok(Math.ceil((TOKENS.length - 1) / 4) * 10 <= 50);
});

test("a 429 cool-down reads seconds, epoch seconds and epoch milliseconds", () => {
  const now = 1_800_000_000_000;
  const headers = (value?: string) => new Headers(value === undefined ? {} : { "retry-after": value });
  assert.equal(coolDownMs(headers("5"), now), 5000);
  assert.equal(coolDownMs(new Headers({ "x-ratelimit-reset": String(now / 1000 + 7) }), now), 7000);
  assert.equal(coolDownMs(headers(String(now + 3000)), now), 3000);
  assert.equal(coolDownMs(headers(), now), 10_000);
  assert.equal(coolDownMs(headers("soon"), now), 10_000);
  assert.equal(coolDownMs(headers("600"), now), 60_000);
  assert.equal(coolDownMs(headers(String(now - 5000)), now), 1000);
});

test("the rotation quotes missing names first, then the oldest", () => {
  const current = new Map<string, Buy>([
    ["a", { price: 1, impactPct: 0.1, at: 300 }],
    ["b", { price: 1, impactPct: 0.1, at: 100 }],
    ["c", { price: 1, impactPct: 0.1, at: 200 }],
  ]);
  assert.deepEqual(stalestMints(["a", "b", "c", "d"], current, 3), ["d", "b", "c"]);
  assert.deepEqual(stalestMints(["a", "b"], current, 0), []);
});

test("the holdings note appears only after 90 days", () => {
  assert.equal(holdingsMayBeStale(Date.parse("2026-10-17T12:00:00Z")), false);
  assert.equal(holdingsMayBeStale(Date.parse("2027-01-10T12:00:00Z")), false);
  assert.equal(holdingsMayBeStale(Date.parse("2027-01-12T12:00:00Z")), true);
});

test("server logs blank out anything that looks like an address", () => {
  const error = new Error("Invalid param: could not find account TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  assert.equal(logMessage(error), "Invalid param: could not find account [address]");
  assert.equal(logMessage("not an error"), "request failed");
  assert.equal(logMessage(new Error("RPC answered 429")), "RPC answered 429");
});

test("the limiter pauses when Jupiter says the window is nearly full", async () => {
  const { windowNearlyFull } = await import("../src/server/jupiter");
  assert.equal(windowNearlyFull("5"), false);
  assert.equal(windowNearlyFull("1"), false);
  assert.equal(windowNearlyFull("0"), true);
  assert.equal(windowNearlyFull("-2"), true);
  assert.equal(windowNearlyFull(null), false);
});
