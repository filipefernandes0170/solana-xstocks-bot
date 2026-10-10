import { Context } from "telegraf";

export async function helpCommand(ctx: Context) {
  await ctx.reply(
`*xStocks Tracker – Help*

*Portfolio*
\`/portfolio\` or \`/p\` – show your saved wallet
\`/portfolio <address>\` – track any wallet
Just paste a Solana address anytime.

*Prices*
\`/prices\` – live prices of major tokenized stocks

*Yield*
\`/yield\` – current yield / collateral opportunities (Kamino, Jupiter, Kraken…)

*Alerts*
\`/alert NVDAx up 5\` – notify if NVDAx rises ≥5%
\`/alert TSLAx down 3\`
\`/alert SPYx both 5\`
\`/alert list\` – show your alerts

*Other*
\`/start\` – welcome
\`/help\` – this message

Data sources: Solana RPC + Jupiter Price API.
Add new tokens by editing \`src/config/tokens.ts\`.`,
    { parse_mode: "Markdown" }
  );
}
