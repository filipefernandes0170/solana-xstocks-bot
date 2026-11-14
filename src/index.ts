import { MENU_COMMANDS, createBot } from "./bot/index.js";
import cron from "node-cron";
import { config } from "./config/index.js";
import { checkAlerts } from "./services/alerts.js";
import { getDeskQuotes } from "./services/desk.js";
import { checkHealth, reportParMint, runBackup, tellAdmin } from "./services/monitor.js";
import { checkDesk, checkEvents } from "./services/pings.js";

// A promise nobody handled must not take the bot down (Node's default is to exit): it is logged and the bot goes on.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

const bot = createBot();

// Load prices before anyone asks, so the first lookup after a restart answers at once.
getDeskQuotes().catch((err) => console.warn("Warm-up failed:", err instanceof Error ? err.message : err));

// Telegraf 4.16: the launch() promise settles only when polling stops, so log from the onLaunch callback.
bot.launch(() => {
  console.log("xStocks Telegram bot is running");
  if (!config.tokenMint) console.log("$PAR has no address yet (config/par.ts). Holder texts will not send until it has.");
  if (process.env.TOKEN_MINT) console.warn("TOKEN_MINT in .env is no longer read: the $PAR address comes from config/par.ts only.");
  // The command list Telegram shows next to the message box.
  bot.telegram.setMyCommands(MENU_COMMANDS).catch((err) => console.warn("Could not set the command menu:", err.message));
  // Every start reaches the admin, so a crash loop or a deploy is visible.
  void tellAdmin(bot, "🔄 Par bot started.").then(() => reportParMint(bot));
  // Today's backup right after a start, if the daily one has not run yet.
  setTimeout(() => void runBackup(bot, true), 60_000).unref();
})
  .catch((err) => {
    console.error("Failed to launch bot:", err);
    process.exit(1);
  });

const tasks = [
  cron.schedule(config.alertCron, () => {
    checkAlerts(bot).catch((err) => console.error("Alert check failed:", err));
  }),
  cron.schedule(config.deskCron, () => {
    checkDesk(bot).catch((err) => console.error("Desk check failed:", err));
  }),
  cron.schedule(config.eventsCron, () => {
    checkEvents(bot).catch((err) => console.error("Event check failed:", err));
  }),
  // Health of the data feeds every 5 minutes, and the database backup once a day.
  cron.schedule("*/5 * * * *", () => {
    checkHealth(bot).catch((err) => console.error("Health check failed:", err));
  }),
  cron.schedule("30 3 * * *", () => {
    runBackup(bot).catch((err) => console.error("Backup failed:", err));
  }),
];

// Stop polling and the timers, then exit. Without this, node-cron kept the process alive and every
// restart waited for systemd's 90 s timeout. A background quote round may still be running, so exit after 3 s.
function shutdown(signal: string) {
  for (const task of tasks) task.stop();
  bot.stop(signal);
  setTimeout(() => process.exit(0), 3000).unref();
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
