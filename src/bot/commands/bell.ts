import { Context } from "telegraf";
import { getUser, setBell, upsertUser } from "../../db/index.js";
import { config } from "../../config/index.js";
import { holderWallet, walletsHolding } from "../../services/holder.js";

export async function bellCommand(ctx: Context) {
  upsertUser(ctx.from!.id, ctx.from?.username, ctx.from?.first_name);
  const user = getUser(ctx.from!.id);
  const next = !(user?.bell === 1);
  setBell(ctx.from!.id, next);
  if (!next) {
    await ctx.reply("Open bell is off.");
    return;
  }
  const wallet = holderWallet(user ?? { wallet: null, holder_wallet: null });
  let note = "Paste the wallet that holds the coin, or the bell will not ring.";
  if (!config.tokenMint) note = "The bell stays quiet until the coin mint is set on the server.";
  else if (wallet) {
    const holders = await walletsHolding([wallet]).catch(() => new Set<string>());
    note = holders.has(wallet)
      ? "You hold the coin, so it will send."
      : "This wallet does not hold the coin yet, so it will not send.";
  }
  await ctx.reply(`Open bell is on.\nOne message when Nasdaq opens, listing whatever is Fair, each with Buy.\n${note}`);
}
