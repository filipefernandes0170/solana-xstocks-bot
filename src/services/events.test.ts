// /events and the event texts: the market calendar (same as the site's), the brief's notes, the site's filings,
// the texts, and the event log that keeps texts to one each and at most five a day.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

// The database module opens DATABASE_PATH when it loads: a throwaway file, never the bot's own.
process.env.TELEGRAM_BOT_TOKEN ??= "test-token-not-real";
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "par-events-")), "test.db");

const { MARKET_DAYS, dayTitle, marketNotes, nextTradingDay } = await import("./calendar.js");
const { EVENT_TEXTS_PER_DAY, eventsText, filingText, filingsToText, parseSiteFilings, pauseText, resumeText } = await import("./events.js");
const { briefText, helpText, startText } = await import("./messages.js");

const ET = (iso: string) => Date.parse(iso);

test("the bot's market calendar is the site's, day for day", async () => {
  const site = await import("../../site/src/lib/calendar.js");
  assert.deepEqual(MARKET_DAYS, site.MARKET_DAYS);
  // Both write a day the same way, whatever the engine's own month names ("Sep", not "Sept").
  const siteEvents = await import("../../site/src/lib/events.js");
  for (const date of ["2026-09-07", "2026-11-26", "2027-06-18"]) assert.equal(dayTitle(date), siteEvents.dayTitle(date, date));
  assert.equal(dayTitle("2026-09-07"), "Mon 7 Sep");
  assert.equal(nextTradingDay("2026-11-25"), "2026-11-27");
  assert.equal(nextTradingDay("2026-12-24"), "2026-12-28");
});

test("the brief says when Nasdaq is shut or closes early, and nothing on an ordinary day", () => {
  // Each "now" is 9:10 New York time, when the brief goes out.
  assert.deepEqual(marketNotes(ET("2026-10-20T13:10:00Z")), []);
  assert.deepEqual(marketNotes(ET("2026-11-25T14:10:00Z")), [
    "🏖 Nasdaq is closed tomorrow for Thanksgiving Day.",
    "⏰ Nasdaq closes early Fri 27 Nov, at 1:00 PM ET (Day after Thanksgiving).",
  ]);
  assert.deepEqual(marketNotes(ET("2026-11-27T14:10:00Z")), ["⏰ Nasdaq closes early today, at 1:00 PM ET (Day after Thanksgiving)."]);
  assert.deepEqual(marketNotes(ET("2026-09-04T13:10:00Z")), ["🏖 Nasdaq is closed Mon 7 Sep for Labor Day."]);
  assert.deepEqual(marketNotes(ET("2026-12-23T14:10:00Z")), ["⏰ Nasdaq closes early tomorrow, at 1:00 PM ET (Christmas Eve)."]);
  assert.deepEqual(marketNotes(ET("2026-12-24T14:10:00Z")), [
    "⏰ Nasdaq closes early today, at 1:00 PM ET (Christmas Eve).",
    "🏖 Nasdaq is closed tomorrow for Christmas Day.",
  ]);

  const brief = briefText([], ET("2026-11-25T14:10:00Z"), 20);
  assert.ok(brief.includes("🏖 Nasdaq is closed tomorrow for Thanksgiving Day."), brief);
  assert.ok(!briefText([], ET("2026-10-20T13:10:00Z"), 20).includes("🏖"));
});

const FILING = {
  id: "sec:0001628280-26-064366",
  kind: "filing",
  topic: "results",
  at: ET("2026-10-21T20:05:00Z"),
  allDay: false,
  day: "2026-10-21",
  symbols: ["TSLAx"],
  company: "Tesla",
  title: "Results",
  line: "Results of operations and financial condition.",
  tags: ["8-K · Item 2.02"],
  major: true,
  source: { label: "SEC filing", url: "https://www.sec.gov/Archives/edgar/data/1318605/000162828026064366/0001628280-26-064366-index.htm" },
};

test("only well-formed, timed SEC filings are taken from the site", () => {
  const answer = {
    events: [
      FILING,
      { ...FILING, id: "sec:0000000000-26-000002", allDay: true }, // time not read yet
      { ...FILING, id: "sec:0000000000-26-000003", source: { url: "https://evil.example/x" } },
      { ...FILING, id: "sec:0000000000-26-000004", symbols: ["NOPE"] },
      { ...FILING, id: "not-an-id" },
      { ...FILING, id: "sec:0000000000-26-000005", kind: "market" },
      { ...FILING, id: "sec:0000000000-26-000006", symbols: ["amd", "AMDX"] },
      null,
    ],
  };
  const filings = parseSiteFilings(answer);
  assert.ok(filings);
  assert.deepEqual(
    filings.map((filing) => filing.id),
    ["sec:0001628280-26-064366", "sec:0000000000-26-000006"],
  );
  assert.deepEqual(filings[1].symbols, ["AMD", "AMDx"], "symbols are matched to the bot's own");
  assert.equal(parseSiteFilings(null), null);
  assert.equal(parseSiteFilings({ events: "x" }), null);
});

