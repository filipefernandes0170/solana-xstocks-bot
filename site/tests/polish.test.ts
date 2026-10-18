// Fixes of 18 Oct 2026: short dollar amounts read the same on the server and in the browser, the gap is a plain number
// while Nasdaq is closed, and Nasdaq prints are not read again while Nasdaq has no session at all.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GapMeter, GapPill } from "../src/components/desk/parts";
import { formatCompactUsd, formatGap, gapNumber } from "../src/lib/format";
import { quietSince, sessionClosed } from "../src/lib/session";
import { SETTLE_AFTER_MS, printsSettled, type PrintRow } from "../src/lib/shared";

test("short dollar amounts drop a trailing .0, as browsers do", () => {
  // Without minimumFractionDigits Node wrote "$51.0M" and browsers "$51M": /ranking then failed to hydrate.
  assert.equal(formatCompactUsd(51e6), "$51M");
  assert.equal(formatCompactUsd(51.04e6), "$51M");
  assert.equal(formatCompactUsd(80.3e6), "$80.3M");
  assert.equal(formatCompactUsd(950), "$950");
  assert.equal(formatCompactUsd(1500), "$1.5K");
  assert.equal(formatCompactUsd(2e9), "$2B");
  assert.equal(formatCompactUsd(-51e6), "-$51M");
  assert.equal(formatCompactUsd(0), "$0");
});

test("the gap as a plain number, and the usual words when Nasdaq is open", () => {
  assert.equal(gapNumber(-1.4), "-1.40%");
  assert.equal(gapNumber(0.123), "+0.12%");
  assert.equal(gapNumber(0), "0.00%");
  assert.equal(gapNumber(null), "—");
  assert.equal(formatGap(-1.4), "-1.40% cheap");
  assert.equal(formatGap(0.5), "+0.50% rich");
});

test("closed means a known state that is not the regular session", () => {
  assert.equal(sessionClosed("Closed"), true);
  assert.equal(sessionClosed("After-Hours"), true);
  assert.equal(sessionClosed("Pre-Market"), true);
  assert.equal(sessionClosed("Open"), false);
  assert.equal(sessionClosed(" open "), false);
  assert.equal(sessionClosed(""), false);
  assert.equal(sessionClosed(null), false);
  assert.equal(sessionClosed(undefined), false);
});

