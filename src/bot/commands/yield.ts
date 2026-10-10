import { Context } from "telegraf";
import { getYieldOpportunities } from "../../services/yield.js";
import { formatPct } from "../../utils/format.js";

export async function yieldCommand(ctx: Context) {
  const msg = await ctx.reply("⏳ Checking yield opportunities…");

  try {
    const opps = await getYieldOpportunities();

    let out = `💰 *Yield Opportunities*\n\n`;
    for (const y of opps) {
      const apyStr = y.apy > 0 ? ` ~${formatPct(y.apy)} APY` : "";
      out += `*${y.protocol}* · ${y.asset}${apyStr}\n`;
      out += `${y.description}\n`;
      if (y.link) out += `[Open](${y.link})\n`;
      out += `\n`;
    }

    out += `_APYs are approximate and change frequently. DYOR._`;

    await ctx.telegram.editMessageText(ctx.chat!.id, msg.message_id, undefined, out, {
      parse_mode: "Markdown",
      link_preview_options: { is_disabled: true },
    });
  } catch (err) {
    console.error(err);
    await ctx.telegram.editMessageText(
      ctx.chat!.id,
      msg.message_id,
      undefined,
      "❌ Failed to load yield data."
    );
  }
}
