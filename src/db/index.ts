import Database from "better-sqlite3";
import { config } from "../config/index.js";
import fs from "fs";
import path from "path";

const dir = path.dirname(config.dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

export const db: Database.Database = new Database(config.dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    telegram_id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    wallet TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    direction TEXT NOT NULL CHECK(direction IN ('up','down','both')),
    threshold_pct REAL NOT NULL,
    active INTEGER DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
  );

  CREATE TABLE IF NOT EXISTS price_snapshots (
    symbol TEXT NOT NULL,
    price REAL NOT NULL,
    ts INTEGER NOT NULL,
    PRIMARY KEY (symbol, ts)
  );

  CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(telegram_id);
  CREATE INDEX IF NOT EXISTS idx_snapshots_symbol_ts ON price_snapshots(symbol, ts);

  CREATE TABLE IF NOT EXISTS watches (
    telegram_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    PRIMARY KEY (telegram_id, symbol),
    FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
  );

  CREATE TABLE IF NOT EXISTS verdict_state (
    symbol TEXT PRIMARY KEY,
    verdict_id TEXT NOT NULL,
    gap REAL,
    open INTEGER NOT NULL,
    thin INTEGER NOT NULL,
    updated_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS bag_state (
    telegram_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    verdict_id TEXT NOT NULL,
    thin INTEGER NOT NULL,
    PRIMARY KEY (telegram_id, symbol),
    FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
  );

  CREATE TABLE IF NOT EXISTS bell_log (
    telegram_id INTEGER NOT NULL,
    day TEXT NOT NULL,
    PRIMARY KEY (telegram_id, day)
  );

  CREATE TABLE IF NOT EXISTS brief_log (
    telegram_id INTEGER NOT NULL,
    day TEXT NOT NULL,
    PRIMARY KEY (telegram_id, day)
  );

  CREATE TABLE IF NOT EXISTS size_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    usd INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    last_checked INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS pair_log (
    telegram_id INTEGER NOT NULL,
    pair TEXT NOT NULL,
    day TEXT NOT NULL,
    PRIMARY KEY (telegram_id, pair, day)
  );

  CREATE TABLE IF NOT EXISTS wallet_proofs (
    nonce TEXT PRIMARY KEY,
    telegram_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    used INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS event_log (
    telegram_id INTEGER NOT NULL,
    event_id TEXT NOT NULL,
    day TEXT NOT NULL,
    capped INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (telegram_id, event_id)
  );

  CREATE TABLE IF NOT EXISTS pause_state (
    symbol TEXT PRIMARY KEY,
    paused INTEGER NOT NULL,
    since INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS rebase_sent (
    telegram_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    effective_at INTEGER NOT NULL,
    PRIMARY KEY (telegram_id, symbol, effective_at)
  );
`);

function addColumn(table: string, column: string, type: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((col) => col.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

addColumn("users", "holder_wallet", "TEXT");
addColumn("users", "bell", "INTEGER DEFAULT 0");
addColumn("users", "brief", "INTEGER DEFAULT 0");
// The wallet a user proved is theirs by signing a message on the site (see services/walletProof.ts).
// Only this wallet counts for the holder features.
addColumn("users", "verified_wallet", "TEXT");
addColumn("users", "verified_at", "INTEGER");
addColumn("users", "pairs", "INTEGER DEFAULT 0");
// Filing texts (/events): on unless the user turns them off. Pause alerts have no switch.
addColumn("users", "events", "INTEGER DEFAULT 1");

export function upsertUser(telegramId: number, username?: string, firstName?: string) {
  db.prepare(`
    INSERT INTO users (telegram_id, username, first_name, updated_at)
    VALUES (?, ?, ?, strftime('%s','now'))
    ON CONFLICT(telegram_id) DO UPDATE SET
      username = excluded.username,
      first_name = excluded.first_name,
      updated_at = strftime('%s','now')
  `).run(telegramId, username ?? null, firstName ?? null);
}

export function setWallet(telegramId: number, wallet: string) {
  db.prepare(`
    UPDATE users SET
      wallet = ?,
      holder_wallet = COALESCE(holder_wallet, ?),
      updated_at = strftime('%s','now')
    WHERE telegram_id = ?
  `).run(wallet, wallet, telegramId);
}

export function setHolderWallet(telegramId: number, wallet: string) {
  db.prepare(`
    UPDATE users SET holder_wallet = ?, updated_at = strftime('%s','now')
    WHERE telegram_id = ?
  `).run(wallet, telegramId);
}

/** Saves a one-time proof code for this user (created_at in ms). */
export function createProof(telegramId: number, nonce: string, createdAt: number) {
  db.prepare(`INSERT INTO wallet_proofs (nonce, telegram_id, created_at) VALUES (?, ?, ?)`).run(nonce, telegramId, createdAt);
}

export type ProofRow = { nonce: string; telegram_id: number; created_at: number; used: number };

export function getProof(nonce: string) {
  return (db.prepare(`SELECT nonce, telegram_id, created_at, used FROM wallet_proofs WHERE nonce = ?`).get(nonce) as ProofRow | undefined) ?? null;
}

/** This user's newest code that has not been used. */
export function latestProof(telegramId: number) {
  return (
    (db
      .prepare(`SELECT nonce, telegram_id, created_at, used FROM wallet_proofs WHERE telegram_id = ? AND used = 0 ORDER BY created_at DESC LIMIT 1`)
      .get(telegramId) as ProofRow | undefined) ?? null
  );
}

export function markProofUsed(nonce: string) {
  db.prepare(`UPDATE wallet_proofs SET used = 1 WHERE nonce = ?`).run(nonce);
}

/** Codes older than a day are of no use; called when a new one is made. */
export function pruneProofs(before: number) {
  db.prepare(`DELETE FROM wallet_proofs WHERE created_at < ?`).run(before);
}

export function setVerifiedWallet(telegramId: number, wallet: string | null) {
  db.prepare(`
    UPDATE users SET verified_wallet = ?, verified_at = ?, updated_at = strftime('%s','now')
    WHERE telegram_id = ?
  `).run(wallet, wallet ? Date.now() : null, telegramId);
}

export type SizeAlertRow = { id: number; telegram_id: number; symbol: string; usd: number; last_checked: number };

export function addSizeAlert(telegramId: number, symbol: string, usd: number) {
  db.prepare(`INSERT INTO size_alerts (telegram_id, symbol, usd) VALUES (?, ?, ?)`).run(telegramId, symbol, usd);
}

export function listSizeAlerts(telegramId: number) {
  return db
    .prepare(`SELECT id, telegram_id, symbol, usd, last_checked FROM size_alerts WHERE telegram_id = ? AND active = 1 ORDER BY id`)
    .all(telegramId) as SizeAlertRow[];
}

/** Every active size alert, the least recently checked first. */
export function activeSizeAlerts() {
  return db
    .prepare(`SELECT id, telegram_id, symbol, usd, last_checked FROM size_alerts WHERE active = 1 ORDER BY last_checked, id`)
    .all() as SizeAlertRow[];
}

export function touchSizeAlert(id: number, at: number) {
  db.prepare(`UPDATE size_alerts SET last_checked = ? WHERE id = ?`).run(at, id);
}

export function deactivateSizeAlert(id: number) {
  db.prepare(`UPDATE size_alerts SET active = 0 WHERE id = ?`).run(id);
}

/** Turns off one name's size alerts, or all of this user's. */
export function clearSizeAlerts(telegramId: number, symbol?: string) {
  if (symbol) {
    db.prepare(`UPDATE size_alerts SET active = 0 WHERE telegram_id = ? AND symbol = ?`).run(telegramId, symbol);
    return;
  }
  db.prepare(`UPDATE size_alerts SET active = 0 WHERE telegram_id = ?`).run(telegramId);
}

export function setPairs(telegramId: number, on: boolean) {
  db.prepare(`UPDATE users SET pairs = ?, updated_at = strftime('%s','now') WHERE telegram_id = ?`).run(on ? 1 : 0, telegramId);
}

export function setEvents(telegramId: number, on: boolean) {
  db.prepare(`UPDATE users SET events = ?, updated_at = strftime('%s','now') WHERE telegram_id = ?`).run(on ? 1 : 0, telegramId);
}

export function eventAlreadySent(telegramId: number, eventId: string) {
  return !!db.prepare(`SELECT 1 AS ok FROM event_log WHERE telegram_id = ? AND event_id = ?`).get(telegramId, eventId);
}

/** `capped`: the text counts toward the daily limit (filing texts do; pause alerts and failed sends do not). */
export function markEventSent(telegramId: number, eventId: string, day: string, capped: boolean) {
  db.prepare(`INSERT OR IGNORE INTO event_log (telegram_id, event_id, day, capped) VALUES (?, ?, ?, ?)`).run(telegramId, eventId, day, capped ? 1 : 0);
}

/** Filing texts sent to this user on a New York day. */
export function eventsSentOn(telegramId: number, day: string) {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM event_log WHERE telegram_id = ? AND day = ? AND capped = 1`).get(telegramId, day) as { n: number };
  return row.n;
}

/** Everyone who got one event text, such as a pause alert (for the matching "resumed" text). */
export function eventRecipients(eventId: string) {
  return (db.prepare(`SELECT telegram_id FROM event_log WHERE event_id = ?`).all(eventId) as { telegram_id: number }[]).map((row) => row.telegram_id);
}

export function pruneEventLog(beforeDay: string) {
  db.prepare(`DELETE FROM event_log WHERE day < ?`).run(beforeDay);
}

export type PauseRow = { symbol: string; paused: number; since: number };

/** The last pause flag seen on chain for each token, and since when. */
export function getPauseStates() {
  return new Map((db.prepare(`SELECT symbol, paused, since FROM pause_state`).all() as PauseRow[]).map((row) => [row.symbol, row]));
}

export function savePauseState(symbol: string, paused: boolean, since: number) {
  db.prepare(`
    INSERT INTO pause_state (symbol, paused, since) VALUES (?, ?, ?)
    ON CONFLICT(symbol) DO UPDATE SET paused = excluded.paused, since = excluded.since
  `).run(symbol, paused ? 1 : 0, since);
}

export function pairAlreadySent(telegramId: number, pair: string, day: string) {
  return !!db.prepare(`SELECT 1 AS ok FROM pair_log WHERE telegram_id = ? AND pair = ? AND day = ?`).get(telegramId, pair, day);
}

export function markPairSent(telegramId: number, pair: string, day: string) {
  db.prepare(`INSERT OR IGNORE INTO pair_log (telegram_id, pair, day) VALUES (?, ?, ?)`).run(telegramId, pair, day);
}

export function setBell(telegramId: number, on: boolean) {
  db.prepare(`
    UPDATE users SET bell = ?, updated_at = strftime('%s','now')
    WHERE telegram_id = ?
  `).run(on ? 1 : 0, telegramId);
}

export function setBrief(telegramId: number, on: boolean) {
  db.prepare(`
    UPDATE users SET brief = ?, updated_at = strftime('%s','now')
    WHERE telegram_id = ?
  `).run(on ? 1 : 0, telegramId);
}

/** Users who asked for the morning brief. Whether it sends depends on the coin, checked when it goes out. */
export function listBriefUsers() {
  return db.prepare(`SELECT telegram_id, wallet, holder_wallet, verified_wallet, bell, pairs, events FROM users WHERE brief = 1`).all() as UserRow[];
}

/** Brief log rows use telegram_id 0 for the public channel post, and -1 for the Friday ranking post. */
export function briefAlreadySent(telegramId: number, day: string) {
  return !!db.prepare(`SELECT 1 AS ok FROM brief_log WHERE telegram_id = ? AND day = ?`).get(telegramId, day);
}

export function markBriefSent(telegramId: number, day: string) {
  db.prepare(`INSERT OR IGNORE INTO brief_log (telegram_id, day) VALUES (?, ?)`).run(telegramId, day);
}

export function getUser(telegramId: number) {
  return db.prepare(`SELECT * FROM users WHERE telegram_id = ?`).get(telegramId) as any;
}

export function addAlert(telegramId: number, symbol: string, direction: string, thresholdPct: number) {
  return db.prepare(`
    INSERT INTO alerts (telegram_id, symbol, direction, threshold_pct)
    VALUES (?, ?, ?, ?)
  `).run(telegramId, symbol.toUpperCase(), direction, thresholdPct);
}

export function getActiveAlerts(telegramId?: number) {
  if (telegramId) {
    return db.prepare(`SELECT * FROM alerts WHERE telegram_id = ? AND active = 1`).all(telegramId) as any[];
  }
  return db.prepare(`SELECT * FROM alerts WHERE active = 1`).all() as any[];
}

export function deactivateAlert(id: number) {
  db.prepare(`UPDATE alerts SET active = 0 WHERE id = ?`).run(id);
}

/** Turns off every active alert of one user; returns how many were on. */
export function clearAlerts(telegramId: number) {
  return db.prepare(`UPDATE alerts SET active = 0 WHERE telegram_id = ? AND active = 1`).run(telegramId).changes;
}

export function savePriceSnapshot(symbol: string, price: number) {
  const ts = Math.floor(Date.now() / 1000);
  db.prepare(`INSERT OR REPLACE INTO price_snapshots (symbol, price, ts) VALUES (?, ?, ?)`).run(symbol, price, ts);
}

export function getPriceHistory(symbol: string, minutes: number) {
  const since = Math.floor(Date.now() / 1000) - minutes * 60;
  return db.prepare(`
    SELECT price, ts FROM price_snapshots
    WHERE symbol = ? AND ts >= ?
    ORDER BY ts ASC
  `).all(symbol, since) as { price: number; ts: number }[];
}

export type UserRow = {
  telegram_id: number;
  wallet: string | null;
  holder_wallet: string | null;
  verified_wallet: string | null;
  bell: number;
  pairs: number;
  /** 1 unless the user turned filing texts off with /events off. */
  events: number;
};

export function listPingUsers(): UserRow[] {
  return db.prepare(`
    SELECT telegram_id, wallet, holder_wallet, verified_wallet, bell, pairs, events
    FROM users
    WHERE wallet IS NOT NULL OR verified_wallet IS NOT NULL OR bell = 1
  `).all() as UserRow[];
}

export function addWatch(telegramId: number, symbol: string) {
  db.prepare(`INSERT OR IGNORE INTO watches (telegram_id, symbol) VALUES (?, ?)`).run(telegramId, symbol);
}

export function removeWatch(telegramId: number, symbol?: string) {
  if (symbol) {
    db.prepare(`DELETE FROM watches WHERE telegram_id = ? AND symbol = ?`).run(telegramId, symbol);
    return;
  }
  db.prepare(`DELETE FROM watches WHERE telegram_id = ?`).run(telegramId);
}

export function listWatches(telegramId: number) {
  return db.prepare(`SELECT symbol FROM watches WHERE telegram_id = ? ORDER BY symbol`).all(telegramId) as {
    symbol: string;
  }[];
}

export function listAllWatches() {
  return db.prepare(`SELECT telegram_id, symbol FROM watches`).all() as {
    telegram_id: number;
    symbol: string;
  }[];
}

export type VerdictRow = {
  symbol: string;
  verdict_id: string;
  gap: number | null;
  open: number;
  thin: number;
};

export function getVerdictStates() {
  const rows = db.prepare(`SELECT symbol, verdict_id, gap, open, thin FROM verdict_state`).all() as VerdictRow[];
  return new Map(rows.map((row) => [row.symbol, row]));
}

export function saveVerdictState(row: VerdictRow) {
  db.prepare(`
    INSERT INTO verdict_state (symbol, verdict_id, gap, open, thin, updated_at)
    VALUES (?, ?, ?, ?, ?, strftime('%s','now'))
    ON CONFLICT(symbol) DO UPDATE SET
      verdict_id = excluded.verdict_id,
      gap = excluded.gap,
      open = excluded.open,
      thin = excluded.thin,
      updated_at = strftime('%s','now')
  `).run(row.symbol, row.verdict_id, row.gap, row.open, row.thin);
}

export function getBagState(telegramId: number) {
  return db.prepare(`
    SELECT symbol, verdict_id, thin FROM bag_state WHERE telegram_id = ?
  `).all(telegramId) as { symbol: string; verdict_id: string; thin: number }[];
}

export function saveBagState(telegramId: number, symbol: string, verdictId: string, thin: number) {
  db.prepare(`
    INSERT INTO bag_state (telegram_id, symbol, verdict_id, thin)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(telegram_id, symbol) DO UPDATE SET
      verdict_id = excluded.verdict_id,
      thin = excluded.thin
  `).run(telegramId, symbol, verdictId, thin);
}

export function deleteBagSymbol(telegramId: number, symbol: string) {
  db.prepare(`DELETE FROM bag_state WHERE telegram_id = ? AND symbol = ?`).run(telegramId, symbol);
}

export function bellAlreadySent(telegramId: number, day: string) {
  return !!db.prepare(`SELECT 1 AS ok FROM bell_log WHERE telegram_id = ? AND day = ?`).get(telegramId, day);
}

export function markBellSent(telegramId: number, day: string) {
  db.prepare(`INSERT OR IGNORE INTO bell_log (telegram_id, day) VALUES (?, ?)`).run(telegramId, day);
}

export function rebaseAlreadySent(telegramId: number, symbol: string, effectiveAt: number) {
  return !!db
    .prepare(`SELECT 1 AS ok FROM rebase_sent WHERE telegram_id = ? AND symbol = ? AND effective_at = ?`)
    .get(telegramId, symbol, effectiveAt);
}

export function markRebaseSent(telegramId: number, symbol: string, effectiveAt: number) {
  db.prepare(`INSERT OR IGNORE INTO rebase_sent (telegram_id, symbol, effective_at) VALUES (?, ?, ?)`).run(
    telegramId,
    symbol,
    effectiveAt,
  );
}
