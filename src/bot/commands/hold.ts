import { Context } from "telegraf";
import { getProof, getUser, markProofUsed, recentProofs, releaseVerifiedWallet, setVerifiedWallet, upsertUser, type ProofRow } from "../../db/index.js";
import { holdText, proofKeyboard, provenText } from "../../services/messages.js";
import { PROOF_TTL_MS, fetchSiteProof, isNonce, proofFresh, verifyCodeProof, type SiteProof } from "../../services/walletProof.js";
import { holderNote } from "../holderNote.js";
import { freshProofCode } from "../proof.js";

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
  await holdReply(ctx);
}

/** The proof message with its button. Also the answer to the site's "Open @ONPAR_BOT" link (?start=hold). */
export async function holdReply(ctx: Context) {
  const nonce = freshProofCode(ctx.from!.id);
  const user = getUser(ctx.from!.id);
  await ctx.reply(holdText(user?.verified_wallet ?? null), { parse_mode: "HTML", reply_markup: proofKeyboard(nonce) });
}

/**
 * Checks the proof for a code (from ?start=v-<code>, or the button under a proof message) or, without one, this
 * user's few newest codes, and saves the wallet only when the code is theirs, unused and fresh, and the signature
 * checks out here, whatever the site said. A wallet counts for one Telegram account: proving it here removes it from
 * any other.
 */
export async function confirmProof(ctx: Context, nonce?: string) {
  const telegramId = ctx.from!.id;
  upsertUser(telegramId, ctx.from?.username, ctx.from?.first_name);
  const again = () => ({ reply_markup: proofKeyboard(freshProofCode(telegramId)) });

  let proof: ProofRow | null = null;
  let signed: SiteProof | null = null;
  if (nonce) {
    proof = isNonce(nonce) ? getProof(nonce) : null;
    if (!proof || proof.telegram_id !== telegramId) {
      await ctx.reply("🔐 That code is not yours, or there is none. Here is a new one:", again());
      return;
    }
    if (proof.used) {
      await ctx.reply("🔐 That code was already used. Here is a new one:", again());
      return;
    }
    if (!proofFresh(proof.created_at)) {
      await ctx.reply("🔐 That code has expired (they last 15 minutes). Here is a new one:", again());
      return;
    }
    signed = await fetchSiteProof(proof.nonce);
  } else {
    // No code named (/hold check, or a button from before the code rode in it): the first recent code with a signature.
    const candidates = recentProofs(telegramId, Date.now() - PROOF_TTL_MS, 3);
    if (candidates.length === 0) {
      await ctx.reply("🔐 There is no code waiting, or it has expired (they last 15 minutes). Here is a new one:", again());
      return;
    }
    for (const candidate of candidates) {
      proof = candidate;
      signed = await fetchSiteProof(candidate.nonce);
      if (signed) break;
    }
  }
  if (!proof || !signed) {
    await ctx.reply("🔐 No signature for this code yet. Sign the message on the page, then tap Back to Telegram or “I signed it”.");
    return;
  }
  if (!verifyCodeProof(signed.address, signed.signature, proof.nonce)) {
    await ctx.reply("🔐 The signature did not check out, so nothing was saved. Here is a new code to try again:", again());
    return;
  }
  markProofUsed(proof.nonce);
  const others = releaseVerifiedWallet(signed.address, telegramId);
  setVerifiedWallet(telegramId, signed.address);
  await ctx.reply(`${provenText(signed.address)}\n\n${await holderNote(telegramId)}`, { parse_mode: "HTML" });
  for (const other of others) {
    await ctx.telegram
      .sendMessage(other, "👛 Your proven wallet was just proven by another Telegram account, so holder texts stopped here. A wallet counts for one account. Send /hold to prove a wallet again.")
      .catch(() => {});
  }
}
