// The redesign's second pass: the mark, the hero lines, sharing, favourites, the bot card and the gap history.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { MARK_FOAM, MARK_GOLD } from "../src/components/Logo";
import { spread } from "../src/components/desk/HeroLines";
import { botCard, gapBar } from "../src/lib/botText";
import { dayKey, recentDayKeys, seriesFor, withinBand, type Snapshot } from "../src/lib/history";
import { cardShareText, sizeShareText, stockUrl, telegramShareUrl, xShareUrl } from "../src/lib/share";
import { TOKENS } from "../src/lib/tokens";
import type { Quote } from "../src/lib/types";
import { watchLink } from "../src/lib/useFavourites";

test("the site's logo draws the same mark as the image generator", () => {
  const mark = readFileSync(new URL("../../tools/brand/mark.mjs", import.meta.url), "utf8");
  assert.ok(mark.includes(`gold: "${MARK_GOLD}"`), "gold line");
  assert.ok(mark.includes(`foam: "${MARK_FOAM}"`), "pale line");
});

test("the hero lines start closer together the smaller the gap", () => {
  assert.equal(spread(0), 30);
  assert.equal(spread(1), 80);
  assert.equal(spread(-2), 130);
  assert.equal(spread(25), 130);
});

test("share texts say what is on screen, plainly", () => {
  assert.equal(stockUrl("NVDAx"), "https://onpar.site/s/NVDAx");
  assert.equal(cardShareText("NVDAx", 0.36, "Split"), "A $1,000 buy of NVDAx is 0.36% over the Nasdaq print right now (Split). Is the price real?");
  assert.equal(cardShareText("TSLAx", -0.31, "Wait"), "A $1,000 buy of TSLAx is 0.31% under the Nasdaq print right now (Wait). Is the price real?");
  assert.equal(cardShareText("AAPLx", 0.01, "Fair"), "A $1,000 buy of AAPLx is at the Nasdaq print right now (Fair). Is the price real?");
  assert.equal(cardShareText("SPCXx", null, "No print"), "Is SPCXx at the share price? A live check on Par.");
  assert.equal(sizeShareText("NFLXx", 5000, 0.87), "A $5,000 buy of NFLXx costs 0.87% over the Nasdaq print right now. Checked on Par.");
  assert.ok(xShareUrl("a b", "https://x.y/z").startsWith("https://x.com/intent/post?text=a+b&url="));
  assert.ok(telegramShareUrl("a", "https://x.y/z").startsWith("https://t.me/share/url?url="));
});

test("the favourites link fits Telegram's 64-character start parameter", () => {
  const longest = [...TOKENS].sort((a, b) => b.symbol.length - a.symbol.length).map((t) => t.symbol);
  const link = watchLink(longest);
  const payload = new URL(link).searchParams.get("start") ?? "";
  assert.ok(payload.length <= 64, payload);
  assert.match(payload, /^[A-Za-z0-9_-]+$/);
  assert.equal(payload.split("-").length - 1, 8);
});

test("the /bot card meter matches the bot's", () => {
  assert.equal(gapBar(0), "cheap ─────●───── rich");
  assert.equal(gapBar(2), "cheap ─────┼────● rich");
  assert.equal(gapBar(-5), "cheap ●────┼───── rich");
  const quote = {
    symbol: "NVDAx",
    name: "NVIDIA",
    sector: "Semiconductors",
    underlying: "NVDA",
    mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
    usdPrice: 214.8,
    change24h: -0.7,
    stockPrice: 214.13,
    marketState: "Closed",
    sharesPerToken: 1.0017,
    buyPrice: 214.9,
    buyImpactPct: 0.027,
    buyAt: 1_000_000,
    issuerPrice: 213.75,
    issuerAt: 1_000_000,
    rebase: null,
    poolUsd: 3_171_158,
  } satisfies Quote;
  const card = botCard(quote, 1_030_000);
  assert.ok(card.head.endsWith("NVIDIA · NVDAx"));
  assert.ok(card.lines.includes("🛒 $1,000 buy $214.90 a share"));
  assert.ok(card.lines.some((line) => line.startsWith("📏 Gap +0.36% rich")));
  assert.equal(card.meter, gapBar(((214.9 - 214.13) / 214.13) * 100));
});

test("the gap history reads per-day blobs and counts the fair band only while open", () => {
  assert.equal(dayKey(Date.parse("2026-10-17T13:45:00Z")), "day/2026-10-17");
  const keys = recentDayKeys(Date.parse("2026-10-17T13:45:00Z"), 3);
  assert.deepEqual(keys, ["day/2026-10-15", "day/2026-10-16", "day/2026-10-17"]);
  const snaps: Snapshot[] = [
    { t: 3, state: "Open", rows: { NVDAx: [100.2, 100] } },
    { t: 1, state: "Pre-Market", rows: { NVDAx: [101, 100] } },
    { t: 2, state: "Open", rows: { NVDAx: [101, 100], AAPLx: [1, 1] } },
  ];
  const points = seriesFor("NVDAx", snaps);
  assert.deepEqual(
    points.map((p) => p.t),
    [1, 2, 3],
  );
  assert.deepEqual(withinBand(points), { open: 2, within: 1 });
  assert.deepEqual(seriesFor("TSLAx", snaps), []);
});
