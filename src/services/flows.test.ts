// Issuer flows (services/flows.ts): what counts as a large flow, the window it is measured over, how a reported flow is
// not counted twice, the texts, and the database rows behind them.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

// The database module opens DATABASE_PATH when it loads: a throwaway file, never the bot's own.
process.env.TELEGRAM_BOT_TOKEN ??= "test-token-not-real";
process.env.DATABASE_PATH = path.join(mkdtempSync(path.join(tmpdir(), "par-flows-")), "bot.db");

const flows = await import("./flows.js");
const db = await import("../db/index.js");
const { FLOW_MIN_PCT, FLOW_MIN_USD, FLOW_WINDOW_MS, FLOW_WINDOW_SLACK_MS, detectFlow, flowBaseline, flowFromRow, flowMoney, flowText, flowToRow, flowsText } =
  flows;

const MIN = 60_000;
const T0 = Date.parse("2026-10-19T15:00:00Z");
// MSTRx-like numbers: 8 decimals, $137 a share, about 540,000 shares on Solana (about $74M).
const UNIT = 10n ** 8n;
const SUPPLY = 540_000n * UNIT;

/** Readings every 5 minutes from `from` to `to` (minutes after T0), with `step(minute)` extra tokens on top. */
function readings(from: number, to: number, step: (minute: number) => bigint = () => 0n) {
  const out = [];
  for (let m = from; m <= to; m += 5) out.push({ at: T0 + m * MIN, raw: SUPPLY + step(m) });
  return out;
}

const base = { symbol: "MSTRx", lastFlow: null, decimals: 8, multiplier: 1, usdPrice: 137 };

test("a batch of $6.9M (9% of supply) created in the last hour is a large flow", () => {
  // 50,000 tokens created at minute 70; the newest reading is minute 75, the baseline minute 15 (60 min before).
  const flow = detectFlow({ ...base, readings: readings(0, 75, (m) => (m >= 70 ? 50_000n * UNIT : 0n)) });
  assert.ok(flow);
  assert.equal(flow.at, T0 + 75 * MIN);
  assert.equal(flow.since, T0 + 15 * MIN);
  assert.equal(flow.shares, 50_000);
  assert.equal(flow.usd, 50_000 * 137);
  assert.ok(Math.abs(flow.pct - (50_000 / 540_000) * 100) < 1e-9);
  assert.equal(flow.supplyUsd, 590_000 * 137);
});

test("burns count the same way, as negative flows", () => {
  const flow = detectFlow({ ...base, readings: readings(0, 75, (m) => (m >= 70 ? -20_000n * UNIT : 0n)) });
  assert.ok(flow);
  assert.equal(flow.shares, -20_000);
  assert.ok(flow.usd < 0 && flow.pct < 0);
});

test("small flows are left out: both the dollar and the percent floor must be met", () => {
  assert.equal(FLOW_MIN_USD, 500_000);
  assert.equal(FLOW_MIN_PCT, 1);
  // $411k: under $500,000 (and 0.56%).
  assert.equal(detectFlow({ ...base, readings: readings(0, 75, (m) => (m >= 70 ? 3_000n * UNIT : 0n)) }), null);
  // $685k but 0.93% of supply: under 1%.
  assert.equal(detectFlow({ ...base, readings: readings(0, 75, (m) => (m >= 70 ? 5_000n * UNIT : 0n)) }), null);
  // $822k and 1.1%: both met.
  assert.ok(detectFlow({ ...base, readings: readings(0, 75, (m) => (m >= 70 ? 6_000n * UNIT : 0n)) }));
});

test("the window is about an hour: no flow before an hour of readings, none from readings too old", () => {
  // Only 50 minutes of readings: no baseline yet.
  assert.equal(detectFlow({ ...base, readings: readings(0, 50, (m) => (m >= 45 ? 50_000n * UNIT : 0n)) }), null);
  // A gap: the only older reading is 2 hours old, past the window and its slack.
  const gap = [{ at: T0, raw: SUPPLY }, { at: T0 + 120 * MIN, raw: SUPPLY + 50_000n * UNIT }];
  assert.equal(detectFlow({ ...base, readings: gap }), null);
  // The baseline is the newest reading at least 60 minutes old, within 80.
  const pick = flowBaseline(readings(0, 90), { at: T0 + 90 * MIN, raw: SUPPLY }, null);
  assert.equal(pick?.at, T0 + 30 * MIN);
  assert.equal(FLOW_WINDOW_MS + FLOW_WINDOW_SLACK_MS, 80 * MIN);
});

