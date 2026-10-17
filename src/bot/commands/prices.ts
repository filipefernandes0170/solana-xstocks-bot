import { Context } from "telegraf";
import { getDeskQuotes } from "../../services/desk.js";
import { pricesText } from "../../services/messages.js";

/** /prices: every name with its verdict, price, gap and 24h move. */
export async function pricesCommand(ctx: Context) {
  const pending = await ctx.reply("📈 Reading the desk…");
  try {
    const quotes = await getDeskQuotes();
    if (quotes.length === 0 || !quotes.some((quote) => quote.usdPrice != null)) {
      await ctx.telegram.editMessageText(ctx.chat!.id, pending.message_id, undefined, "📈 The price feed is busy. Try again in a minute.");
      return;
    }
    await ctx.telegram.editMessageText(ctx.chat!.id, pending.message_id, undefined, pricesText(quotes), {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  } catch (err) {
    console.error("Prices failed:", err instanceof Error ? err.message : err);
    await ctx.telegram.editMessageText(ctx.chat!.id, pending.message_id, undefined, "📈 Could not read the desk. Try again.");
  }
}
