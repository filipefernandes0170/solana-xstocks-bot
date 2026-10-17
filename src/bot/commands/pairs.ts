import { Context } from "telegraf";
import { setPairs, upsertUser } from "../../db/index.js";
import { getDeskQuotes } from "../../services/desk.js";
import { pairsText } from "../../services/messages.js";
import { PAIR_POINTS, companyPairs } from "../../services/pairs.js";
import { holderNote } from "../holderNote.js";

/** /pairs: the companies with two tokens and which $1,000 buy is cheaper (free). /pairs on|off: the ping (holders). */
export async function pairsCommand(ctx: Context) {
  const telegramId = ctx.from!.id;
  upsertUser(telegramId, ctx.from?.username, ctx.from?.first_name);
  const arg = ((ctx.message as { text?: string })?.text ?? "").trim().split(/\s+/)[1]?.toLowerCase();

  if (arg === "on") {
    setPairs(telegramId, true);
    await ctx.reply(
      `🔁 On: a text when one token of a company is ${PAIR_POINTS} points cheaper than the other, at most once a day per company.\n\n${await holderNote(telegramId)}`,
      { parse_mode: "HTML" },
    );
    return;
  }
  if (arg === "off") {
    setPairs(telegramId, false);
    await ctx.reply("🔁 Two-token texts are off.");
    return;
  }

  const quotes = await getDeskQuotes({ allowStale: true });
  if (!quotes.some((quote) => quote.usdPrice != null)) {
    await ctx.reply("🔁 The price feed is busy. Try again in a minute.");
    return;
  }
  await ctx.reply(pairsText(companyPairs(quotes, Date.now())), { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
}
