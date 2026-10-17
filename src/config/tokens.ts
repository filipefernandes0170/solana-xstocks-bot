// src/config/tokens.ts
// Easy to extend – just add new entries. The rest of the bot auto-detects them.

export interface TokenizedStock {
  symbol: string;
  name: string;
  mint: string;
  decimals: number;
  underlying?: string;
  issuer: "xStocks" | "Securitize" | "Backpack" | "Ondo" | "Other";
}

/**
 * Major tokenized stocks on Solana (primarily xStocks by Backed Finance).
 * Mint addresses verified from public sources (xstocks.fi, Solscan, Dune, etc.).
 */
export const TOKENIZED_STOCKS: TokenizedStock[] = [
  { symbol: "NVDAx", name: "NVIDIA xStock", mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh", decimals: 8, underlying: "NVDA", issuer: "xStocks" },
  { symbol: "TSLAx", name: "Tesla xStock", mint: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB", decimals: 8, underlying: "TSLA", issuer: "xStocks" },
  { symbol: "AAPLx", name: "Apple xStock", mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", decimals: 8, underlying: "AAPL", issuer: "xStocks" },
  { symbol: "SPYx",  name: "S&P 500 xStock", mint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W", decimals: 8, underlying: "SPY", issuer: "xStocks" },
  { symbol: "QQQx",  name: "Nasdaq-100 xStock", mint: "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ", decimals: 8, underlying: "QQQ", issuer: "xStocks" },
  { symbol: "MSFTx", name: "Microsoft xStock", mint: "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX", decimals: 8, underlying: "MSFT", issuer: "xStocks" },
  { symbol: "GOOGLx",name: "Alphabet xStock", mint: "XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN", decimals: 8, underlying: "GOOGL", issuer: "xStocks" },
  { symbol: "AMZNx", name: "Amazon xStock", mint: "Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg", decimals: 8, underlying: "AMZN", issuer: "xStocks" },
  { symbol: "METAx", name: "Meta xStock", mint: "Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu", decimals: 8, underlying: "META", issuer: "xStocks" },
  { symbol: "CRCLx", name: "Circle xStock", mint: "XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1", decimals: 8, underlying: "CRCL", issuer: "xStocks" },
  { symbol: "MSTRx", name: "Strategy xStock", mint: "XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ", decimals: 8, underlying: "MSTR", issuer: "xStocks" },
  { symbol: "COINx", name: "Coinbase xStock", mint: "Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu", decimals: 8, underlying: "COIN", issuer: "xStocks" },
  { symbol: "GLDx",  name: "Gold xStock", mint: "Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re", decimals: 8, underlying: "GLD", issuer: "xStocks" },
  { symbol: "SPCXx", name: "SpaceX xStock", mint: "Xs3oZwbHvqis4NYcf4YKWmEia2eC84wSiVrcYcTqpH8", decimals: 8, underlying: "SPCX", issuer: "xStocks" },
  { symbol: "PLTRx", name: "Palantir xStock", mint: "XsoBhf2ufR8fTyNSjqfU71DYGaE6Z3SUGAidpzriAA4", decimals: 8, underlying: "PLTR", issuer: "xStocks" },
  { symbol: "AMDx",  name: "AMD xStock", mint: "XsXcJ6GZ9kVnjqGsjBnktRcuwMBmvKWh8S93RefZ1rF", decimals: 8, underlying: "AMD", issuer: "xStocks" },
  { symbol: "HOODx", name: "Robinhood xStock", mint: "XsvNBAYkrDRNhA7wPHQfX3ZUXZyZLdnCQDfHZ56bzpg", decimals: 8, underlying: "HOOD", issuer: "xStocks" },
  { symbol: "MCDx",  name: "McDonald's xStock", mint: "XsqE9cRRpzxcGKDXj1BJ7Xmg4GRhZoyY1KpmGSxAWT2", decimals: 8, underlying: "MCD", issuer: "xStocks" },
  { symbol: "NFLXx", name: "Netflix xStock", mint: "XsEH7wWfJJu2ZT3UCFeVfALnVA6CP5ur7Ee11KmzVpL", decimals: 8, underlying: "NFLX", issuer: "xStocks" },
];

export const MINT_TO_TOKEN = new Map(TOKENIZED_STOCKS.map(t => [t.mint, t]));
export const SYMBOL_TO_TOKEN = new Map(TOKENIZED_STOCKS.map(t => [t.symbol.toUpperCase(), t]));
export const KNOWN_MINTS = TOKENIZED_STOCKS.map(t => t.mint);

/** One word from a chat: `nvda`, `nvdax`, or `nvidia`. */
export function lookupToken(input: string): TokenizedStock | null {
  const q = input.trim().toLowerCase();
  if (!q || /\s/.test(q) || q.length > 24) return null;
  const upper = q.toUpperCase();
  const direct = SYMBOL_TO_TOKEN.get(upper) ?? SYMBOL_TO_TOKEN.get(`${upper}X`);
  if (direct) return direct;
  const under = TOKENIZED_STOCKS.find((token) => token.underlying?.toUpperCase() === upper);
  if (under) return under;
  return (
    TOKENIZED_STOCKS.find((token) => token.name.toLowerCase().replace(/ xstock$/, "") === q) ?? null
  );
}
