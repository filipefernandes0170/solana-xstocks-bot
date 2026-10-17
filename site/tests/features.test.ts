// The redesign's helpers: per-share pricing, the gap meter, the size check, and the bot/site mint lists.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { FAIR_BAND, gapPosition, premiumUsd, sectorColours } from "../src/lib/brand";
import { parseUsd, sizeCall } from "../src/lib/size";
import { TOKENS } from "../src/lib/tokens";
import { perShareFill } from "../src/server/quotes";

test("a buy is priced per share: on-chain units times the multiplier", () => {
  // Live NVDAx numbers from 17 Oct 2026: $1,000 bought 4.64544038 on-chain units at a 1.0017 multiplier.
  const nvda = perShareFill(1000, 464_544_038, 8, 1.001701196801074);
  assert.ok(nvda && Math.abs(nvda.price - 214.9) < 0.01, String(nvda?.price));
  // NFLXx after its 10-for-1 split: without the multiplier the price per share would be ten times too high.
  const nflx = perShareFill(500, 70_283_000, 8, 10);
  assert.ok(nflx && Math.abs(nflx.price - 71.14) < 0.01, String(nflx?.price));
  assert.equal(perShareFill(1000, 0, 8, 1), null);
  assert.equal(perShareFill(1000, 464_544_038, 8, null)?.shares, 4.64544038);
});

test("the gap meter places the fair band in the middle and clamps at ±2%", () => {
  assert.equal(gapPosition(0).left, 50);
  assert.equal(gapPosition(FAIR_BAND).left, 60);
  assert.equal(gapPosition(-2).left, 0);
  assert.deepEqual(gapPosition(24.1), { left: 100, off: "right" });
  assert.deepEqual(gapPosition(-3), { left: 0, off: "left" });
  assert.equal(gapPosition(1).off, null);
});

test("the extra paid is the cost minus the same shares at the print", () => {
  assert.ok(Math.abs((premiumUsd(1000, 4.6534, 214.13) as number) - (1000 - 4.6534 * 214.13)) < 1e-9);
  assert.ok((premiumUsd(1000, 5, 210) as number) < 0);
  assert.equal(premiumUsd(1000, 5, null), null);
});

test("the size call uses the desk's thresholds", () => {
  assert.equal(sizeCall({ gap: 0.2, impactPct: 0.1, open: true }).tone, "fair");
  assert.equal(sizeCall({ gap: 0.2, impactPct: 0.1, open: false }).tone, "close");
  assert.equal(sizeCall({ gap: 0.6, impactPct: 0.1, open: true }).tone, "close");
  assert.equal(sizeCall({ gap: 137.9, impactPct: 58, open: false }).tone, "far");
  assert.equal(sizeCall({ gap: 0.1, impactPct: 2.5, open: true }).tone, "far");
  assert.equal(sizeCall({ gap: null, impactPct: 0.1, open: true }).tone, "none");
});

test("amounts parse with or without dollar signs and commas", () => {
  assert.equal(parseUsd("$5,000"), 5000);
  assert.equal(parseUsd("1000.50"), 1000.5);
  assert.equal(parseUsd("abc"), null);
  assert.equal(parseUsd("0"), null);
});

test("every sector has its own badge colours", () => {
  for (const token of TOKENS) assert.notEqual(sectorColours(token.sector).bg, "#143240", token.sector);
});

test("the site and the bot track the same mints", () => {
  const bot = readFileSync(new URL("../../src/config/tokens.ts", import.meta.url), "utf8");
  const botMints = new Map([...bot.matchAll(/symbol: "(\w+)",\s*name: "[^"]+", mint: "(\w+)"/g)].map((m) => [m[1], m[2]]));
  assert.equal(botMints.size, TOKENS.length);
  for (const token of TOKENS) assert.equal(botMints.get(token.symbol), token.mint, token.symbol);
});

test("a Nasdaq print survives one failed round, but not past 30 minutes", async () => {
  const { freshPrints } = await import("../src/server/quotes");
  const now = 1_800_000_000_000;
  const rows = new Map([
    ["NFLX", { price: 70.53, state: "Closed", at: now - 4 * 60_000 }],
    ["AMD", { price: 528.75, state: "Closed", at: now - 31 * 60_000 }],
  ]);
  assert.deepEqual(freshPrints(rows, now), { NFLX: { price: 70.53, state: "Closed" } });
});

test("the page keeps the newest buy per name across polled answers", async () => {
  const { mergeBuys } = await import("../src/lib/verdict");
  const now = 1_800_000_000_000;
  const quote = (mint: string, buyAt: number | null, buyPrice: number | null) =>
    ({ mint, buyAt, buyPrice, buyImpactPct: buyPrice == null ? null : 0.01 }) as unknown as import("../src/lib/types").Quote;
  const previous = [quote("a", now - 20_000, 100), quote("b", now - 100_000, 50), quote("c", now - 10_000, 10)];
  const next = [quote("a", null, null), quote("b", null, null), quote("c", now - 2_000, 11)];
  const merged = mergeBuys(previous, next, now);
  assert.equal(merged[0].buyPrice, 100, "a usable buy is kept when the answer has none");
  assert.equal(merged[1].buyPrice, null, "a buy older than 90 s is dropped");
  assert.equal(merged[2].buyPrice, 11, "a newer buy replaces the held one");
});
