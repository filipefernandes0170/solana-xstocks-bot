import type { InlineKeyboardMarkup } from "telegraf/types";
import { createProof, getUser, pruneProofs, recentProofs } from "../db/index.js";
import { proofKeyboard } from "../services/messages.js";
import { newNonce } from "../services/walletProof.js";

/** A code made less than this long ago is handed out again: it still has ten minutes to run. */
const REUSE_MS = 5 * 60_000;

/**
 * A one-time proof code for this user: their newest unused one while it is young, else a new one (codes older than a
 * day are cleared first). Every holder reply carries a proof button, so without the reuse a person opening a few of
 * them held a pile of codes, and "I signed it" checked a different one from the one they had signed.
 */
export function freshProofCode(telegramId: number) {
  const now = Date.now();
  const young = recentProofs(telegramId, now - REUSE_MS, 1)[0];
  if (young) return young.nonce;
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
