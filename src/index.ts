import { MENU_COMMANDS, createBot } from "./bot/index.js";
import cron from "node-cron";
import { config } from "./config/index.js";
import { checkAlerts } from "./services/alerts.js";
import { getDeskQuotes } from "./services/desk.js";
import { checkDesk, checkEvents } from "./services/pings.js";

const bot = createBot();

// Load prices before anyone asks, so the first lookup after a restart answers at once.
getDeskQuotes().catch((err) => console.warn("Warm-up failed:", err instanceof Error ? err.message : err));

// Telegraf 4.16: the launch() promise settles only when polling stops, so log from the onLaunch callback.
bot.launch(() => {
  console.log("xStocks Telegram bot is running");
  if (!config.tokenMint) console.log("TOKEN_MINT is not set. Pings will not send until it is.");
  // The command list Telegram shows next to the message box.
  bot.telegram.setMyCommands(MENU_COMMANDS).catch((err) => console.warn("Could not set the command menu:", err.message));
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
