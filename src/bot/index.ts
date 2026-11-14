import { Telegraf, type Context } from "telegraf";
import { env } from "../config/index.js";
import { SYMBOL_TO_TOKEN, lookupToken } from "../config/tokens.js";
import { getDeskQuotes } from "../services/desk.js";
import { pricesText } from "../services/messages.js";
import { isValidSolanaAddress } from "../services/solana.js";
import { alertCommand } from "./commands/alert.js";
import { bellCommand } from "./commands/bell.js";
import { briefCommand, briefReply } from "./commands/brief.js";
import { sendCard } from "./commands/card.js";
import { helpCommand } from "./commands/help.js";
import { eventsCommand } from "./commands/events.js";
import { flowsCommand } from "./commands/flows.js";
import { confirmProof, holdCommand } from "./commands/hold.js";
import { portfolioCommand } from "./commands/portfolio.js";
import { pricesCommand } from "./commands/prices.js";
import { replySize, sizeCommand, sizeMenu } from "./commands/size.js";
import { startCommand } from "./commands/start.js";
import { watchCommand, watchReply } from "./commands/watch.js";
import { weekCommand } from "./commands/week.js";
import { pairsCommand } from "./commands/pairs.js";
import { sizeAlertCommand } from "./commands/sizealert.js";
import { yieldCommand } from "./commands/yield.js";
import { caCommand } from "./commands/ca.js";

/** The command list Telegram shows in the menu next to the message box. */
export const MENU_COMMANDS = [
  { command: "prices", description: "The whole desk: verdicts, prices and gaps" },
  { command: "events", description: "Market days off, balance changes and SEC filings" },
  { command: "week", description: "This week's ranking, and tokens created on Solana" },
  { command: "flows", description: "Large batches of tokens created or burned (texts for $PAR holders)" },
  { command: "pairs", description: "Same company, two tokens: which is cheaper" },
  { command: "sizealert", description: "A text when your order size is at the real price ($PAR holders)" },
  { command: "size", description: "What your order really costs: /size NVDAx 5000" },
  { command: "portfolio", description: "Your stock-token bag, valued per share" },
  { command: "watch", description: "A text when a name turns Fair ($PAR holders)" },
  { command: "brief", description: "Morning brief before the open ($PAR holders)" },
  { command: "bell", description: "One message at the Nasdaq open ($PAR holders)" },
  { command: "yield", description: "Live lending rates on Kamino" },
  { command: "alert", description: "One-off price move alerts" },
  { command: "hold", description: "Prove the wallet that holds $PAR" },
  { command: "ca", description: "The official $PAR address" },
  { command: "help", description: "How Par works" },
];

export function createBot() {
  const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);

  const onError = (err: unknown, ctx: Context) => {
    console.error("Bot error for", ctx.updateType, err);
    ctx.reply("Something went wrong. Please try again.").catch(() => {});
  };

  // Each message is handled on its own. Telegraf otherwise waits for every handler in a batch (up to 90 s) before it
  // fetches new messages, so one slow lookup (a size check, a wallet read, a hung RPC call) held up everyone's /start.
  bot.use((ctx, next) => {
    void next().catch((err) => onError(err, ctx));
  });

  bot.start(startCommand);
  bot.help(helpCommand);
  bot.command("portfolio", portfolioCommand);
  bot.command("p", portfolioCommand);
  bot.command("prices", pricesCommand);
  bot.command("week", weekCommand);
  bot.command("events", eventsCommand);
  bot.command("flows", flowsCommand);
  bot.command("pairs", pairsCommand);
  bot.command("sizealert", sizeAlertCommand);
  bot.command("size", sizeCommand);
  bot.command("yield", yieldCommand);
  bot.command("alert", alertCommand);
  bot.command("watch", watchCommand);
  bot.command("bell", bellCommand);
  bot.command("brief", briefCommand);
  bot.command("hold", holdCommand);
  bot.command("ca", caCommand);
  // Not in the menu: tells anyone their own Telegram ID (the admin puts theirs in ALERT_CHAT_ID).
  bot.command("myid", (ctx) => ctx.reply(`🆔 Your Telegram ID is <code>${ctx.from.id}</code>.`, { parse_mode: "HTML" }));

  // Buttons under cards, size checks and /start.
  // Symbols are xStocks (NVDAx) or Backpack tokens (MU, SPCX), so the pattern does not assume a trailing x.
  bot.action(/^size:([A-Za-z]{1,10}):(\d{2,6})$/, async (ctx) => {
    const token = SYMBOL_TO_TOKEN.get(ctx.match[1].toUpperCase());
    await ctx.answerCbQuery(token ? "Asking Jupiter…" : "Unknown name").catch(() => {});
    if (token) await replySize(ctx, token.symbol, Number(ctx.match[2]));
  });

  bot.action(/^watch:([A-Za-z]{1,10})$/, async (ctx) => {
    const token = SYMBOL_TO_TOKEN.get(ctx.match[1].toUpperCase());
    await ctx.answerCbQuery(token ? `Watching ${token.symbol}` : "Unknown name").catch(() => {});
    if (token) await watchReply(ctx, token.symbol);
  });

  // "proof:check:<code>" checks that message's own code; plain "proof:check" (buttons sent before 14 Nov 2026)
  // checks this person's recent codes.
  bot.action(/^proof:check(?::([0-9a-f]{32}))?$/, async (ctx) => {
    await ctx.answerCbQuery("Checking the signature…").catch(() => {});
    await confirmProof(ctx, ctx.match[1]);
  });

  bot.action("menu:prices", async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const quotes = await getDeskQuotes({ allowStale: true });
    if (!quotes.some((quote) => quote.usdPrice != null)) {
      await ctx.reply("📈 The price feed is busy. Try again in a minute.");
      return;
    }
    await ctx.reply(pricesText(quotes), { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
  });

  bot.action("menu:size", async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const menu = sizeMenu();
    await ctx.reply(menu.text, { parse_mode: "HTML", reply_markup: menu.markup });
  });

  bot.action("menu:brief", async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await briefReply(ctx, true);
  });

  bot.action("menu:watchall", async (ctx) => {
    await ctx.answerCbQuery("Watching every name").catch(() => {});
    await watchReply(ctx, "ALL");
  });

  bot.on("text", async (ctx, next) => {
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) return next();
    const token = lookupToken(text);
    if (token) return sendCard(ctx, token);
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text) && isValidSolanaAddress(text)) {
      (ctx.message as { text: string }).text = `/portfolio ${text}`;
      return portfolioCommand(ctx);
    }
    await ctx.reply("🤔 Send a name like <code>nvda</code> or <code>tesla</code>, paste a Solana wallet, or tap /help.", {
      parse_mode: "HTML",
    });
  });

  bot.catch(onError);

  return bot;
}
