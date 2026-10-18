// Shared desk state (buys, prints, wanted names), the buy picking order, the "quote these first" requests, and the
// cached-page rules (how long a copy may be served, when it counts as stale).
import assert from "node:assert/strict";
import { test } from "node:test";
import { ageLabel } from "../src/lib/format";
import {
  DUE_AFTER_MS,
  WANTED_PER_REFRESH,
  WANT_KEEP_MS,
  WANT_REQUOTE_MS,
  dueSymbols,
  mergeBuyMaps,
  mergePrintRows,
  parseBuys,
  parsePrints,
  parseWanted,
  pickBuys,
  wantedSymbols,
  type Buy,
  type PrintRow,
} from "../src/lib/shared";
import { LIVE_PAGE_CACHE, PUBLIC_DATA_CACHE, SHELL_PAGE_CACHE, STALE_PAGE_MS, WANT_CACHE } from "../src/lib/site";
import { TOKENS } from "../src/lib/tokens";
import type { Quote } from "../src/lib/types";

const NOW = 1_792_300_000_000;
const [A, B, C, D, E, F] = TOKENS.map((token) => token.mint);
const buy = (at: number, price = 100): Buy => ({ price, impactPct: 0.1, at });

test("shared buys keep only well-formed entries", () => {
  const parsed = parseBuys({
    v: 1,
    buys: {
      [A]: { price: 214.2, impactPct: 0.05, at: NOW - 1000 },
      [B]: { price: -1, impactPct: 0.05, at: NOW },
      [C]: { price: 10, impactPct: -0.2, at: NOW },
      [D]: { price: 10, impactPct: 0.2, at: "yesterday" },
      "not-a-mint": { price: 10, impactPct: 0.2, at: NOW },
      [E]: null,
    },
  });
  assert.deepEqual([...parsed.keys()], [A]);
  assert.deepEqual(parsed.get(A), { price: 214.2, impactPct: 0.05, at: NOW - 1000 });
  assert.equal(parseBuys(null).size, 0);
  assert.equal(parseBuys({ buys: [1, 2] }).size, 0);
  assert.equal(parseBuys("garbage").size, 0);
});

test("shared prints need a read time and valid rows", () => {
  assert.equal(parsePrints(null), null);
  assert.equal(parsePrints({ rows: {} }), null);
  const parsed = parsePrints({
    readAt: NOW,
    rows: {
      NVDA: { price: 214.13, state: "Closed", at: NOW },
      SPY: { price: 0, state: "Closed", at: NOW },
      "<script>": { price: 1, state: "x", at: NOW },
      AAPL: { price: 343.46, state: 5, at: NOW },
    },
  });
  assert.deepEqual(parsed, { readAt: NOW, rows: { NVDA: { price: 214.13, state: "Closed", at: NOW } } });
});

test("wanted names need a mint and a time", () => {
  const parsed = parseWanted({ wanted: { [A]: NOW, [B]: "soon", nope: NOW } });
  assert.deepEqual([...parsed.entries()], [[A, NOW]]);
});

test("merging buys keeps the newest per name and drops old ones", () => {
  const mine = new Map([
    [A, buy(NOW - 5_000, 1)],
    [B, buy(NOW - 200_000, 2)],
  ]);
  const theirs = new Map([
    [A, buy(NOW - 1_000, 3)],
    [C, buy(NOW - 30_000, 4)],
  ]);
  const merged = mergeBuyMaps(mine, theirs, NOW, 120_000);
  assert.equal(merged.get(A)?.price, 3);
  assert.equal(merged.has(B), false);
  assert.equal(merged.get(C)?.price, 4);
  // The order of the two maps does not change the answer.
  assert.deepEqual([...mergeBuyMaps(theirs, mine, NOW, 120_000).entries()].sort(), [...merged.entries()].sort());
});

test("merging prints takes a shared print only when it is newer", () => {
  const local = new Map<string, PrintRow>([
    ["NVDA", { price: 1, state: "Open", at: NOW - 10_000 }],
    ["AAPL", { price: 2, state: "Open", at: NOW }],
  ]);
  mergePrintRows(local, {
    NVDA: { price: 3, state: "Open", at: NOW - 1_000 },
    AAPL: { price: 4, state: "Open", at: NOW - 60_000 },
    SPY: { price: 5, state: "Open", at: NOW - 5_000 },
  });
  assert.equal(local.get("NVDA")?.price, 3);
  assert.equal(local.get("AAPL")?.price, 2);
  assert.equal(local.get("SPY")?.price, 5);
});

