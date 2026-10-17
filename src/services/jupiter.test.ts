import assert from "node:assert/strict";
import test from "node:test";

// The config module needs a bot token to load; the limiter itself never uses it.
process.env.TELEGRAM_BOT_TOKEN ??= "test-token-not-real";
const { coolDownMs, jupiterBase, jupiterGapMs, jupiterPaused, resetJupiterLimiter, takeSlot } = await import("./jupiter.js");

test("requests are spaced one gap apart", async () => {
  resetJupiterLimiter();
  const gap = jupiterGapMs();
  const now = Date.now();
  assert.equal(await takeSlot(10_000, now), true);
  // The next slot is one gap away: refused when the caller will not wait that long.
  assert.equal(await takeSlot(gap - 100, now), false);
  resetJupiterLimiter();
});

test("the gap keeps under Jupiter's limit", () => {
  const gap = jupiterGapMs();
  assert.equal(gap, 2100);
  assert.ok(["https://api.jup.ag", "https://lite-api.jup.ag"].includes(jupiterBase()));
});

test("a 429 cool-down reads seconds, epoch seconds and epoch milliseconds", () => {
  const now = 1_800_000_000_000;
  assert.equal(coolDownMs("5", now), 5000);
  assert.equal(coolDownMs(String(now / 1000 + 7), now), 7000);
  assert.equal(coolDownMs(String(now + 3000), now), 3000);
  assert.equal(coolDownMs(undefined, now), 10_000);
  assert.equal(coolDownMs("soon", now), 10_000);
  assert.equal(coolDownMs("600", now), 60_000);
  assert.equal(coolDownMs(String(now - 5000), now), 1000);
});

test("nothing is paused before a 429", () => {
  resetJupiterLimiter();
  assert.equal(jupiterPaused(), false);
});

test("the limiter pauses when Jupiter says the window is nearly full", async () => {
  const { windowNearlyFull } = await import("./jupiter.js");
  assert.equal(windowNearlyFull("5"), false);
  assert.equal(windowNearlyFull("1"), false);
  assert.equal(windowNearlyFull("0"), true);
  assert.equal(windowNearlyFull("-2"), true);
  assert.equal(windowNearlyFull(undefined), false);
  assert.equal(windowNearlyFull(""), false);
});
