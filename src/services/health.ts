// Health: is Par's data still coming in? Every few minutes the bot looks at its own feeds (token prices, Nasdaq prints,
// the mints on Solana) and at the Par site (and the SEC filings it reads). A problem that lasts ALERT_AFTER_MS is
// texted to ALERT_CHAT_ID once, and again when it is fixed. Without ALERT_CHAT_ID it only goes to the log.
// The bot also writes a heartbeat file after every desk round; deploy/watchdog.sh restarts the bot if it stops.

import fs from "node:fs";
import path from "node:path";
import { config } from "../config/index.js";

export type Problem = "prices" | "nasdaq" | "chain" | "site" | "filings";

export type HealthReading = {
  /** When token prices last came in (Jupiter, or GeckoTerminal as a backup). */
  quotesAt: number | null;
  /** When the newest Nasdaq print was read. */
  printsAt: number | null;
  /** When the mints were last read on Solana. */
  mintsAt: number | null;
  /** The Par site answered. */
  siteOk: boolean;
  /** When the site last read the SEC (the oldest company list). */
  filingsAt: number | null;
};

export const ALERT_AFTER_MS = 10 * 60_000;
const MIN = 60_000;

/** The age past which each feed counts as stuck. Prices come every minute, prints every 3, mints every 5. */
export const LIMITS = { prices: 10 * MIN, nasdaq: 20 * MIN, chain: 30 * MIN, filings: 60 * MIN };

export function problemsIn(reading: HealthReading, now: number): Problem[] {
  const stale = (at: number | null, limit: number) => at == null || now - at > limit;
  const problems: Problem[] = [];
  if (stale(reading.quotesAt, LIMITS.prices)) problems.push("prices");
  if (stale(reading.printsAt, LIMITS.nasdaq)) problems.push("nasdaq");
  if (stale(reading.mintsAt, LIMITS.chain)) problems.push("chain");
  if (!reading.siteOk) problems.push("site");
  // Filings are judged only when the site answers: a site that is down is one problem, not two.
  else if (stale(reading.filingsAt, LIMITS.filings)) problems.push("filings");
  return problems;
}

export type HealthState = Map<Problem, { since: number; alerted: boolean }>;

/** One round: which problems to text now (they lasted ALERT_AFTER_MS) and which are fixed (texted only if alerted). */
export function stepHealth(state: HealthState, problems: Problem[], now: number) {
  const next: HealthState = new Map();
  const alerts: { problem: Problem; since: number }[] = [];
  const recoveries: Problem[] = [];
  for (const problem of problems) {
    const known = state.get(problem);
    const since = known?.since ?? now;
    const alerted = known?.alerted ?? false;
    if (!alerted && now - since >= ALERT_AFTER_MS) {
      alerts.push({ problem, since });
      next.set(problem, { since, alerted: true });
    } else {
      next.set(problem, { since, alerted });
    }
  }
  for (const [problem, known] of state) if (!next.has(problem) && known.alerted) recoveries.push(problem);
  return { state: next, alerts, recoveries };
}

const WHAT: Record<Problem, string> = {
  prices: "Token prices (Jupiter, and GeckoTerminal as a backup) have not updated",
  nasdaq: "Nasdaq prints have not updated",
  chain: "The mints on Solana could not be read (pauses, balance changes and multipliers)",
  site: "onpar.site is not answering",
  filings: "The site has not read SEC filings, so filing texts wait",
};

const FIXED: Record<Problem, string> = {
  prices: "Token prices are updating again.",
  nasdaq: "Nasdaq prints are updating again.",
  chain: "The mints on Solana are read again.",
  site: "onpar.site is answering again.",
  filings: "The site is reading SEC filings again.",
};

function utc(ms: number) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));
}

export function alertText(problem: Problem, since: number) {
  return `⚠️ Par: ${WHAT[problem]} since ${utc(since)} UTC.`;
}

export function recoveryText(problem: Problem) {
  return `✅ Par: ${FIXED[problem]}`;
}

/** The folder of the database, which the service may write (deploy/par-bot.service: ReadWritePaths). */
export function dataDir() {
  return path.dirname(path.resolve(config.dbPath));
}

/** Unix seconds in data/heartbeat, for deploy/watchdog.sh. A failed write is only logged. */
export function writeHeartbeat(now = Date.now()) {
  try {
    fs.writeFileSync(path.join(dataDir(), "heartbeat"), String(Math.floor(now / 1000)));
  } catch (err) {
    console.warn("Heartbeat not written:", (err as Error).message);
  }
}
