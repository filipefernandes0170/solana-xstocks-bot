import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { TOKENIZED_STOCKS } from "../config/tokens.js";
import type { DeskQuote } from "./desk.js";
import { briefTeaser, briefText, cardText, pricesText, sizeText } from "./messages.js";
import { currentMultiplier, gapBar, inBriefWindow, isPreMarket, perShareFill, sizeCall, tradeVerdict } from "./verdict.js";

// The size command module loads the config, which needs a bot token; it is never used here.
process.env.TELEGRAM_BOT_TOKEN ??= "test-token-not-real";
const { parseAmount } = await import("../bot/commands/size.js");

test("every bot mint matches the Par site's verified list", () => {
  const site = readFileSync(new URL("../../site/src/lib/tokens.ts", import.meta.url), "utf8");
  const siteMints = new Map([...site.matchAll(/symbol: "(\w+)", name: "[^"]+", mint: "(\w+)"/g)].map((m) => [m[1], m[2]]));
  assert.equal(siteMints.size, TOKENIZED_STOCKS.length);
  for (const token of TOKENIZED_STOCKS) assert.equal(token.mint, siteMints.get(token.symbol), token.symbol);
  // NFLXx once pointed at Chevron's token (CVXx); this is the Netflix mint.
  assert.equal(TOKENIZED_STOCKS.find((t) => t.symbol === "NFLXx")?.mint, "XsEH7wWfJJu2ZT3UCFeVfALnVA6CP5ur7Ee11KmzVpL");
});

test("the multiplier in force switches at the effective time", () => {
  const state = { multiplier: "1.0009", newMultiplier: "1.0017", newMultiplierEffectiveTimestamp: 2_000 };
  assert.equal(currentMultiplier(state, 1_999), 1.0009);
  assert.equal(currentMultiplier(state, 2_000), 1.0017);
  assert.equal(currentMultiplier(null, 2_000), 1);
  assert.equal(currentMultiplier({ multiplier: "10", newMultiplier: "10", newMultiplierEffectiveTimestamp: 0 }, 5), 10);
});

test("a buy is priced per share: on-chain units times the multiplier", () => {
  // Live NVDAx numbers from 17 Oct 2026: $1,000 bought 4.64544038 on-chain units at a 1.0017 multiplier.
  const nvda = perShareFill(1000, 464_544_038, 8, 1.001701196801074);
  assert.ok(nvda && Math.abs(nvda.price - 214.90) < 0.01, String(nvda?.price));
  // NFLXx after its 10-for-1 split: without the multiplier the price per share would be ten times too high.
  const nflx = perShareFill(500, 70_283_000, 8, 10);
  assert.ok(nflx && Math.abs(nflx.shares - 7.0283) < 1e-6 && Math.abs(nflx.price - 71.14) < 0.01, String(nflx?.price));
  assert.equal(perShareFill(1000, 0, 8, 1), null);
  assert.equal(perShareFill(1000, Number.NaN, 8, 1), null);
});

test("the size call uses the desk's thresholds", () => {
  assert.equal(sizeCall({ gap: 0.2, impactPct: 0.1, open: true }).tone, "fair");
  assert.equal(sizeCall({ gap: 0.2, impactPct: 0.1, open: false }).tone, "close");
  assert.equal(sizeCall({ gap: 0.6, impactPct: 0.1, open: true }).tone, "close");
  assert.equal(sizeCall({ gap: 1.2, impactPct: 0.1, open: true }).tone, "far");
  assert.equal(sizeCall({ gap: 0.1, impactPct: 2.5, open: true }).tone, "far");
  assert.equal(sizeCall({ gap: null, impactPct: 0.1, open: true }).tone, "none");
});

test("the brief window is 9:00 to 9:29 New York time on weekdays", () => {
  // 20 Oct 2026 is a Monday; New York is on daylight time (UTC-4).
  assert.equal(inBriefWindow(Date.parse("2026-10-20T12:59:00Z")), false);
  assert.equal(inBriefWindow(Date.parse("2026-10-20T13:00:00Z")), true);
  assert.equal(inBriefWindow(Date.parse("2026-10-20T13:29:00Z")), true);
  assert.equal(inBriefWindow(Date.parse("2026-10-20T13:30:00Z")), false);
  assert.equal(inBriefWindow(Date.parse("2026-10-18T13:10:00Z")), false);
  assert.equal(isPreMarket("Pre-Market"), true);
  assert.equal(isPreMarket("Closed"), false);
  assert.equal(isPreMarket(null), false);
});

test("the text gap meter marks the center and both ends", () => {
  assert.equal(gapBar(0), "cheap ─────●───── rich");
  assert.equal(gapBar(2), "cheap ─────┼────● rich");
  assert.equal(gapBar(-5), "cheap ●────┼───── rich");
  assert.equal(gapBar(null), null);
});

test("size amounts parse from plain, dollar and k forms", () => {
  assert.equal(parseAmount("5000"), 5000);
  assert.equal(parseAmount("$5,000"), 5000);
  assert.equal(parseAmount("5k"), 5000);
  assert.equal(parseAmount("2.5k"), 2500);
  assert.equal(parseAmount("NVDAx"), null);
  assert.equal(parseAmount("-5"), null);
});

const now = Date.parse("2026-10-20T13:10:00Z");
const quote = (over: Partial<DeskQuote>): DeskQuote => ({
  symbol: "SPYx",
  name: "S&P 500",
  mint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
  underlying: "SPY",
  usdPrice: 762.75,
  stockPrice: 760,
  marketState: "Pre-Market",
  buyPrice: null,
  buyImpactPct: null,
  buyAt: null,
  issuerPrice: null,
  issuerAt: null,
  rebase: null,
  change24h: -1.3,
  sharesPerToken: 1.0057,
  ...over,
});

test("messages escape names and keep Telegram HTML balanced", () => {
  const spy = quote({});
  const tsla = quote({ symbol: "TSLAx", name: "Tesla", underlying: "TSLA", usdPrice: 350, stockPrice: 352, change24h: -6 });
  const texts = [
    cardText(spy, tradeVerdict(spy)),
    pricesText([spy, tsla]),
    briefText([spy, tsla], now, 20),
    briefTeaser([spy, tsla], now),
    sizeText({ ok: true, quote: spy, usd: 5000, shares: 6.55, price: 763.36, impactPct: 0.4, at: now }).text,
  ];
  for (const text of texts) {
    assert.ok(text.includes("S&amp;P") || !text.includes("S&P"), "names are escaped");
    assert.ok(!/&(?!amp;|lt;|gt;)/.test(text), "no bare ampersand");
    for (const tag of ["b", "i", "code"]) {
      assert.equal(text.split(`<${tag}>`).length, text.split(`</${tag}>`).length, `<${tag}> balanced`);
    }
    assert.ok(text.length < 4096, "fits one Telegram message");
    assert.ok(!text.includes("\n\n\n"), "no double blank lines");
  }
});
