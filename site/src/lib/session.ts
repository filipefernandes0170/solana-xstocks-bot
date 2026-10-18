// US market session helpers. All Nasdaq times are New York time. Holidays and early closes come from calendar.ts.

import { EARLY_CLOSE_LABEL, OPEN_MINUTES, addDays, atNewYork, closeMinutes, isTradingDay, marketDay, newYorkParts, nextTradingDay, nyDate } from "./calendar";
import { dateFormat } from "./intl";

export function isSessionOpen(state: string | null | undefined) {
  return (state ?? "").trim().toLowerCase() === "open";
}

/** True when the feed says the regular session is not open (closed, pre-market or after hours); false when open or not known yet. */
export function sessionClosed(state: string | null | undefined) {
  return (state ?? "").trim() !== "" && !isSessionOpen(state);
}

/** Nasdaq's pre-market starts at 4:00 ET; after hours ends four hours after the close (20:00, or 17:00 on an early close). */
const PREMARKET_MINUTES = 4 * 60;
const AFTER_HOURS_MINUTES = 4 * 60;

function afterHoursEnd(date: string) {
  return atNewYork(date, closeMinutes(date) + AFTER_HOURS_MINUTES);
}

/**
 * When the current stretch with no Nasdaq trading at all began (the end of after hours on the last trading day), or
 * null while pre-market, the regular session or after hours runs. No print can change inside such a stretch: weekday
 * nights from 20:00 to 4:00 ET, whole weekends and market holidays. Nasdaq plans an overnight session (target
 * December 2026, pending approval); once it runs, weekday nights are no longer quiet and this must change.
 */
export function quietSince(now: number): number | null {
  const today = nyDate(now);
  const p = newYorkParts(now);
  if (isTradingDay(today)) {
    const end = afterHoursEnd(today);
    if (now >= end) return end;
    if (p.hour * 60 + p.minute >= PREMARKET_MINUTES) return null;
  }
  let day = addDays(today, -1);
  for (let i = 0; i < 14 && !isTradingDay(day); i++) day = addDays(day, -1);
  return afterHoursEnd(day);
}

/** Next 09:30 New York on a trading day: weekends and market holidays are skipped. */
export function nextOpen(now: number) {
  const today = nyDate(now);
  const p = newYorkParts(now);
  const beforeOpen = p.hour * 60 + p.minute < OPEN_MINUTES;
  const day = beforeOpen && isTradingDay(today) ? today : nextTradingDay(today);
  return atNewYork(day, OPEN_MINUTES);
}

/** "3h 12m" or "45m" until the next open. */
export function timeToOpen(now: number) {
  const minutes = Math.max(1, Math.round((nextOpen(now) - now) / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}

/** The day of the next open in words: "today", "tomorrow" or a weekday such as "Monday". */
export function opensDay(now: number) {
  const open = nextOpen(now);
  const a = newYorkParts(now);
  const b = newYorkParts(open);
  const days = Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return dateFormat("en-US", { timeZone: "America/New_York", weekday: "long" }).format(new Date(open));
}

/** One calm line for when the regular session is not open: where Nasdaq stands and when it opens. */
export function closedLine(state: string | null, now: number) {
  const label = sessionLabel(state, now);
  const holiday = marketDay(nyDate(now));
  const where =
    holiday?.kind === "closed"
      ? `Nasdaq is closed today for ${holiday.name}`
      : label === "Closed" || label === "Open"
        ? "Nasdaq is closed"
        : `Nasdaq is in ${label.toLowerCase()}`;
  return `${where}. It opens ${opensDay(now)} at 9:30 ET, and nothing is called fair until then.`;
}

/** True on an early-close day (the regular session ends at 1:00 PM ET). */
export function earlyCloseToday(now: number) {
  return marketDay(nyDate(now))?.kind === "early";
}

export function sessionLine(state: string | null, now: number) {
  if (isSessionOpen(state)) {
    return earlyCloseToday(now)
      ? `Nasdaq is open until ${EARLY_CLOSE_LABEL} today, an early close. The gap is the live difference versus the print.`
      : "Nasdaq is open. The gap is the live difference versus the print.";
  }
  return `Nasdaq opens in ${timeToOpen(now)}. Until then this gap can drift.`;
}

/** Session label from the quote feed, or from the clock and the market calendar when the feed has none. */
export function sessionLabel(state: string | null, now: number) {
  const s = (state ?? "").trim().toLowerCase();
  if (s.includes("pre")) return "Premarket";
  if (s === "open" || s.includes("regular")) return "Open";
  if (s.includes("after")) return "After hours";
  if (s.includes("close")) return "Closed";
  const today = nyDate(now);
  if (!isTradingDay(today)) return "Closed";
  const p = newYorkParts(now);
  const minutes = p.hour * 60 + p.minute;
  const close = closeMinutes(today);
  if (minutes >= 240 && minutes < OPEN_MINUTES) return "Premarket";
  if (minutes >= OPEN_MINUTES && minutes < close) return "Open";
  // After hours run four hours past the close: to 20:00, or to 17:00 after a 13:00 early close.
  if (minutes >= close && minutes < close + 240) return "After hours";
  return "Closed";
}

/** "1:27 AM ET" */
export function etClock(now: number) {
  return `${dateFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(now))} ET`;
}

/** "17 Oct, 13:30" in UTC, from unix seconds. */
export function utcStamp(seconds: number) {
  return dateFormat("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(seconds * 1000));
}
