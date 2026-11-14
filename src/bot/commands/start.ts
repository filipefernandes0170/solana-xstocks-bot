import { Context } from "telegraf";
import { config } from "../../config/index.js";
import { getUser, upsertUser } from "../../db/index.js";
import { bagWatchText, startKeyboard, startText } from "../../services/messages.js";
import { holderNote } from "../holderNote.js";
import { briefReply } from "./brief.js";
import { eventsReply } from "./events.js";
import { confirmProof, holdReply } from "./hold.js";
import { freshProofCode, proveKeyboardFor } from "../proof.js";
import { payloadWallet, portfolioReply } from "./portfolio.js";
import { payloadSymbols, watchReply } from "./watch.js";

/**
 * /start, including the site's deep links: ?start=brief turns the morning brief on, ?start=w-NVDAx-TSLAx
 * (the Favourites "Watch in Telegram" button) watches those names, and ?start=p-<wallet> (the portfolio's
 * "Watch this bag" button) saves that public address and shows its bag, which turns the bag texts on.
 * ?start=v-<code> comes back from the site after a wallet signed the proof message (see /hold),
 * ?start=events (the Events page) answers /events, and ?start=hold (the site's "how to get holder alerts" steps)
 * answers /hold.
 */
export async function startCommand(ctx: Context) {
  const from = ctx.from!;
  upsertUser(from.id, from.username, from.first_name);
  const payload = ((ctx.message as { text?: string })?.text ?? "").trim().split(/\s+/)[1] ?? "";

  if (payload.startsWith("v-")) {
    await confirmProof(ctx, payload.slice(2));
    return;
  }
  if (payload === "hold") {
    await holdReply(ctx);
    return;
  }

  // Someone who has not proven a wallet sees the proof button first, so a holder can do it straight away.
  const proofNonce = getUser(from.id)?.verified_wallet ? null : freshProofCode(from.id);
  await ctx.reply(startText(from.first_name, config.holderMin), {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: startKeyboard(proofNonce),
  });
  if (payload === "brief") await briefReply(ctx, true);
  if (payload === "events") await eventsReply(ctx);
  const symbols = payloadSymbols(payload);
  if (symbols.length > 0) await watchReply(ctx, symbols);
  const wallet = payloadWallet(payload);
  if (wallet && (await portfolioReply(ctx, wallet))) {
    await ctx.reply(bagWatchText(await holderNote(from.id)), { parse_mode: "HTML", reply_markup: proveKeyboardFor(from.id) });
  }
}
