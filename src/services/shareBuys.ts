// Shares the bot's $1,000 buy quotes with the Par site (POST https://onpar.site/api/share-buys, an Edge Function there).
// The bot quotes every name about once a minute with its own Jupiter allowance; the site's allowance is small and shared
// by every visitor, so the first visitor after a quiet spell used to wait up to a minute for the buys. With these, the
// site's desk shows them at once. Same quote as the site's (a $1,000 USDC buy, per share, 5x sanity check).
//
// Off unless SHARE_BUYS_SECRET is set to the same value as in Netlify (at least 32 characters). Sent after each round
// of buy quotes, only when there is a newer quote than last time. It never blocks or stops the bot; problems are logged
// at most once every 10 minutes, and a summary once an hour.

import { config } from "../config/index.js";
import { DESK_URL } from "./messages.js";

export type ShareableBuy = { price: number; impactPct: number; at: number };
export type SharePayload = { v: 1; buys: { mint: string; price: number; impactPct: number; at: number }[] };

/** The site shows a buy for 90 s, so older ones are not sent. */
const MAX_AGE_MS = 90_000;
const MIN_SECRET = 32;
const WARN_EVERY_MS = 10 * 60_000;
const REPORT_EVERY_MS = 60 * 60_000;

/** The buys worth sending: well-formed and quoted in the last 90 s (or at most a minute ahead, clocks differ). */
export function sharePayload(buys: Map<string, ShareableBuy>, now: number): SharePayload {
  const rows: SharePayload["buys"] = [];
  for (const [mint, buy] of buys) {
    const age = now - buy.at;
    if (!Number.isFinite(buy.price) || buy.price <= 0 || !Number.isFinite(buy.impactPct) || buy.impactPct < 0) continue;
    if (!Number.isFinite(age) || age < -60_000 || age > MAX_AGE_MS) continue;
    rows.push({ mint, price: buy.price, impactPct: buy.impactPct, at: buy.at });
  }
  return { v: 1, buys: rows };
}

/** What a failed answer means, in words for the log. */
export function shareProblem(status: number) {
  if (status === 401) return "the site refused the secret: SHARE_BUYS_SECRET differs between the bot's .env and Netlify";
  if (status === 404) return "the site has sharing off: SHARE_BUYS_SECRET is missing in Netlify (or the site has not been redeployed since)";
  return `the site answered HTTP ${status}`;
}

let newestSent = 0;
let lastWarnAt = 0;
let sentSince = 0;
let reportedAt = Date.now();
let shortWarned = false;

function warn(message: string) {
  const now = Date.now();
  if (now - lastWarnAt < WARN_EVERY_MS) return;
  lastWarnAt = now;
  console.warn(`Sharing buys with the site: ${message}`);
}

/** Sends the fresh buys to the site. Safe to call after every round; returns quietly when sharing is off. */
export async function shareBuys(buys: Map<string, ShareableBuy>, now = Date.now()) {
  const secret = config.shareBuysSecret;
  if (secret === "") return;
  if (secret.length < MIN_SECRET) {
    if (!shortWarned) console.warn(`Sharing buys with the site is off: SHARE_BUYS_SECRET must be at least ${MIN_SECRET} characters.`);
    shortWarned = true;
    return;
  }
  const payload = sharePayload(buys, now);
  const newest = Math.max(0, ...payload.buys.map((buy) => buy.at));
  if (payload.buys.length === 0 || newest <= newestSent) return;
  try {
    const response = await fetch(`${DESK_URL}/api/share-buys`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      warn(shareProblem(response.status));
      return;
    }
    newestSent = newest;
    sentSince += 1;
    if (Date.now() - reportedAt >= REPORT_EVERY_MS) {
      console.log(`Shared buy quotes with the site ${sentSince} times in the last hour.`);
      sentSince = 0;
      reportedAt = Date.now();
    }
  } catch (error) {
    warn(error instanceof Error ? error.message : "request failed");
  }
}
