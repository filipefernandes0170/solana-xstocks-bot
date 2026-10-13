import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { config } from "../config/index.js";
import { connection } from "./solana.js";

let decimalsCache: number | null = null;
const balanceCache = new Map<string, { at: number; holds: boolean }>();

async function decimals() {
  if (decimalsCache != null) return decimalsCache;
  const info = await connection.getParsedAccountInfo(new PublicKey(config.tokenMint));
  const value = info.value?.data;
  const parsed = value && "parsed" in value ? value.parsed?.info?.decimals : undefined;
  decimalsCache = typeof parsed === "number" ? parsed : 6;
  return decimalsCache;
}

function minRaw(decimals: number) {
  if (config.holderMin <= 0) return 1n;
  return BigInt(Math.round(config.holderMin * 10 ** decimals));
}

/**
 * Wallets that currently hold the project coin.
 * Any amount counts unless HOLDER_MIN_TOKENS is set.
 * Results are cached for a minute so the ping loop does not hammer RPC.
 */
export async function walletsHolding(wallets: string[]) {
  const unique = [...new Set(wallets.filter(Boolean))];
  const holding = new Set<string>();
  if (!config.tokenMint || unique.length === 0) return holding;

  const now = Date.now();
  const pending: string[] = [];
  for (const wallet of unique) {
    const cached = balanceCache.get(wallet);
    if (cached && now - cached.at < 60_000) {
      if (cached.holds) holding.add(wallet);
    } else {
      pending.push(wallet);
    }
  }
  if (pending.length === 0) return holding;

  try {
    const threshold = minRaw(await decimals());
    const mint = new PublicKey(config.tokenMint);
    const found = new Set<string>();

    for (const program of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
      const atas = pending.map((wallet) => getAssociatedTokenAddressSync(mint, new PublicKey(wallet), false, program));
      for (let i = 0; i < atas.length; i += 100) {
        const slice = atas.slice(i, i + 100);
        const infos = await connection.getMultipleAccountsInfo(slice);
        infos.forEach((info, index) => {
          if (!info || info.data.length < 72) return;
          const amount = Buffer.from(info.data).readBigUInt64LE(64);
          if (amount >= threshold) found.add(pending[i + index]);
        });
      }
    }

    for (const wallet of pending) {
      const holds = found.has(wallet);
      balanceCache.set(wallet, { at: now, holds });
      if (holds) holding.add(wallet);
    }
  } catch (err) {
    console.warn("Holder check failed:", (err as Error).message);
  }
  return holding;
}

export function holderWallet(user: { wallet: string | null; holder_wallet: string | null }) {
  return user.holder_wallet || user.wallet || "";
}
