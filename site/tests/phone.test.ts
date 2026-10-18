// Faster on phones (18 Oct 2026): an old cached page starts fetching fresh prices from its first script, and a card keeps
// drawing a recent but older $1,000 buy, in grey with its age, instead of falling back to "Loading".
import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GapMeter, GapPill } from "../src/components/desk/parts";
import { staleScript } from "../src/components/StaleMark";
import { EARLY_QUOTES_KEY, EARLY_QUOTES_URL, isQuotesResult, takeEarlyQuotes } from "../src/lib/earlyQuotes";
import { STALE_PAGE_MS } from "../src/lib/site";
import type { Quote } from "../src/lib/types";
import { BUY_SHOWN_MS, buyShowable, buyUsable, olderBuy, verdict } from "../src/lib/verdict";

const NOW = 1_792_300_000_000;
const quote = (buyAgeMs: number | null, extra: Partial<Quote> = {}): Quote => ({
  symbol: "NVDAx",
  name: "NVIDIA",
  sector: "Semiconductors",
  underlying: "NVDA",
  mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
  usdPrice: 211,
  change24h: 0,
  stockPrice: 212,
  marketState: "Open",
  sharesPerToken: 1,
  buyPrice: buyAgeMs == null ? null : 210.94,
  buyImpactPct: buyAgeMs == null ? null : 0.1,
  buyAt: buyAgeMs == null ? null : NOW - buyAgeMs,
  issuerPrice: 212,
  issuerAt: NOW - 60_000,
  rebase: null,
  poolUsd: 1_000_000,
  ...extra,
});

test("a buy is shown up to 3 minutes, the verdict still uses it only up to 90 s", () => {
  assert.equal(BUY_SHOWN_MS, 180_000);
  assert.equal(buyUsable(NOW - 90_000, NOW), true);
  assert.equal(buyUsable(NOW - 90_001, NOW), false);
  assert.equal(buyShowable(NOW - 180_000, NOW), true);
  assert.equal(buyShowable(NOW - 180_001, NOW), false);
  assert.equal(buyShowable(NOW + 60_000, NOW), true);
  assert.equal(buyShowable(NOW + 60_001, NOW), false);
  assert.equal(buyShowable(null, NOW), false);
});

test("an older buy gives its gap and age; a usable, too old or missing one gives nothing", () => {
  assert.equal(olderBuy(quote(60_000), NOW), null, "still usable: the normal gap is shown");
  const older = olderBuy(quote(100_000), NOW);
  assert.ok(older);
  assert.equal(older.ageMs, 100_000);
  assert.ok(Math.abs(older.gap - ((210.94 - 212) / 212) * 100) < 1e-9);
  assert.equal(olderBuy(quote(200_000), NOW), null, "past 3 minutes");
  assert.equal(olderBuy(quote(null), NOW), null);
  assert.equal(olderBuy(quote(100_000, { stockPrice: null }), NOW), null);
});

test("the verdict does not change with an older buy on the card", () => {
  // With a buy past 90 s the verdict is what it was with no buy at all.
  assert.deepEqual(verdict(quote(100_000), NOW), verdict(quote(null), NOW));
  assert.notEqual(verdict(quote(30_000), NOW).id, verdict(quote(null), NOW).id);
});

test("the meter draws an older buy in grey with its age, never cheap or rich", () => {
  const html = renderToStaticMarkup(createElement(GapMeter, { gap: null, waiting: "Loading the $1,000 buy…", loading: true, older: { gap: -0.6, ageMs: 100_000 } }));
  assert.match(html, />-0\.60%</);
  assert.match(html, /Last \$1,000 quote 1 min old\. A newer one is on its way\./);
  assert.match(html, /The last \$1,000 quote, 1 min old, was 0\.60% below the Nasdaq print/);
  assert.match(html, /An older \$1,000 quote: a newer one is on its way/);
  assert.doesNotMatch(html, /cheap<|rich<|Loading the/);
  // A usable buy wins over an older one, with the usual colours.
  const live = renderToStaticMarkup(createElement(GapMeter, { gap: -0.3, waiting: "", older: { gap: -0.6, ageMs: 100_000 } }));
  assert.match(live, /-0\.30% cheap/);
  assert.doesNotMatch(live, /Last \$1,000 quote/);
  // No buy at all: still the loading shimmer.
  assert.match(renderToStaticMarkup(createElement(GapMeter, { gap: null, waiting: "Loading the $1,000 buy…", loading: true })), /Loading the \$1,000 buy/);
  // The list's pill.
  assert.match(renderToStaticMarkup(createElement(GapPill, { value: -0.6, older: true })), /title="An older \$1,000 quote[^"]*"[^>]*>-0\.60%</);
});

