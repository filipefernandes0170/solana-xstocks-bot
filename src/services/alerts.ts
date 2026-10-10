import { Telegraf } from "telegraf";
import { getActiveAlerts, getPriceHistory, deactivateAlert } from "../db/index.js";
import { getPrices } from "./prices.js";
import { config } from "../config/index.js";
import { SYMBOL_TO_TOKEN } from "../config/tokens.js";

/**
 * Check user-defined % alerts and automatic big-move alerts.
 * Call this on a cron schedule.
 */
export async function checkAlerts(bot: Telegraf) {
  const alerts = getActiveAlerts();
  if (alerts.length === 0) return;

  const symbols = [...new Set(alerts.map(a => a.symbol))];
  const mints = symbols
    .map(s => SYMBOL_TO_TOKEN.get(s)?.mint)
    .filter(Boolean) as string[];

  const prices = await getPrices(mints);

  for (const alert of alerts) {
    const token = SYMBOL_TO_TOKEN.get(alert.symbol);
    if (!token) continue;

    const priceData = prices.get(token.mint);
    if (!priceData) continue;

    const history = getPriceHistory(alert.symbol, config.bigMoveWindowMin);
    if (history.length < 2) continue;

    const oldPrice = history[0].price;
    const current = priceData.usdPrice;
    const changePct = ((current - oldPrice) / oldPrice) * 100;

    let triggered = false;

    if (alert.direction === "up" && changePct >= alert.threshold_pct) {
      triggered = true;
    } else if (alert.direction === "down" && changePct <= -alert.threshold_pct) {
      triggered = true;
    } else if (alert.direction === "both" && Math.abs(changePct) >= alert.threshold_pct) {
      triggered = true;
    }

    if (triggered) {
      try {
        await bot.telegram.sendMessage(
          alert.telegram_id,
          `🚨 *Alert triggered*\n\n*${alert.symbol}* moved *${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%* in the last ${config.bigMoveWindowMin}m\nCurrent price: $${current.toFixed(2)}`,
          { parse_mode: "Markdown" }
        );
      } catch (err) {
        console.warn("Failed to send alert to", alert.telegram_id, err);
      }
    }
  }
}
