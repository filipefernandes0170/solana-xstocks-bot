import { Context } from "telegraf";
import { lookupToken } from "../../config/tokens.js";
import { yieldText } from "../../services/messages.js";
import { getLendingOffers } from "../../services/yield.js";

/** /yield, or /yield NVDAx: live Kamino lending rates for the xStocks. */
export async function yieldCommand(ctx: Context) {
  const arg = ((ctx.message as { text?: string })?.text ?? "").trim().split(/\s+/)[1];
  const token = arg ? lookupToken(arg) : null;
  if (arg && !token) {
    await ctx.reply("💰 I don't know that name. Try /yield NVDAx, or /yield for every name.");
    return;
  }
  const pending = await ctx.reply("💰 Reading Kamino…");
  try {
    const offers = await getLendingOffers();
    if (!offers) {
      await ctx.telegram.editMessageText(ctx.chat!.id, pending.message_id, undefined, "💰 Kamino did not answer. Try again in a minute.");
      return;
    }
    await ctx.telegram.editMessageText(ctx.chat!.id, pending.message_id, undefined, yieldText(offers, token?.symbol ?? null), {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  } catch (err) {
    console.error("Yield failed:", err instanceof Error ? err.message : err);
    await ctx.telegram.editMessageText(ctx.chat!.id, pending.message_id, undefined, "💰 Could not read the lending markets. Try again.");
  }
}
