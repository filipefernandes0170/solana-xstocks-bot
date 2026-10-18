// Daily backup of the bot's database: proven wallets, watch lists, alerts and settings. SQLite's own online backup
// copies it safely while the bot runs; the copy is checked (PRAGMA integrity_check) before it is kept, and the newest
// BACKUPS_KEPT days are kept in data/backups. They live on the same server, so they protect against a damaged or
// mistaken database; a disk snapshot (see README) protects against losing the server itself.

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { db } from "../db/index.js";
import { dataDir } from "./health.js";

export const BACKUPS_KEPT = 14;
const NAME = /^bot-\d{4}-\d{2}-\d{2}\.db$/;

export function backupDir() {
  return path.join(dataDir(), "backups");
}

/** "bot-2026-10-18.db", by UTC day. */
export function backupName(now: number) {
  return `bot-${new Date(now).toISOString().slice(0, 10)}.db`;
}

/** The backups to delete: every one past the newest `keep`. Other files in the folder are never touched. */
export function backupsToDelete(names: string[], keep = BACKUPS_KEPT) {
  return names
    .filter((name) => NAME.test(name))
    .sort()
    .reverse()
    .slice(keep);
}

/** Copies the database to data/backups/bot-<day>.db, checks the copy, and removes backups past the newest 14. */
export async function backupDatabase(now = Date.now()) {
  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, backupName(now));
  const part = `${file}.part`;
  removeWithSidecars(part);
  await db.backup(part);
  // The live database runs in WAL mode, and so does the copy. Turned into a plain single file (journal_mode DELETE)
  // before the check, it leaves no -wal or -shm files behind and restores by simply copying one file back.
  const copy = new Database(part, { fileMustExist: true });
  let result: unknown;
  try {
    copy.pragma("journal_mode = DELETE");
    result = copy.pragma("integrity_check", { simple: true });
  } finally {
    copy.close();
  }
  if (result !== "ok") {
    removeWithSidecars(part);
    throw new Error(`the copy failed its integrity check (${String(result)})`);
  }
  fs.renameSync(part, file);
  removeWithSidecars(part);
  for (const name of backupsToDelete(fs.readdirSync(dir))) removeWithSidecars(path.join(dir, name));
  return file;
}

/** A database file and any -wal, -shm or -journal file next to it. */
function removeWithSidecars(file: string) {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) fs.rmSync(`${file}${suffix}`, { force: true });
}

/** Today's backup, unless it already exists (after a restart). */
export async function backupIfMissing(now = Date.now()) {
  if (fs.existsSync(path.join(backupDir(), backupName(now)))) return null;
  return backupDatabase(now);
}
