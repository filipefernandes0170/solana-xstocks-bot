import { Telegraf } from "telegraf";
import { deactivateAlert, getActiveAlerts, getPriceHistory } from "../db/index.js";
import { getPrices } from "./prices.js";
import { config } from "../config/index.js";
import { SYMBOL_TO_TOKEN } from "../config/tokens.js";
import { money } from "./verdict.js";

/**
 * /alert: one-off texts when a name moves a set percentage within the window (BIG_MOVE_WINDOW_MINUTES).
 * Each alert turns itself off after it fires, so a move that lasts does not text every five minutes.
 * Called on a cron schedule.
 */
export async function checkAlerts(bot: Telegraf) {
  const alerts = getActiveAlerts();
  if (alerts.length === 0) return;

  const symbols = [...new Set(alerts.map((a) => a.symbol))];
  const mints = symbols.map((s) => SYMBOL_TO_TOKEN.get(s)?.mint).filter(Boolean) as string[];
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

    const triggered =
      (alert.direction === "up" && changePct >= alert.threshold_pct) ||
      (alert.direction === "down" && changePct <= -alert.threshold_pct) ||
      (alert.direction === "both" && Math.abs(changePct) >= alert.threshold_pct);
    if (!triggered) continue;

    try {
      await bot.telegram.sendMessage(
        alert.telegram_id,
        [
          `🚨 <b>${token.symbol} ${changePct >= 0 ? "▲" : "▼"} ${changePct >= 0 ? "+" : "−"}${Math.abs(changePct).toFixed(2)}%</b> in ${config.bigMoveWindowMin} minutes`,
          `Now ${money(current)}, from ${money(oldPrice)}.`,
          "",
          `This alert is now off. Set it again with <code>/alert ${token.symbol} ${alert.direction} ${alert.threshold_pct}</code>`,
        ].join("\n"),
        { parse_mode: "HTML" },
      );
      deactivateAlert(alert.id);
    } catch (err) {
      console.warn("Failed to send alert to", alert.telegram_id, err instanceof Error ? err.message : err);
    }
  }
}
