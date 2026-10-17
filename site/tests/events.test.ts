// /events: the market calendar, the SEC feed reader, the mint reader, and the holiday-aware session clock.
import assert from "node:assert/strict";
import { test } from "node:test";
import { MARKET_DAYS, addDays, isTradingDay, marketDay, nextTradingDay, nyDate, weekdayOf } from "../src/lib/calendar";
import {
  SEC_CIK,
  dayTitle,
  filingEvent,
  filingEvents,
  filingHeaderUrl,
  groupByDay,
  marketEvents,
  parseAcceptance,
  parseMintState,
  parseSubmissions,
  pauseEvents,
  rebaseEvents,
  relativeDay,
  shownForm,
  splitByTime,
  submissionsUrl,
  type RawFiling,
} from "../src/lib/events";
import { closedLine, nextOpen, opensDay, sessionLabel, sessionLine } from "../src/lib/session";
import { ETF_UNDERLYINGS, TOKENS } from "../src/lib/tokens";

// ---------------------------------------------------------------------------------------------------------------
// The calendar

test("the market calendar is in order, on weekdays, and matches the exchanges' lists", () => {
  const dates = MARKET_DAYS.map((day) => day.date);
  assert.deepEqual(dates, [...dates].sort(), "sorted");
  assert.equal(new Set(dates).size, dates.length, "no date twice");
  for (const day of MARKET_DAYS) {
    const weekday = weekdayOf(day.date);
    assert.ok(weekday >= 1 && weekday <= 5, `${day.date} is a weekday`);
    assert.equal(day.source, day.date.startsWith("2026") ? "nasdaq" : "nyse", day.date);
  }
  // Nasdaq 2026, as published: ten full closures and two early closes.
  const y2026 = MARKET_DAYS.filter((day) => day.date.startsWith("2026"));
  assert.equal(y2026.filter((day) => day.kind === "closed").length, 10);
  assert.deepEqual(
    y2026.filter((day) => day.kind === "early").map((day) => day.date),
    ["2026-11-27", "2026-12-24"],
  );
  // NYSE: no New Year's holiday is observed in 2028 (1 January is a Saturday); Christmas 2027 is observed on Friday 24.
  assert.equal(marketDay("2027-12-31"), null);
  assert.equal(marketDay("2027-12-24")?.kind, "closed");
  assert.equal(marketDay("2028-07-03")?.kind, "early");
  assert.equal(marketDay("2026-11-26")?.name, "Thanksgiving Day");
});

test("the calendar covers at least the next twelve months", () => {
  const last = MARKET_DAYS[MARKET_DAYS.length - 1].date;
  assert.ok(last >= addDays(nyDate(Date.now()), 365), `the list ends ${last}: add the next year from the exchanges' sites`);
});

test("trading days skip weekends and holidays, not early closes", () => {
  assert.equal(isTradingDay("2026-11-26"), false);
  assert.equal(isTradingDay("2026-11-27"), true);
  assert.equal(isTradingDay("2026-10-17"), false); // Saturday
  assert.equal(nextTradingDay("2026-11-25"), "2026-11-27");
  assert.equal(nextTradingDay("2027-09-03"), "2027-09-07"); // Friday before Labor Day
  assert.equal(nextTradingDay("2027-12-23"), "2027-12-27");
});

// ---------------------------------------------------------------------------------------------------------------
// The session clock knows the holidays now

