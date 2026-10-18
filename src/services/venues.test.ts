// Where to buy and Supply on Solana in the bot: what it reads from the site, and how it says it.
import assert from "node:assert/strict";
import test from "node:test";

process.env.TELEGRAM_BOT_TOKEN ??= "test-token-not-real";

const { parseSupply, parseVenues } = await import("./venues.js");
const { cardText, supplySection, venueLine, weekText } = await import("./messages.js");
const { tradeVerdict } = await import("./verdict.js");
const siteSupply = await import("../../site/src/lib/supply.js");

function balanced(text: string) {
  for (const tag of ["b", "i", "code"]) assert.equal(text.split(`<${tag}>`).length, text.split(`</${tag}>`).length, `<${tag}> balanced`);
  assert.ok(!/&(?!amp;|lt;|gt;)/.test(text), "no bare ampersand");
  assert.ok(text.length < 4096);
}

test("the bot reads the site's venues, and leaves out anything malformed", () => {
  // The shape site/src/lib/venues.ts writes (VenueQuote).
  const answer = {
    symbol: "NVDAx",
    venues: [
      { venue: "kraken", name: "Kraken", market: "NVDAx/USD", state: "open", price: 212.2712, bestAsk: 212.27, quoteCurrency: "USD", href: "https://www.kraken.com/xstocks", at: 1 },
      { venue: "backpack", name: "Backpack Exchange", market: "SPCX.US/USDC", state: "limited", price: null, bestAsk: null, quoteCurrency: "USDC", href: "https://backpack.exchange", at: 1 },
      { name: "<script>", state: "open", price: 1 },
      { name: "Kraken", state: "open", price: null },
      { name: "Kraken", state: "weird", price: 5 },
    ],
  };
  assert.deepEqual(parseVenues(answer), [
    { name: "Kraken", state: "open", price: 212.2712, quoteCurrency: "USD" },
    { name: "Backpack Exchange", state: "limited", price: null, quoteCurrency: "USDC" },
  ]);
  assert.deepEqual(parseVenues(null), []);
  assert.deepEqual(parseVenues({ venues: "x" }), []);
});

test("a card says what $1,000 pays on each exchange, before its fee", () => {
  const kraken = { name: "Kraken", state: "open" as const, price: 212.27, quoteCurrency: "USD" as const };
  assert.equal(venueLine(kraken, 214.13), "🏦 Kraken: $1,000 buys at <b>$212.27</b> a share, before its fee · gap -0.87% cheap");
  assert.equal(
    venueLine({ name: "Backpack Exchange", state: "open", price: 144.07, quoteCurrency: "USDC" }, null),
    "🏦 Backpack Exchange: $1,000 buys at <b>$144.07</b> a share (in USDC), before its fee",
  );
  assert.equal(venueLine({ ...kraken, state: "limited", price: null }, 214), "🏦 Kraken: takes only some orders on this market right now");
  assert.equal(venueLine({ ...kraken, state: "thin", price: null }, 214), "🏦 Kraken: less than $1,000 on its order book right now");
  assert.equal(venueLine({ ...kraken, state: "error", price: null }, 214), null, "a venue that did not answer is left out");

  const quote = {
    symbol: "NVDAx",
    name: "NVIDIA",
    mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
    underlying: "NVDA",
    usdPrice: 212.3,
    stockPrice: 214.13,
    marketState: "Closed",
    buyPrice: null,
    buyImpactPct: null,
    buyAt: null,
    issuerPrice: null,
    issuerAt: null,
    rebase: null,
    change24h: null,
    sharesPerToken: 1.0017,
    issuer: "xStocks" as const,
    poolUsd: 2_000_000,
  };
  const text = cardText(quote, tradeVerdict(quote), [kraken, { ...kraken, name: "Backpack Exchange", state: "error", price: null }]);
  assert.ok(text.includes("🏦 Kraken: $1,000 buys at <b>$212.27</b> a share, before its fee"), text);
  assert.ok(!text.includes("Backpack Exchange"));
  balanced(text);
  assert.ok(!cardText(quote, tradeVerdict(quote)).includes("🏦"), "no exchanges, no line");
});

test("/week adds tokens created and destroyed on Solana, by dollar value, once there is a base reading", () => {
  // Built with the site's own code, then read the way the bot reads /api/supply.
  const rows = siteSupply.supplyRows(
    new Map([
      ["NVDAx", { raw: "1010000000000", decimals: 8, multiplier: 1 }],
      ["TSLAx", { raw: "495000000000", decimals: 8, multiplier: 1 }],
      ["MU", { raw: "100000000", decimals: 6, multiplier: 1 }],
    ]),
    { t: Date.parse("2026-10-18T00:20:00Z"), rows: { NVDAx: { raw: "1000000000000", decimals: 8 }, TSLAx: { raw: "500000000000", decimals: 8 }, MU: { raw: "100000000", decimals: 6 } } },
  );
  const supply = parseSupply(JSON.parse(JSON.stringify({ ok: true, rows, since: Date.parse("2026-10-18T00:20:00Z"), firstReading: 1, asOf: 2 })));
  assert.ok(supply);
  assert.equal(supply.rows.length, 3);
  const prices = new Map([
    ["NVDAx", 212],
    ["TSLAx", 350],
  ]);
  assert.deepEqual(supplySection(supply, prices), [
    "",
    "📦 <b>Supply on Solana since 18 Oct</b>",
    "🟢 <b>NVDAx</b> +100 created (+1.00%) · about $21,200",
    "🔴 <b>TSLAx</b> −50 destroyed (−1.00%) · about $17,500",
    "<i>Tokens the issuer created, or that were burned, on Solana. Rebases are not counted.</i>",
  ]);
  assert.deepEqual(supplySection({ rows: supply.rows, since: null }, prices), [], "nothing until a reading is a day old");
  assert.deepEqual(supplySection(null, prices), []);
  const quiet = supplySection({ rows: [{ symbol: "MU", shares: 100, change: 0, changePct: 0 }], since: Date.parse("2026-10-18T00:20:00Z") }, prices);
  assert.ok(quiet.includes("No tokens created or destroyed."));

  // Before the first ranking (no US session recorded yet), /week still shows the supply.
  const early = weekText({ rows: [], readings: 0 }, supply, prices);
  assert.ok(early.includes("It starts after about two hours of a US session."));
  assert.ok(early.includes("📦 <b>Supply on Solana since 18 Oct</b>"));
  balanced(early);
  assert.equal(parseSupply({ ok: false, rows: [] }), null);
  assert.equal(parseSupply({ ok: true, rows: [{ symbol: "<b>", shares: 1 }] })?.rows.length, 0);
});
