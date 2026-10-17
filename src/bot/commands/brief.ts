import { Context } from "telegraf";
import { getUser, setBrief, upsertUser } from "../../db/index.js";
import { holderNote } from "../holderNote.js";
import { proveKeyboardFor } from "../proof.js";

const ON =
  "🌅 <b>Morning brief is on</b>\nEvery weekday, in the half hour before Nasdaq opens: the furthest gaps over and under the print, the names closest to it, the biggest 24h moves and any balance change coming up.";

/** Turns the brief on (or flips it when `force` is not given) and answers with what will happen. */
export async function briefReply(ctx: Context, force?: boolean) {
  upsertUser(ctx.from!.id, ctx.from?.username, ctx.from?.first_name);
  const user = getUser(ctx.from!.id);
  const next = force ?? !(user?.brief === 1);
  setBrief(ctx.from!.id, next);
  if (!next) {
    await ctx.reply("🌅 Morning brief is off. Send /brief to turn it back on.");
    return;
  }
  await ctx.reply(`${ON}\n\n${await holderNote(ctx.from!.id)}`, { parse_mode: "HTML", reply_markup: proveKeyboardFor(ctx.from!.id) });
}

export async function briefCommand(ctx: Context) {
  await briefReply(ctx);
}