test("only key filings of the last two hours are texted, oldest first", () => {
  const [tesla] = parseSiteFilings({ events: [FILING] }) ?? [];
  const now = tesla.at + 30 * 60_000;
  const older = { ...tesla, id: "sec:0000000000-26-000010", at: tesla.at - 60 * 60_000 };
  const stale = { ...tesla, id: "sec:0000000000-26-000011", at: now - 3 * 60 * 60_000 };
  const minor = { ...tesla, id: "sec:0000000000-26-000012", major: false };
  assert.deepEqual(
    filingsToText([tesla, stale, minor, older], now).map((filing) => filing.id),
    ["sec:0000000000-26-000010", "sec:0001628280-26-064366"],
  );
  assert.equal(EVENT_TEXTS_PER_DAY, 5);
});

function balanced(text: string) {
  for (const tag of ["b", "i", "code"]) assert.equal(text.split(`<${tag}>`).length, text.split(`</${tag}>`).length, `<${tag}> balanced`);
  assert.ok(!/&(?!amp;|lt;|gt;)/.test(text.replace(/href="[^"]*"/g, "")), "no bare ampersand");
  assert.ok(text.length < 4096);
}

test("the event texts say what happened, where it came from, and how to stop them", () => {
  const [tesla] = parseSiteFilings({ events: [FILING] }) ?? [];
  const text = filingText(tesla);
  assert.equal(
    text,
    "📄 <b>Tesla · Results</b>\nTSLAx · 8-K · Item 2.02 · Wed 21 Oct, 4:05 PM ET\nResults of operations and financial condition.\n\n<i>What the company filed at the SEC. Par does not say how the price will move. /events off stops these texts.</i>",
  );
  balanced(text);
  const pause = pauseText("NVDAx");
  assert.ok(pause.startsWith("⛔ <b>NVDAx transfers are paused</b>\nThe issuer has paused every transfer of NVDAx on chain."));
  balanced(pause);
  assert.ok(resumeText("MU").includes("<code>mu</code>"));
  balanced(resumeText("MU"));
});

test("/events lists the week ahead and the latest key filings", () => {
  const now = ET("2026-11-23T15:00:00Z"); // Monday of Thanksgiving week
  const [tesla] = parseSiteFilings({ events: [{ ...FILING, at: now - 86_400_000 }] }) ?? [];
  const text = eventsText({
    now,
    rebases: [
      { symbol: "NVDAx", rebase: { at: Math.floor((now + 2 * 86_400_000) / 1000), next: 1.002, current: 1.001, direction: "up" } },
      { symbol: "AAPLx", rebase: { at: Math.floor((now + 9 * 86_400_000) / 1000), next: 1.004, current: 1.003, direction: "up" } },
    ],
    paused: ["MU"],
    filings: [tesla],
    footer: "footer",
  });
  assert.ok(text.includes("🏖 Thu 26 Nov · closed for Thanksgiving Day"), text);
  assert.ok(text.includes("⏰ Fri 27 Nov · closes early, 1:00 PM ET (Day after Thanksgiving)"));
  assert.ok(text.includes("🔁 <b>NVDAx</b> · Wed 25 Nov, 15:00 UTC · balance up"));
  assert.ok(!text.includes("AAPLx"), "a change more than 7 days away is left out");
  assert.ok(text.includes("⛔ Paused on chain: <b>MU</b>."));
  assert.ok(text.includes('📄 <b>Tesla</b> · Results · Sun 22 Nov, 10:00 AM ET · <a href="https://www.sec.gov/Archives/edgar/data/1318605/'));
  assert.ok(text.endsWith("\n\nfooter"));
  balanced(text);

  const quiet = eventsText({ now: ET("2026-10-19T15:00:00Z"), rebases: [], paused: null, filings: null, footer: "" });
  assert.ok(quiet.includes("Usual hours every weekday."));
  assert.ok(quiet.includes("None set on chain."));
  assert.ok(quiet.includes("The mints could not be read right now."));
  assert.ok(quiet.includes("The filings could not be read right now."));
});

test("the welcome and /help mention /events", () => {
  assert.ok(startText("Ana").includes("/events · market days off, balance changes and SEC filings"));
  assert.ok(helpText().includes("/events on"));
});

test("each event is texted once per person, and filing texts stop at five a day", async () => {
  const db = await import("../db/index.js");
  db.upsertUser(1, "ana", "Ana");
  assert.equal(db.getUser(1)?.events, 1, "filing texts are on by default");
  db.setEvents(1, false);
  assert.equal(db.getUser(1)?.events, 0);
  db.setEvents(1, true);

  const day = "2026-10-21";
  assert.equal(db.eventAlreadySent(1, "sec:a"), false);
  db.markEventSent(1, "sec:a", day, true);
  db.markEventSent(1, "sec:a", day, true);
  assert.equal(db.eventAlreadySent(1, "sec:a"), true);
  assert.equal(db.eventsSentOn(1, day), 1, "the same filing counts once");
  db.markEventSent(1, "pause:MU:1", day, false);
  db.markEventSent(1, "sec:failed", day, false);
  assert.equal(db.eventsSentOn(1, day), 1, "pause alerts and failed sends do not count");
  assert.deepEqual(db.eventRecipients("pause:MU:1"), [1]);
  db.pruneEventLog("2026-10-22");
  assert.equal(db.eventAlreadySent(1, "sec:a"), false);

  assert.equal(db.getPauseStates().size, 0);
  db.savePauseState("MU", true, 100);
  db.savePauseState("MU", false, 200);
  assert.deepEqual(db.getPauseStates().get("MU"), { symbol: "MU", paused: 0, since: 200 });
});
