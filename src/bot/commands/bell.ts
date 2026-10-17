import { Context } from "telegraf";
import { getUser, setBell, upsertUser } from "../../db/index.js";
import { holderNote } from "../holderNote.js";
import { proveKeyboardFor } from "../proof.js";

export async function bellCommand(ctx: Context) {
  upsertUser(ctx.from!.id, ctx.from?.username, ctx.from?.first_name);
  const user = getUser(ctx.from!.id);
  const next = !(user?.bell === 1);
  setBell(ctx.from!.id, next);
  if (!next) {
    await ctx.reply("🔕 Open bell is off. Send /bell to turn it back on.");
    return;
  }
  await ctx.reply(
    `🔔 <b>Open bell is on</b>\nOne message as Nasdaq opens, listing whatever is Fair, each with a Buy button.\n\n${await holderNote(ctx.from!.id)}`,
    { parse_mode: "HTML", reply_markup: proveKeyboardFor(ctx.from!.id) },
  );
}
