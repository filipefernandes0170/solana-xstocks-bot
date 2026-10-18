import { Context } from "telegraf";
import { upsertUser } from "../../db/index.js";
import { getDeskQuotes } from "../../services/desk.js";
import { weekKeyboard, weekText } from "../../services/messages.js";
import { fetchRanking } from "../../services/ranking.js";
import { fetchSupply } from "../../services/venues.js";

/** Last trade per share by symbol, to put a dollar value on tokens created or destroyed. */
export async function lastPrices() {
  const quotes = await getDeskQuotes({ allowStale: true }).catch(() => []);
  return new Map(quotes.filter((quote) => quote.usdPrice != null).map((quote) => [quote.symbol, quote.usdPrice as number]));
}

/** /week: the last 7 days' ranking and supply on Solana, from the Par site. Free for everyone. */
export async function weekCommand(ctx: Context) {
  upsertUser(ctx.from!.id, ctx.from?.username, ctx.from?.first_name);
  const [ranking, supply, prices] = await Promise.all([fetchRanking(), fetchSupply(), lastPrices()]);
  await ctx.reply(weekText(ranking, supply, prices), {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(ranking ? { reply_markup: weekKeyboard() } : {}),
  });
}