test("wanted names whose buy is missing or 45 s old go first, two per refresh at most", () => {
  const mints = [A, B, C, D, E, F];
  const current = new Map([
    [A, buy(NOW - 100_000)],
    [B, buy(NOW - 90_000)],
    [C, buy(NOW - 10_000)],
    [D, buy(NOW - 50_000)],
  ]);
  // E and F have no buy at all, so without wishes they would go first.
  assert.deepEqual(pickBuys(mints, current, new Map(), NOW, 4), [E, F, A, B]);
  // D is wanted and 50 s old, C is wanted but fresh (10 s): only D jumps the queue.
  const wanted = new Map([
    [C, NOW - 5_000],
    [D, NOW - 5_000],
  ]);
  assert.deepEqual(pickBuys(mints, current, wanted, NOW, 4), [D, E, F, A]);
  // Four wanted names that are due: only WANTED_PER_REFRESH (3) of them go first, the oldest ones (F has no buy);
  // the last slot goes to the oldest of the rest, so the list keeps moving.
  const many = new Map([
    [A, NOW],
    [B, NOW],
    [D, NOW],
    [F, NOW],
  ]);
  const picked = pickBuys(mints, current, many, NOW, 4);
  assert.equal(WANTED_PER_REFRESH, 3);
  assert.deepEqual(picked, [F, A, B, E]);
  assert.equal(new Set(picked).size, picked.length);
  // Three due wanted names and four slots: all three first, then the oldest other.
  assert.deepEqual(pickBuys(mints, current, new Map([[A, NOW], [B, NOW], [D, NOW]]), NOW, 4), [A, B, D, E]);
  // A wish older than 2 minutes no longer counts.
  assert.deepEqual(pickBuys(mints, current, new Map([[D, NOW - WANT_KEEP_MS - 1]]), NOW, 4), [E, F, A, B]);
  // Never more than asked for, and nothing when asked for nothing.
  assert.equal(pickBuys(mints, current, wanted, NOW, 2).length, 2);
  assert.deepEqual(pickBuys(mints, current, wanted, NOW, 0), []);
  // A wanted name that is not quotable (not in the list) is never picked.
  assert.deepEqual(pickBuys([A, B], new Map(), new Map([[F, NOW]]), NOW, 4), [A, B]);
});

test("the page asks only for names that need a buy, in its own order", () => {
  const quote = (symbol: string, extra: Partial<Quote>): Quote =>
    ({ ...TOKENS.find((t) => t.symbol === symbol)!, usdPrice: 100, poolUsd: 1_000_000, buyAt: null, ...extra }) as Quote;
  const quotes = [
    quote("NVDAx", { buyAt: NOW - 10_000 }),
    quote("TSLAx", { buyAt: NOW - DUE_AFTER_MS }),
    quote("AAPLx", { buyAt: null }),
    quote("AMDx", { poolUsd: 14_000 }),
    quote("SPYx", { usdPrice: null }),
  ];
  assert.equal(DUE_AFTER_MS, WANT_REQUOTE_MS);
  assert.deepEqual(dueSymbols(["NVDAx", "TSLAx", "AAPLx", "AMDx", "SPYx", "TSLAx", "NOPEx"], quotes, NOW), ["TSLAx", "AAPLx"]);
  assert.deepEqual(dueSymbols(["AAPLx", "TSLAx"], quotes, NOW, 1), ["AAPLx"]);
});

test("a want request carries at most 8 known names, sorted and without repeats", () => {
  assert.deepEqual(wantedSymbols(["TSLAx", "NVDAx", "TSLAx", "nope", 5, null]), ["NVDAx", "TSLAx"]);
  assert.deepEqual(wantedSymbols("NVDAx"), []);
  assert.deepEqual(wantedSymbols(undefined), []);
  const all = TOKENS.map((token) => token.symbol);
  assert.equal(wantedSymbols(all).length, 8);
  assert.deepEqual(wantedSymbols(all), [...all].sort().slice(0, 8));
});

test("live pages may be served from cache for a day, and count as stale after a minute", () => {
  const swr = (header: string) => Number(/stale-while-revalidate=(\d+)/.exec(header)?.[1] ?? 0);
  const maxAge = (header: string) => Number(/s-maxage=(\d+)/.exec(header)?.[1] ?? 0);
  for (const header of [LIVE_PAGE_CACHE, SHELL_PAGE_CACHE]) {
    assert.match(header, /\bpublic\b/);
    assert.match(header, /\bdurable\b/);
    assert.equal(swr(header), 86_400);
  }
  // The page refreshes as often as the data it shows.
  assert.equal(maxAge(LIVE_PAGE_CACHE), maxAge(PUBLIC_DATA_CACHE));
  assert.equal(STALE_PAGE_MS, 60_000);
  // A copy that is fresh by the CDN's rules is never called stale by the page.
  assert.ok(maxAge(LIVE_PAGE_CACHE) * 1000 < STALE_PAGE_MS);
  assert.equal(swr(WANT_CACHE), 0);
  assert.equal(maxAge(WANT_CACHE), 15);
});

test("an age reads in words", () => {
  assert.equal(ageLabel(-5_000), "0 s");
  assert.equal(ageLabel(42_400), "42 s");
  assert.equal(ageLabel(61_000), "1 min");
  assert.equal(ageLabel(59 * 60_000), "59 min");
  assert.equal(ageLabel(3 * 3_600_000 + 5), "3 h");
  assert.equal(ageLabel(24 * 3_600_000), "1 day");
  assert.equal(ageLabel(50 * 3_600_000), "2 days");
});