test("the session clock skips market holidays and knows early closes", () => {
  const thanksgivingMorning = Date.parse("2026-11-26T14:00:00Z"); // 9:00 ET
  assert.equal(nextOpen(thanksgivingMorning), Date.parse("2026-11-27T14:30:00Z"));
  assert.equal(opensDay(thanksgivingMorning), "tomorrow");
  assert.equal(sessionLabel(null, thanksgivingMorning), "Closed");
  assert.equal(
    closedLine("Closed", thanksgivingMorning),
    "Nasdaq is closed today for Thanksgiving Day. It opens tomorrow at 9:30 ET, and nothing is called fair until then.",
  );

  const saturdayBeforeMlk = Date.parse("2027-01-16T17:00:00Z");
  assert.equal(opensDay(saturdayBeforeMlk), "Tuesday");
  assert.equal(nextOpen(saturdayBeforeMlk), Date.parse("2027-01-19T14:30:00Z"));

  const laborDay = Date.parse("2026-09-07T14:38:43Z"); // 10:38 ET, a Monday holiday
  assert.equal(sessionLabel(null, laborDay), "Closed");
  assert.equal(nextOpen(laborDay), Date.parse("2026-09-08T13:30:00Z"));

  const earlyCloseNoon = Date.parse("2026-11-27T17:00:00Z"); // 12:00 ET
  const earlyCloseTwo = Date.parse("2026-11-27T19:00:00Z"); // 14:00 ET
  const earlyCloseSix = Date.parse("2026-11-27T23:00:00Z"); // 18:00 ET
  assert.equal(sessionLabel(null, earlyCloseNoon), "Open");
  assert.equal(sessionLabel(null, earlyCloseTwo), "After hours");
  assert.equal(sessionLabel(null, earlyCloseSix), "Closed");
  assert.equal(
    sessionLine("Open", earlyCloseNoon),
    "Nasdaq is open until 1:00 PM ET today, an early close. The gap is the live difference versus the print.",
  );
  // An ordinary weekday is unchanged.
  assert.equal(sessionLine("Open", Date.parse("2026-10-19T15:00:00Z")), "Nasdaq is open. The gap is the live difference versus the print.");
  assert.equal(nextOpen(Date.parse("2026-10-17T15:30:00Z")), Date.parse("2026-10-19T13:30:00Z"));
});

// ---------------------------------------------------------------------------------------------------------------
// SEC filings

test("every company Par tracks has its SEC number, and the funds have none", () => {
  const companies = [...new Set(TOKENS.map((token) => token.underlying))].filter((u) => !ETF_UNDERLYINGS.has(u));
  assert.deepEqual(Object.keys(SEC_CIK).sort(), companies.sort());
  for (const cik of Object.values(SEC_CIK)) assert.match(cik, /^\d{10}$/);
  assert.equal(SEC_CIK.NVDA, "0001045810");
  assert.equal(SEC_CIK.AMD, "0000002488");
});

// Part of a submissions answer as data.sec.gov gave it on 17 Oct 2026 (Tesla), plus a broken row and an old one.
// The SEC's own acceptanceDateTime is in the answer but is not used (see lib/events.ts).
const TESLA = {
  filings: {
    recent: {
      accessionNumber: ["0001628280-26-064366", "not-an-accession", "0001628280-26-063820", "0001104659-26-106432", "0001104659-26-090001"],
      filingDate: ["2026-10-02", "2026-10-02", "2026-09-29", "2026-09-09", "2026-08-01"],
      acceptanceDateTime: ["2026-10-02T13:04:26.000Z", "", "2026-09-29T20:38:50.000Z", "2026-09-09T23:00:10.000Z", ""],
      form: ["8-K", "8-K", "8-K", "4", "10-Q"],
      items: ["2.02,9.01", "", "1.01,1.02,2.03,9.01", "", ""],
    },
  },
};

