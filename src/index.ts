import { createBot } from "./bot/index.js";
import cron from "node-cron";
import { config } from "./config/index.js";
import { checkAlerts } from "./services/alerts.js";
import { checkDesk } from "./services/pings.js";

const bot = createBot();

bot.launch()
  .then(() => {
    console.log("xStocks Telegram bot is running");
    if (!config.tokenMint) console.log("TOKEN_MINT is not set. Pings will not send until it is.");
  })
  .catch((err) => {
    console.error("Failed to launch bot:", err);
    process.exit(1);
  });

cron.schedule(config.alertCron, () => {
  checkAlerts(bot).catch((err) => console.error("Alert check failed:", err));
});

cron.schedule(config.deskCron, () => {
  checkDesk(bot).catch((err) => console.error("Desk check failed:", err));
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));