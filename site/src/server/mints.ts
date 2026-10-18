// Every tracked mint, read in one getMultipleAccounts call and kept for two minutes: pauses and balance changes for
// /events, raw supply for "Supply on Solana". Server-only, read-only.

import { parseMintState, type MintAccount, type MintState } from "../lib/events";
import { TOKENS } from "../lib/tokens";
import { logMessage, rpc } from "./solana";

const CHAIN_FRESH_MS = 2 * 60_000;

let chain: { at: number; states: MintState[] } | null = null;
let reading: Promise<{ at: number; states: MintState[] } | null> | null = null;

async function readMints() {
  try {
    const result = await rpc<{ value: MintAccount[] }>(
      "getMultipleAccounts",
      [TOKENS.map((token) => token.mint), { encoding: "jsonParsed", commitment: "confirmed" }],
      10_000,
    );
    if (!Array.isArray(result?.value) || result.value.length !== TOKENS.length) throw new Error("Unexpected mint list");
    chain = { at: Date.now(), states: TOKENS.map((token, index) => parseMintState(token.symbol, result.value[index])) };
  } catch (error) {
    console.warn(`[par] Mints: ${logMessage(error)}`);
  }
  return chain;
}

/** The mints as of at most two minutes ago; the last good read when Solana does not answer; null if never read. */
export async function mintStates(now = Date.now()) {
  if (chain && now - chain.at < CHAIN_FRESH_MS) return chain;
  reading ??= readMints().finally(() => {
    reading = null;
  });
  return reading;
}
