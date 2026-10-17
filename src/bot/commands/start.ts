import { Context } from "telegraf";
import { upsertUser } from "../../db/index.js";
import { startKeyboard, startText } from "../../services/messages.js";
import { briefReply } from "./brief.js";

/** /start, including the deep link from the site's "Get the morning brief" button (t.me/ONPAR_BOT?start=brief). */
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
}
