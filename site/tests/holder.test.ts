// The holder minimum (HOLDER_MIN_TOKENS): read safely, and shown in words wherever the site explains who gets the texts.
// Filipe set it to 250,000 $PAR for the launch (8 Nov 2026); 0 or empty still means any amount.
import assert from "node:assert/strict";
import { test } from "node:test";
import { holderCount, holderMinimum, holderRule } from "../src/lib/holder";

test("the minimum is read safely: empty, zero, negative or junk means any amount", () => {
  assert.equal(holderMinimum("250000"), 250000);
  assert.equal(holderMinimum(" 250000 "), 250000);
  for (const raw of ["", "0", "-5", "abc", undefined, null]) assert.equal(holderMinimum(raw), 0, String(raw));
});

test("the rule in words", () => {
  assert.equal(holderCount(250000), "250,000");
  assert.equal(holderRule(250000), "at least 250,000 $PAR");
  assert.equal(holderRule(0), "any amount of $PAR");
});

test("the desk's holder section states the minimum and says why a wallet does or does not qualify", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { WhyHold } = await import("../src/components/desk/WhyHold");
  const base = { wallet: "", onWallet: () => undefined, busy: false, error: null, onCheck: () => undefined };
  const held = renderToStaticMarkup(createElement(WhyHold, { ...base, status: "holds", minimum: 250000 }));
  assert.match(held, /needs at least 250,000 \$PAR, and the texts stop when it holds less/);
  assert.match(held, /This wallet holds at least 250,000 \$PAR, so it would get the texts/);
  const short = renderToStaticMarkup(createElement(WhyHold, { ...base, status: "absent", minimum: 250000 }));
  assert.match(short, /This wallet holds less than 250,000 \$PAR, so it would not get the texts/);
  const any = renderToStaticMarkup(createElement(WhyHold, { ...base, status: "absent", minimum: 0 }));
  assert.match(any, /This wallet would not get the texts/);
  assert.match(any, /The texts stop when the wallet no longer holds the coin/);
});
