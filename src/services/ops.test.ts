// Calm texts, health alerts and the database backup.
import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

// The database module opens DATABASE_PATH when it loads: a throwaway file, never the bot's own.
process.env.TELEGRAM_BOT_TOKEN ??= "test-token-not-real";
process.env.DATABASE_PATH = path.join(mkdtempSync(path.join(tmpdir(), "par-ops-")), "bot.db");

const { BAG_TEXT_EVERY_MS, bagNews, pingAllowed, FAIR_PING_EVERY_MS } = await import("./calm.js");
const { ALERT_AFTER_MS, alertText, problemsIn, recoveryText, stepHealth, writeHeartbeat, dataDir } = await import("./health.js");
const { backupDatabase, backupDir, backupIfMissing, backupName, backupsToDelete } = await import("./backup.js");
const db = await import("../db/index.js");

const MIN = 60_000;
const T0 = Date.parse("2026-10-19T14:00:00Z");

test("a name flip-flopping on the 1% edge is texted once, not every minute", () => {
  let told = bagNews(null, { verdictId: "overnight", thin: false }, T0, { holds: true, coveredElsewhere: false });
  assert.equal(told.send, false, "the first reading is only remembered");
  let texts = 0;
  // Every minute for an hour: Wait, Overnight, Wait, Overnight…
  for (let minute = 1; minute <= 59; minute++) {
    const verdictId = minute % 2 === 1 ? "wait" : "overnight";
    const news = bagNews(told.next, { verdictId, thin: false }, T0 + minute * MIN, { holds: true, coveredElsewhere: false });
    if (news.send) {
      texts += 1;
      assert.equal(news.from, "overnight");
    }
    told = news;
  }
  assert.equal(texts, 1, "one text in the hour");
  // It ends on Wait, which is what they were told: nothing more after the hour.
  const after = bagNews(told.next, { verdictId: "wait", thin: false }, T0 + 2 * 60 * MIN, { holds: true, coveredElsewhere: false });
  assert.equal(after.send, false);
});

test("if a name ends somewhere other than what the person was told, one catch-up text follows the hour", () => {
  const start = bagNews(null, { verdictId: "overnight", thin: false }, T0, { holds: true, coveredElsewhere: false }).next;
  const first = bagNews(start, { verdictId: "wait", thin: false }, T0 + MIN, { holds: true, coveredElsewhere: false });
  assert.equal(first.send, true);
  // Back to Overnight 5 minutes later: inside the hour, so it waits.
  const back = bagNews(first.next, { verdictId: "overnight", thin: false }, T0 + 6 * MIN, { holds: true, coveredElsewhere: false });
  assert.equal(back.send, false);
  assert.equal(back.next.told, "wait", "still remembers what was said");
  // Still Overnight when the hour is up: one catch-up, from Wait.
  const catchUp = bagNews(back.next, { verdictId: "overnight", thin: false }, T0 + MIN + BAG_TEXT_EVERY_MS, { holds: true, coveredElsewhere: false });
  assert.equal(catchUp.send, true);
  assert.equal(catchUp.from, "wait");
  assert.equal(catchUp.next.told, "overnight");
});

test("thin pools, non-holders, loading verdicts and watch pings are handled without stray texts", () => {
  const start = bagNews(null, { verdictId: "near", thin: false }, T0, { holds: true, coveredElsewhere: false }).next;
  const thin = bagNews(start, { verdictId: "near", thin: true }, T0 + MIN, { holds: true, coveredElsewhere: false });
  assert.deepEqual([thin.send, thin.from, thin.thin], [true, null, true], "a pool turning thin is news on its own");
  const stillThin = bagNews(thin.next, { verdictId: "near", thin: true }, T0 + 2 * BAG_TEXT_EVERY_MS, { holds: true, coveredElsewhere: false });
  assert.equal(stillThin.send, false, "said once");
  const deep = bagNews(stillThin.next, { verdictId: "near", thin: false }, T0 + 3 * BAG_TEXT_EVERY_MS, { holds: true, coveredElsewhere: false });
  assert.equal(deep.send, false, "a deep pool again is not a text");
  assert.equal(deep.next.toldThin, false);

  // Someone without $PAR is never texted, and their memory follows along so they never get old news later.
  const outsider = bagNews(start, { verdictId: "wait", thin: false }, T0 + MIN, { holds: false, coveredElsewhere: false });
  assert.equal(outsider.send, false);
  assert.equal(outsider.next.told, "wait");

  // Still loading: nothing is said or forgotten.
  const loading = bagNews(start, { verdictId: "checking", thin: false }, T0 + MIN, { holds: true, coveredElsewhere: false });
  assert.equal(loading.send, false);
  assert.deepEqual(loading.next, start);

  // A /watch ping about the name already went out this round: the bag note stays quiet and counts as told.
  const covered = bagNews(start, { verdictId: "fair", thin: false }, T0 + MIN, { holds: true, coveredElsewhere: true });
  assert.equal(covered.send, false);
  assert.deepEqual(covered.next, { told: "fair", toldAt: T0 + MIN, toldThin: false });
});

test("Fair pings: at most one per name an hour", () => {
  assert.equal(pingAllowed(null, T0, FAIR_PING_EVERY_MS), true);
  assert.equal(pingAllowed(T0 - 59 * MIN, T0, FAIR_PING_EVERY_MS), false);
  assert.equal(pingAllowed(T0 - 60 * MIN, T0, FAIR_PING_EVERY_MS), true);
  db.upsertUser(7, "ana", "Ana");
  assert.equal(db.lastPing(7, "NVDAx", "fair"), null);
  db.markPing(7, "NVDAx", "fair", T0);
  db.markPing(7, "NVDAx", "fair", T0 + 5);
  assert.equal(db.lastPing(7, "NVDAx", "fair"), T0 + 5);
  assert.equal(db.lastPing(7, "NVDAx", "rich"), null, "kinds are separate");
});

