import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { config } from "../config/index.js";
import { MINT_TO_TOKEN } from "../config/tokens.js";

export const connection = new Connection(config.rpcUrl, {
  commitment: "confirmed",
  confirmTransactionInitialTimeout: 60_000,
});

export interface Holding {
  symbol: string;
  name: string;
  mint: string;
  amount: number;
  decimals: number;
  rawAmount: bigint;
}

/**
 * Fetch all known tokenized stock balances for a wallet.
 * Scans both classic Token and Token-2022 programs (xStocks use Token-2022).
 */
export async function getTokenizedStockHoldings(walletAddress: string): Promise<Holding[]> {
  const owner = new PublicKey(walletAddress);
  const holdings: Holding[] = [];
  const programs = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];

  for (const programId of programs) {
    try {
      const accounts = await connection.getParsedTokenAccountsByOwner(owner, { programId });
      for (const { account } of accounts.value) {
        const info = account.data.parsed.info;
        const mint = info.mint as string;
        const tokenMeta = MINT_TO_TOKEN.get(mint);
        if (!tokenMeta) continue;

        const amount = Number(info.tokenAmount.uiAmountString ?? 0);
        if (amount <= 0) continue;

        holdings.push({
          symbol: tokenMeta.symbol,
          name: tokenMeta.name,
          mint,
          amount,
          decimals: tokenMeta.decimals,
          rawAmount: BigInt(info.tokenAmount.amount),
        });
      }
    } catch (err) {
      console.warn(`Token accounts fetch failed for ${programId.toBase58()}:`, (err as Error).message);
    }
  }

  return holdings.sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export function isValidSolanaAddress(addr: string): boolean {
  try {
    new PublicKey(addr);
    return true;
  } catch {
    return false;
  }
}
