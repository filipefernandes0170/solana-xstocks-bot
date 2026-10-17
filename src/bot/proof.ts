import type { InlineKeyboardMarkup } from "telegraf/types";
import { createProof, getUser, pruneProofs } from "../db/index.js";
import { proofKeyboard } from "../services/messages.js";
import { newNonce } from "../services/walletProof.js";

/** A new one-time proof code for this user (codes older than a day are cleared first). */
export function freshProofCode(telegramId: number) {
  const now = Date.now();
  pruneProofs(now - 24 * 60 * 60_000);
  const nonce = newNonce();
  createProof(telegramId, nonce, now);
  return nonce;
}

/**
 * The "Prove my wallet" button for someone who has not proven a wallet yet, so the step is right there on /start and
 * under every holder feature; nothing for someone who has. Free features never need it.
 */
export function proveKeyboardFor(telegramId: number): InlineKeyboardMarkup | undefined {
  const user = getUser(telegramId);
  if (user?.verified_wallet) return undefined;
  return proofKeyboard(freshProofCode(telegramId));
}
