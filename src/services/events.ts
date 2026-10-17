// /events and the event texts. Key SEC filings come from the Par site (GET /api/events; the site reads the SEC),
// market days from calendar.ts, and balance changes and pauses from the bot's own read of each mint (desk.ts).
// Par lists what official sources publish; these texts never say how a price will move.

import { Markup } from "telegraf";
import type { InlineKeyboardMarkup } from "telegraf/types";
import { SYMBOL_TO_TOKEN } from "../config/tokens.js";
import { EARLY_CLOSE_LABEL, MARKET_DAYS, addDays, dayTitle } from "./calendar.js";
import { DESK_URL } from "./messages.js";
import { escapeHtml, etDay, type Rebase } from "./verdict.js";

/** Filing texts a holder gets in one New York day, at most. Pause alerts do not count. */
export const EVENT_TEXTS_PER_DAY = 5;
/** A filing is texted only while it is this fresh, so a restart or a slow site never sends old news. */
export const FILING_PING_MAX_AGE_MS = 2 * 60 * 60_000;
/** /events lists key filings from this many days back. */
const FILING_LIST_DAYS = 7;

export type SiteFiling = {
  id: string;
  at: number;
  symbols: string[];
  company: string;
  title: string;
  line: string;
  tags: string[];
  major: boolean;
  url: string;
};

const FILING_URL = /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/\d+\/\d+\/\d{10}-\d{2}-\d{6}-index\.htm$/;

function text(value: unknown, max = 300) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

/**
 * The timed SEC filings in the site's answer, checked field by field. Filings whose time the site has not read yet
 * are left out (they are never texted). Null when the answer is not an events list.
 */
export function parseSiteFilings(data: unknown): SiteFiling[] | null {
  const body = data as { events?: unknown } | null;
  if (!body || !Array.isArray(body.events)) return null;
  const filings: SiteFiling[] = [];
  for (const raw of body.events) {
    const event = raw as Record<string, unknown> | null;
    if (!event || event.kind !== "filing" || event.allDay !== false) continue;
    const id = text(event.id, 40);
    const at = event.at;
    const url = text((event.source as { url?: unknown } | undefined)?.url, 200);
    if (!/^sec:\d{10}-\d{2}-\d{6}$/.test(id) || typeof at !== "number" || !Number.isFinite(at) || !FILING_URL.test(url)) continue;
    const symbols = (Array.isArray(event.symbols) ? event.symbols : [])
      .map((symbol) => (typeof symbol === "string" ? SYMBOL_TO_TOKEN.get(symbol.toUpperCase())?.symbol : undefined))
      .filter((symbol): symbol is string => !!symbol);
    const company = text(event.company, 60);
    const title = text(event.title, 80);
    if (symbols.length === 0 || !company || !title) continue;
    filings.push({
      id,
      at,
      symbols,
      company,
      title,
      line: text(event.line),
      tags: (Array.isArray(event.tags) ? event.tags : []).map((tag) => text(tag, 60)).filter(Boolean),
      major: event.major === true,
      url,
    });
  }
  return filings;
}

/** The site's filings, or null when the site cannot be reached. */
export async function fetchSiteFilings(timeoutMs = 10_000): Promise<SiteFiling[] | null> {
  try {
    const response = await fetch(`${DESK_URL}/api/events`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return null;
    return parseSiteFilings(await response.json());
  } catch {
    return null;
  }
}

/** Key filings worth a text right now, oldest first. */
export function filingsToText(filings: SiteFiling[], now: number) {
  return filings
    .filter((filing) => filing.major && filing.at <= now + 60_000 && now - filing.at <= FILING_PING_MAX_AGE_MS)
    .sort((a, b) => a.at - b.at);
}

/** "4:05 PM ET" */
function etTime(ms: number) {
  return `${new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(ms))} ET`;
}

/** "Tue 20 Oct, 00:30 UTC" */
function utcWhen(seconds: number) {
  const ms = seconds * 1000;
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));
  return `${dayTitle(new Date(ms).toISOString().slice(0, 10))}, ${time} UTC`;
}

// ── Texts ────────────────────────────────────────────────────────────────────

export function filingText(filing: SiteFiling) {
  return [
    `📄 <b>${escapeHtml(filing.company)} · ${escapeHtml(filing.title)}</b>`,
    `${filing.symbols.map(escapeHtml).join(", ")} · ${escapeHtml(filing.tags[0] ?? "SEC filing")} · ${escapeHtml(dayTitle(etDay(filing.at)))}, ${etTime(filing.at)}`,
    filing.line ? escapeHtml(filing.line) : null,
    "",
    "<i>What the company filed at the SEC. Par does not say how the price will move. /events off stops these texts.</i>",
  ]
    .filter((line) => line != null)
    .join("\n");
}

