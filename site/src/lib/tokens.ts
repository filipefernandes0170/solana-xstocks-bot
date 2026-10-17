// The tokenized stocks Par tracks (xStocks on Solana), in display order.
// Mints and sectors are the ones the published desk used (deploy 6aced2a4, 14 Oct 2026).

export type StockToken = {
  symbol: string;
  name: string;
  mint: string;
  underlying: string;
  sector: string;
};

export const TOKENS: StockToken[] = [
  { symbol: "NVDAx", name: "NVIDIA", mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh", underlying: "NVDA", sector: "Semiconductors" },
  { symbol: "TSLAx", name: "Tesla", mint: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB", underlying: "TSLA", sector: "Autos" },
  { symbol: "AAPLx", name: "Apple", mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", underlying: "AAPL", sector: "Consumer tech" },
  { symbol: "SPYx", name: "S&P 500", mint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W", underlying: "SPY", sector: "Index" },
  { symbol: "QQQx", name: "Nasdaq-100", mint: "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ", underlying: "QQQ", sector: "Index" },
  { symbol: "MSFTx", name: "Microsoft", mint: "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX", underlying: "MSFT", sector: "Software" },
  { symbol: "GOOGLx", name: "Alphabet", mint: "XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN", underlying: "GOOGL", sector: "Internet" },
  { symbol: "AMZNx", name: "Amazon", mint: "Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg", underlying: "AMZN", sector: "Consumer" },
  { symbol: "METAx", name: "Meta", mint: "Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu", underlying: "META", sector: "Internet" },
  { symbol: "CRCLx", name: "Circle", mint: "XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1", underlying: "CRCL", sector: "Fintech" },
  { symbol: "MSTRx", name: "Strategy", mint: "XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ", underlying: "MSTR", sector: "Treasury" },
  { symbol: "COINx", name: "Coinbase", mint: "Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu", underlying: "COIN", sector: "Exchange" },
  { symbol: "GLDx", name: "Gold", mint: "Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re", underlying: "GLD", sector: "Commodity" },
  { symbol: "SPCXx", name: "SpaceX", mint: "Xs3oZwbHvqis4NYcf4YKWmEia2eC84wSiVrcYcTqpH8", underlying: "SPCX", sector: "Aerospace" },
  { symbol: "PLTRx", name: "Palantir", mint: "XsoBhf2ufR8fTyNSjqfU71DYGaE6Z3SUGAidpzriAA4", underlying: "PLTR", sector: "Software" },
  { symbol: "AMDx", name: "AMD", mint: "XsXcJ6GZ9kVnjqGsjBnktRcuwMBmvKWh8S93RefZ1rF", underlying: "AMD", sector: "Semiconductors" },
  { symbol: "HOODx", name: "Robinhood", mint: "XsvNBAYkrDRNhA7wPHQfX3ZUXZyZLdnCQDfHZ56bzpg", underlying: "HOOD", sector: "Brokerage" },
  { symbol: "NFLXx", name: "Netflix", mint: "XsEH7wWfJJu2ZT3UCFeVfALnVA6CP5ur7Ee11KmzVpL", underlying: "NFLX", sector: "Media" },
  { symbol: "MCDx", name: "McDonald's", mint: "XsqE9cRRpzxcGKDXj1BJ7Xmg4GRhZoyY1KpmGSxAWT2", underlying: "MCD", sector: "Restaurants" },
];

export const TOKEN_BY_MINT = new Map(TOKENS.map((token) => [token.mint, token]));
export const TOKEN_BY_SYMBOL = new Map(TOKENS.map((token) => [token.symbol, token]));

// Underlyings that trade as ETFs on Nasdaq. The quote API needs assetclass=etf for these.
export const ETF_UNDERLYINGS = new Set(["SPY", "QQQ", "GLD"]);

// SpaceX has no public stock print.
export const NO_PRINT_UNDERLYING = "SPCX";

// Names Kraken quotes around the clock (used by the Overnight verdict).
export const AROUND_THE_CLOCK = new Set(["TSLAx", "QQQx", "SPYx", "NVDAx", "CRCLx", "AAPLx", "HOODx", "MSTRx", "GLDx", "GOOGLx"]);

export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