test("the submissions reader keeps recent filings, their items and their SEC page", () => {
  const filings = parseSubmissions(TESLA, SEC_CIK.TSLA, "2026-09-01");
  assert.deepEqual(
    filings.map((filing) => filing.accession),
    ["0001628280-26-064366", "0001628280-26-063820", "0001104659-26-106432"],
    "the broken row and the one before the cut-off are dropped",
  );
  const [results] = filings;
  assert.deepEqual(results, {
    accession: "0001628280-26-064366",
    form: "8-K",
    filed: "2026-10-02",
    items: ["2.02", "9.01"],
    url: "https://www.sec.gov/Archives/edgar/data/1318605/000162828026064366/0001628280-26-064366-index.htm",
  });
  assert.equal(
    filingHeaderUrl(SEC_CIK.TSLA, results.accession),
    "https://www.sec.gov/Archives/edgar/data/1318605/000162828026064366/0001628280-26-064366.hdr.sgml",
  );
  assert.equal(submissionsUrl(SEC_CIK.NVDA), "https://data.sec.gov/submissions/CIK0001045810.json");
  assert.deepEqual(parseSubmissions(null, SEC_CIK.TSLA, "2026-09-01"), []);
  assert.deepEqual(parseSubmissions({ filings: { recent: { accessionNumber: "x" } } }, SEC_CIK.TSLA, "2026-09-01"), []);
});

test("the acceptance time comes from the filing's header, in New York time", () => {
  // GoPro's results, 16 Oct 2026: the filing page says "Accepted 2026-10-16 17:30:16"; the JSON said 01:30:16Z on the 17th.
  const header = "<SEC-HEADER>0001500435-26-000064.hdr.sgml : 20261016\n<ACCEPTANCE-DATETIME>20261016173016\n<ACCESSION-NUMBER>0001500435-26-000064\n<TYPE>8-K\n";
  assert.equal(parseAcceptance(header), Date.parse("2026-10-16T21:30:16Z"));
  // Winter time: 9:04:26 on 2 Dec is 14:04:26 UTC.
  assert.equal(parseAcceptance("<ACCEPTANCE-DATETIME>20261202090426"), Date.parse("2026-12-02T14:04:26Z"));
  assert.equal(parseAcceptance("<ACCEPTANCE-DATETIME>20261399990000"), null);
  assert.equal(parseAcceptance("<html>Not found</html>"), null);
});

function raw(form: string, items: string[], filed = "2026-10-10"): RawFiling {
  return { accession: "0000000000-26-000001", form, filed, items, url: "https://www.sec.gov/Archives/edgar/data/1/1/1-index.htm" };
}

const AT = Date.parse("2026-10-10T20:05:00Z");

test("a filing becomes an event named by its most consequential item", () => {
  const [tesla] = parseSubmissions(TESLA, SEC_CIK.TSLA, "2026-09-01");
  const results = filingEvent(tesla, "TSLA", Date.parse("2026-10-02T13:04:26Z"));
  assert.ok(results);
  assert.equal(results.title, "Results");
  assert.equal(results.topic, "results");
  assert.equal(results.major, true);
  assert.equal(results.line, "Results of operations and financial condition.");
  assert.deepEqual(results.tags, ["8-K · Item 2.02"]);
  assert.deepEqual(results.symbols, ["TSLAx"]);
  assert.equal(results.company, "Tesla");
  assert.equal(results.id, "sec:0001628280-26-064366");
  assert.equal(results.day, "2026-10-02");
  assert.equal(results.allDay, false);

  const deal = filingEvent(raw("8-K", ["1.01", "1.02", "2.03", "9.01"]), "TSLA", AT);
  assert.equal(deal?.title, "Major agreement signed");
  assert.deepEqual(deal?.tags, ["8-K · Item 1.01", "Major agreement ended", "New debt"]);
  assert.equal(deal?.line, "A major agreement was signed. A major agreement ended. A new debt or financial obligation.");
  assert.equal(deal?.major, true);

  const routine = filingEvent(raw("8-K", ["7.01", "8.01"]), "MSTR", AT);
  assert.equal(routine?.title, "Other events");
  assert.equal(routine?.major, false);

  const people = filingEvent(raw("8-K", ["5.02"]), "COIN", AT);
  assert.equal(people?.title, "Board or executives");
  assert.equal(people?.major, true);

  const foreign = filingEvent(raw("6-K", []), "SKHY", AT);
  assert.equal(foreign?.title, "Company report");
  assert.equal(foreign?.major, true);
  assert.deepEqual(foreign?.symbols, ["SKHY"]);

  // AMD and SpaceX have two tokens each, so a filing concerns both.
  assert.deepEqual(filingEvent(raw("8-K", ["2.02"]), "AMD", AT)?.symbols, ["AMDx", "AMD"]);
  assert.deepEqual(filingEvent(raw("8-K", ["2.02"]), "SPCX", AT)?.symbols, ["SPCXx", "SPCX"]);

  // Amendments are shown but never texted; forms the page does not explain are left out.
  assert.equal(filingEvent(raw("8-K/A", ["2.01"]), "DJT", AT)?.title, "Acquisition or sale completed (amended)");
  assert.equal(filingEvent(raw("8-K/A", ["2.01"]), "DJT", AT)?.major, false);
  assert.equal(filingEvent(raw("10-K/A", []), "MU", AT)?.title, "Annual report (amended)");
  assert.equal(filingEvent(raw("10-Q", []), "MU", AT)?.major, false);
  for (const form of ["DEFA14A", "425", "4", "144", "424B5", "SC 13G"]) assert.equal(filingEvent(raw(form, []), "MSTR", AT), null, form);
  assert.equal(shownForm("8-K"), true);
  assert.equal(shownForm("6-K/A"), true);
  assert.equal(shownForm("4"), false);

  // Until its time is read, a filing sits on its filing date with no time, and is never "ahead".
  const pending = filingEvent(raw("8-K", ["2.02"], "2026-10-17"), "NVDA", null);
  assert.equal(pending?.allDay, true);
  assert.equal(pending?.day, "2026-10-17");
  assert.equal(splitByTime(pending ? [pending] : [], Date.parse("2026-10-17T15:00:00Z")).past.length, 1);
});

