import { Context } from "telegraf";
import { lookupToken } from "../../config/tokens.js";
import { config } from "../../config/index.js";
import { addWatch, getUser, listWatches, removeWatch, upsertUser } from "../../db/index.js";
import { holderWallet, walletsHolding } from "../../services/holder.js";

async function holdLine(telegramId: number) {
  const user = getUser(telegramId);
  const wallet = user ? holderWallet(user) : "";
  if (!config.tokenMint) return "Pings stay off until the coin mint is set on the server.";
  if (!wallet) return "Paste the wallet that holds the coin, or nothing will be sent.";
  const holders = await walletsHolding([wallet]).catch(() => new Set<string>());
  if (!holders.has(wallet)) return "This wallet does not hold the coin yet, so the ping will not send.";
  return "You hold the coin. Pings are on.";
}

export async function watchCommand(ctx: Context) {
  upsertUser(ctx.from!.id, ctx.from?.username, ctx.from?.first_name);
  const parts = ((ctx.message as { text?: string })?.text ?? "").trim().split(/\s+/);
  const arg = parts[1]?.toLowerCase();
  const extra = parts[2]?.toLowerCase();

  if (!arg || arg === "list") {
    const rows = listWatches(ctx.from!.id);
    const names = rows.length === 0 ? "nothing" : rows.map((row) => (row.symbol === "ALL" ? "every name" : row.symbol)).join(", ");
    await ctx.reply(
      `Watching ${names}.\n\n/watch NVDAx\n/watch all\n/watch off\n\nA ping arrives when a watched name turns Fair, and when it trades rich while Nasdaq is closed.\n${await holdLine(ctx.from!.id)}`,
    );
    return;
  }

  if (arg === "off") {
    if (extra) {
      const token = lookupToken(extra);
      removeWatch(ctx.from!.id, token?.symbol ?? extra.toUpperCase());
    } else {
      removeWatch(ctx.from!.id);
    }
    await ctx.reply(extra ? `Stopped watching ${extra.toUpperCase()}.` : "Stopped all watches.");
    return;
  }

  if (arg === "all") {
    addWatch(ctx.from!.id, "ALL");
    await ctx.reply(`Watching every name.\nI'll text you when one turns Fair, and when one trades rich while Nasdaq is closed.\n${await holdLine(ctx.from!.id)}`);
    return;
  }

  const token = lookupToken(arg);
  if (!token) {
    await ctx.reply("I don't know that name. Try /watch NVDAx or /watch all.");
    return;
  }
  addWatch(ctx.from!.id, token.symbol);
  await ctx.reply(
    `Watching ${token.symbol}.\nI'll text you when it turns Fair, and if it trades rich while Nasdaq is closed.\n${await holdLine(ctx.from!.id)}`,
  );
}
