import assert from "node:assert/strict";
import test from "node:test";
import { TOKENIZED_STOCKS } from "../config/tokens.js";
import { nasdaqAssetClass, nasdaqQuoteUrl } from "./nasdaq.js";

test("funds are asked for as ETFs, companies as stocks", () => {
  assert.equal(nasdaqAssetClass("SPY"), "etf");
  assert.equal(nasdaqAssetClass("QQQ"), "etf");
  assert.equal(nasdaqAssetClass("GLD"), "etf");
  assert.equal(nasdaqAssetClass("NVDA"), "stocks");
  assert.equal(nasdaqQuoteUrl("SPY"), "https://api.nasdaq.com/api/quote/SPY/info?assetclass=etf");
  assert.equal(nasdaqQuoteUrl("AAPL"), "https://api.nasdaq.com/api/quote/AAPL/info?assetclass=stocks");
});

test("every fund the bot tracks is covered", () => {
  const funds = TOKENIZED_STOCKS.filter((token) => ["SPYx", "QQQx", "GLDx"].includes(token.symbol));
  assert.equal(funds.length, 3);
  for (const token of funds) assert.equal(nasdaqAssetClass(token.underlying ?? ""), "etf", token.symbol);
});