test("what was told is kept in the database between rounds", () => {
  db.upsertUser(8, "bo", "Bo");
  db.saveBagState(8, "NVDAx", "wait", 0, { told: "overnight", toldAt: T0, toldThin: false });
  let row = db.getBagState(8)[0];
  assert.deepEqual([row.told, row.told_at, row.told_thin], ["overnight", T0, 0]);
  db.saveBagState(8, "NVDAx", "overnight", 1, { told: "overnight", toldAt: T0 + 9, toldThin: true });
  row = db.getBagState(8)[0];
  assert.deepEqual([row.verdict_id, row.thin, row.told, row.told_at, row.told_thin], ["overnight", 1, "overnight", T0 + 9, 1]);
});

test("health: a feed stuck for 10 minutes is texted once, and again when it is fixed", () => {
  const fine = { quotesAt: T0, printsAt: T0, mintsAt: T0, siteOk: true, filingsAt: T0 };
  assert.deepEqual(problemsIn(fine, T0 + 5 * MIN), []);
  assert.deepEqual(problemsIn({ ...fine, quotesAt: T0 - 11 * MIN }, T0), ["prices"]);
  assert.deepEqual(problemsIn({ ...fine, printsAt: null }, T0), ["nasdaq"]);
  assert.deepEqual(problemsIn({ ...fine, mintsAt: T0 - 31 * MIN }, T0), ["chain"]);
  assert.deepEqual(problemsIn({ ...fine, siteOk: false, filingsAt: null }, T0), ["site"], "a site that is down is one problem, not two");
  assert.deepEqual(problemsIn({ ...fine, filingsAt: T0 - 61 * MIN }, T0), ["filings"]);

  let state = new Map();
  let step = stepHealth(state, ["prices"], T0);
  assert.deepEqual([step.alerts.length, step.recoveries.length], [0, 0], "not yet: it may be a blip");
  step = stepHealth(step.state, ["prices"], T0 + 5 * MIN);
  assert.equal(step.alerts.length, 0);
  step = stepHealth(step.state, ["prices"], T0 + ALERT_AFTER_MS);
  assert.deepEqual(step.alerts, [{ problem: "prices", since: T0 }]);
  step = stepHealth(step.state, ["prices"], T0 + 15 * MIN);
  assert.equal(step.alerts.length, 0, "said once");
  step = stepHealth(step.state, [], T0 + 20 * MIN);
  assert.deepEqual(step.recoveries, ["prices"]);
  state = step.state;
  assert.equal(state.size, 0);
  // A blip that clears before 10 minutes is never mentioned.
  step = stepHealth(state, ["site"], T0);
  step = stepHealth(step.state, [], T0 + 5 * MIN);
  assert.deepEqual([step.alerts.length, step.recoveries.length], [0, 0]);

  assert.equal(alertText("nasdaq", Date.parse("2026-10-19T14:05:00Z")), "⚠️ Par: Nasdaq prints have not updated since 14:05 UTC.");
  assert.equal(recoveryText("site"), "✅ Par: onpar.site is answering again.");
});

test("the heartbeat file holds unix seconds next to the database", () => {
  writeHeartbeat(T0);
  assert.equal(fs.readFileSync(path.join(dataDir(), "heartbeat"), "utf8"), String(T0 / 1000));
});

test("the backup is a checked copy, one a day, and only the newest 14 are kept", async () => {
  db.upsertUser(9, "cy", "Cy");
  db.setVerifiedWallet(9, "5nToQHYHxYmZbm8m4gGGx9GW8bL4C9mYkJbUrRVnFvEq");
  const file = await backupDatabase(T0);
  assert.equal(path.basename(file), backupName(T0));
  assert.equal(backupName(T0), "bot-2026-10-19.db");
  // The copy opens on its own and holds the data.
  const Database = (await import("better-sqlite3")).default;
  const copy = new Database(file, { readonly: true });
  const user = copy.prepare("SELECT verified_wallet FROM users WHERE telegram_id = 9").get() as { verified_wallet: string };
  copy.close();
  assert.equal(user.verified_wallet, "5nToQHYHxYmZbm8m4gGGx9GW8bL4C9mYkJbUrRVnFvEq");
  assert.equal(await backupIfMissing(T0), null, "today's copy exists");
  // One plain file: no .part, and no -wal or -shm files left next to it, even after it was opened.
  assert.deepEqual(fs.readdirSync(backupDir()), ["bot-2026-10-19.db"]);

  // Rotation: 16 daily copies plus an unrelated file; the two oldest go, the other file stays.
  const names = Array.from({ length: 16 }, (_, i) => `bot-2026-10-${String(i + 1).padStart(2, "0")}.db`);
  assert.deepEqual(backupsToDelete([...names, "notes.txt"]), ["bot-2026-10-02.db", "bot-2026-10-01.db"]);
  for (const name of names) fs.writeFileSync(path.join(backupDir(), name), "x");
  await backupDatabase(T0 + 86_400_000);
  const left = fs.readdirSync(backupDir()).sort();
  assert.equal(left.length, 14, left.join(", "));
  assert.equal(left[0], "bot-2026-10-05.db");
  assert.equal(left[left.length - 1], "bot-2026-10-20.db");
});
