// Share images: the words on a name's picture say plainly what the numbers mean, or why there is no gap.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cardImageLine, stampUtc } from "../src/components/share/cardImage";

test("a name's picture says where the $1,000 buy sits, or plainly why it cannot", () => {
  assert.equal(cardImageLine({ gap: 0.36, poolUsd: 3_000_000, stockPrice: 214 }), "A $1,000 buy is 0.36% over the Nasdaq print.");
  assert.equal(cardImageLine({ gap: -0.31, poolUsd: 3_000_000, stockPrice: 214 }), "A $1,000 buy is 0.31% under the Nasdaq print.");
  assert.equal(cardImageLine({ gap: 0.001, poolUsd: 3_000_000, stockPrice: 214 }), "A $1,000 buy is at the Nasdaq print.");
  assert.equal(cardImageLine({ gap: null, poolUsd: 4_432, stockPrice: 70 }), "The pool holds about $4.4k, too thin for a $1,000 buy.");
  assert.equal(cardImageLine({ gap: null, poolUsd: null, stockPrice: null }), "The Nasdaq print is not in yet.");
  assert.equal(cardImageLine({ gap: null, poolUsd: 3_000_000, stockPrice: 214 }), "The $1,000 buy is still loading.");
});

test("the picture carries the time it was drawn, in UTC", () => {
  assert.equal(stampUtc(Date.parse("2026-10-17T17:40:12Z")), "17 Oct 2026, 17:40 UTC");
});
