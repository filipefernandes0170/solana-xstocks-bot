// Nasdaq's quote API needs assetclass=etf for funds. Asking for SPY, QQQ or GLD as stocks returns HTTP 400,
// which left SPYx, QQQx and GLDx without a Nasdaq print (fixed 17 Oct 2026, same fix as site/src/lib/tokens.ts).
const ETF_UNDERLYINGS = new Set(["SPY", "QQQ", "GLD"]);

export function nasdaqAssetClass(symbol: string): "etf" | "stocks" {
  return ETF_UNDERLYINGS.has(symbol) ? "etf" : "stocks";
}

export function nasdaqQuoteUrl(symbol: string) {
  return `https://api.nasdaq.com/api/quote/${symbol}/info?assetclass=${nasdaqAssetClass(symbol)}`;
}