type Sandbox = { document: { documentElement: { attrs: Set<string>; setAttribute(name: string): void } }; window: Record<string, unknown>; fetch: (url: string) => Promise<unknown>; Date: DateConstructor };

function runStaleScript(asOf: number, prefetch: string | undefined, now: number, answer: unknown = { ok: true, quotes: [], asOf: now }) {
  const fetched: string[] = [];
  const sandbox: Sandbox = {
    document: {
      documentElement: {
        attrs: new Set(),
        setAttribute(name: string) {
          this.attrs.add(name);
        },
      },
    },
    window: {},
    fetch: (url: string) => {
      fetched.push(url);
      return Promise.resolve({ ok: true, json: () => Promise.resolve(answer) });
    },
    Date: { ...Date, now: () => now } as DateConstructor,
  };
  runInNewContext(staleScript(asOf, prefetch), sandbox);
  return { sandbox, fetched };
}

test("a stale copy's script marks the page and starts the fresh prices' request", async () => {
  const stale = runStaleScript(NOW - STALE_PAGE_MS - 1, EARLY_QUOTES_URL, NOW);
  assert.deepEqual([...stale.sandbox.document.documentElement.attrs], ["data-par-stale"]);
  assert.deepEqual(stale.fetched, ["/api/quotes"]);
  assert.deepEqual(await stale.sandbox.window[EARLY_QUOTES_KEY], { ok: true, quotes: [], asOf: NOW });

  const fresh = runStaleScript(NOW - 5_000, EARLY_QUOTES_URL, NOW);
  assert.equal(fresh.sandbox.document.documentElement.attrs.size, 0);
  assert.deepEqual(fresh.fetched, [], "a fresh copy asks for nothing early");

  const plain = runStaleScript(NOW - STALE_PAGE_MS - 1, undefined, NOW);
  assert.deepEqual([...plain.sandbox.document.documentElement.attrs], ["data-par-stale"]);
  assert.deepEqual(plain.fetched, [], "without prefetch the script only marks the page");
});

test("the early answer is taken once, and only when well formed", async () => {
  const good = { ok: true, quotes: [quote(10_000)], asOf: NOW };
  const holder = globalThis as unknown as { window?: Record<string, unknown> };
  const before = holder.window;
  try {
    holder.window = { [EARLY_QUOTES_KEY]: Promise.resolve(good) };
    assert.deepEqual(await takeEarlyQuotes(), good);
    assert.equal(await takeEarlyQuotes(), null, "taken once");
    holder.window = { [EARLY_QUOTES_KEY]: Promise.resolve({ ok: true, quotes: "no", asOf: NOW }) };
    assert.equal(await takeEarlyQuotes(), null);
    holder.window = { [EARLY_QUOTES_KEY]: Promise.reject(new Error("offline")) };
    assert.equal(await takeEarlyQuotes(), null);
    holder.window = { [EARLY_QUOTES_KEY]: Promise.resolve(null) };
    assert.equal(await takeEarlyQuotes(), null, "the request answered with an error status");
    holder.window = {};
    assert.equal(await takeEarlyQuotes(), null);
  } finally {
    if (before === undefined) delete holder.window;
    else holder.window = before;
  }
  assert.equal(isQuotesResult({ ok: false, quotes: [], asOf: NOW, message: "Price feed paused." }), true);
  assert.equal(isQuotesResult({ ok: true, quotes: [], asOf: Number.NaN }), false);
  assert.equal(isQuotesResult(null), false);
});
