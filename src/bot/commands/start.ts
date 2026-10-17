import { Context } from "telegraf";
import { upsertUser } from "../../db/index.js";
import { bagWatchText, startKeyboard, startText } from "../../services/messages.js";
import { holderNote } from "../holderNote.js";
import { briefReply } from "./brief.js";
import { confirmProof } from "./hold.js";
import { payloadWallet, portfolioReply } from "./portfolio.js";
import { payloadSymbols, watchReply } from "./watch.js";

/**
 * /start, including the site's deep links: ?start=brief turns the morning brief on, ?start=w-NVDAx-TSLAx
 * (the Favourites "Watch in Telegram" button) watches those names, and ?start=p-<wallet> (the portfolio's
 * "Watch this bag" button) saves that public address and shows its bag, which turns the bag texts on.
 * ?start=v-<code> comes back from the site after a wallet signed the proof message (see /hold).
 */
export async function startCommand(ctx: Context) {
  const from = ctx.from!;
  upsertUser(from.id, from.username, from.first_name);
  const payload = ((ctx.message as { text?: string })?.text ?? "").trim().split(/\s+/)[1] ?? "";

  if (payload.startsWith("v-")) {
    await confirmProof(ctx, payload.slice(2));
    return;
  }

  await ctx.reply(startText(from.first_name), {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: startKeyboard(),
  });
  if (payload === "brief") await briefReply(ctx, true);
  const symbols = payloadSymbols(payload);
  if (symbols.length > 0) await watchReply(ctx, symbols);
  const wallet = payloadWallet(payload);
  if (wallet && (await portfolioReply(ctx, wallet))) {
    await ctx.reply(bagWatchText(await holderNote(from.id)), { parse_mode: "HTML" });
  }
}