export function filingKeyboard(filing: SiteFiling): InlineKeyboardMarkup {
  return Markup.inlineKeyboard([
    [Markup.button.url("📄 Read the filing", filing.url)],
    [Markup.button.url("📅 Every event", `${DESK_URL}/events`)],
  ]).reply_markup;
}

export function pauseText(symbol: string) {
  return [
    `⛔ <b>${escapeHtml(symbol)} transfers are paused</b>`,
    `The issuer has paused every transfer of ${escapeHtml(symbol)} on chain. Until it lifts, nobody can send or sell it, in any app.`,
    "Par reads the mint every few minutes and will text you when transfers resume.",
  ].join("\n");
}

export function resumeText(symbol: string) {
  return [
    `✅ <b>${escapeHtml(symbol)} transfers resumed</b>`,
    "The issuer lifted the pause on chain, so the token can move again.",
    `Send <code>${escapeHtml(symbol.toLowerCase())}</code> for its card before you trade: the price may have drifted while it was paused.`,
  ].join("\n");
}

export function mintKeyboard(mint: string): InlineKeyboardMarkup {
  return Markup.inlineKeyboard([[Markup.button.url("🔎 See the mint on chain", `https://explorer.solana.com/address/${mint}`)]]).reply_markup;
}

export type EventsView = {
  now: number;
  rebases: { symbol: string; rebase: Rebase }[];
  /** Symbols paused on chain right now; null when the mints could not be read. */
  paused: string[] | null;
  /** Null when the site could not be reached. */
  filings: SiteFiling[] | null;
  /** The last lines: whether this person's filing texts are on. */
  footer: string;
};

/** /events: the next 7 days, and the key filings of the last 7. */
export function eventsText(view: EventsView) {
  const today = etDay(view.now);
  const last = addDays(today, 6);
  const days = MARKET_DAYS.filter((day) => day.date >= today && day.date <= last).map((day) =>
    day.kind === "closed"
      ? `🏖 ${dayTitle(day.date)} · closed for ${escapeHtml(day.name)}`
      : `⏰ ${dayTitle(day.date)} · closes early, ${EARLY_CLOSE_LABEL} (${escapeHtml(day.name)})`,
  );
  const weekEnd = view.now + 7 * 86_400_000;
  const rebases = view.rebases
    .filter((row) => row.rebase.at * 1000 > view.now && row.rebase.at * 1000 <= weekEnd)
    .sort((a, b) => a.rebase.at - b.rebase.at)
    .map((row) => `🔁 <b>${escapeHtml(row.symbol)}</b> · ${utcWhen(row.rebase.at)} · ${row.rebase.direction === "up" ? "balance up" : "multiplier down"}`);
  const since = view.now - FILING_LIST_DAYS * 86_400_000;
  const filings = (view.filings ?? [])
    .filter((filing) => filing.major && filing.at >= since && filing.at <= view.now + 60_000)
    .sort((a, b) => b.at - a.at)
    .slice(0, 6)
    .map(
      (filing) =>
        `📄 <b>${escapeHtml(filing.company)}</b> · ${escapeHtml(filing.title)} · ${escapeHtml(dayTitle(etDay(filing.at)))}, ${etTime(filing.at)} · <a href="${escapeHtml(filing.url)}">SEC</a>`,
    );

  return [
    "📅 <b>Events · the next 7 days</b>",
    "",
    "<b>Nasdaq</b>",
    days.length > 0 ? days.join("\n") : "Usual hours every weekday.",
    "",
    "<b>Balance changes</b>",
    rebases.length > 0 ? rebases.join("\n") : "None set on chain.",
    "",
    "<b>Transfers</b>",
    view.paused == null
      ? "The mints could not be read right now."
      : view.paused.length > 0
        ? `⛔ Paused on chain: ${view.paused.map((symbol) => `<b>${escapeHtml(symbol)}</b>`).join(", ")}.`
        : "✅ No token is paused.",
    "",
    `<b>Key filings, last ${FILING_LIST_DAYS} days</b>`,
    view.filings == null ? "The filings could not be read right now." : filings.length > 0 ? filings.join("\n") : "None.",
    "",
    `🌐 <a href="${DESK_URL}/events">Every event, with 14 days of filings</a>`,
    "",
    view.footer,
  ].join("\n");
}

export const EVENTS_ON_TEXT =
  "🔔 <b>Filing texts are on</b>\nKey SEC filings (results, deals, board or executive changes, warnings) for the names in your bag or watch list, within minutes, at most 5 a day.";

export const EVENTS_OFF_TEXT =
  "🔕 <b>Filing texts are off</b>\nPause alerts for the tokens you hold or watch stay on: they are about your funds. /events on turns filing texts back on.";
