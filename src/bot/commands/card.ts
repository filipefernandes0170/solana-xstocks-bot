import { Context } from "telegraf";
import type { TokenizedStock } from "../../config/tokens.js";
import { describe, getDeskQuote } from "../../services/desk.js";
import { buyKeyboard, cardText } from "../../services/messages.js";

export async function sendCard(ctx: Context, token: TokenizedStock) {
  const pending = await ctx.reply(`Looking up ${token.symbol}…`);
  try {
    const quote = await getDeskQuote(token.symbol);
    if (!quote || quote.usdPrice == null) {
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        pending.message_id,
        undefined,
        "Price feed is busy. Try again in a minute.",
      );
      return;
    }
    const verdict = describe(quote);
    await ctx.telegram.editMessageText(ctx.chat!.id, pending.message_id, undefined, cardText(quote, verdict), {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: buyKeyboard([quote]),
    });
  } catch (err) {
    console.error(err);
    await ctx.telegram.editMessageText(ctx.chat!.id, pending.message_id, undefined, "Could not load that name. Try again.");
  }
}
