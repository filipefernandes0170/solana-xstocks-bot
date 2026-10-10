import { Context } from "telegraf";
import { upsertUser } from "../../db/index.js";

export async function startCommand(ctx: Context) {
  const from = ctx.from!;
  upsertUser(from.id, from.username, from.first_name);

  await ctx.reply(
`👋 Welcome to *xStocks Tracker*

Monitor tokenized stocks on Solana (NVDAx, AAPLx, SPYx, TSLAx…) with live prices, portfolio value and yield ideas.

*Quick start*
1. Paste any Solana wallet address
2. Or use /portfolio after setting a wallet

*Commands*
/portfolio  – your holdings & total value
/prices     – live prices of top xStocks
/yield      – current yield opportunities
/alert      – set price alerts
/help       – full help

Just send a wallet address anytime to track it.`,
    { parse_mode: "Markdown" }
  );
}