test("only the last 14 days of filings are listed, newest first", () => {
  const now = Date.parse("2026-10-17T18:00:00Z");
  const rows = [raw("8-K", ["2.02"], "2026-10-02"), raw("8-K", ["5.02"], "2026-10-16"), raw("8-K", ["1.01"], "2026-10-17"), raw("8-K", ["8.01"], "2026-10-01")].map(
    (row, i) => ({ ...row, accession: `0000000000-26-00000${i}` }),
  );
  const accepted = {
    "0000000000-26-000000": Date.parse("2026-10-02T13:00:00Z"), // 15 days ago
    "0000000000-26-000001": now - 86_400_000,
    "0000000000-26-000002": now - 3_600_000,
    // 000003 has no time yet, and its filing date is too old.
  };
  assert.deepEqual(
    filingEvents(rows, "NVDA", accepted, now).map((event) => event.title),
    ["Major agreement signed", "Board or executives"],
  );
});

// ---------------------------------------------------------------------------------------------------------------
// Mints on Solana

function mint(extensions: { extension: string; state: Record<string, unknown> }[]) {
  return { data: { parsed: { type: "mint", info: { extensions } } } };
}

test("a mint says whether transfers are paused and when its multiplier changes", () => {
  const now = Date.parse("2026-10-17T18:00:00Z");
  const ahead = Math.floor((now + 3 * 86_400_000) / 1000);
  const nvda = parseMintState(
    "NVDAx",
    mint([
      { extension: "pausableConfig", state: { authority: "x", paused: false } },
      { extension: "scaledUiAmountConfig", state: { multiplier: "1.0009180758490996", newMultiplier: "1.001701196801074", newMultiplierEffectiveTimestamp: ahead } },
    ]),
  );
  assert.deepEqual(nvda, { symbol: "NVDAx", paused: false, multiplier: 1.0009180758490996, newMultiplier: 1.001701196801074, effectiveAt: ahead * 1000 });
  const [change] = rebaseEvents([nvda], now);
  assert.equal(change.title, "Balance change");
  assert.equal(change.id, `rebase:NVDAx:${ahead}`);
  assert.ok(change.line.startsWith("The multiplier goes from 1.0009 to 1.0017: 100 tokens will show as 100.08."), change.line);
  assert.equal(change.tags[1], "Balance up");
  assert.equal(change.source.url, "https://explorer.solana.com/address/Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh");
  assert.equal(splitByTime([change], now).ahead.length, 1);

  // A change ten days ago is listed as done; one a month ago and one that changes nothing are not.
  const recent = { ...nvda, effectiveAt: now - 10 * 86_400_000 };
  assert.equal(rebaseEvents([recent], now)[0].title, "Balance changed");
  assert.deepEqual(rebaseEvents([{ ...nvda, effectiveAt: now - 30 * 86_400_000 }], now), []);
  const flat = parseMintState("TSLAx", mint([{ extension: "scaledUiAmountConfig", state: { multiplier: "1", newMultiplier: "1", newMultiplierEffectiveTimestamp: 0 } }]));
  assert.deepEqual(rebaseEvents([flat], now), []);
  // A 10-for-1 split reads as 100 tokens becoming 1,000.
  const split = { symbol: "NFLXx", paused: false, multiplier: 1, newMultiplier: 10, effectiveAt: now + 86_400_000 };
  assert.match(rebaseEvents([split], now)[0].line, /100 tokens will show as 1,000\./);

  const paused = parseMintState("MU", mint([{ extension: "pausableConfig", state: { authority: "x", paused: true } }]));
  assert.equal(paused.paused, true);
  const [pause] = pauseEvents([paused, nvda], now);
  assert.equal(pause.id, "pause:MU");
  assert.equal(pause.title, "Transfers paused");
  assert.equal(splitByTime([pause], now + 60_000).ahead.length, 1, "a pause in force stays on top");

  // A mint that could not be read says nothing, and a mint with no pause switch cannot be paused.
  assert.equal(parseMintState("NVDAx", null).paused, null);
  assert.deepEqual(pauseEvents([parseMintState("NVDAx", null)], now), []);
  assert.equal(parseMintState("NVDAx", mint([])).paused, false);
});

