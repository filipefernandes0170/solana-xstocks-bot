import { Context } from "telegraf";
import { setHolderWallet, upsertUser } from "../../db/index.js";
import { config } from "../../config/index.js";
import { walletsHolding } from "../../services/holder.js";
import { isValidSolanaAddress } from "../../services/solana.js";

export async function holdCommand(ctx: Context) {
  upsertUser(ctx.from!.id, ctx.from?.username, ctx.from?.first_name);
  const address = ((ctx.message as { text?: string })?.text ?? "").trim().split(/\s+/)[1];
  if (!address || !isValidSolanaAddress(address)) {
    await ctx.reply("Send the wallet that holds the coin:\n/hold <solana address>\n\nPings use this wallet. Your xStock bag can be a different one.");
    return;
  }
  setHolderWallet(ctx.from!.id, address);
  if (!config.tokenMint) {
    await ctx.reply("Saved. Pings stay off until the coin mint is set on the server.");
    return;
  }
  const holders = await walletsHolding([address]).catch(() => new Set<string>());
  await ctx.reply(
    holders.has(address)
      ? "Saved. This wallet holds the coin, so pings can send."
      : "Saved. This wallet does not hold the coin yet, so pings will wait.",
  );
}
