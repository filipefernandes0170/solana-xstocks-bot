import { Telegraf } from "telegraf";
import { env } from "../config/index.js";
import { lookupToken } from "../config/tokens.js";
import { isValidSolanaAddress } from "../services/solana.js";
import { startCommand } from "./commands/start.js";
import { portfolioCommand } from "./commands/portfolio.js";
import { pricesCommand } from "./commands/prices.js";
import { yieldCommand } from "./commands/yield.js";
import { alertCommand } from "./commands/alert.js";
import { helpCommand } from "./commands/help.js";
import { watchCommand } from "./commands/watch.js";
import { bellCommand } from "./commands/bell.js";
import { holdCommand } from "./commands/hold.js";
import { sendCard } from "./commands/card.js";

export function createBot() {
  const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);

  bot.start(startCommand);
  bot.help(helpCommand);
  bot.command("portfolio", portfolioCommand);
  bot.command("p", portfolioCommand);
  bot.command("prices", pricesCommand);
  bot.command("yield", yieldCommand);
  bot.command("alert", alertCommand);
  bot.command("watch", watchCommand);
  bot.command("bell", bellCommand);
  bot.command("hold", holdCommand);

  bot.on("text", async (ctx, next) => {
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) return next();
    const token = lookupToken(text);
    if (token) return sendCard(ctx, token);
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text) && isValidSolanaAddress(text)) {
      (ctx.message as { text: string }).text = `/portfolio ${text}`;
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