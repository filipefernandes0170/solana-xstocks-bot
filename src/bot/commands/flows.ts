import { Context } from "telegraf";
import { flowEventsSince, getUser, setFlows, upsertUser } from "../../db/index.js";
import { FLOWS_OFF_TEXT, FLOWS_ON_TEXT, flowFromRow, flowsText, watchingSince } from "../../services/flows.js";
import { holderNote } from "../holderNote.js";
import { proveKeyboardFor } from "../proof.js";

/**
 * /flows: the large issuer flows (tokens created or burned) of the last 24 hours, free for everyone.
 * /flows on|off: the flow texts for $PAR holders, for the names they hold or watch (on unless turned off).
 */
export async function flowsCommand(ctx: Context) {
  const telegramId = ctx.from!.id;
  upsertUser(telegramId, ctx.from?.username, ctx.from?.first_name);
  const arg = ((ctx.message as { text?: string })?.text ?? "").trim().split(/\s+/)[1]?.toLowerCase();

  if (arg === "on") {
    setFlows(telegramId, true);
    await ctx.reply(`${FLOWS_ON_TEXT}\n\n${await holderNote(telegramId)}`, { parse_mode: "HTML", reply_markup: proveKeyboardFor(telegramId) });
    return;
  }
  if (arg === "off") {
    setFlows(telegramId, false);
    await ctx.reply(FLOWS_OFF_TEXT, { parse_mode: "HTML" });
    return;
  }

  const now = Date.now();
  const flows = flowEventsSince(now - 24 * 60 * 60_000).map(flowFromRow);
  const footer =
    getUser(telegramId)?.flows === 0
      ? "🔕 Your flow texts are off. /flows on turns them back on."
      : `🔔 Flow texts: large flows in the names in your bag or watch list, at most 3 a day and once per name every 6 hours. /flows off stops them.\n\n${await holderNote(telegramId)}`;
  await ctx.reply(flowsText({ flows, now, watchingSince: watchingSince(), footer }), {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: proveKeyboardFor(telegramId),
  });
}
