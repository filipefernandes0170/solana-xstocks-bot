// What a token's issuer can still do: one read of the mint account. Server-only, read-only.

import { issuerPowers, type IssuerResult, type ParsedMint } from "../lib/issuer";
import { TOKEN_BY_SYMBOL } from "../lib/tokens";
import { logMessage, rpc } from "./solana";

const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
// Mint settings rarely change; 10 minutes keeps a "paused" flag reasonably fresh without asking the RPC on every view.
const CACHE_MS = 10 * 60_000;
const cache = new Map<string, { at: number; result: IssuerResult }>();

type MintAccount = { value: { owner?: string; data?: { parsed?: { type?: string; info?: ParsedMint } } } | null };

export async function issuerResult(symbol: string): Promise<IssuerResult> {
  const token = TOKEN_BY_SYMBOL.get(symbol);
  if (!token) return { ok: false, symbol, message: "Unknown name." };
  const cached = cache.get(token.mint);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.result;
  try {
    const account = await rpc<MintAccount>("getAccountInfo", [token.mint, { encoding: "jsonParsed", commitment: "confirmed" }], 10_000);
    const parsed = account?.value?.data?.parsed;
    if (!account?.value || parsed?.type !== "mint" || !parsed.info) throw new Error("The address is not a mint account");
    const result: IssuerResult = {
      ok: true,
      symbol: token.symbol,
      mint: token.mint,
      program: account.value.owner === TOKEN_2022_PROGRAM ? "Token-2022" : "Token",
      powers: issuerPowers(parsed.info),
      at: Date.now(),
    };
    cache.set(token.mint, { at: Date.now(), result });
    return result;
  } catch (error) {
    console.warn(`[par] Issuer powers: ${logMessage(error)}`);
    if (cached) return cached.result;
    return { ok: false, symbol: token.symbol, message: "The mint could not be read right now." };
  }
}
