// "Where to buy" and "Supply on Solana": the order-book math and the supply arithmetic.
import assert from "node:assert/strict";
import { test } from "node:test";
import { multiplierAt, parseMintState } from "../src/lib/events";
import {
  SUPPLY_MIN_AGE_MS,
  baseReading,
  byChange,
  supplyKey,
  supplyKeys,
  supplyRows,
  tokensFromRaw,
  type SupplyReading,
} from "../src/lib/supply";
import { TOKEN_BY_SYMBOL } from "../src/lib/tokens";
import { averageFill, backpackMarket, krakenPair, krakenState, parseLevels } from "../src/lib/venues";

const close = (actual: number | null, expected: number, digits = 6) => {
  assert.ok(actual != null, "a number");
  assert.ok(Math.abs((actual as number) - expected) < 10 ** -digits, `${actual} vs ${expected}`);
};

test("a $1,000 market buy walks the asks from the cheapest, and a thin book gives no price", () => {
  // $500 at 100 buys 5 shares; $500 at 101 buys 4.950495 more; the average is 1000 / 9.950495.
  close(averageFill([[101, 10], [100, 5]]), 1000 / (5 + 500 / 101));
  close(averageFill([[212.27, 100]]), 212.27);
  assert.equal(averageFill([[100, 1], [101, 1]]), null, "only $201 on the book");
  assert.equal(averageFill([]), null);
  close(averageFill([[Number.NaN, 5], [-1, 5], [100, 0], [100, 20]]), 100, 9);
});

test("order books are read the way each exchange writes them", () => {
  // Kraken: [price, size, time]; Backpack: [price, size]. Both as text.
  assert.deepEqual(parseLevels([["212.27", "0.035331", 1792274164]]), [[212.27, 0.035331]]);
  assert.deepEqual(parseLevels([["144.07", "1.69"], ["x", "1"], "bad"]), [[144.07, 1.69]]);
  assert.deepEqual(parseLevels(null), []);
});

test("each token maps to the exchange market that lists it", () => {
  const token = (symbol: string) => TOKEN_BY_SYMBOL.get(symbol)!;
  assert.equal(krakenPair(token("NVDAx")), "NVDAxUSD");
  assert.equal(krakenPair(token("SPCXx")), "SPCXxUSD");
  assert.equal(krakenPair(token("SPCX")), null, "Kraken sells the xStock, not Backpack's token");
  assert.equal(backpackMarket(token("SPCX")), "SPCX.US_USDC");
  assert.equal(backpackMarket(token("MU")), "MU.US_USDC");
  assert.equal(backpackMarket(token("NVDAx")), null);
  // Only "online" takes a market buy; on a weekend some Kraken pairs are "post_only" (resting limit orders only).
  assert.equal(krakenState("online"), "open");
  assert.equal(krakenState("post_only"), "limited");
  assert.equal(krakenState("cancel_only"), "limited");
  assert.equal(krakenState(undefined), "limited");
});

test("supply counts are exact, even for amounts past what a float holds", () => {
  close(tokensFromRaw("1066712345678", 8), 10667.12345678, 8);
  close(tokensFromRaw("123456789012345678901234", 6), 123456789012345678.901234, 0);
  assert.equal(tokensFromRaw("0", 8), 0);
  assert.equal(tokensFromRaw("12.5", 8), null);
  assert.equal(tokensFromRaw("-5", 8), null);
  assert.equal(tokensFromRaw("100", 40), null);
});

