// "Who can freeze your bag": the issuer powers of a wallet's tokens, from one getMultipleAccounts read of their mints.
// Server-only, read-only. Each mint is judged with the same rules as a name page (lib/issuer.ts) and kept for
// 10 minutes, since mint settings rarely change.

import type { BagPowersResult, MintPowers } from "../lib/bagPowers";
import { issuerPowers, type ParsedMint } from "../lib/issuer";
import { logMessage, rpc } from "./solana";

const CACHE_MS = 10 * 60_000;
/** getMultipleAccounts takes up to 100 accounts; a wallet page asks for at most 40. */
export const MAX_MINTS = 40;
const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const cache = new Map<string, { at: number; powers: MintPowers }>();

type Account = { data?: { parsed?: { type?: string; info?: ParsedMint } } } | null;

/** Unique, well-formed mint addresses, at most MAX_MINTS. */
export function cleanMints(input: unknown): string[] {
  const list = Array.isArray(input) ? input.filter((mint): mint is string => typeof mint === "string" && MINT.test(mint)) : [];
  return [...new Set(list)].slice(0, MAX_MINTS);
}

/** What one parsed account allows; `read: false` for anything that is not a mint. */
export function mintPowers(mint: string, account: Account): MintPowers {
  const parsed = account?.data?.parsed;
  if (!parsed || parsed.type !== "mint" || !parsed.info) return { mint, read: false, on: [], pausedNow: false };
  const powers = issuerPowers(parsed.info);
  return { mint, read: true, on: powers.filter((power) => power.on).map((power) => power.id), pausedNow: powers.some((power) => power.id === "pause" && power.now != null) };
}

export async function bagPowersResult(mints: string[]): Promise<BagPowersResult> {
  const now = Date.now();
  const missing = mints.filter((mint) => {
    const held = cache.get(mint);
    return !held || now - held.at >= CACHE_MS;
  });
  if (missing.length > 0) {
    try {
      const result = await rpc<{ value: Account[] }>("getMultipleAccounts", [missing, { encoding: "jsonParsed", commitment: "confirmed" }], 10_000);
      if (!Array.isArray(result?.value) || result.value.length !== missing.length) throw new Error("Unexpected account list");
      missing.forEach((mint, index) => cache.set(mint, { at: now, powers: mintPowers(mint, result.value[index]) }));
    } catch (error) {
      console.warn(`[par] Bag powers: ${logMessage(error)}`);
      if (!mints.some((mint) => cache.has(mint))) return { ok: false, message: "The token mints could not be read right now." };
    }
  }
  return { ok: true, at: now, mints: mints.map((mint) => cache.get(mint)?.powers ?? { mint, read: false, on: [], pausedNow: false }) };
}
