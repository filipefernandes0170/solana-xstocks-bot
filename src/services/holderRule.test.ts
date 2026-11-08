// $PAR in the bot's words: the holder minimum (250,000 $PAR at launch, 8 Nov 2026) and /ca, the official address.
import assert from "node:assert/strict";
import { test } from "node:test";
import { PAR_HOLDER_MIN, PAR_MINT } from "../config/par.js";
import { holderAmount } from "./holderRule.js";
import { caText, helpText, startText } from "./messages.js";

test("the minimum in words, and plain $PAR when any amount counts", () => {
  assert.equal(PAR_HOLDER_MIN, 250_000);
  assert.equal(holderAmount(250000), "at least 250,000 $PAR");
  assert.equal(holderAmount(0), "$PAR");
  assert.equal(holderAmount(-1), "$PAR");
  assert.equal(holderAmount(Number.NaN), "$PAR");
});

test("/start names the minimum next to the holder features only when one is set", () => {
  assert.ok(startText("Ana", 250000).includes("<b>For $PAR holders</b> · at least 250,000 $PAR"));
  const any = startText("Ana");
  assert.ok(any.includes("<b>For $PAR holders</b>\n"));
  assert.ok(!any.includes("at least"));
});

test("/ca: the official address, or that $PAR is not live yet; listed in /start and /help", () => {
  const before = caText("");
  assert.match(before, /\$PAR is not live yet/);
  assert.match(before, /is not Par's/);
  const mint = "So11111111111111111111111111111111111111112";
  const after = caText(mint);
  assert.ok(after.includes(`<code>${mint}</code>`));
  assert.match(after, /Any other address is not \$PAR/);
  assert.ok(startText("Ana").includes("/ca · the official $PAR address"));
  assert.ok(helpText().includes("/ca · the official $PAR address"));
  // Empty until launch day; after that a Solana address (base58, 32 to 44 characters).
  assert.ok(PAR_MINT === "" || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(PAR_MINT), PAR_MINT);
});
