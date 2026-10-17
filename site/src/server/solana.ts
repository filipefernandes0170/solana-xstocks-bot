// Read-only Solana JSON-RPC helpers. Server-only. Nothing here signs or sends a transaction.

import { env } from "./http";

const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export const BAD_ADDRESS = "That does not look like a Solana address.";

/** The bytes of a base58 string, most significant first; null when it has a character outside base58. */
export function base58Decode(value: string): Uint8Array | null {
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(value)) return null;
  const bytes: number[] = [];
  for (const char of value) {
    let carry = BASE58.indexOf(char);
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const char of value) {
    if (char !== "1") break;
    bytes.push(0);
  }
  return Uint8Array.from(bytes.reverse());
}

/** True for a base58 string that decodes to exactly 32 bytes (a Solana public key). */
export function isSolanaAddress(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value) && base58Decode(value)?.length === 32;
}

/** An error's text for the server log, with anything that looks like an address blanked out. */
export function logMessage(error: unknown) {
  return (error instanceof Error ? error.message : "request failed").replace(/[1-9A-HJ-NP-Za-km-z]{32,44}/g, "[address]");
}

/** Trims the input and throws the desk's message when it is not an address. */
export function walletInput(input: unknown): { wallet: string } {
  const wallet = typeof (input as { wallet?: unknown })?.wallet === "string" ? (input as { wallet: string }).wallet.trim() : "";
  if (!isSolanaAddress(wallet)) throw new Error(BAD_ADDRESS);
  return { wallet };
}

function rpcUrls() {
  const configured = env("SOLANA_RPC_URL");
  return configured && configured !== DEFAULT_RPC ? [configured, DEFAULT_RPC] : [DEFAULT_RPC];
}

export async function rpc<T>(method: string, params: unknown[], timeoutMs = 15_000): Promise<T> {
  let lastError: unknown = null;
  for (const url of rpcUrls()) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`RPC answered ${response.status}`);
      const data = (await response.json()) as { result?: T; error?: { message?: string } };
      if (data.error) throw new Error(data.error.message ?? "RPC error");
      return data.result as T;
    } catch (error) {
      lastError = error;
      // Never log the URL: a private RPC URL can contain an API key.
      console.warn(`[par] Solana RPC ${method}: ${logMessage(error)}`);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("RPC unavailable");
}

type ParsedTokenAccount = {
  account: { data: { parsed?: { info?: { mint?: string; tokenAmount?: { uiAmount?: number | null; uiAmountString?: string } } } } };
};

/** UI amounts by mint, across the classic Token and the Token-2022 programs. UI amounts include any share multiplier. */
export async function tokenBalances(owner: string): Promise<Map<string, number>> {
  const balances = new Map<string, number>();
  for (const programId of [TOKEN_PROGRAM, TOKEN_2022_PROGRAM]) {
    const result = await rpc<{ value: ParsedTokenAccount[] }>("getTokenAccountsByOwner", [
      owner,
      { programId },
      { encoding: "jsonParsed", commitment: "confirmed" },
    ]);
    for (const entry of result?.value ?? []) {
      const info = entry.account?.data?.parsed?.info;
      const mint = info?.mint;
      const amount = Number(info?.tokenAmount?.uiAmountString ?? info?.tokenAmount?.uiAmount ?? 0);
      if (!mint || !Number.isFinite(amount) || amount <= 0) continue;
      balances.set(mint, (balances.get(mint) ?? 0) + amount);
    }
  }
  return balances;
}

export async function solBalance(owner: string): Promise<number> {
  const result = await rpc<{ value: number }>("getBalance", [owner, { commitment: "confirmed" }]);
  return Number(result?.value ?? 0) / 1e9;
}
