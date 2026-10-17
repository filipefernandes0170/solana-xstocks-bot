// The pre-launch pass: issuer powers, the weekly ranking, the closed-market wording and the card's loading state.
import assert from "node:assert/strict";
import { test } from "node:test";
import { meterWaiting } from "../src/components/desk/StockCard";
import type { Snapshot } from "../src/lib/history";
import { issuerPowers, shortKey, type ParsedMint } from "../src/lib/issuer";
import { MIN_OPEN_READINGS, nearLabel, rankNames, rankingShareText } from "../src/lib/ranking";
import { closedLine, opensDay } from "../src/lib/session";

// The NVDAx mint account as Solana's RPC returned it (jsonParsed) on 17 Oct 2026.
const NVDAX_MINT: ParsedMint = {
  decimals: 8,
  freezeAuthority: "JDq14BWvqCRFNu1krb12bcRpbGtJZ1FLEakMw6FdxJNs",
  mintAuthority: "7pt9tkctJPK7PPNQJ77GKg8ZffSF6QxoMiCFYHxrtaCj",
  supply: "32126227321629",
  extensions: [
    { extension: "metadataPointer", state: { authority: "5aMNNLQJwAEeoemTEMkv5NVjqKwvvefRYCQ5Z67HFvEq" } },
    { extension: "permanentDelegate", state: { delegate: "5aMNNLQJwAEeoemTEMkv5NVjqKwvvefRYCQ5Z67HFvEq" } },
    { extension: "defaultAccountState", state: { accountState: "initialized" } },
    { extension: "scaledUiAmountConfig", state: { authority: "S7vYFFWH6BjJyEsdrPQpqpYTqLTrPRK6KW3VwsJuRaS", multiplier: "1.0009180758490996" } },
    { extension: "pausableConfig", state: { authority: "JDq14BWvqCRFNu1krb12bcRpbGtJZ1FLEakMw6FdxJNs", paused: false } },
    { extension: "transferHook", state: { authority: "5aMNNLQJwAEeoemTEMkv5NVjqKwvvefRYCQ5Z67HFvEq", programId: null } },
  ],
};

test("issuer powers are read from the mint, most serious first", () => {
  const powers = issuerPowers(NVDAX_MINT);
  assert.deepEqual(
    powers.map((power) => [power.id, power.on]),
    [
      ["seize", true],
      ["freeze", true],
      ["pause", true],
      ["hook", true],
      ["multiplier", true],
      ["mint", true],
    ],
  );
  assert.equal(powers[0].title, "Can move or burn tokens from any wallet");
  assert.equal(powers[0].authority, "5aMNNLQJwAEeoemTEMkv5NVjqKwvvefRYCQ5Z67HFvEq");
  assert.equal(powers.find((p) => p.id === "hook")?.title, "Can add a transfer rule later");
  assert.ok(powers.every((power) => power.now == null), "nothing is paused");
  assert.equal(shortKey("5aMNNLQJwAEeoemTEMkv5NVjqKwvvefRYCQ5Z67HFvEq"), "5aMN…FvEq");
});

test("a paused or plain mint reads as such", () => {
  const paused = issuerPowers({
    ...NVDAX_MINT,
    extensions: [{ extension: "pausableConfig", state: { authority: "JDq14BWvqCRFNu1krb12bcRpbGtJZ1FLEakMw6FdxJNs", paused: true } }],
  });
  assert.equal(paused.find((p) => p.id === "pause")?.now, "Transfers are paused right now.");

  const plain = issuerPowers({ mintAuthority: null, freezeAuthority: null, extensions: [] });
  assert.ok(plain.every((power) => !power.on));
  assert.equal(plain.find((p) => p.id === "mint")?.title, "Supply is fixed");

  const frozenStart = issuerPowers({ ...NVDAX_MINT, extensions: [{ extension: "defaultAccountState", state: { accountState: "frozen" } }] });
  assert.equal(frozenStart.at(-1)?.id, "frozenStart");
});

function snap(t: number, state: string, rows: Snapshot["rows"]): Snapshot {
  return { t, state, rows };
}

test("the ranking counts open readings within 0.4% of the print, closest first", () => {
  const snaps: Snapshot[] = [];
  for (let i = 0; i < 10; i += 1) {
    snaps.push(
      snap(1_000 + i, "Open", {
        AAPLx: [100.1, 100], // always 0.1%: near
        NVDAx: [i < 5 ? 100.2 : 101, 100], // half near
        TSLAx: [102, 100], // never near
        AMDx: i < 3 ? [100, 100] : (undefined as unknown as [number, number]), // too few readings
      }),
    );
  }
  snaps.push(snap(5_000, "Closed", { TSLAx: [100, 100] })); // closed readings do not count
  for (const s of snaps) for (const key of Object.keys(s.rows)) if (!s.rows[key]) delete s.rows[key];

  const ranking = rankNames(snaps, ["NVDAx", "TSLAx", "AAPLx", "AMDx"]);
  assert.deepEqual(
    ranking.rows.map((row) => row.symbol),
    ["AAPLx", "NVDAx", "TSLAx"],
  );
  assert.equal(ranking.rows[0].near, 1);
  assert.equal(ranking.rows[1].near, 0.5);
  assert.equal(ranking.rows[2].near, 0);
  assert.ok(Math.abs(ranking.rows[1].typicalGap - 0.6) < 1e-9, String(ranking.rows[1].typicalGap));
  assert.equal(ranking.readings, 10);
  assert.deepEqual([ranking.from, ranking.to], [1_000, 1_009]);
  assert.equal(MIN_OPEN_READINGS, 8);
  assert.equal(nearLabel(0.916), "92%");
  assert.equal(
    rankingShareText(ranking),
    "This week on Par: AAPLx sat within 0.4% of Nasdaq 100% of the time. TSLAx only 0%. Is the price real?",
  );
  assert.deepEqual(rankNames([], ["NVDAx"]), { rows: [], readings: 0, from: null, to: null });
});

