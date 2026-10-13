import { Context } from "telegraf";
import { addAlert, getActiveAlerts, upsertUser } from "../../db/index.js";
import { SYMBOL_TO_TOKEN } from "../../config/tokens.js";

export async function alertCommand(ctx: Context) {
  upsertUser(ctx.from!.id, ctx.from?.username, ctx.from?.first_name);

  const text = (ctx.message as any)?.text || "";
  const parts = text.trim().split(/\s+/);

  // /alert list
  if (parts[1]?.toLowerCase() === "list") {
    const alerts = getActiveAlerts(ctx.from!.id);
    if (alerts.length === 0) {
      return ctx.reply("You have no active alerts.\n\nSet one with:\n`/alert NVDAx up 5`", {
        parse_mode: "Markdown",
      });
    }
    let out = "*Your alerts*\n\n";
    for (const a of alerts) {
      out += `• ${a.symbol} ${a.direction} ${a.threshold_pct}%\n`;
    }
    return ctx.reply(out, { parse_mode: "Markdown" });
  }

  // /alert SYMBOL up|down|both PCT
  if (parts.length < 4) {
    return ctx.reply(
`*Set a price alert*

Usage:
\`/alert NVDAx up 5\`
\`/alert TSLAx down 3\`
\`/alert SPYx both 5\`

\`/alert list\` – show your alerts`,
      { parse_mode: "Markdown" }
    );
  }

  const symbol = parts[1].toUpperCase();
  const direction = parts[2].toLowerCase();
  const pct = parseFloat(parts[3]);

  if (!SYMBOL_TO_TOKEN.has(symbol)) {
    return ctx.reply(`Unknown symbol: ${symbol}\nSupported: NVDAx, TSLAx, AAPLx, SPYx…`);
  }
  if (!["up", "down", "both"].includes(direction)) {
    return ctx.reply("Direction must be: up | down | both");
  }
  if (isNaN(pct) || pct <= 0 || pct > 100) {
    return ctx.reply("Threshold must be a number between 0 and 100");
  }

  addAlert(ctx.from!.id, symbol, direction, pct);
  await ctx.reply(
    `✅ Alert set: *${symbol}* ${direction} *${pct}%*\n\nYou will be notified when the price moves that much within the monitoring window.`,
    { parse_mode: "Markdown" }
  );
}
