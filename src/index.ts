import { createBot } from "./bot/index.js";
import cron from "node-cron";
import { config } from "./config/index.js";
import { checkAlerts } from "./services/alerts.js";

const bot = createBot();

bot.launch()
  .then(() => {
    console.log("🚀 xStocks Telegram bot is running");
  })
  .catch((err) => {
    console.error("Failed to launch bot:", err);
    process.exit(1);
  });

// Periodic alert checker
cron.schedule(config.alertCron, () => {
  checkAlerts(bot).catch((err) => console.error("Alert check failed:", err));
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
