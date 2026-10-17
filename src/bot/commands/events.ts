import { Context } from "telegraf";
import { getUser, setEvents, upsertUser } from "../../db/index.js";
import { getDeskQuotes, pauseFlags } from "../../services/desk.js";
import { EVENTS_OFF_TEXT, EVENTS_ON_TEXT, eventsText, fetchSiteFilings } from "../../services/events.js";
import { holderNote } from "../holderNote.js";
import { proveKeyboardFor } from "../proof.js";

/**
 * /events: market days off, balance changes and paused tokens in the next 7 days, and the key SEC filings of the
 * last 7 (free). /events on|off: the filing texts for $PAR holders (on unless turned off; pause alerts always on).
 */
export async function eventsCommand(ctx: Context) {
  const telegramId = ctx.from!.id;
  upsertUser(telegramId, ctx.from?.username, ctx.from?.first_name);
  const arg = ((ctx.message as { text?: string })?.text ?? "").trim().split(/\s+/)[1]?.toLowerCase();

  if (arg === "on") {
    setEvents(telegramId, true);
    await ctx.reply(`${EVENTS_ON_TEXT}\n\n${await holderNote(telegramId)}`, { parse_mode: "HTML", reply_markup: proveKeyboardFor(telegramId) });
    return;
  }
  if (arg === "off") {
    setEvents(telegramId, false);
    await ctx.reply(EVENTS_OFF_TEXT, { parse_mode: "HTML" });
    return;
  }
  await eventsReply(ctx);
}

/** The /events answer, also sent after /start from the site's Events page. */
export async function eventsReply(ctx: Context) {
  const telegramId = ctx.from!.id;
  const [quotes, flags, filings] = await Promise.all([
    getDeskQuotes({ allowStale: true }).catch(() => []),
    pauseFlags().catch(() => null),
    fetchSiteFilings(),
  ]);
  const read = flags ? [...flags.values()].some((paused) => paused != null) : false;
  const footer =
    getUser(telegramId)?.events === 0
      ? "🔕 Your filing texts are off. /events on turns them back on."
      : `🔔 Filing texts: key filings for the names in your bag or watch list, at most 5 a day. /events off stops them.\n\n${await holderNote(telegramId)}`;
  await ctx.reply(
    eventsText({
      now: Date.now(),
      rebases: quotes.flatMap((quote) => (quote.rebase ? [{ symbol: quote.symbol, rebase: quote.rebase }] : [])),
      paused: flags && read ? [...flags.entries()].filter(([, paused]) => paused === true).map(([symbol]) => symbol) : null,
      filings,
      footer,
    }),
    { parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: proveKeyboardFor(telegramId) },
  );
}
