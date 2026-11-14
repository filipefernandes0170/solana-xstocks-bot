import { Context } from "telegraf";
import { getUser, setWallet, upsertUser } from "../../db/index.js";
import { getDeskQuotes } from "../../services/desk.js";
import { portfolioText } from "../../services/messages.js";
import { buildPortfolio } from "../../services/portfolio.js";
import { isValidSolanaAddress } from "../../services/solana.js";

const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** The wallet in a site link payload such as "p-<address>" (the portfolio's "Watch this bag" button), or null. */
export function payloadWallet(payload: string) {
  if (!payload.startsWith("p-")) return null;
  const wallet = payload.slice(2);
  return ADDRESS.test(wallet) && isValidSolanaAddress(wallet) ? wallet : null;
}

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

  await portfolioReply(ctx, wallet);
}

/**
 * Shows the wallet's bag and saves it. Shared by /portfolio, a pasted address and the site's "Watch this bag" link.
 * The saved wallet is the one the bag texts follow; it is saved only after it was read, so an address the chain
 * cannot answer for is never kept. Returns false when the address is not valid or could not be read.
 */
export async function portfolioReply(ctx: Context, wallet: string) {
  if (!isValidSolanaAddress(wallet)) {
    await ctx.reply("💼 That does not look like a Solana address.");
    return false;
  }

  const pending = await ctx.reply("💼 Reading the wallet…");

  let read: [Awaited<ReturnType<typeof buildPortfolio>>, Awaited<ReturnType<typeof getDeskQuotes>>];
  try {
    read = await Promise.all([buildPortfolio(wallet), getDeskQuotes({ allowStale: true }).catch(() => [])]);
  } catch (err) {
    console.error("Portfolio failed:", err instanceof Error ? err.message : err);
    await ctx.telegram.editMessageText(ctx.chat!.id, pending.message_id, undefined, "💼 Could not read that wallet. Try again in a minute.").catch(() => {});
    return false;
  }
  const [pf, quotes] = read;
  setWallet(ctx.from!.id, wallet);

  try {
    if (pf.positions.length === 0) {
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        pending.message_id,
        undefined,
        `💼 No tracked stock tokens in <code>${wallet.slice(0, 4)}…${wallet.slice(-4)}</code>.\nPar tracks NVDAx, TSLAx, AAPLx, SPYx, MU, SPCX and more. /prices lists them all.`,
        { parse_mode: "HTML" },
      );
      return true;
    }
    await ctx.telegram.editMessageText(
      ctx.chat!.id,
      pending.message_id,
      undefined,
      portfolioText(wallet, pf, new Map(quotes.map((quote) => [quote.symbol, quote]))),
      { parse_mode: "HTML", link_preview_options: { is_disabled: true } },
    );
  } catch (err) {
    // The wallet was read and saved; only showing it failed.
    console.error("Portfolio reply failed:", err instanceof Error ? err.message : err);
  }
  return true;
}
