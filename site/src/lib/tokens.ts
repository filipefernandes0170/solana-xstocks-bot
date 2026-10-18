// The tokenized stocks Par tracks on Solana, in display order.
// xStocks (Backed): the mints and sectors the published desk used (deploy 6aced2a4, 14 Oct 2026).
// Backpack Securities: each mint is listed under "<SYMBOL>.US" by Backpack's own exchange API
// (api.backpack.exchange/api/v1/assets, checked 17 Oct 2026), and all share Backpack's issuer authority on chain.

export type StockToken = {
  symbol: string;
  name: string;
  mint: string;
  underlying: string;
  sector: string;
  issuer: Issuer;
};

export type Issuer = "xStocks" | "Backpack";

export const ISSUER_LABEL: Record<Issuer, string> = { xStocks: "xStocks", Backpack: "Backpack Securities" };

export const TOKENS: StockToken[] = [
  { symbol: "NVDAx", name: "NVIDIA", mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh", underlying: "NVDA", sector: "Semiconductors", issuer: "xStocks" },
  { symbol: "TSLAx", name: "Tesla", mint: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB", underlying: "TSLA", sector: "Autos", issuer: "xStocks" },
  { symbol: "AAPLx", name: "Apple", mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", underlying: "AAPL", sector: "Consumer tech", issuer: "xStocks" },
  { symbol: "SPYx", name: "S&P 500", mint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W", underlying: "SPY", sector: "Index", issuer: "xStocks" },
  { symbol: "QQQx", name: "Nasdaq-100", mint: "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ", underlying: "QQQ", sector: "Index", issuer: "xStocks" },
  { symbol: "MSFTx", name: "Microsoft", mint: "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX", underlying: "MSFT", sector: "Software", issuer: "xStocks" },
  { symbol: "GOOGLx", name: "Alphabet", mint: "XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN", underlying: "GOOGL", sector: "Internet", issuer: "xStocks" },
  { symbol: "AMZNx", name: "Amazon", mint: "Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg", underlying: "AMZN", sector: "Consumer", issuer: "xStocks" },
  { symbol: "METAx", name: "Meta", mint: "Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu", underlying: "META", sector: "Internet", issuer: "xStocks" },
  { symbol: "CRCLx", name: "Circle", mint: "XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1", underlying: "CRCL", sector: "Fintech", issuer: "xStocks" },
  { symbol: "MSTRx", name: "Strategy", mint: "XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ", underlying: "MSTR", sector: "Treasury", issuer: "xStocks" },
  { symbol: "COINx", name: "Coinbase", mint: "Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu", underlying: "COIN", sector: "Exchange", issuer: "xStocks" },
  { symbol: "GLDx", name: "Gold", mint: "Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re", underlying: "GLD", sector: "Commodity", issuer: "xStocks" },
  { symbol: "SPCXx", name: "SpaceX", mint: "Xs3oZwbHvqis4NYcf4YKWmEia2eC84wSiVrcYcTqpH8", underlying: "SPCX", sector: "Aerospace", issuer: "xStocks" },
  { symbol: "PLTRx", name: "Palantir", mint: "XsoBhf2ufR8fTyNSjqfU71DYGaE6Z3SUGAidpzriAA4", underlying: "PLTR", sector: "Software", issuer: "xStocks" },
  { symbol: "AMDx", name: "AMD", mint: "XsXcJ6GZ9kVnjqGsjBnktRcuwMBmvKWh8S93RefZ1rF", underlying: "AMD", sector: "Semiconductors", issuer: "xStocks" },
  { symbol: "HOODx", name: "Robinhood", mint: "XsvNBAYkrDRNhA7wPHQfX3ZUXZyZLdnCQDfHZ56bzpg", underlying: "HOOD", sector: "Brokerage", issuer: "xStocks" },
  { symbol: "NFLXx", name: "Netflix", mint: "XsEH7wWfJJu2ZT3UCFeVfALnVA6CP5ur7Ee11KmzVpL", underlying: "NFLX", sector: "Media", issuer: "xStocks" },
  { symbol: "MCDx", name: "McDonald's", mint: "XsqE9cRRpzxcGKDXj1BJ7Xmg4GRhZoyY1KpmGSxAWT2", underlying: "MCD", sector: "Restaurants", issuer: "xStocks" },
  { symbol: "SPCX", name: "SpaceX", mint: "SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb", underlying: "SPCX", sector: "Aerospace", issuer: "Backpack" },
  { symbol: "MU", name: "Micron", mint: "MUxEsUKSMACyw5fZf68wxf5FLnZVhtU9CwH8uNNGay1", underlying: "MU", sector: "Semiconductors", issuer: "Backpack" },
  { symbol: "TTWO", name: "Take-Two", mint: "TTWofwAge91oFhZs7kpQdyrVRkmevgM88xijGvQFbKo", underlying: "TTWO", sector: "Gaming", issuer: "Backpack" },
  { symbol: "SKHY", name: "SK hynix", mint: "SKHYhSjuRWHgikq8eRKbtBbpABgJSkd7ytQV14i9EQ3", underlying: "SKHY", sector: "Semiconductors", issuer: "Backpack" },
  { symbol: "DJT", name: "Trump Media", mint: "DJTu7vi8norVzdVAffgvb39VP7wjKeTsgaMBJrzfxvoF", underlying: "DJT", sector: "Media", issuer: "Backpack" },
  { symbol: "AMD", name: "AMD", mint: "AMD8XwJXgQ9WV45Wyj9yFLejxzf2J6VM1PJY8bJEjeES", underlying: "AMD", sector: "Semiconductors", issuer: "Backpack" },
];

export const TOKEN_BY_MINT = new Map(TOKENS.map((token) => [token.mint, token]));
export const TOKEN_BY_SYMBOL = new Map(TOKENS.map((token) => [token.symbol, token]));

// Underlyings that trade as ETFs on Nasdaq. The quote API needs assetclass=etf for these.
export const ETF_UNDERLYINGS = new Set(["SPY", "QQQ", "GLD"]);


// Names Kraken quotes around the clock, weekends included (used by the Overnight verdict).
// Kraken's xStocks FAQ (September 2026) listed ten. SPCXx was added on 18 Oct 2026: Kraken's live pair status showed
// it trading on Saturday 17 and Sunday 18 Oct, with exactly these eleven online and the other eight xStocks taking only
// resting orders. @ONPAR_BOT keeps the same list (a bot test checks they match).
export const AROUND_THE_CLOCK = new Set(["TSLAx", "QQQx", "SPYx", "NVDAx", "CRCLx", "AAPLx", "HOODx", "MSTRx", "GLDx", "GOOGLx", "SPCXx"]);

export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
