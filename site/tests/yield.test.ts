// Kamino offers: the borrow figure is the market's stablecoin rate, and every link opens the token's own page.
import assert from "node:assert/strict";
import { test } from "node:test";
import { KAMINO_MARKETS, kaminoReserveUrl, offersFromRows, type ReserveMetrics } from "../src/server/offers";

const [XSTOCKS, SENTORA] = KAMINO_MARKETS;

// Rows as Kamino's API gave them on 17 Oct 2026 (the xStocks market), trimmed to a few.
const ROWS: ReserveMetrics[] = [
  {
    reserve: "7B66Az3tJhAo4bLkX8PzTixQ9ZGyHkkjxfVLhF26sP5q",
    liquidityToken: "NVDAx",
    liquidityTokenMint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
    maxLtv: 0.55,
    borrowApy: 0.0717,
    supplyApy: 0.00022,
    totalSupplyUsd: 2287173,
  },
  {
    reserve: "97zoywd8mPZsGTg8q1wdD2Wgkdrs2tqusp1Qqcxbyj7E",
    liquidityToken: "USDC",
    liquidityTokenMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    maxLtv: 0.8,
    borrowApy: 0.066861418243086,
    supplyApy: 0.05474586300112927,
    totalSupplyUsd: 5712520,
  },
  {
    reserve: "F1xMZ8em6SrQkCnKQR1pzcxQieSUth35sYDQ2kK6o8tX",
    liquidityToken: "USDG",
    liquidityTokenMint: "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH",
    maxLtv: 0,
    borrowApy: 0.0759,
    supplyApy: 0.0484,
    totalSupplyUsd: 8455,
  },
];

test("the borrow figure is the stablecoin's rate in that market, never the token's own", () => {
  const [nvda, ...rest] = offersFromRows(ROWS, XSTOCKS);
  assert.equal(rest.length, 0, "stablecoins are not offers");
  assert.equal(nvda.symbol, "NVDAx");
  assert.equal(nvda.supplyApy, 0.00022);
  assert.equal(nvda.borrowAsset, "USDC");
  assert.equal(nvda.borrowApy, 0.066861418243086, "USDC's borrow rate, not NVDAx's 7.17%");
  assert.equal(nvda.maxLtv, 0.55);
  assert.equal(nvda.href, "https://kamino.com/borrow/reserve/5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua/7B66Az3tJhAo4bLkX8PzTixQ9ZGyHkkjxfVLhF26sP5q");

  // Sentora lends PYUSD; with no stablecoin row, no borrow figure is shown at all.
  const sentora = offersFromRows(
    [
      { ...ROWS[0], reserve: "4WqQtjQbewk7ptnXsX3E3Tf3M4pa9YiBsgAqjsJDkspH", supplyApy: 0 },
      { reserve: "6bR98MJTH68s7eV8ssyBgfuuH5oR2bEt58P9rZPLpBrC", liquidityToken: "PYUSD", liquidityTokenMint: "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo", borrowApy: 0.0081 },
    ],
    SENTORA,
  );
  assert.equal(sentora[0].borrowAsset, "PYUSD");
  assert.equal(sentora[0].borrowApy, 0.0081);
  assert.ok(sentora[0].href.startsWith("https://kamino.com/borrow/reserve/8BNUWRSibVasaAmhYpBCFpGgMisGKfVAf9ho3Cmf6vjr/"));
  const lonely = offersFromRows([ROWS[0]], XSTOCKS)[0];
  assert.equal(lonely.borrowAsset, null);
  assert.equal(lonely.borrowApy, null);
});

test("a Kamino link is built only from a real reserve address", () => {
  assert.equal(kaminoReserveUrl(XSTOCKS.id, undefined), "https://kamino.com/borrow");
  assert.equal(kaminoReserveUrl(XSTOCKS.id, "../../evil"), "https://kamino.com/borrow");
  assert.equal(
    kaminoReserveUrl(XSTOCKS.id, "7B66Az3tJhAo4bLkX8PzTixQ9ZGyHkkjxfVLhF26sP5q"),
    "https://kamino.com/borrow/reserve/5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua/7B66Az3tJhAo4bLkX8PzTixQ9ZGyHkkjxfVLhF26sP5q",
  );
});
