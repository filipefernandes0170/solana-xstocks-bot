import { Context, Markup } from "telegraf";
import { config } from "../../config/index.js";
import { caText } from "../../services/messages.js";

/** /ca: the official $PAR address (config/par.ts), with its Solscan page; before launch, that $PAR is not live yet. */
export async function caCommand(ctx: Context) {
  const mint = config.tokenMint;
  await ctx.reply(caText(mint), {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: mint ? Markup.inlineKeyboard([Markup.button.url("View on Solscan", `https://solscan.io/token/${mint}`)]).reply_markup : undefined,
  });
}
