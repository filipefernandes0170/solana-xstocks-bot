// US market session helpers. All Nasdaq times are New York time.

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function isSessionOpen(state: string | null | undefined) {
  return (state ?? "").trim().toLowerCase() === "open";
}

type NyParts = { weekday: string; year: number; month: number; day: number; hour: number; minute: number; second: number };

function newYorkParts(ms: number): NyParts {
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
function newYorkToUtc(year: number, month: number, day: number, hour: number, minute: number) {
  let guess = Date.UTC(year, month - 1, day, hour + 4, minute);
  for (let i = 0; i < 3; i++) {
    const p = newYorkParts(guess);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    guess = Date.UTC(year, month - 1, day, hour, minute) - (asUtc - guess);
  }
  return guess;
}

/** Next 09:30 New York on a weekday (holidays are not modelled). */
export function nextOpen(now: number) {
  const p = newYorkParts(now);
  let weekday = WEEKDAYS.indexOf(p.weekday.slice(0, 3));
  if (weekday < 0) weekday = 1;
  const beforeOpen = p.hour < 9 || (p.hour === 9 && p.minute < 30);
  let addDays = 0;
  if (!(beforeOpen && weekday >= 1 && weekday <= 5)) {
    addDays = 1;
    let next = (weekday + addDays) % 7;
    while (next === 0 || next === 6) {
      addDays += 1;
      next = (weekday + addDays) % 7;
    }
  }
  const day = new Date(Date.UTC(p.year, p.month - 1, p.day + addDays));
  return newYorkToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), 9, 30);
}

/** "3h 12m" or "45m" until the next open. */
export function timeToOpen(now: number) {
  const minutes = Math.max(1, Math.round((nextOpen(now) - now) / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}

export function sessionLine(state: string | null, now: number) {
  return isSessionOpen(state)
    ? "Nasdaq is open. The gap is the live difference versus the print."
    : `Nasdaq opens in ${timeToOpen(now)}. Until then this gap can drift.`;
}

/** Session label from the quote feed, or from the clock when the feed has none. */
export function sessionLabel(state: string | null, now: number) {
  const s = (state ?? "").trim().toLowerCase();
  if (s.includes("pre")) return "Premarket";
  if (s === "open" || s.includes("regular")) return "Open";
  if (s.includes("after")) return "After hours";
  if (s.includes("close")) return "Closed";
  const p = newYorkParts(now);
  const weekday = WEEKDAYS.indexOf(p.weekday.slice(0, 3));
  const minutes = p.hour * 60 + p.minute;
  if (weekday >= 1 && weekday <= 5) {
    if (minutes >= 240 && minutes < 570) return "Premarket";
    if (minutes >= 570 && minutes < 960) return "Open";
    if (minutes >= 960 && minutes < 1200) return "After hours";
  }
  return "Closed";
}

/** "1:27 AM ET" */
export function etClock(now: number) {
  return `${new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(now))} ET`;
}

/** "17 Oct, 13:30" in UTC, from unix seconds. */
export function utcStamp(seconds: number) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(seconds * 1000));
}
