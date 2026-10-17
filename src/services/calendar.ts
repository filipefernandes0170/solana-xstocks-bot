// US stock market days off and early closes, the same list as the Par site (site/src/lib/calendar.ts; a test checks
// they match). 2026 from Nasdaq's holiday schedule, 2027 and 2028 from NYSE's published list (both checked
// 17 Oct 2026; Nasdaq had not published 2027 yet). Every early close is at 1:00 p.m. ET. Dates are New York dates.

import { etDay } from "./verdict.js";

export type MarketDay = { date: string; name: string; kind: "closed" | "early"; source: "nasdaq" | "nyse" };

export const MARKET_DAYS: MarketDay[] = [
  { date: "2026-01-01", name: "New Year's Day", kind: "closed", source: "nasdaq" },
  { date: "2026-01-19", name: "Martin Luther King Jr. Day", kind: "closed", source: "nasdaq" },
  { date: "2026-02-16", name: "Presidents' Day", kind: "closed", source: "nasdaq" },
  { date: "2026-04-03", name: "Good Friday", kind: "closed", source: "nasdaq" },
  { date: "2026-05-25", name: "Memorial Day", kind: "closed", source: "nasdaq" },
  { date: "2026-06-19", name: "Juneteenth", kind: "closed", source: "nasdaq" },
  { date: "2026-07-03", name: "Independence Day (observed)", kind: "closed", source: "nasdaq" },
  { date: "2026-09-07", name: "Labor Day", kind: "closed", source: "nasdaq" },
  { date: "2026-11-26", name: "Thanksgiving Day", kind: "closed", source: "nasdaq" },
  { date: "2026-11-27", name: "Day after Thanksgiving", kind: "early", source: "nasdaq" },
  { date: "2026-12-24", name: "Christmas Eve", kind: "early", source: "nasdaq" },
  { date: "2026-12-25", name: "Christmas Day", kind: "closed", source: "nasdaq" },
  { date: "2027-01-01", name: "New Year's Day", kind: "closed", source: "nyse" },
  { date: "2027-01-18", name: "Martin Luther King Jr. Day", kind: "closed", source: "nyse" },
  { date: "2027-02-15", name: "Presidents' Day", kind: "closed", source: "nyse" },
  { date: "2027-03-26", name: "Good Friday", kind: "closed", source: "nyse" },
  { date: "2027-05-31", name: "Memorial Day", kind: "closed", source: "nyse" },
  { date: "2027-06-18", name: "Juneteenth (observed)", kind: "closed", source: "nyse" },
  { date: "2027-07-05", name: "Independence Day (observed)", kind: "closed", source: "nyse" },
  { date: "2027-09-06", name: "Labor Day", kind: "closed", source: "nyse" },
  { date: "2027-11-25", name: "Thanksgiving Day", kind: "closed", source: "nyse" },
  { date: "2027-11-26", name: "Day after Thanksgiving", kind: "early", source: "nyse" },
  { date: "2027-12-24", name: "Christmas Day (observed)", kind: "closed", source: "nyse" },
  { date: "2028-01-17", name: "Martin Luther King Jr. Day", kind: "closed", source: "nyse" },
  { date: "2028-02-21", name: "Presidents' Day", kind: "closed", source: "nyse" },
  { date: "2028-04-14", name: "Good Friday", kind: "closed", source: "nyse" },
  { date: "2028-05-29", name: "Memorial Day", kind: "closed", source: "nyse" },
  { date: "2028-06-19", name: "Juneteenth", kind: "closed", source: "nyse" },
  { date: "2028-07-03", name: "Day before Independence Day", kind: "early", source: "nyse" },
  { date: "2028-07-04", name: "Independence Day", kind: "closed", source: "nyse" },
  { date: "2028-09-04", name: "Labor Day", kind: "closed", source: "nyse" },
  { date: "2028-11-23", name: "Thanksgiving Day", kind: "closed", source: "nyse" },
  { date: "2028-11-24", name: "Day after Thanksgiving", kind: "early", source: "nyse" },
  { date: "2028-12-25", name: "Christmas Day", kind: "closed", source: "nyse" },
];

export const EARLY_CLOSE_LABEL = "1:00 PM ET";

const BY_DATE = new Map(MARKET_DAYS.map((day) => [day.date, day]));

export function marketDay(date: string) {
  return BY_DATE.get(date) ?? null;
}

/** A date moved by whole days: addDays("2026-11-26", 1) is "2026-11-27". */
export function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function weekdayOf(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** A weekday that is not a market holiday. Early-close days are trading days. */
export function isTradingDay(date: string) {
  const weekday = weekdayOf(date);
  return weekday >= 1 && weekday <= 5 && marketDay(date)?.kind !== "closed";
}

export function nextTradingDay(date: string) {
  let next = addDays(date, 1);
  for (let i = 0; i < 14 && !isTradingDay(next); i++) next = addDays(next, 1);
  return next;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Thu 26 Nov". Spelled out here, not by Intl: engines differ ("Sep" or "Sept"), and the site must match. */
export function dayTitle(date: string) {
  const [, month, day] = date.split("-").map(Number);
  return `${WEEKDAYS[weekdayOf(date)]} ${day} ${MONTHS[month - 1]}`;
}

/**
 * For the morning brief: an early close today, any day off before the next session, and an early close on that
 * next session. Empty on an ordinary day.
 */
export function marketNotes(now: number): string[] {
  const today = etDay(now);
  const tomorrow = addDays(today, 1);
  const when = (date: string) => (date === tomorrow ? "tomorrow" : dayTitle(date));
  const notes: string[] = [];
  const todayIs = marketDay(today);
  if (todayIs?.kind === "early") notes.push(`⏰ Nasdaq closes early today, at ${EARLY_CLOSE_LABEL} (${todayIs.name}).`);
  const next = nextTradingDay(today);
  for (let date = tomorrow; date < next; date = addDays(date, 1)) {
    const off = marketDay(date);
    if (off?.kind === "closed") notes.push(`🏖 Nasdaq is closed ${when(date)} for ${off.name}.`);
  }
  const nextIs = marketDay(next);
  if (nextIs?.kind === "early") notes.push(`⏰ Nasdaq closes early ${when(next)}, at ${EARLY_CLOSE_LABEL} (${nextIs.name}).`);
  return notes;
}