test("the base reading is the oldest one at least 20 hours old, inside the last 8 days", () => {
  const now = Date.parse("2026-10-25T12:00:00Z");
  const reading = (iso: string): SupplyReading => ({ t: Date.parse(iso), rows: {} });
  const list = [reading("2026-10-16T00:20:00Z"), reading("2026-10-18T00:20:00Z"), reading("2026-10-24T00:20:00Z"), reading("2026-10-25T00:20:00Z")];
  assert.equal(baseReading(list, now)?.t, Date.parse("2026-10-18T00:20:00Z"), "the 16 Oct reading is too old");
  assert.equal(baseReading([reading("2026-10-25T00:20:00Z")], now), null, "under 20 hours old");
  assert.equal(baseReading([reading("2026-10-24T17:00:00Z")], now), null, "19 hours old is too new");
  assert.equal(baseReading([reading("2026-10-24T15:00:00Z")], now)?.t, Date.parse("2026-10-24T15:00:00Z"), "21 hours old is used");
  assert.equal(SUPPLY_MIN_AGE_MS, 20 * 3_600_000);
  assert.equal(supplyKey(Date.parse("2026-10-18T23:59:00Z")), "day/2026-10-18");
  const keys = supplyKeys(now);
  assert.equal(keys.length, 8);
  assert.equal(keys[0], "day/2026-10-18");
  assert.equal(keys[7], "day/2026-10-25");
});

test("created or destroyed is measured on the raw supply, shown in shares at today's multiplier", () => {
  const base: SupplyReading = {
    t: Date.parse("2026-10-18T00:20:00Z"),
    rows: { NVDAx: { raw: "1000000000000", decimals: 8 }, TSLAx: { raw: "500000000000", decimals: 8 }, MU: { raw: "100000000", decimals: 6 } },
  };
  const now = new Map([
    ["NVDAx", { raw: "1010000000000", decimals: 8, multiplier: 1.0017 }],
    ["TSLAx", { raw: "495000000000", decimals: 8, multiplier: 1 }],
    ["MU", { raw: "100000000", decimals: 6, multiplier: 1.0001 }],
    ["SKHY", { raw: "5000000", decimals: 6, multiplier: 1 }],
  ]);
  const rows = supplyRows(now, base);
  const nvda = rows.find((row) => row.symbol === "NVDAx")!;
  close(nvda.shares, 10100 * 1.0017);
  close(nvda.change, 100 * 1.0017);
  close(nvda.changePct, 1);
  const tsla = rows.find((row) => row.symbol === "TSLAx")!;
  close(tsla.change, -50);
  close(tsla.changePct, -1);
  assert.equal(rows.find((row) => row.symbol === "MU")!.change, 0, "a rebase alone creates nothing");
  assert.equal(rows.find((row) => row.symbol === "SKHY")!.change, null, "no earlier reading");
  assert.deepEqual(
    byChange(rows, (symbol) => ({ NVDAx: 212, TSLAx: 350, MU: 850 })[symbol] ?? null).map((row) => row.symbol),
    ["NVDAx", "MU", "TSLAx", "SKHY"],
  );
  // A change of decimals between readings is not compared.
  assert.equal(supplyRows(new Map([["MU", { raw: "100", decimals: 2, multiplier: 1 }]]), base)[0].change, null);
});

test("the mint's supply, decimals and current multiplier are read as the chain gives them", () => {
  const now = Date.parse("2026-10-18T12:00:00Z");
  const account = (scaled: Record<string, unknown> | null) => ({
    data: {
      parsed: {
        type: "mint",
        info: { supply: "1066712345678", decimals: 8, extensions: scaled ? [{ extension: "scaledUiAmountConfig", state: scaled }] : [] },
      },
    },
  });
  const passed = parseMintState("NVDAx", account({ multiplier: "1.0009", newMultiplier: "1.0017", newMultiplierEffectiveTimestamp: Math.floor((now - 1000) / 1000) }));
  assert.equal(passed.supplyRaw, "1066712345678");
  assert.equal(passed.decimals, 8);
  assert.equal(multiplierAt(passed, now), 1.0017, "the new multiplier once its time has come");
  const ahead = parseMintState("NVDAx", account({ multiplier: "1.0009", newMultiplier: "1.0017", newMultiplierEffectiveTimestamp: Math.floor((now + 86_400_000) / 1000) }));
  assert.equal(multiplierAt(ahead, now), 1.0009);
  assert.equal(multiplierAt(parseMintState("X", account(null)), now), 1, "no multiplier means one token is one share");
  assert.equal(multiplierAt(parseMintState("X", account({ multiplier: "0" })), now), null, "a broken multiplier is never guessed");
  assert.equal(multiplierAt(parseMintState("X", null), now), null, "an unread mint has no multiplier");
});
