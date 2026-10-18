// The desk's pure logic must keep giving the same answers as the published desk.
// tests/golden.json was produced by the ORIGINAL functions extracted from the live bundle (deploy 6aced2a4, Oct 2026).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  formatCompactUsd,
  formatGap,
  formatImpact,
  formatPct,
  formatRate,
  formatUsd,
  impactHint,
  multiplierLabel,
  perSharePrice,
} from "../src/lib/format";
import { addDays, marketDay, nyDate } from "../src/lib/calendar";
import { etClock, nextOpen, sessionLabel, sessionLine, timeToOpen, utcStamp } from "../src/lib/session";
import { verdict } from "../src/lib/verdict";

const golden = JSON.parse(readFileSync(new URL("./golden.json", import.meta.url), "utf8"));

test("formatters match the published desk", () => {
  for (const c of golden.format) {
    assert.equal(formatUsd(c.v), c.usd, `formatUsd(${c.v})`);
    assert.equal(formatPct(c.v), c.pct, `formatPct(${c.v})`);
    assert.equal(formatGap(c.v), c.gap, `formatGap(${c.v})`);
    assert.equal(multiplierLabel(c.v), c.shares, `multiplierLabel(${c.v})`);
    assert.equal(formatRate(c.v), c.rate, `formatRate(${c.v})`);
    assert.equal(impactHint(c.v), c.hint, `impactHint(${c.v})`);
    assert.equal(perSharePrice(c.v, 1.0057), c.perShare, `perSharePrice(${c.v})`);
    if (c.impact != null) assert.equal(formatImpact(c.v), c.impact, `formatImpact(${c.v})`);
    if (c.compact != null) assert.equal(formatCompactUsd(c.v), c.compact, `formatCompactUsd(${c.v})`);
  }
});

test("session clock matches the published desk", () => {
  // The published desk did not know market holidays, so cases that touch one are checked in the holiday tests instead.
  const touchesHoliday = (s: { t: number; nextOpen: number }) => {
    for (let day = nyDate(s.t); day <= nyDate(s.nextOpen); day = addDays(day, 1)) if (marketDay(day)) return true;
    return false;
  };
  const cases = golden.sessions.filter((s: { t: number; nextOpen: number }) => !touchesHoliday(s));
  assert.ok(cases.length >= 100, `only ${cases.length} cases left`);
  for (const s of cases) {
    assert.equal(nextOpen(s.t), s.nextOpen, `nextOpen(${s.t})`);
    assert.equal(timeToOpen(s.t), s.toOpen, `timeToOpen(${s.t})`);
    assert.equal(sessionLine(s.state, s.t), s.line, `sessionLine(${s.state}, ${s.t})`);
    assert.equal(sessionLabel(s.state, s.t), s.label, `sessionLabel(${s.state}, ${s.t})`);
    assert.equal(etClock(s.t), s.clock, `etClock(${s.t})`);
    assert.equal(utcStamp(Math.floor(s.t / 1000)), s.stamp, `utcStamp(${s.t})`);
  }
});

test("verdicts match the published desk", () => {
  for (const [i, c] of golden.verdicts.entries()) {
    // Intended difference: the published desk treated SpaceX (SPCX) as having no Nasdaq print. It has traded on
    // Nasdaq since 12 June 2026, so SPCXx is now judged like any other name (next test).
    if (c.row.underlying === "SPCX") continue;
    assert.deepEqual(verdict(c.row, golden.now), c.verdict, `verdict #${i} ${JSON.stringify(c.row)}`);
  }
});

test("SpaceX is judged against its Nasdaq print like any other name", () => {
  const cases = golden.verdicts.filter((c: { row: { underlying: string } }) => c.row.underlying === "SPCX");
  assert.ok(cases.length > 0);
  for (const c of cases) {
    // Same row under another name Kraken quotes around the clock (SPCXx is one since 18 Oct 2026): identical answer.
    const asNvidia = verdict({ ...c.row, symbol: "NVDAx", underlying: "NVDA" }, golden.now);
    assert.deepEqual(verdict(c.row, golden.now), asNvidia, JSON.stringify(c.row));
  }
  const judged = cases.map((c: { row: Parameters<typeof verdict>[0] }) => verdict(c.row, golden.now).id);
  assert.ok(judged.some((id: string) => id !== "unpriced"), "a SpaceX row with a print gets a real verdict");
});

test("SPCXx is Overnight while Nasdaq is closed, like the other names Kraken quotes around the clock", () => {
  const now = Date.parse("2026-10-18T12:00:00Z");
  const row = {
    symbol: "SPCXx",
    underlying: "SPCX",
    usdPrice: 144.4,
    stockPrice: 146.03,
    marketState: "Closed",
    buyPrice: 144.6,
    buyImpactPct: 0.1,
    buyAt: now,
    issuerPrice: 144.5,
    issuerAt: now,
  };
  assert.equal(verdict(row, now).id, "overnight");
  // Buy still loading: Overnight only while the last trade is within 1% of the print.
  assert.equal(verdict({ ...row, usdPrice: 145, buyPrice: null, buyAt: null }, now).id, "overnight");
  assert.equal(verdict({ ...row, buyPrice: null, buyAt: null }, now).id, "wait", "the last trade is 1.12% away");
  assert.notEqual(verdict({ ...row, symbol: "MSFTx", underlying: "MSFT" }, now).id, "overnight");
  assert.equal(verdict({ ...row, marketState: "Open" }, now).id === "overnight", false, "never while Nasdaq is open");
});
