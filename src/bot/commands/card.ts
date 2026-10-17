import { Context } from "telegraf";
import type { TokenizedStock } from "../../config/tokens.js";
import { describe, getDeskQuote } from "../../services/desk.js";
import { cardKeyboard, cardText } from "../../services/messages.js";

/** A name typed in the chat: its card, with Buy, three size checks and Watch. */
export async function sendCard(ctx: Context, token: TokenizedStock) {
  const pending = await ctx.reply(`🔎 Looking up ${token.symbol}…`);
  try {
    const quote = await getDeskQuote(token.symbol);
    if (!quote || quote.usdPrice == null) {
      await ctx.telegram.editMessageText(ctx.chat!.id, pending.message_id, undefined, "🔎 The price feed is busy. Try again in a minute.");
      return;
    }
    await ctx.telegram.editMessageText(ctx.chat!.id, pending.message_id, undefined, cardText(quote, describe(quote)), {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: cardKeyboard(quote),
    });
  } catch (err) {
    console.error("Card failed:", err instanceof Error ? err.message : err);
    await ctx.telegram.editMessageText(ctx.chat!.id, pending.message_id, undefined, "🔎 Could not load that name. Try again.");
  }
}
