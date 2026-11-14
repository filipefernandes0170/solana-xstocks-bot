import { Context, Markup } from "telegraf";
import { config } from "../../config/index.js";
import { parMintReading } from "../../services/holder.js";
import { caText } from "../../services/messages.js";

/** /ca: the official $PAR address (config/par.ts), with its Solscan page; before launch, that $PAR is not live yet. */
export async function caCommand(ctx: Context) {
  const mint = config.tokenMint;
  // The bot read this address on chain when it started. If it is not a token, it is not shown (the admin was told).
  if (mint && parMintReading()?.status === "bad") {
    await ctx.reply("⏳ The $PAR address is being checked. Please look again in a few minutes.");
    return;
  }
  await ctx.reply(caText(mint), {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: mint ? Markup.inlineKeyboard([Markup.button.url("View on Solscan", `https://solscan.io/token/${mint}`)]).reply_markup : undefined,
  });
}
