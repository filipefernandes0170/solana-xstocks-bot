import { Context } from "telegraf";
import { upsertUser } from "../../db/index.js";
import { weekKeyboard, weekText } from "../../services/messages.js";
import { fetchRanking } from "../../services/ranking.js";

/** /week: the last 7 days' ranking from the Par site. Free for everyone. */
export async function weekCommand(ctx: Context) {
  upsertUser(ctx.from!.id, ctx.from?.username, ctx.from?.first_name);
  const ranking = await fetchRanking();
  await ctx.reply(weekText(ranking), {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(ranking ? { reply_markup: weekKeyboard() } : {}),
  });
}
