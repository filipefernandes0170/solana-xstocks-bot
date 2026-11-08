// The holder minimum in the bot's words (HOLDER_MIN_TOKENS; 250,000 $PAR at launch, 8 Nov 2026).
import assert from "node:assert/strict";
import { test } from "node:test";
import { holderAmount } from "./holderRule.js";
import { startText } from "./messages.js";

test("the minimum in words, and plain $PAR when any amount counts", () => {
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