test("a reported flow is not counted again, and a second batch after it is measured from it", () => {
  const all = readings(0, 120, (m) => (m >= 70 ? 50_000n * UNIT : 0n) + (m >= 95 ? 10_000n * UNIT : 0n));
  const first = detectFlow({ ...base, readings: all.filter((r) => r.at <= T0 + 75 * MIN) });
  assert.ok(first);
  const lastFlow = { at: first.at, rawAfter: first.rawAfter };
  // The same reading again: nothing new.
  assert.equal(detectFlow({ ...base, lastFlow, readings: all.filter((r) => r.at <= T0 + 75 * MIN) }), null);
  // Ten minutes later, no new tokens: measured from the reported flow, so nothing.
  assert.equal(detectFlow({ ...base, lastFlow, readings: all.filter((r) => r.at <= T0 + 85 * MIN) }), null);
  // A second batch of 10,000 ($1.37M, 1.7%): reported on its own, not as 60,000.
  const second = detectFlow({ ...base, lastFlow, readings: all.filter((r) => r.at <= T0 + 100 * MIN) });
  assert.ok(second);
  assert.equal(second.shares, 10_000);
  assert.equal(second.since, first.at);
});

test("a rebase is never a flow: the raw supply does not move, only the multiplier", () => {
  const flow = detectFlow({ ...base, multiplier: 10, readings: readings(0, 75) });
  assert.equal(flow, null);
  // With a multiplier, shares are raw tokens times it (a split shows as more shares, not as more raw supply).
  const split = detectFlow({ ...base, multiplier: 2, usdPrice: 68.5, readings: readings(0, 75, (m) => (m >= 70 ? 25_000n * UNIT : 0n)) });
  assert.equal(split?.shares, 50_000);
});

test("no price or no supply means no flow", () => {
  assert.equal(detectFlow({ ...base, usdPrice: null, readings: readings(0, 75, (m) => (m >= 70 ? 50_000n * UNIT : 0n)) }), null);
  assert.equal(detectFlow({ ...base, readings: [] }), null);
});

test("texts: amounts, direction, and no buy or sell call", () => {
  assert.equal(flowMoney(4_200_000), "$4.20M");
  assert.equal(flowMoney(-650_400), "$650k");
  const created = detectFlow({ ...base, readings: readings(0, 75, (m) => (m >= 70 ? 50_000n * UNIT : 0n)) })!;
  const text = flowText(created);
  assert.match(text, /Issuer flow · MSTRx/);
  assert.match(text, /\$6\.85M<\/b> of new MSTRx created since/);
  assert.match(text, /50,000 shares, \+9\.3% of its supply on Solana/);
  assert.match(text, /not a buy or sell signal/);
  assert.match(text, /xStocks \(Backed\)/);
  const burned = flowText(detectFlow({ ...base, readings: readings(0, 75, (m) => (m >= 70 ? -20_000n * UNIT : 0n)) })!);
  assert.match(burned, /MSTRx burned since/);
  assert.match(burned, /−3\.7% of its supply/);
  const list = flowsText({ flows: [created], now: created.at + 10 * MIN, watchingSince: T0, footer: "footer" });
  assert.match(list, /🟢 <b>MSTRx<\/b> \+\$6\.85M created · \+9\.3%/);
  const empty = flowsText({ flows: [], now: T0 + 30 * MIN, watchingSince: T0, footer: "footer" });
  assert.match(empty, /No large flows yet\. Par started reading the supply at .* flows show from an hour after that\./);
  assert.match(flowsText({ flows: [], now: T0 + 5 * 60 * MIN, watchingSince: T0, footer: "f" }), /No large flows in the last 24 hours\./);
});

test("the database keeps readings and flows, and flow texts have their own daily count", () => {
  db.recordSupply("mintA", T0, "100");
  db.recordSupply("mintA", T0, "999");
  db.recordSupply("mintA", T0 + 5 * MIN, "150");
  assert.deepEqual(db.supplyReadings("mintA", T0), [
    { at: T0, raw: "100" },
    { at: T0 + 5 * MIN, raw: "150" },
  ]);
  assert.equal(db.oldestSupplyAt(), T0);

  const flow = detectFlow({ ...base, readings: readings(0, 75, (m) => (m >= 70 ? 50_000n * UNIT : 0n)) })!;
  db.addFlowEvent(flowToRow(flow));
  db.addFlowEvent(flowToRow(flow));
  assert.equal(db.flowEventsSince(T0).length, 1);
  assert.deepEqual(flowFromRow(db.lastFlowEvent("MSTRx")!), flow);

  db.upsertUser(42);
  assert.equal(db.getUser(42).flows, 1);
  db.setFlows(42, false);
  assert.equal(db.getUser(42).flows, 0);
  // A delivered flow text counts toward the flow limit, not toward the limit for filing texts.
  db.markEventSent(42, `flow:MSTRx:${flow.at}`, "2026-10-19", true);
  db.markEventSent(42, "0001234567-26-000001", "2026-10-19", true);
  db.markEventSent(42, `flow:NVDAx:${flow.at}`, "2026-10-19", false);
  assert.equal(db.flowTextsOn(42, "2026-10-19"), 1);
  assert.equal(db.eventsSentOn(42, "2026-10-19"), 1);
});
