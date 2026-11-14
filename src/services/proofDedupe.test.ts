// A database from before 14 Nov 2026 could hold one proven wallet on several Telegram accounts. When the bot opens
// it, the newest proof keeps the wallet, and from then on the database itself refuses a second owner.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";

process.env.TELEGRAM_BOT_TOKEN ??= "test-token-not-real";
const file = path.join(mkdtempSync(path.join(tmpdir(), "par-dedupe-")), "bot.db");
process.env.DATABASE_PATH = file;

// The database as an older bot left it: the same wallet proven by three accounts, and one account with its own.
const old = new Database(file);
old.exec(`
  CREATE TABLE users (
    telegram_id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    wallet TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now')),
    verified_wallet TEXT,
    verified_at INTEGER
  );
  INSERT INTO users (telegram_id, verified_wallet, verified_at) VALUES
    (1, 'Shared', 1000),
    (2, 'Shared', 3000),
    (3, 'Shared', 2000),
    (4, 'Own', 500),
    (5, NULL, NULL),
    (6, 'Tie', 700),
    (7, 'Tie', 700);
`);
old.close();

const db = await import("../db/index.js");

test("on opening, each proven wallet stays with the account that proved it last", () => {
  const wallet = (id: number) => db.getUser(id)?.verified_wallet ?? null;
  assert.equal(wallet(1), null);
  assert.equal(wallet(2), "Shared", "the newest proof keeps it");
  assert.equal(wallet(3), null);
  assert.equal(wallet(4), "Own", "a wallet with one owner is left alone");
  assert.equal(wallet(5), null);
  assert.deepEqual([wallet(6), wallet(7)], [null, "Tie"], "the same moment: one of them keeps it, never both");
});

test("from then on the database refuses a second owner", () => {
  assert.throws(() => db.setVerifiedWallet(5, "Shared"), /UNIQUE/);
  // The bot's own order (take it from the others, then save) works.
  assert.deepEqual(db.releaseVerifiedWallet("Shared", 5), [2]);
  db.setVerifiedWallet(5, "Shared");
  assert.equal(db.getUser(5)?.verified_wallet, "Shared");
  assert.equal(db.getUser(2)?.verified_wallet ?? null, null);
  // Many accounts with no proven wallet are fine.
  db.setVerifiedWallet(5, null);
  assert.equal(db.getUser(5)?.verified_wallet ?? null, null);
});