test("while closed, the gap pill and meter give the number in grey, never cheap or rich", () => {
  const closedPill = renderToStaticMarkup(createElement(GapPill, { value: -1.4, closed: true }));
  assert.match(closedPill, />-1\.40%</);
  assert.doesNotMatch(closedPill, /cheap|rich|pine|clay/);
  const openPill = renderToStaticMarkup(createElement(GapPill, { value: -1.4 }));
  assert.match(openPill, /-1\.40% cheap/);
  assert.match(openPill, /text-pine/);

  const closedMeter = renderToStaticMarkup(createElement(GapMeter, { gap: -1.4, waiting: "", closed: true }));
  assert.match(closedMeter, /Buy versus last Nasdaq print/);
  assert.match(closedMeter, /The \$1,000 buy is 1\.40% below the last Nasdaq print/);
  assert.doesNotMatch(closedMeter, /cheap<|rich<|bg-clay"|bg-pine ring/);
  const openMeter = renderToStaticMarkup(createElement(GapMeter, { gap: 0.6, waiting: "" }));
  assert.match(openMeter, />Buy versus Nasdaq</);
  // The meter's description used to read "+0.60% rich above Nasdaq"; it now gives the size and the side once.
  assert.match(openMeter, /The \$1,000 buy is 0\.60% above the Nasdaq print/);
  assert.match(renderToStaticMarkup(createElement(GapMeter, { gap: 0.001, waiting: "" })), /The \$1,000 buy is at the Nasdaq print/);
});

const at = (iso: string) => Date.parse(iso);

test("quiet stretches: from the end of after hours to the next pre-market, weekends and holidays included", () => {
  // Friday 16 Oct 2026, after hours ends at 20:00 EDT (00:00 UTC Saturday).
  const fridayEnd = at("2026-10-17T00:00:00Z");
  assert.equal(quietSince(at("2026-10-16T23:59:00Z")), null);
  assert.equal(quietSince(fridayEnd), fridayEnd);
  assert.equal(quietSince(at("2026-10-18T15:00:00Z")), fridayEnd);
  // Monday 19 Oct: quiet until pre-market at 04:00 EDT (08:00 UTC).
  assert.equal(quietSince(at("2026-10-19T07:59:00Z")), fridayEnd);
  assert.equal(quietSince(at("2026-10-19T08:00:00Z")), null);
  assert.equal(quietSince(at("2026-10-19T14:00:00Z")), null);
  assert.equal(quietSince(at("2026-10-19T23:59:00Z")), null);
  // Monday night.
  assert.equal(quietSince(at("2026-10-20T00:00:00Z")), at("2026-10-20T00:00:00Z"));
  assert.equal(quietSince(at("2026-10-20T05:00:00Z")), at("2026-10-20T00:00:00Z"));
});

test("quiet stretches across a holiday, an early close and the end of daylight saving", () => {
  // Wednesday 25 Nov ends at 20:00 EST (01:00 UTC); Thursday 26 Nov is Thanksgiving, closed all day.
  const wednesdayEnd = at("2026-11-26T01:00:00Z");
  assert.equal(quietSince(at("2026-11-26T15:00:00Z")), wednesdayEnd);
  // Friday 27 Nov: pre-market at 04:00 EST (09:00 UTC); the early close at 13:00 ends after hours at 17:00 (22:00 UTC).
  assert.equal(quietSince(at("2026-11-27T08:59:00Z")), wednesdayEnd);
  assert.equal(quietSince(at("2026-11-27T09:00:00Z")), null);
  assert.equal(quietSince(at("2026-11-27T21:59:00Z")), null);
  assert.equal(quietSince(at("2026-11-27T22:00:00Z")), at("2026-11-27T22:00:00Z"));
  // Daylight saving ends on Sunday 1 Nov: Friday 30 Oct ends at 20:00 EDT, Monday 2 Nov opens at 04:00 EST.
  const october30End = at("2026-10-31T00:00:00Z");
  assert.equal(quietSince(at("2026-11-01T12:00:00Z")), october30End);
  assert.equal(quietSince(at("2026-11-02T08:59:00Z")), october30End);
  assert.equal(quietSince(at("2026-11-02T09:00:00Z")), null);
});

test("prints are settled only when every one was read, as Closed, well inside the quiet stretch", () => {
  const quietFrom = at("2026-10-17T00:00:00Z");
  const late = quietFrom + SETTLE_AFTER_MS;
  const row = (state: string, readAt: number): PrintRow => ({ price: 100, state, at: readAt });
  const rows = new Map([
    ["NVDA", row("Closed", late)],
    ["SPY", row("Closed", late + 3_600_000)],
  ]);
  assert.equal(printsSettled(rows, ["NVDA", "SPY"], quietFrom), true);
  assert.equal(printsSettled(rows, ["NVDA", "SPY", "TSLA"], quietFrom), false, "a symbol without a print");
  assert.equal(printsSettled(new Map([...rows, ["NVDA", row("Closed", late - 1)]]), ["NVDA", "SPY"], quietFrom), false, "read too soon after the session");
  assert.equal(printsSettled(new Map([...rows, ["NVDA", row("After-Hours", late)]]), ["NVDA", "SPY"], quietFrom), false, "Nasdaq did not say closed");
  assert.equal(printsSettled(new Map([...rows, ["NVDA", row(" closed ", late)]]), ["NVDA", "SPY"], quietFrom), true);
  assert.equal(printsSettled(rows, ["NVDA", "SPY"], null), false, "a session is running");
  assert.equal(printsSettled(rows, [], quietFrom), false);
});