test("the closed-market line says when Nasdaq opens, calmly", () => {
  const saturday = Date.parse("2026-10-17T15:30:00Z"); // 11:30 ET
  const fridayEvening = Date.parse("2026-10-16T21:00:00Z"); // 17:00 ET
  const mondayEarly = Date.parse("2026-10-19T12:00:00Z"); // 08:00 ET
  const mondayEvening = Date.parse("2026-10-19T21:00:00Z"); // 17:00 ET
  assert.equal(opensDay(saturday), "Monday");
  assert.equal(opensDay(fridayEvening), "Monday");
  assert.equal(opensDay(mondayEarly), "today");
  assert.equal(opensDay(mondayEvening), "tomorrow");
  assert.equal(closedLine("Closed", saturday), "Nasdaq is closed. It opens Monday at 9:30 ET, and nothing is called fair until then.");
  assert.equal(closedLine("Pre-Market", mondayEarly), "Nasdaq is in premarket. It opens today at 9:30 ET, and nothing is called fair until then.");
});

test("a card waits for the buy with a shimmer, and says plainly when the print is missing or the pool is thin", () => {
  assert.deepEqual(meterWaiting({ stockPrice: 214.13, usdPrice: 214.2, poolUsd: 3_000_000 }), { loading: true, text: "Loading the $1,000 buy…" });
  assert.deepEqual(meterWaiting({ stockPrice: null, usdPrice: 214.2, poolUsd: null }), { loading: false, text: "The Nasdaq print is not in yet." });
  assert.deepEqual(meterWaiting({ stockPrice: null, usdPrice: null, poolUsd: null }), { loading: true, text: "Loading the prices…" });
  assert.deepEqual(meterWaiting({ stockPrice: 70, usdPrice: 69.7, poolUsd: 4_432 }), {
    loading: false,
    text: "The pool holds about $4.4k, too thin to quote a $1,000 buy. Use the Size check for a small order.",
  });
});

test("Backpack's tokens sit beside xStocks, and the cheaper $1,000 buy of a company is named", async () => {
  const { TOKENS, ISSUER_LABEL } = await import("../src/lib/tokens");
  const { companyBuys } = await import("../src/components/stock/OtherTokens");
  assert.equal(TOKENS.length, 25);
  assert.deepEqual(
    TOKENS.filter((t) => t.issuer === "Backpack").map((t) => t.symbol),
    ["SPCX", "MU", "TTWO", "SKHY", "DJT", "AMD"],
  );
  assert.equal(new Set(TOKENS.map((t) => t.mint)).size, 25, "every mint once");
  assert.equal(ISSUER_LABEL.Backpack, "Backpack Securities");

  const now = 1_000_000;
  const quote = (symbol: string, buyPrice: number | null) => ({
    symbol,
    name: "AMD",
    sector: "Semiconductors",
    underlying: "AMD",
    mint: `${symbol}-mint`,
    usdPrice: 528,
    change24h: null,
    stockPrice: 528.75,
    marketState: "Open",
    sharesPerToken: 1,
    buyPrice,
    buyImpactPct: 0.1,
    buyAt: buyPrice == null ? null : now,
    issuerPrice: null,
    issuerAt: null,
    rebase: null,
    poolUsd: 186_475,
  });
  const both = companyBuys("AMDx", [quote("AMDx", 560), quote("AMD", 529)], now);
  assert.deepEqual(
    both.rows.map((r) => [r.symbol, r.issuer]),
    [
      ["AMDx", "xStocks"],
      ["AMD", "Backpack Securities"],
    ],
  );
  assert.equal(both.cheaper?.symbol, "AMD");
  assert.equal(companyBuys("AMDx", [quote("AMDx", 560), quote("AMD", null)], now).cheaper, null, "waits for both buys");
  assert.equal(companyBuys("MU", [], now).rows.length, 1);

  const thinAmdx = { ...quote("AMDx", null), poolUsd: 14_170 };
  const deep = companyBuys("AMD", [thinAmdx, quote("AMD", 529)], now);
  assert.equal(deep.cheaper, null);
  assert.equal(deep.onlyDeep?.symbol, "AMD");
  assert.equal(deep.rows[0].thinPool, 14_170);
});
