import { Context } from "telegraf";
import { upsertUser } from "../../db/index.js";

export async function startCommand(ctx: Context) {
  const from = ctx.from!;
  upsertUser(from.id, from.username, from.first_name);

  await ctx.reply(
`Par

The site is free. This bot texts you when a price becomes real, and only while your wallet holds $PAR.

Type a name, like nvda
Paste the wallet that holds the coin
/watch NVDAx  – ping when it turns Fair, and when it is rich while the market is closed
/watch all
/bell         – one message at the Nasdaq open, with whatever is Fair
/hold         – use a different wallet for the coin than for your xStocks

Also
/portfolio    – xStock bag
/prices
/yield
/alert NVDAx up 5
/help`,
  );
}