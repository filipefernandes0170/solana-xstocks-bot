import assert from "node:assert/strict";
import test from "node:test";
import { lookupToken } from "../config/tokens.js";
import { fairFlip, inBellWindow, richWhileClosed, signalChanged, toSnap, tradeVerdict } from "./verdict.js";

const now = Date.now();
const base = {
  symbol: "NVDAx",
  underlying: "NVDA",
  usdPrice: 100,
  stockPrice: 100,
  marketState: "Open",
  buyPrice: 100,
  buyImpactPct: 0.2,
  buyAt: now,
  issuerPrice: 100,
  issuerAt: now,
};

test("fair uses the $1,000 buy, not the last trade", () => {
  assert.equal(tradeVerdict(base, now).id, "fair");
  assert.match(tradeVerdict(base, now).line, /reaches 1% impact/);
  assert.equal(tradeVerdict({ ...base, buyPrice: null, buyAt: null }, now).id, "checking");
  assert.equal(tradeVerdict({ ...base, usdPrice: 100, buyPrice: 100, issuerPrice: 100.6, stockPrice: 100.1 }, now).id, "split");
  assert.equal(tradeVerdict({ ...base, issuerAt: now - 21 * 60_000 }, now).id, "checking");
  assert.equal(tradeVerdict({ ...base, buyAt: now - 91_000 }, now).id, "checking");
  assert.equal(tradeVerdict({ ...base, marketState: "Closed" }, now).id, "overnight");
  assert.equal(tradeVerdict({ ...base, buyPrice: 102, marketState: "Closed" }, now).id, "wait");
  assert.equal(tradeVerdict({ ...base, buyImpactPct: 3 }, now).id, "wait");
  // SpaceX has traded on Nasdaq as SPCX since 12 June 2026: it is judged like any other name.
  assert.equal(tradeVerdict({ ...base, underlying: "SPCX", symbol: "SPCXx" }, now).id, "fair");
  assert.equal(tradeVerdict({ ...base, underlying: "SPCX", symbol: "SPCXx", stockPrice: null }, now).id, "unpriced");
});

test("a name with no overnight quote waits while the market is closed", () => {
  const verdict = tradeVerdict({
    ...base,
    symbol: "AMZNx",
    underlying: "AMZN",
    marketState: "Closed",
    usdPrice: 100.2,
  });
  assert.equal(verdict.id, "wait");
  assert.match(verdict.line, /no around-the-clock/);
});

test("flips do not fire on the first reading or while the feed is still checking", () => {
  const fair = toSnap(base, now);
  const closed = toSnap({ ...base, marketState: "Closed", buyPrice: 103 }, now);
  assert.equal(fairFlip(null, fair), false);
  assert.equal(richWhileClosed(null, closed), false);
  assert.equal(fairFlip(toSnap({ ...base, marketState: "" }), fair), false);
  assert.equal(fairFlip(closed, fair), true);
  assert.equal(richWhileClosed(fair, closed), true);
  assert.equal(richWhileClosed(closed, closed), false);
  assert.equal(signalChanged(fair, closed), true);
});

test("one word finds the stock, the token, or the company", () => {
  assert.equal(lookupToken("nvda")?.symbol, "NVDAx");
  assert.equal(lookupToken("NVDAx")?.symbol, "NVDAx");
  assert.equal(lookupToken("nvidia")?.symbol, "NVDAx");
  assert.equal(lookupToken("not a stock"), null);
});

test("the bell window is the half hour after the open on a weekday", () => {
  const open = Date.parse("2026-10-13T13:31:00.000Z");
  const later = Date.parse("2026-10-13T14:30:00.000Z");
  const sunday = Date.parse("2026-10-11T13:31:00.000Z");
  assert.equal(inBellWindow(open), true);
  assert.equal(inBellWindow(later), false);
  assert.equal(inBellWindow(sunday), false);
});

test("SPCXx is quoted around the clock on Kraken, so it can be Overnight; the bot's list is the site's", async () => {
  const closed = { ...base, underlying: "SPCX", symbol: "SPCXx", marketState: "Closed" };
  assert.equal(tradeVerdict(closed, now).id, "overnight");
  assert.equal(tradeVerdict({ ...closed, buyPrice: null, buyAt: null }, now).id, "overnight", "buy loading, last trade near the print");
  assert.equal(tradeVerdict({ ...closed, buyPrice: 102 }, now).id, "wait", "far from the print it still waits");
  // Microsoft is not quoted around the clock: the same row waits.
  assert.notEqual(tradeVerdict({ ...closed, underlying: "MSFT", symbol: "MSFTx" }, now).id, "overnight");
  const { AROUND_THE_CLOCK } = await import("./verdict.js");
  const site = await import("../../site/src/lib/tokens.js");
  assert.deepEqual([...AROUND_THE_CLOCK].sort(), [...site.AROUND_THE_CLOCK].sort());
  assert.equal(AROUND_THE_CLOCK.size, 11);
});
