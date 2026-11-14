import { config } from "../config/index.js";
import { getUser } from "../db/index.js";
import { holderStates, holderWallet } from "../services/holder.js";
import { holderAmount } from "../services/holderRule.js";

/** One line on whether this user's texts will actually send: it depends on the wallet holding $PAR. */
export async function holderNote(telegramId: number) {
  const user = getUser(telegramId);
  const wallet = user ? holderWallet(user) : "";
  if (!config.tokenMint) {
    return wallet
      ? "⏳ $PAR is not live yet, so holder texts stay off until it is. Your proven wallet is saved."
      : "⏳ $PAR is not live yet, so holder texts stay off until it is. You can already prove your wallet with the button below.";
  }
  const amount = holderAmount(config.holderMin);
  if (!wallet) {
    return `🔐 Prove the wallet that holds ${amount} with the button below (one signed message, not a transaction), or nothing will be sent.`;
  }
  const state = (await holderStates([wallet]).catch(() => null))?.get(wallet) ?? "unknown";
  if (state === "holds") return `✅ Your proven wallet holds ${amount}, so this will send.`;
  // The chain could not be read just now: say so, instead of telling a holder they hold too little.
  if (state === "unknown") return `⏳ Could not check your proven wallet on Solana just now. This will send while it holds ${amount}.`;
  return config.holderMin > 0
    ? `👛 Holder texts need ${amount} in your proven wallet. It holds less, so this will wait until it does.`
    : "👛 Your proven wallet does not hold $PAR yet, so this will wait until it does.";
}
