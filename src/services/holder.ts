import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { config } from "../config/index.js";
import { accountHolds, holderThreshold, readMint, type MintFacts, type MintReading, type TokenAccountSlice } from "./parMint.js";
import { RPC_URLS, chainCall } from "./solana.js";

/** `unknown`: the chain could not be read and there is no recent answer to fall back on. */
export type HolderState = "holds" | "short" | "unknown";

/** An answer is reused for a minute, so the ping loop does not hammer the RPC. */
const FRESH_MS = 60_000;
/**
 * When the chain cannot be read, the last answer stands for this long. Without it, one failed request turned every
 * holder into a non-holder for that round: their Fair ping was skipped for good, and they were told they held too little.
 */
const LAST_GOOD_MS = 15 * 60_000;

const balanceCache = new Map<string, { at: number; holds: boolean }>();

// ----- The mint -----

let reading: MintReading | null = null;

/** What the chain said about the $PAR address when it was last read; null before the first good read. */
export function parMintReading() {
  return reading;
}

/** Reads the $PAR mint and remembers the answer. Null when $PAR is not live; throws when the chain cannot be read. */
export async function checkParMint(): Promise<MintReading | null> {
  if (!config.tokenMint) return null;
  try {
    new PublicKey(config.tokenMint);
  } catch {
    reading = { status: "bad", reason: "it is not a valid Solana address" };
    return reading;
  }
  reading = await readMint(RPC_URLS, config.tokenMint);
  return reading;
}

// A mint that is not a token is read again at most every 5 minutes (it only changes with a new deploy).
let badReadAt = 0;

async function mintFacts(): Promise<MintFacts | null> {
  if (reading?.status === "ok") return reading;
  if (reading?.status === "bad" && Date.now() - badReadAt < 5 * 60_000) return null;
  const fresh = await checkParMint();
  if (fresh?.status === "bad") badReadAt = Date.now();
  return fresh?.status === "ok" ? fresh : null;
}

// ----- The balances -----

/**
 * For each wallet: does it hold enough $PAR right now (HOLDER_MIN_TOKENS, 250,000 at launch)? Reads each wallet's own
 * $PAR account, a hundred wallets per request. When the chain cannot be read, an answer up to 15 minutes old stands;
 * a wallet with none is `unknown`, never "holds too little".
 */
export async function holderStates(wallets: string[]): Promise<Map<string, HolderState>> {
  const states = new Map<string, HolderState>();
  const unique = [...new Set(wallets.filter(Boolean))];
  if (!config.tokenMint || unique.length === 0) return states;

  const now = Date.now();
  const pending: string[] = [];
  for (const wallet of unique) {
    const cached = balanceCache.get(wallet);
    if (cached && now - cached.at < FRESH_MS) states.set(wallet, cached.holds ? "holds" : "short");
    else pending.push(wallet);
  }
  if (pending.length === 0) return states;

  try {
    const facts = await mintFacts();
    // The address is not a token: nobody holds it. (The admin was told when the bot started.)
    if (!facts) {
      for (const wallet of pending) states.set(wallet, "short");
      return states;
    }
    const mint = new PublicKey(config.tokenMint);
    const program = new PublicKey(facts.programId);
    const threshold = holderThreshold(config.holderMin, facts.decimals);
    const entries: { wallet: string; key: Uint8Array; address: string }[] = [];
    for (const wallet of pending) {
      try {
        const owner = new PublicKey(wallet);
        entries.push({ wallet, key: owner.toBytes(), address: getAssociatedTokenAddressSync(mint, owner, true, program).toBase58() });
      } catch {
        states.set(wallet, "short");
      }
    }
    for (let i = 0; i < entries.length; i += 100) {
      const slice = entries.slice(i, i + 100);
      const result = await chainCall<{ value?: TokenAccountSlice[] }>("getMultipleAccounts", [
        slice.map((entry) => entry.address),
        { encoding: "base64", commitment: "confirmed", dataSlice: { offset: 0, length: 72 } },
      ]);
      const value = result?.value;
      if (!Array.isArray(value) || value.length !== slice.length) throw new Error("getMultipleAccounts: unexpected answer");
      slice.forEach((entry, index) => {
        const holds = accountHolds(value[index], mint.toBytes(), entry.key, threshold);
        balanceCache.set(entry.wallet, { at: now, holds });
        states.set(entry.wallet, holds ? "holds" : "short");
      });
    }
  } catch (err) {
    console.warn("Holder check failed:", (err as Error).message);
    for (const wallet of pending) {
      if (states.has(wallet)) continue;
      const cached = balanceCache.get(wallet);
      states.set(wallet, cached && now - cached.at < LAST_GOOD_MS ? (cached.holds ? "holds" : "short") : "unknown");
    }
  }
  return states;
}

/** The wallets that hold enough $PAR (see holderStates). A wallet that could not be checked is left out. */
export async function walletsHolding(wallets: string[]) {
  const holding = new Set<string>();
  for (const [wallet, state] of await holderStates(wallets)) if (state === "holds") holding.add(wallet);
  return holding;
}

/**
 * The wallet the holder features check: only one its owner proved by signing a message (/hold). A typed address
 * proves nothing, since anyone can paste someone else's public address.
 */
export function holderWallet(user: { verified_wallet?: string | null }) {
  return user.verified_wallet || "";
}
