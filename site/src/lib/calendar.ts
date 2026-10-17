// US stock market days off and early closes, from the exchanges' own published lists. All dates are New York dates.
// 2026: Nasdaq's holiday schedule (nasdaqtrader.com, checked 17 Oct 2026).
// 2027 and 2028: NYSE's published list (nyse.com/markets/hours-calendars, checked 17 Oct 2026). Nasdaq had not
// published 2027 yet; the US exchanges close on the same days. Every early close is at 1:00 p.m. ET.
// @ONPAR_BOT keeps the same list in src/services/calendar.ts, and a bot test checks the two match.

export type MarketDayKind = "closed" | "early";

export type MarketDay = { date: string; name: string; kind: MarketDayKind; source: CalendarSource };

export type CalendarSource = "nasdaq" | "nyse";

export const CALENDAR_SOURCES: Record<CalendarSource, { label: string; url: string }> = {
  nasdaq: { label: "Nasdaq holiday schedule", url: "https://www.nasdaqtrader.com/Trader.aspx?id=Calendar" },
  nyse: { label: "NYSE holidays and hours", url: "https://www.nyse.com/markets/hours-calendars" },
};

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

/** The last date the list covers. After it only weekends are known, so the list needs its next year by then. */
export const CALENDAR_UNTIL = "2028-12-31";

/** Regular session in minutes after midnight, New York time. */
export const OPEN_MINUTES = 9 * 60 + 30;
export const CLOSE_MINUTES = 16 * 60;
export const EARLY_CLOSE_MINUTES = 13 * 60;
export const EARLY_CLOSE_LABEL = "1:00 PM ET";

const BY_DATE = new Map(MARKET_DAYS.map((day) => [day.date, day]));

/** The holiday or early close on a New York date ("2026-11-26"), or null for an ordinary day. */
export function marketDay(date: string) {
  return BY_DATE.get(date) ?? null;
}

type NyParts = { weekday: string; year: number; month: number; day: number; hour: number; minute: number; second: number };

export function newYorkParts(ms: number): NyParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    weekday: part("weekday"),
    year: Number(part("year")),
    month: Number(part("month")),
    day: Number(part("day")),
    hour: Number(part("hour")),
    minute: Number(part("minute")),
    second: Number(part("second")),
  };
}

/** UTC milliseconds for a New York wall-clock time (handles daylight saving). */
export function newYorkToUtc(year: number, month: number, day: number, hour: number, minute: number) {
  let guess = Date.UTC(year, month - 1, day, hour + 4, minute);
  for (let i = 0; i < 3; i++) {
    const p = newYorkParts(guess);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    guess = Date.UTC(year, month - 1, day, hour, minute) - (asUtc - guess);
  }
  return guess;
}

/** The New York date of a moment: "2026-11-26". */
export function nyDate(ms: number) {
  const p = newYorkParts(ms);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** UTC milliseconds for a time of day on a New York date. */
export function atNewYork(date: string, minutes: number) {
  const [year, month, day] = date.split("-").map(Number);
  return newYorkToUtc(year, month, day, Math.floor(minutes / 60), minutes % 60);
}

/** A date moved by whole days: addDays("2026-11-26", 1) is "2026-11-27". */
export function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** 0 for Sunday to 6 for Saturday. */
export function weekdayOf(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** A weekday that is not a market holiday. Early-close days are trading days. */
export function isTradingDay(date: string) {
  const weekday = weekdayOf(date);
  return weekday >= 1 && weekday <= 5 && marketDay(date)?.kind !== "closed";
}

/** When the regular session ends on that date, in minutes after midnight ET: 16:00, or 13:00 on an early close. */
export function closeMinutes(date: string) {
  return marketDay(date)?.kind === "early" ? EARLY_CLOSE_MINUTES : CLOSE_MINUTES;
}

/** The first trading day after `date`. */
export function nextTradingDay(date: string) {
  let next = addDays(date, 1);
  for (let i = 0; i < 14 && !isTradingDay(next); i++) next = addDays(next, 1);
  return next;
}
