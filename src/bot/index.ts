import { Telegraf } from "telegraf";
import { env } from "../config/index.js";
import { startCommand } from "./commands/start.js";
import { portfolioCommand } from "./commands/portfolio.js";
import { pricesCommand } from "./commands/prices.js";
import { yieldCommand } from "./commands/yield.js";
import { alertCommand } from "./commands/alert.js";
import { helpCommand } from "./commands/help.js";

export function createBot() {
  const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);

  bot.start(startCommand);
  bot.help(helpCommand);
  bot.command("portfolio", portfolioCommand);
  bot.command("p", portfolioCommand);
  bot.command("prices", pricesCommand);
  bot.command("yield", yieldCommand);
  bot.command("alert", alertCommand);

  // Auto-detect bare wallet address
  bot.on("text", async (ctx, next) => {
    const text = ctx.message.text.trim();
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text)) {
      (ctx.message as any).text = `/portfolio ${text}`;
      return portfolioCommand(ctx);
    }
    return next();
  });

  bot.catch((err, ctx) => {
    console.error("Bot error for", ctx.updateType, err);
    ctx.reply("Something went wrong. Please try again.").catch(() => {});
  });

  return bot;
}
