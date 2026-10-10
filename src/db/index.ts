import Database from "better-sqlite3";
import { config } from "../config/index.js";
import fs from "fs";
import path from "path";

const dir = path.dirname(config.dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

export const db = new Database(config.dbPath);

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
`);

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
    UPDATE users SET wallet = ?, updated_at = strftime('%s','now')
    WHERE telegram_id = ?
  `).run(wallet, telegramId);
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
