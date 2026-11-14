// Launch fixes from the site review of 14 Nov 2026: the $PAR line under the nav, the phone table, the steps to the
// holder alerts, /verify without a code, and "Where to buy" while Nasdaq is closed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { solscanToken } from "../src/lib/holder";
import type { Quote } from "../src/lib/types";

const source = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

test("the $PAR line under the nav: not live yet before launch, the full address with Copy and Solscan after", async () => {
  const { ParStrip } = await import("../src/components/ParStrip");
  const before = renderToStaticMarkup(createElement(ParStrip, { mint: "" }));
  assert.match(before, /\$PAR is not live yet\./);
  assert.match(before, /Its only official address will appear here\./);
  assert.match(before, /href="\/#par"/);
  assert.doesNotMatch(before, /Copy|Solscan/);

  // A real-looking Solana address (wrapped SOL's mint), only to draw the launched state.
  const mint = "So11111111111111111111111111111111111111112";
  const after = renderToStaticMarkup(createElement(ParStrip, { mint }));
  assert.match(after, /Official \$PAR address/);
  // The whole address, never shortened: checking every character is the point.
  assert.ok(after.includes(`>${mint}<`), "the full address is on the page");
  assert.doesNotMatch(after, /…/);
  assert.ok(after.includes(`href="${solscanToken(mint)}"`));
  assert.match(after, />Copy</);
  assert.match(after, /Any other address is not \$PAR\./);
  assert.match(after, /href="\/#par"/);
  assert.doesNotMatch(after, /not live yet/);

  // Every page gets it: it sits inside the nav every page renders.
  assert.match(source("components/SiteNav.tsx"), /<ParStrip \/>/);
});

test("the holder section is where /#par lands, says what $PAR unlocks, and gives the three steps", async () => {
  const { WhyHold } = await import("../src/components/desk/WhyHold");
  const base = { wallet: "", onWallet: () => undefined, busy: false, error: null, status: null, onCheck: () => undefined };
  const html = renderToStaticMarkup(createElement(WhyHold, { ...base, minimum: 250000 }));
  assert.match(html, /<section id="par"/);
  assert.match(html, /What \$PAR unlocks/);
  assert.doesNotMatch(html, /Why hold/);
  // The steps, in order: hold, /hold in the bot, sign a message.
  const steps = [/Hold at least 250,000 \$PAR/, /Send \/hold to @ONPAR_BOT/, /Sign one message/].map((step) => html.search(step));
  assert.ok(steps.every((at) => at >= 0), "all three steps are there");
  assert.deepEqual([...steps].sort((a, b) => a - b), steps, "in order");
  assert.match(html, /href="https:\/\/t\.me\/ONPAR_BOT\?start=hold"/);
  assert.match(html, /A message, not a transaction: it cannot move funds\./);
  // The bot sends Telegram messages, not SMS: the site says alerts.
  assert.match(html, /The Telegram alerts are for holders\./);
  assert.doesNotMatch(html.replace(/<[^>]+>/g, " "), /\btexts?\b/i);

  // With no minimum set the first step does not name a number.
  const any = renderToStaticMarkup(createElement(WhyHold, { ...base, minimum: 0 }));
  assert.match(any, />Hold \$PAR</);
});

test("the site's own pages say alerts, not texts", () => {
  // The lines that reproduce the bot's own messages (PhoneDemo, lib/botText) are not part of this.
  for (const file of [
    "routes/bot.tsx",
    "routes/events.tsx",
    "routes/verify.tsx",
    "components/desk/WhyHold.tsx",
    "components/desk/Desk.tsx",
    "components/portfolio/BagEvents.tsx",
    "components/portfolio/WatchBag.tsx",
    "components/portfolio/BagPromise.tsx",
    "components/portfolio/BagSupply.tsx",
  ]) {
    const copy = source(file).replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, "");
    // The ways the old copy used the word: "a text when", "holder texts", "it texts you", "Texts stop".
    const old =
      /\b(?:a|the|holder|bag|filing|flow|event|fair|every) texts?(?![-\w[])|\b[0-9]+ texts(?![-\w[])|\btexts? (?:you|me|go|need|stop|start|stay|are|for|off|when|the moment)\b|\b(?:it|bot|then|as) texts(?![-\w[])/i;
    assert.doesNotMatch(copy, old, `${file} still says "text"`);
  }
});

test("/verify without a code offers the way back to the bot", () => {
  const page = source("routes/verify.tsx");
  assert.match(page, /This link is missing its code\./);
  assert.match(page, /href="https:\/\/t\.me\/ONPAR_BOT\?start=hold"/);
  assert.match(page, /Open @ONPAR_BOT/);
  assert.match(page, /send \/hold to @ONPAR_BOT/);
});

test("the phone rows of the table show the whole price and the verdict", async () => {
  const { StockList } = await import("../src/components/desk/StockList");
  const quote: Quote = {
    symbol: "SPYx",
    name: "S&P 500",
    sector: "Index",
    underlying: "SPY",
    mint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
    usdPrice: 749.12,
    change24h: 0.1,
    stockPrice: 748.5,
    marketState: "Open",
    sharesPerToken: 1,
    buyPrice: 749.3,
    buyImpactPct: 0.01,
    buyAt: 1,
    issuerPrice: null,
    issuerAt: null,
    rebase: null,
    poolUsd: 3_000_000,
  };
  const row = { ...quote, verdict: { id: "fair" as const, title: "Fair", line: "" }, gap: 0.11, older: null };
  const html = renderToStaticMarkup(createElement(StockList, { rows: [row], onOpen: () => undefined, favourites: [], onFavourite: () => undefined }));
  // The phone price is its own element that never truncates, not a tail on the truncated name line.
  assert.match(html, /<span class="whitespace-nowrap[^"]*sm:hidden">\$749\.12<\/span>/);
  assert.doesNotMatch(html, /S&amp;P 500<span/);
  // The phone line carries the verdict in words and the gap, both hidden while a cached page waits for fresh prices.
  const phoneLine = /<span class="col-span-2[^"]*sm:hidden">(.*?)<\/span><\/li>/.exec(html)?.[1] ?? "";
  assert.match(phoneLine, /data-verdict[^>]*>.*Fair/);
  assert.match(phoneLine, /\+0\.11%/);
  assert.equal((phoneLine.match(/data-verdict/g) ?? []).length, 2);
});

test("Where to buy stays grey while Nasdaq is closed", () => {
  const venues = source("components/stock/Venues.tsx");
  assert.match(venues, /const closed = sessionClosed\(quote\?\.marketState\);/);
  assert.match(venues, /<GapPill value=\{gapPct\(row\.price, stock\)\} closed=\{closed\} \/>/);
  // The lowest venue is still named, without the green tint.
  assert.match(venues, /row === lowest \? \(closed \? "bg-field ring-1 ring-line" : "bg-pine-soft ring-1 ring-pine\/30"\)/);
});
