import { Context } from "telegraf";
import { upsertUser } from "../../db/index.js";
import { startKeyboard, startText } from "../../services/messages.js";
import { briefReply } from "./brief.js";
import { payloadSymbols, watchReply } from "./watch.js";

/**
 * /start, including the site's deep links: ?start=brief turns the morning brief on, and ?start=w-NVDAx-TSLAx
 * (the Favourites "Watch in Telegram" button) watches those names.
 */
export async function startCommand(ctx: Context) {
  const from = ctx.from!;
  upsertUser(from.id, from.username, from.first_name);
  const payload = ((ctx.message as { text?: string })?.text ?? "").trim().split(/\s+/)[1] ?? "";

  await ctx.reply(startText(from.first_name), {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: startKeyboard(),
  });
  if (payload === "brief") await briefReply(ctx, true);
  const symbols = payloadSymbols(payload);
  if (symbols.length > 0) await watchReply(ctx, symbols);
}
