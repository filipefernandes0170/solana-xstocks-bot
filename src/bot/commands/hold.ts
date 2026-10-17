import { Context } from "telegraf";
import { setHolderWallet, upsertUser } from "../../db/index.js";
import { isValidSolanaAddress } from "../../services/solana.js";
import { holderNote } from "../holderNote.js";

export async function holdCommand(ctx: Context) {
  upsertUser(ctx.from!.id, ctx.from?.username, ctx.from?.first_name);
  const address = ((ctx.message as { text?: string })?.text ?? "").trim().split(/\s+/)[1];
  if (!address || !isValidSolanaAddress(address)) {
    await ctx.reply(
      "👛 Send the wallet that holds $PAR:\n<code>/hold &lt;solana address&gt;</code>\n\nPings use this wallet. Your stock-token bag can be a different one. Par only reads balances.",
      { parse_mode: "HTML" },
    );
    return;
  }
  setHolderWallet(ctx.from!.id, address);
  await ctx.reply(`👛 Saved.\n${await holderNote(ctx.from!.id)}`, { parse_mode: "HTML" });
}
