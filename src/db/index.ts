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

export function setBell(telegramId: number, on: boolean) {
  db.prepare(`
    UPDATE users SET bell = ?, updated_at = strftime('%s','now')
    WHERE telegram_id = ?
  `).run(on ? 1 : 0, telegramId);
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
  bell: number;
};

export function listPingUsers(): UserRow[] {
  return db.prepare(`
    SELECT telegram_id, wallet, holder_wallet, bell
    FROM users
    WHERE wallet IS NOT NULL OR holder_wallet IS NOT NULL OR bell = 1
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
