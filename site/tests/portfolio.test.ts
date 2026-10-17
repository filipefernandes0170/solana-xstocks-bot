// The portfolio upgrade: the bag next to Nasdaq, exit quotes, possible yield, rebases, the Telegram link and the map.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bagEvents,
  bagWatchLink,
  exitTotals,
  exitVersus,
  liveLines,
  realPriceRows,
  realPriceTotals,
  withoutDust,
  yieldIdeas,
} from "../src/lib/bag";
import { treemap } from "../src/lib/treemap";
import type { Offer, PortfolioLine, Quote } from "../src/lib/types";
import { sellUnits } from "../src/server/quotes";

const close = (a: number | null | undefined, b: number) => assert.ok(a != null && Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

function quote(symbol: string, fields: Partial<Quote> = {}): Quote {
  return {
    symbol,
    name: symbol,
    sector: "Semiconductors",
    underlying: symbol.slice(0, -1),
    mint: `${symbol}-mint`,
    usdPrice: 100,
    change24h: 1,
    stockPrice: 100,
    marketState: "Closed",
    sharesPerToken: 1,
    buyPrice: null,
    buyImpactPct: null,
    buyAt: null,
    issuerPrice: null,
    issuerAt: null,
    rebase: null,
    poolUsd: null,
    ...fields,
  };
}

function line(symbol: string, amount: number, usdValue: number, kind: PortfolioLine["kind"] = "Stock"): PortfolioLine {
  return {
    symbol,
    name: symbol,
    kind,
    sector: kind === "Cash" ? "Cash" : "Semiconductors",
    country: "United States",
    currency: "USD",
    underlying: symbol,
    amount,
    usdValue,
    change24h: null,
  };
}

test("the map gives every value its share of the box, inside the box", () => {
  const tiles = treemap(
    [6, 6, 4, 3, 2, 2, 1].map((value, index) => ({ value, item: index })),
    6,
    4,
  );
  assert.equal(tiles.length, 7);
  for (const tile of tiles) {
    close(tile.w * tile.h, tile.value);
    assert.ok(tile.x >= -1e-9 && tile.y >= -1e-9 && tile.x + tile.w <= 6 + 1e-9 && tile.y + tile.h <= 4 + 1e-9, JSON.stringify(tile));
  }
  assert.deepEqual(
    tiles.slice(0, 2).map(({ x, y, w, h }) => [x, y, w, h]),
    [
      [0, 0, 3, 2],
      [0, 2, 3, 2],
    ],
  );
  assert.deepEqual(treemap([{ value: 0, item: 1 }, { value: -5, item: 2 }], 10, 10), []);
  assert.equal(treemap([{ value: 3, item: "only" }], 10, 5)[0].w, 10);
});

test("an exit quote sells the on-chain units behind the shares a wallet shows", () => {
  assert.equal(sellUnits(2.5, 1, 8), 250_000_000);
  // NFLXx after its 10-for-1: 25 shares in the wallet are 2.5 tokens on chain.
  assert.equal(sellUnits(25, 10, 8), 250_000_000);
  assert.equal(sellUnits(1, null, 8), null);
  assert.equal(sellUnits(0, 1, 8), null);
  assert.equal(sellUnits(1e-12, 1, 8), null);
});

test("the Telegram bag link carries one public address and fits the start parameter", () => {
  const wallet = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
  const link = bagWatchLink(` ${wallet} `);
  assert.equal(link, `https://t.me/ONPAR_BOT?start=p-${wallet}`);
  const payload = new URL(link ?? "").searchParams.get("start") ?? "";
  assert.ok(payload.length <= 64);
  assert.match(payload, /^[A-Za-z0-9_-]+$/);
  assert.equal(bagWatchLink("not a wallet"), null);
  assert.equal(bagWatchLink("0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl"), null);
});

test("the bag is re-marked live and set next to the same shares at Nasdaq", () => {
  const quotes = [quote("NVDAx", { usdPrice: 214.8, stockPrice: 214.13 }), quote("SPCXx", { underlying: "SPCX", usdPrice: 50, stockPrice: null })];
  const lines = liveLines([line("NVDAx", 2, 400), line("SPCXx", 1, 49), line("USDC", 10, 10, "Cash"), line("AMDx", 1, 5)], quotes);
  close(lines[0].usdValue, 429.6);
  assert.equal(lines[2].usdValue, 10);
  assert.equal(lines[3].usdValue, 5);

  const rows = realPriceRows(lines, quotes, 1_000_000);
  assert.deepEqual(
    rows.map((row) => row.line.symbol),
    ["NVDAx", "SPCXx"],
  );
  close(rows[0].marked, 429.6);
  close(rows[0].atNasdaq, 428.26);
  close(rows[0].tokenGap, ((214.8 - 214.13) / 214.13) * 100);
  assert.equal(rows[0].buyGap, null);
  assert.equal(rows[1].atNasdaq, null);

  const totals = realPriceTotals(rows);
  close(totals.marked, 429.6);
  close(totals.atNasdaq, 428.26);
  close(totals.diffUsd, 1.34);
  assert.equal(totals.unprinted, 1);
});

test("dust under half a cent is left out and counted, like the bot's bag", () => {
  const split = withoutDust([line("CRCLx", 0.0243, 2), line("SPCXx", 0.00001, 0.0001), line("NVDAx", 0, 0), line("USDC", 0.005, 0.005, "Cash")]);
  assert.deepEqual(
    split.lines.map((l) => l.symbol),
    ["CRCLx", "USDC"],
  );
  assert.equal(split.dust, 1);
});

test("exit quotes are compared with the mark and with Nasdaq from the same moment", () => {
  const nvda = { ok: true as const, symbol: "NVDAx", shares: 2, usd: 428, price: 214, impactPct: 0.05, lastTrade: 214.8, stockPrice: 214.13, marketState: "Open", at: 1 };
  const spcx = { ok: true as const, symbol: "SPCXx", shares: 1, usd: 49, price: 49, impactPct: 0.2, lastTrade: 50, stockPrice: null, marketState: "Open", at: 1 };
  const one = exitVersus(nvda);
  close(one.vsMarkUsd, -1.6);
  close(one.vsNasdaqUsd, -0.26);
  close(one.vsNasdaqPct, ((214 - 214.13) / 214.13) * 100);
  assert.equal(exitVersus(spcx).vsNasdaqUsd, null);

  const both = exitTotals([nvda, spcx]);
  close(both.usd, 477);
  close(both.vsMarkUsd, 477 - 479.6);
  close(both.vsNasdaqUsd, -0.26);
});

test("possible yield uses the best live rate above 0 and leaves the stated vault target out", () => {
  const offer = (symbol: string, venue: string, supplyApy: number | null, kind: Offer["kind"] = "Collateral"): Offer => ({
    symbol,
    venue,
    kind,
    supplyApy,
    borrowAsset: null,
    borrowApy: null,
    maxLtv: null,
    depositsUsd: null,
    note: "",
    href: "https://kamino.com/borrow",
  });
  const offers = [offer("NVDAx", "A", 0.02), offer("NVDAx", "B", 0.03), offer("NVDAx", "Kraken vault", null, "Vault"), offer("TSLAx", "A", 0)];
  const idea = yieldIdeas([line("NVDAx", 5, 1000), line("TSLAx", 1, 400), line("USDC", 50, 50, "Cash")], offers);
  assert.equal(idea.rows.length, 1);
  assert.equal(idea.rows[0].offer.venue, "B");
  close(idea.perYear, 30);
  close(idea.rate, 0.03);
  assert.deepEqual(idea.vaults, ["NVDAx"]);
  assert.equal(yieldIdeas([line("TSLAx", 1, 400)], offers).rate, null);
});

test("coming rebases list only names held, still ahead, soonest first", () => {
  const now = Date.parse("2026-10-17T12:00:00Z");
  const at = (iso: string) => Date.parse(iso) / 1000;
  const quotes = [
    quote("NFLXx", { rebase: { at: at("2026-10-20T13:30:00Z"), current: 10, next: 10.1, direction: "up" } }),
    quote("AAPLx", { rebase: { at: at("2026-10-18T13:30:00Z"), current: 1, next: 1.004, direction: "up" } }),
    quote("TSLAx", { rebase: { at: at("2026-10-16T13:30:00Z"), current: 1, next: 1.01, direction: "up" } }),
    quote("AMDx", { rebase: { at: at("2026-10-19T13:30:00Z"), current: 1, next: 1.01, direction: "up" } }),
  ];
  const events = bagEvents([line("NFLXx", 25, 2500), line("AAPLx", 4, 1000), line("TSLAx", 1, 400)], quotes, now);
  assert.deepEqual(
    events.map((event) => event.line.symbol),
    ["AAPLx", "NFLXx"],
  );
  close(events[1].amountAfter, 25.25);
});
