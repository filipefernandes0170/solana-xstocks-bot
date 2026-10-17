import { Context } from "telegraf";
import { getUser, setWallet, upsertUser } from "../../db/index.js";
import { getDeskQuotes } from "../../services/desk.js";
import { portfolioText } from "../../services/messages.js";
import { buildPortfolio } from "../../services/portfolio.js";
import { isValidSolanaAddress } from "../../services/solana.js";

/** /portfolio <wallet>, or a pasted address: the xStocks in that wallet, valued per share, with each verdict. */
export async function portfolioCommand(ctx: Context) {
  upsertUser(ctx.from!.id, ctx.from?.username, ctx.from?.first_name);
  let wallet = ((ctx.message as { text?: string })?.text ?? "").trim().split(/\s+/)[1];
  const user = getUser(ctx.from!.id);

  if (!wallet) {
    if (!user?.wallet) {
      await ctx.reply("💼 Paste a Solana address, or send <code>/portfolio &lt;address&gt;</code>. Par only reads balances.", {
        parse_mode: "HTML",
      });
      return;
    }
    wallet = user.wallet;
  }

  if (!isValidSolanaAddress(wallet)) {
    await ctx.reply("💼 That does not look like a Solana address.");
    return;
  }

  setWallet(ctx.from!.id, wallet);
  const pending = await ctx.reply("💼 Reading the wallet…");

  try {
    const [pf, quotes] = await Promise.all([buildPortfolio(wallet), getDeskQuotes({ allowStale: true }).catch(() => [])]);
    if (pf.positions.length === 0) {
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        pending.message_id,
        undefined,
        `💼 No tracked xStocks in <code>${wallet.slice(0, 4)}…${wallet.slice(-4)}</code>.\nPar tracks NVDAx, TSLAx, AAPLx, SPYx, QQQx and more. /prices lists them all.`,
        { parse_mode: "HTML" },
      );
      return;
    }
    await ctx.telegram.editMessageText(
      ctx.chat!.id,
      pending.message_id,
      undefined,
      portfolioText(wallet, pf, new Map(quotes.map((quote) => [quote.symbol, quote]))),
      { parse_mode: "HTML", link_preview_options: { is_disabled: true } },
    );
  } catch (err) {
    console.error("Portfolio failed:", err instanceof Error ? err.message : err);
    await ctx.telegram.editMessageText(ctx.chat!.id, pending.message_id, undefined, "💼 Could not read that wallet. Try again in a minute.");
  }
}
