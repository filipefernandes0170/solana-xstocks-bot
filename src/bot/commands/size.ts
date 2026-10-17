import { Context, Markup } from "telegraf";
import { lookupToken } from "../../config/tokens.js";
import { sizeQuote } from "../../services/desk.js";
import { sizeKeyboard, sizeText, sizeUsage } from "../../services/messages.js";

/** "5000", "$5,000", "5k" → dollars. */
export function parseAmount(text: string) {
  const match = text.trim().toLowerCase().replace(/[$,]/g, "").match(/^(\d+(?:\.\d+)?)(k)?$/);
  if (!match) return null;
  const value = Number(match[1]) * (match[2] ? 1000 : 1);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Sends a size check as a new message. Used by /size and by the size buttons under cards. */
export async function replySize(ctx: Context, symbol: string, usd: number) {
  const pending = await ctx.reply(`📏 Asking Jupiter about $${Math.round(usd).toLocaleString("en-US")} of ${symbol}…`);
  try {
    const result = await sizeQuote(symbol, usd);
    if (!result.ok) {
      await ctx.telegram.editMessageText(ctx.chat!.id, pending.message_id, undefined, `📏 ${result.message}`);
      return;
    }
    const { text, tone } = sizeText(result);
    await ctx.telegram.editMessageText(ctx.chat!.id, pending.message_id, undefined, text, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: sizeKeyboard(result, tone),
    });
  } catch (err) {
    console.error("Size check failed:", err instanceof Error ? err.message : err);
    await ctx.telegram.editMessageText(ctx.chat!.id, pending.message_id, undefined, "📏 That check did not go through. Try again.");
  }
}

const POPULAR = ["NVDAx", "TSLAx", "AAPLx", "SPYx"];

/** The size picker: popular names at $1,000, and how to ask for any other. */
export function sizeMenu() {
  return {
    text: sizeUsage(),
    markup: Markup.inlineKeyboard([POPULAR.map((symbol) => Markup.button.callback(`${symbol} $1k`, `size:${symbol}:1000`))]).reply_markup,
  };
}

export async function sizeCommand(ctx: Context) {
  const parts = ((ctx.message as { text?: string })?.text ?? "").trim().split(/\s+/).slice(1);
  const token = parts.map((part) => lookupToken(part)).find(Boolean) ?? null;
  const usd = parts.map((part) => parseAmount(part)).find((value) => value != null) ?? null;
  if (!token || usd == null) {
    const menu = sizeMenu();
    await ctx.reply(menu.text, { parse_mode: "HTML", reply_markup: menu.markup });
    return;
  }
  await replySize(ctx, token.symbol, usd);
}
