// The $PAR address, checked on chain. The address is typed in by hand on launch day (config/par.ts), and a wrong one
// would be shown to everyone by /ca and the site, so the bot reads it when it starts and texts the admin what it found;
// tools/par/check.mts does the same on a PC before the address is published. No config import, so the tool can use it.

import { rpcCall } from "./rpc.js";

export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
/** A pump.fun coin is created with one billion tokens. */
export const PAR_SUPPLY_TOKENS = 1_000_000_000;

export type MintFacts = {
  status: "ok";
  /** The token program that owns the mint. */
  programId: string;
  decimals: number;
  /** Total supply in on-chain units, as a decimal string. */
  supplyRaw: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  /** From the mint's own metadata (Token-2022), when it has any. */
  name: string | null;
  symbol: string | null;
};

/** `bad`: the chain answered, and this address is not a token mint. */
export type MintReading = MintFacts | { status: "bad"; reason: string };

type RpcAccount = {
  owner?: string;
  data?: {
    parsed?: {
      type?: string;
      info?: {
        decimals?: number;
        supply?: string;
        mintAuthority?: string | null;
        freezeAuthority?: string | null;
        extensions?: Array<{ extension?: string; state?: { name?: string; symbol?: string } }>;
      };
    };
  };
} | null;

/** What a getAccountInfo answer (jsonParsed) says about a mint address. Pure, so the tests cover every case. */
export function mintReading(value: RpcAccount): MintReading {
  if (!value) return { status: "bad", reason: "there is no account at this address" };
  if (value.owner !== TOKEN_PROGRAM && value.owner !== TOKEN_2022_PROGRAM) return { status: "bad", reason: "the account is not owned by a token program" };
  const parsed = value.data?.parsed;
  const info = parsed?.info;
  if (parsed?.type !== "mint" || !info) return { status: "bad", reason: "the account is a token account or something else, not a mint" };
  if (typeof info.decimals !== "number" || !Number.isInteger(info.decimals) || info.decimals < 0 || info.decimals > 18) {
    return { status: "bad", reason: "the mint has no usable decimals" };
  }
  if (typeof info.supply !== "string" || !/^\d+$/.test(info.supply)) return { status: "bad", reason: "the mint has no readable supply" };
  const metadata = info.extensions?.find((entry) => entry.extension === "tokenMetadata")?.state;
  return {
    status: "ok",
    programId: value.owner,
    decimals: info.decimals,
    supplyRaw: info.supply,
    mintAuthority: info.mintAuthority ?? null,
    freezeAuthority: info.freezeAuthority ?? null,
    name: typeof metadata?.name === "string" ? metadata.name : null,
    symbol: typeof metadata?.symbol === "string" ? metadata.symbol : null,
  };
}

/** Reads the mint. Throws when the chain cannot be read (which says nothing about the address). */
export async function readMint(urls: string[], mint: string): Promise<MintReading> {
  const result = await rpcCall<{ value?: RpcAccount }>(urls, "getAccountInfo", [mint, { encoding: "jsonParsed", commitment: "confirmed" }]);
  return mintReading(result?.value ?? null);
}

/** The smallest balance that counts as holding, in on-chain units. */
export function holderThreshold(minimumTokens: number, decimals: number) {
  if (!(minimumTokens > 0)) return 1n;
  return BigInt(Math.round(minimumTokens * 10 ** decimals));
}

/** A token account from getMultipleAccounts with base64 encoding (the first 72 bytes are enough). */
export type TokenAccountSlice = { owner?: string; data?: [string, string] } | null;

/**
 * Whether one token account, as read (the first 72 bytes: mint, owner, amount), is this wallet's own account of this
 * mint with at least `threshold` in it. Pure, so the tests cover each way it can be something else.
 */
export function accountHolds(account: TokenAccountSlice, mint: Uint8Array, wallet: Uint8Array, threshold: bigint) {
  if (!account || (account.owner !== TOKEN_PROGRAM && account.owner !== TOKEN_2022_PROGRAM)) return false;
  const data = Buffer.from(account.data?.[0] ?? "", "base64");
  if (data.length < 72) return false;
  if (!data.subarray(0, 32).equals(Buffer.from(mint)) || !data.subarray(32, 64).equals(Buffer.from(wallet))) return false;
  return data.readBigUInt64LE(64) >= threshold;
}

/** The supply in whole tokens (a number is exact enough to compare with a billion). */
export function supplyTokens(facts: MintFacts) {
  return Number(facts.supplyRaw) / 10 ** facts.decimals;
}

/** Things worth a second look on a mint that is otherwise fine. A pump.fun coin has none of them. */
export function mintWarnings(facts: MintFacts): string[] {
  const warnings: string[] = [];
  const supply = supplyTokens(facts);
  if (supply > PAR_SUPPLY_TOKENS) warnings.push(`supply is ${supply.toLocaleString("en-US")}, more than one billion`);
  else if (supply < PAR_SUPPLY_TOKENS * 0.99) warnings.push(`supply is ${supply.toLocaleString("en-US")}, under one billion`);
  if (facts.mintAuthority) warnings.push("someone can still create new tokens (mint authority is set)");
  if (facts.freezeAuthority) warnings.push("someone can freeze accounts (freeze authority is set)");
  return warnings;
}

/** A few plain lines for the admin (and for the launch-day tool). */
export function mintReport(mint: string, reading: MintReading) {
  if (reading.status === "bad") return `⚠️ Par: the $PAR address in the code is NOT a token on Solana (${reading.reason}). /ca is off until it is fixed.\n${mint}`;
  const warnings = mintWarnings(reading);
  const title = reading.name || reading.symbol ? ` · ${[reading.name, reading.symbol].filter(Boolean).join(" · ")}` : "";
  return [
    `${warnings.length === 0 ? "✅" : "⚠️"} Par: $PAR address checked on chain${title}`,
    mint,
    `${reading.programId === TOKEN_2022_PROGRAM ? "Token-2022" : "Token program"} · ${reading.decimals} decimals · supply ${supplyTokens(reading).toLocaleString("en-US")}`,
    ...warnings.map((warning) => `• ${warning}`),
  ].join("\n");
}
