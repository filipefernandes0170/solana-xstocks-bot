import { Context } from "telegraf";
import { getUser, setWallet, upsertUser } from "../../db/index.js";
import { isValidSolanaAddress } from "../../services/solana.js";
import { buildPortfolio } from "../../services/portfolio.js";
import { formatUsd, formatPct, formatAmount, shortAddress } from "../../utils/format.js";

export async function portfolioCommand(ctx: Context) {
  upsertUser(ctx.from!.id, ctx.from?.username, ctx.from?.first_name);

  const text = (ctx.message as any)?.text || "";
  const parts = text.trim().split(/\s+/);
  let wallet = parts[1];

  const user = getUser(ctx.from!.id);

  if (!wallet) {
    if (!user?.wallet) {
      return ctx.reply(
        "Please provide a wallet address:\n`/portfolio <solana_address>`\nor just paste the address.",
        { parse_mode: "Markdown" }
      );
    }
    wallet = user.wallet;
  }

  if (!isValidSolanaAddress(wallet)) {
    return ctx.reply("❌ Invalid Solana address.");
  }

  setWallet(ctx.from!.id, wallet);

  const msg = await ctx.reply("⏳ Fetching portfolio…");

  try {
    const pf = await buildPortfolio(wallet);

    if (pf.positions.length === 0) {
      return ctx.telegram.editMessageText(
        ctx.chat!.id,
        msg.message_id,
        undefined,
        `No tokenized stocks found in \`${shortAddress(wallet)}\`\n\nSupported: NVDAx, TSLAx, AAPLx, SPYx, QQQx and more.`,
        { parse_mode: "Markdown" }
      );
    }

    let out = `📊 *Portfolio* · \`${shortAddress(wallet)}\`\n\n`;
    out += `*Total Value:* ${formatUsd(pf.totalUsd)}`;
    if (pf.change24hPct != null) {
      out += `  (${formatPct(pf.change24hPct)} 24h)`;
    }
    out += `\n\n`;

    for (const p of pf.positions.slice(0, 15)) {
      const chg = p.change24h != null ? ` ${formatPct(p.change24h)}` : "";
      out += `*${p.symbol}*  ${formatAmount(p.amount)}\n`;
      out += `   ${formatUsd(p.usdValue)}  @ ${formatUsd(p.price)}${chg}\n\n`;
    }

    if (pf.positions.length > 15) {
      out += `_…and ${pf.positions.length - 15} more_`;
    }

    await ctx.telegram.editMessageText(ctx.chat!.id, msg.message_id, undefined, out, {
      parse_mode: "Markdown",
    });
  } catch (err: any) {
    console.error(err);
    await ctx.telegram.editMessageText(
      ctx.chat!.id,
      msg.message_id,
      undefined,
      "❌ Failed to load portfolio. Try again later."
    );
  }
}
