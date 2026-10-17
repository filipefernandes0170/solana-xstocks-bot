import { config } from "../config/index.js";
import { getUser } from "../db/index.js";
import { holderWallet, walletsHolding } from "../services/holder.js";

/** One line on whether this user's texts will actually send: it depends on the wallet holding $PAR. */
export async function holderNote(telegramId: number) {
  if (!config.tokenMint) return "⏳ $PAR is not live yet, so holder texts stay off until it is.";
  const user = getUser(telegramId);
  const wallet = user ? holderWallet(user) : "";
  if (!wallet) return "🔐 Prove the wallet that holds $PAR with /hold (one signed message, not a transaction), or nothing will be sent.";
  const holders = await walletsHolding([wallet]).catch(() => new Set<string>());
  return holders.has(wallet)
    ? "✅ Your proven wallet holds $PAR, so this will send."
    : "👛 Your proven wallet does not hold $PAR yet, so this will wait until it does.";
}