// ---------------------------------------------------------------------------------------------------------------
// Market days and the list

test("market days show for the next 90 days, with the early close at 1:00 PM ET", () => {
  const now = Date.parse("2026-10-17T18:00:00Z");
  const events = marketEvents(now);
  assert.deepEqual(
    events.map((event) => event.day),
    ["2026-11-26", "2026-11-27", "2026-12-24", "2026-12-25", "2027-01-01"],
  );
  const [thanksgiving, after] = events;
  assert.equal(thanksgiving.title, "US markets closed");
  assert.equal(thanksgiving.allDay, true);
  assert.equal(thanksgiving.at, Date.parse("2026-11-26T05:00:00Z"));
  assert.equal(thanksgiving.source.url, "https://www.nasdaqtrader.com/Trader.aspx?id=Calendar");
  assert.equal(after.title, "Early close at 1:00 PM ET");
  assert.equal(after.at, Date.parse("2026-11-27T18:00:00Z"));
  assert.equal(events[4].source.url, "https://www.nyse.com/markets/hours-calendars");
  // A day off stays "ahead" all day long.
  assert.equal(splitByTime([thanksgiving], Date.parse("2026-11-26T22:00:00Z")).ahead.length, 1);
});

test("the timeline groups by New York day and labels days plainly", () => {
  const today = "2026-10-17";
  assert.equal(dayTitle("2026-11-26", today), "Thu 26 Nov");
  assert.equal(dayTitle("2027-01-01", today), "Fri 1 Jan 2027");
  assert.equal(relativeDay("2026-10-17", today), "Today");
  assert.equal(relativeDay("2026-10-18", today), "Tomorrow");
  assert.equal(relativeDay("2026-10-16", today), "Yesterday");
  assert.equal(relativeDay("2026-11-26", today), "In 40 days");
  assert.equal(relativeDay("2026-10-14", today), "3 days ago");
  const events = marketEvents(Date.parse("2026-10-17T18:00:00Z"));
  assert.deepEqual(
    groupByDay([events[0], events[1], events[1]]).map((group) => group.events.length),
    [1, 2],
  );
});
