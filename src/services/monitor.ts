// Runs the health checks and the daily backup (services/health.ts, services/backup.ts) and texts the admin
// (ALERT_CHAT_ID) when something needs a look. Without ALERT_CHAT_ID every message goes to the log only.

import path from "node:path";
import type { Telegraf } from "telegraf";
import { config } from "../config/index.js";
import { backupDatabase, backupIfMissing } from "./backup.js";
import { deskHealth } from "./desk.js";
import { alertText, problemsIn, recoveryText, stepHealth, type HealthState } from "./health.js";
import { DESK_URL } from "./messages.js";

let state: HealthState = new Map();
let checking = false;

/** A plain text to the admin chat, or the log when there is none. */
export async function tellAdmin(bot: Telegraf, text: string) {
  if (!config.alertChatId) {
    console.warn(`[admin] ${text}`);
    return;
  }
  try {
    await bot.telegram.sendMessage(config.alertChatId, text, { link_preview_options: { is_disabled: true } });
  } catch (err) {
    console.warn("Admin message failed:", (err as Error).message, "|", text);
  }
}

/** Whether the Par site answers, and when it last read the SEC (from /api/events, shared by its CDN for a minute). */
async function siteReading() {
  try {
    const response = await fetch(`${DESK_URL}/api/events`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return { siteOk: false, filingsAt: null };
    const body = (await response.json()) as { filingsAt?: unknown } | null;
    return { siteOk: true, filingsAt: typeof body?.filingsAt === "number" ? body.filingsAt : null };
  } catch {
    return { siteOk: false, filingsAt: null };
  }
}

/** Every few minutes: a problem lasting 10 minutes is texted once, and again when it is fixed. */
export async function checkHealth(bot: Telegraf) {
  if (checking) return;
  checking = true;
  try {
    const reading = { ...deskHealth(), ...(await siteReading()) };
    const now = Date.now();
    const step = stepHealth(state, problemsIn(reading, now), now);
    state = step.state;
    for (const alert of step.alerts) await tellAdmin(bot, alertText(alert.problem, alert.since));
    for (const problem of step.recoveries) await tellAdmin(bot, recoveryText(problem));
  } catch (err) {
    console.error("Health check failed:", err);
  } finally {
    checking = false;
  }
}

/** The daily backup; `ifMissing` (at start) skips it when today's copy exists. A failure is texted. */
export async function runBackup(bot: Telegraf, ifMissing = false) {
  try {
    const file = ifMissing ? await backupIfMissing() : await backupDatabase();
    if (file) console.log(`Database backup written: ${path.basename(file)}`);
  } catch (err) {
    await tellAdmin(bot, `⚠️ Par: the daily database backup failed (${(err as Error).message}).`);
  }
}
