// "Since you last looked": the wallet's value now against what this device saw on an earlier visit. The earlier view is
// kept in this browser only (localStorage), never sent anywhere. The change is split in two, so a deposit never looks
// like a gain: price moves (the earlier amounts at today's prices) and balance changes (tokens added or removed, and
// rebases, which change a balance without anyone trading). Pure helpers plus the small storage wrapper.

import type { PortfolioLine } from "./types";

export const LAST_LOOK_KEY = "par-last-look";
/** An earlier view is compared from 10 minutes on; a newer one replaces it at most once an hour. */
export const LAST_LOOK_MIN_AGE_MS = 10 * 60_000;
export const LAST_LOOK_SAVE_EVERY_MS = 60 * 60_000;
/** At most this many wallets are remembered on one device; the oldest view goes first. */
const MAX_WALLETS = 5;

export type LookLine = { symbol: string; amount: number; price: number };
export type Snapshot = { at: number; total: number; lines: Record<string, LookLine> };

/** One key per position: the same symbol can appear as a stock token and as something else. */
export function lineKey(line: Pick<PortfolioLine, "kind" | "symbol" | "underlying">) {
  return `${line.kind}:${line.symbol}:${line.underlying}`;
}

export function snapshotOf(lines: PortfolioLine[], at: number): Snapshot {
  const out: Snapshot = { at, total: 0, lines: {} };
  for (const line of lines) {
    if (!(line.amount > 0) || !(line.usdValue >= 0) || !Number.isFinite(line.usdValue)) continue;
    out.lines[lineKey(line)] = { symbol: line.symbol, amount: line.amount, price: line.usdValue / line.amount };
    out.total += line.usdValue;
  }
  return out;
}

export type LookChange = {
  ageMs: number;
  totalThen: number;
  totalNow: number;
  /** The earlier amounts at today's prices, minus their earlier value. */
  priceMove: number;
  /** Tokens added or removed, and rebases: the rest of the change. */
  balanceMove: number;
  /** priceMove as a share of the earlier total, in percent; null when the earlier total was 0. */
  pricePct: number | null;
  /** The positions that moved most on price, largest first (at most two, each at least $0.01). */
  leaders: { symbol: string; move: number }[];
};

/** How the wallet changed between two views. priceMove + balanceMove always equals totalNow - totalThen. */
export function lookChange(then: Snapshot, now: Snapshot): LookChange {
  let priceMove = 0;
  let balanceMove = 0;
  const moves: { symbol: string; move: number }[] = [];
  for (const [key, old] of Object.entries(then.lines)) {
    const current = now.lines[key];
    if (current) {
      const move = old.amount * (current.price - old.price);
      priceMove += move;
      balanceMove += (current.amount - old.amount) * current.price;
      moves.push({ symbol: current.symbol, move });
    } else {
      balanceMove -= old.amount * old.price;
    }
  }
  for (const [key, current] of Object.entries(now.lines)) if (!then.lines[key]) balanceMove += current.amount * current.price;
  return {
    ageMs: now.at - then.at,
    totalThen: then.total,
    totalNow: now.total,
    priceMove,
    balanceMove,
    pricePct: then.total > 0 ? (priceMove / then.total) * 100 : null,
    leaders: moves
      .filter((entry) => Math.abs(entry.move) >= 0.01)
      .sort((a, b) => Math.abs(b.move) - Math.abs(a.move))
      .slice(0, 2),
  };
}

function validSnapshot(value: unknown): value is Snapshot {
  const snap = value as Snapshot | null;
  if (!snap || typeof snap !== "object" || !Number.isFinite(snap.at) || !Number.isFinite(snap.total) || !snap.lines || typeof snap.lines !== "object") return false;
  return Object.values(snap.lines).every(
    (line) => !!line && typeof line.symbol === "string" && Number.isFinite(line.amount) && Number.isFinite(line.price),
  );
}

function readAll(): Record<string, Snapshot> {
  try {
    const raw = JSON.parse(localStorage.getItem(LAST_LOOK_KEY) || "{}") as Record<string, unknown>;
    const out: Record<string, Snapshot> = {};
    for (const [wallet, snap] of Object.entries(raw ?? {})) if (validSnapshot(snap)) out[wallet] = snap;
    return out;
  } catch {
    return {};
  }
}

/** The earlier view of this wallet on this device, if any. */
export function readLastLook(wallet: string): Snapshot | null {
  return readAll()[wallet] ?? null;
}

/** Remembers this view, keeping at most MAX_WALLETS wallets. Storage can refuse (private windows): then nothing is kept. */
export function saveLastLook(wallet: string, snap: Snapshot) {
  try {
    const all = readAll();
    all[wallet] = snap;
    const kept = Object.entries(all)
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, MAX_WALLETS);
    localStorage.setItem(LAST_LOOK_KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Nothing is kept.
  }
}

/** Forgets one wallet's view (with "Forget" or "Disconnect"). */
export function forgetLastLook(wallet: string) {
  try {
    const all = readAll();
    delete all[wallet];
    localStorage.setItem(LAST_LOOK_KEY, JSON.stringify(all));
  } catch {
    // Nothing was kept.
  }
}

/** Whether to replace the stored view with this one: none yet, or the stored one is an hour old. */
export function shouldSave(previous: Snapshot | null, now: number) {
  return previous == null || now - previous.at >= LAST_LOOK_SAVE_EVERY_MS;
}

/** "3 hours ago", "2 days ago", "25 minutes ago". */
export function agoWords(ms: number) {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} days ago`;
}
