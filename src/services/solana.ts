import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { config } from "../config/index.js";
import { TOKENIZED_STOCKS, type TokenizedStock } from "../config/tokens.js";
import { RPC_TIMEOUT_MS, rpcCall, rpcUrls } from "./rpc.js";

// Every request has a time limit: without one, a hung RPC call never returned and held up whatever waited for it.
const timedFetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(RPC_TIMEOUT_MS) })) as typeof fetch;

export const connection = new Connection(config.rpcUrl, {
  commitment: "confirmed",
  confirmTransactionInitialTimeout: 60_000,
  fetch: timedFetch as never,
});

/** The bot's RPC addresses: SOLANA_RPC_URL, then the public one. */
export const RPC_URLS = rpcUrls(config.rpcUrl);

/** One JSON-RPC call on the bot's addresses, with the time and size limits of services/rpc.ts. */
export function chainCall<T>(method: string, params: unknown[]) {
  return rpcCall<T>(RPC_URLS, method, params);
}

export interface Holding {
  symbol: string;
  name: string;
  mint: string;
  amount: number;
  decimals: number;
  rawAmount: bigint;
}

/*
 * A wallet's stock tokens are read from the token accounts those tokens live in: the associated token account of each
 * tracked mint (one address per mint and token program, worked out from the wallet's address). The answer is at most
 * 50 small accounts per wallet. Before 14 Nov 2026 the bot asked for every token account a wallet owns, which for an
 * exchange or pool address is hundreds of megabytes: one such address pasted into /portfolio ran the bot out of
 * memory, and because the address was saved first, it did so again after every restart.
 */
const TOKEN_PROGRAMS = [TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID];
/** getMultipleAccounts takes at most 100 addresses. */
const ACCOUNTS_PER_CALL = 100;
export const ADDRESSES_PER_WALLET = TOKENIZED_STOCKS.length * TOKEN_PROGRAMS.length;
/** How many wallets fit in one call. */
export const WALLETS_PER_CALL = Math.max(1, Math.floor(ACCOUNTS_PER_CALL / ADDRESSES_PER_WALLET));

type Slot = { address: string; token: TokenizedStock };

// Working an address out takes about a millisecond, so each wallet's list is kept (the newest 2,000 wallets).
const slotCache = new Map<string, Slot[]>();
const SLOT_CACHE_MAX = 2000;

/** The token accounts to read for one wallet. Throws when the wallet is not a Solana address. */
export function walletSlots(wallet: string): Slot[] {
  const known = slotCache.get(wallet);
  if (known) return known;
  const owner = new PublicKey(wallet);
  const slots: Slot[] = [];
  for (const token of TOKENIZED_STOCKS) {
    const mint = new PublicKey(token.mint);
    // allowOwnerOffCurve: a pasted address may be a program's (a pool, a vault); it simply holds nothing here.
    for (const program of TOKEN_PROGRAMS) slots.push({ address: getAssociatedTokenAddressSync(mint, owner, true, program).toBase58(), token });
  }
  if (slotCache.size >= SLOT_CACHE_MAX) slotCache.delete(slotCache.keys().next().value as string);
  slotCache.set(wallet, slots);
  return slots;
}

/** One account from getMultipleAccounts with jsonParsed encoding; null when the address holds nothing. */
export type ParsedTokenAccount = {
  data?: { parsed?: { type?: string; info?: { mint?: string; owner?: string; tokenAmount?: { amount?: string; uiAmountString?: string } } } };
} | null;

/**
 * The holdings in one wallet's accounts, as read. An account counts only when it is a token account of the expected
 * mint owned by this wallet and holds something. Amounts are the ones a wallet shows (the RPC applies the multiplier).
 */
export function holdingsFromAccounts(wallet: string, slots: Slot[], accounts: ParsedTokenAccount[]): Holding[] {
  const bySymbol = new Map<string, Holding>();
  slots.forEach((slot, index) => {
    const parsed = accounts[index]?.data?.parsed;
    const info = parsed?.info;
    if (parsed?.type !== "account" || !info || info.mint !== slot.token.mint || info.owner !== wallet) return;
    const amount = Number(info.tokenAmount?.uiAmountString ?? 0);
    const raw = /^\d+$/.test(info.tokenAmount?.amount ?? "") ? BigInt(info.tokenAmount?.amount as string) : 0n;
    if (!Number.isFinite(amount) || amount <= 0) return;
    const held = bySymbol.get(slot.token.symbol);
    if (held) {
      held.amount += amount;
      held.rawAmount += raw;
    } else {
      bySymbol.set(slot.token.symbol, {
        symbol: slot.token.symbol,
        name: slot.token.name,
        mint: slot.token.mint,
        amount,
        decimals: slot.token.decimals,
        rawAmount: raw,
      });
    }
  });
  return [...bySymbol.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}

/**
 * The tracked stock tokens in each wallet, a few wallets per request. Throws when the chain cannot be read, so a failed
 * read is never mistaken for an empty wallet.
 */
export async function holdingsOfWallets(wallets: string[]): Promise<Map<string, Holding[]>> {
  const out = new Map<string, Holding[]>();
  const unique = [...new Set(wallets)];
  for (let i = 0; i < unique.length; i += WALLETS_PER_CALL) {
    const group = unique.slice(i, i + WALLETS_PER_CALL).map((wallet) => ({ wallet, slots: walletSlots(wallet) }));
    const addresses = group.flatMap((entry) => entry.slots.map((slot) => slot.address));
    const result = await chainCall<{ value?: ParsedTokenAccount[] }>("getMultipleAccounts", [addresses, { encoding: "jsonParsed", commitment: "confirmed" }]);
    const value = result?.value;
    if (!Array.isArray(value) || value.length !== addresses.length) throw new Error("getMultipleAccounts: unexpected answer");
    let offset = 0;
    for (const entry of group) {
      out.set(entry.wallet, holdingsFromAccounts(entry.wallet, entry.slots, value.slice(offset, offset + entry.slots.length)));
      offset += entry.slots.length;
    }
  }
  return out;
}

/** The tracked stock tokens in one wallet (see holdingsOfWallets). Throws when the chain cannot be read. */
export async function getTokenizedStockHoldings(walletAddress: string): Promise<Holding[]> {
  return (await holdingsOfWallets([walletAddress])).get(walletAddress) ?? [];
}

export function isValidSolanaAddress(addr: string): boolean {
  try {
    new PublicKey(addr);
    return true;
  } catch {
    return false;
  }
}
