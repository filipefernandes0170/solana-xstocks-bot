import { Context } from "telegraf";
import { createProof, getProof, getUser, latestProof, markProofUsed, pruneProofs, setVerifiedWallet, upsertUser } from "../../db/index.js";
import { holdText, proofKeyboard, provenText } from "../../services/messages.js";
import { fetchSiteProof, isNonce, newNonce, proofFresh, proofMessage, verifyProof } from "../../services/walletProof.js";
import { holderNote } from "../holderNote.js";

/**
 * /hold: prove the wallet that holds $PAR. Makes a one-time code and a button to the site, where the wallet signs
 * a plain message. /hold check confirms it (the site's "Back to Telegram" does the same), /hold off forgets it.
 */
export async function holdCommand(ctx: Context) {
  upsertUser(ctx.from!.id, ctx.from?.username, ctx.from?.first_name);
  const arg = ((ctx.message as { text?: string })?.text ?? "").trim().split(/\s+/)[1]?.toLowerCase();
  if (arg === "check") {
    await confirmProof(ctx);
    return;
  }
  if (arg === "off") {
    setVerifiedWallet(ctx.from!.id, null);
    await ctx.reply("👛 Your proven wallet is removed. Send /hold to prove one again.");
    return;
  }
  const now = Date.now();
  pruneProofs(now - 24 * 60 * 60_000);
  const nonce = newNonce();
  createProof(ctx.from!.id, nonce, now);
  const user = getUser(ctx.from!.id);
  await ctx.reply(holdText(user?.verified_wallet ?? null), { parse_mode: "HTML", reply_markup: proofKeyboard(nonce) });
}

/**
 * Checks the proof for a code (from ?start=v-<code>) or this user's newest code, and saves the wallet only when the
 * code is theirs, unused and fresh, and the signature checks out here, whatever the site said.
 */
export async function confirmProof(ctx: Context, nonce?: string) {
  const telegramId = ctx.from!.id;
  upsertUser(telegramId, ctx.from?.username, ctx.from?.first_name);
  const proof = nonce ? (isNonce(nonce) ? getProof(nonce) : null) : latestProof(telegramId);
  if (!proof || proof.telegram_id !== telegramId) {
    await ctx.reply("🔐 That code is not yours, or there is none. Send /hold for a new one.");
    return;
  }
  if (proof.used) {
    await ctx.reply("🔐 That code was already used. Send /hold for a new one.");
    return;
  }
  if (!proofFresh(proof.created_at)) {
    await ctx.reply("🔐 That code has expired (they last 15 minutes). Send /hold for a new one.");
    return;
  }
  const signed = await fetchSiteProof(proof.nonce);
  if (!signed) {
    await ctx.reply("🔐 No signature for this code yet. Sign the message on the page, then tap Back to Telegram, or send /hold check.");
    return;
  }
  if (!verifyProof(signed.address, signed.signature, proofMessage(proof.nonce))) {
    await ctx.reply("🔐 The signature did not check out, so nothing was saved. Send /hold to try again.");
    return;
  }
  markProofUsed(proof.nonce);
  setVerifiedWallet(telegramId, signed.address);
  await ctx.reply(`${provenText(signed.address)}\n\n${await holderNote(telegramId)}`, { parse_mode: "HTML" });
}
