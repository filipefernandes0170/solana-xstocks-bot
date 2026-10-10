import { Context } from "telegraf";
import { getTopPrices } from "../../services/prices.js";
import { formatUsd, formatPct } from "../../utils/format.js";

export async function pricesCommand(ctx: Context) {
  const msg = await ctx.reply("⏳ Loading live prices…");

  try {
    const prices = await getTopPrices(12);

    if (prices.length === 0) {
      return ctx.telegram.editMessageText(
        ctx.chat!.id,
        msg.message_id,
        undefined,
        "Could not fetch prices right now. Please try again."
      );
    }

    let out = `📈 *Top Tokenized Stocks*\n\n`;
    for (const p of prices) {
      const chg = p.priceChange24h != null ? `  ${formatPct(p.priceChange24h)}` : "";
      out += `*${p.symbol}*  ${formatUsd(p.usdPrice)}${chg}\n`;
    }

    out += `\n_Prices via Jupiter_`;

    await ctx.telegram.editMessageText(ctx.chat!.id, msg.message_id, undefined, out, {
      parse_mode: "Markdown",
    });
  } catch (err) {
    console.error(err);
    await ctx.telegram.editMessageText(
      ctx.chat!.id,
      msg.message_id,
      undefined,
      "❌ Failed to load prices."
    );
  }
}
