import { Context } from "telegraf";

export async function helpCommand(ctx: Context) {
  await ctx.reply(
`Par

One name
Send nvda, nvdax, or nvidia. You get the token price, the Nasdaq price, the gap, the verdict, and Buy.

Pings, only while the wallet holds $PAR
/watch NVDAx   ping when it turns Fair, and if it trades rich while Nasdaq is closed
/watch all
/watch list
/watch off
/bell          one message when Nasdaq opens. Fair names, each with Buy. Send /bell again to turn it off.
/hold <wallet> wallet that holds the coin, if it is not the bag wallet

Your bag
Paste a Solana address. If a stock you hold changes verdict, or $1,000 becomes a large slice of the pool, the bot says so.

Also
/portfolio or /p
/prices
/yield
/alert NVDAx up 5
/alert list

Buy opens Jupiter on that stock, paid with USDC. The bot does not take a fee.`,
  );
}