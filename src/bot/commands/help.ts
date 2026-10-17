import { Context } from "telegraf";
import { helpText } from "../../services/messages.js";

export async function helpCommand(ctx: Context) {
  await ctx.reply(helpText(), { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
}
