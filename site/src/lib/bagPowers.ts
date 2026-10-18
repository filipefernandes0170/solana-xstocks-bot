// "Who can freeze your bag": the issuer powers of every token in a wallet, added up by value. Each mint is read on
// Solana (server/powers.ts) and judged with the same rules as a name page (lib/issuer.ts). Native SOL has no mint and
// no issuer. Pure, so the page and the tests share it. These are powers, not events: Par does not say they will be used.

import type { PowerId } from "./issuer";
import { ISSUER_LABEL, TOKEN_BY_MINT, TOKEN_BY_SYMBOL, USDC_MINT, USDT_MINT } from "./tokens";
import type { PortfolioLine } from "./types";

const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** What one mint allows, as read on chain. `read: false` when the account could not be read as a mint. */
export type MintPowers = { mint: string; read: boolean; on: PowerId[]; pausedNow: boolean };
export type BagPowersResult = { ok: true; at: number; mints: MintPowers[] } | { ok: false; message: string };

/** Powers that can stop a holder's tokens moving: freezing an account, pausing every transfer, a transfer rule. */
const STOP: PowerId[] = ["freeze", "pause", "hook", "frozenStart"];

/** Native SOL: no mint, so no issuer can freeze or move it. */
export function isNativeSol(line: Pick<PortfolioLine, "kind" | "symbol" | "underlying">) {
  return line.kind === "Crypto" && line.symbol === "SOL" && line.underlying === "SOL";
}

/** The mint behind a wallet line, or null (native SOL, or a line whose mint is not known). */
export function lineMint(line: Pick<PortfolioLine, "kind" | "symbol" | "underlying">): string | null {
  if (isNativeSol(line)) return null;
  if (line.kind === "Stock" || line.kind === "ETF") return TOKEN_BY_SYMBOL.get(line.symbol)?.mint ?? null;
  if (line.kind === "Cash") return line.symbol === "USDC" ? USDC_MINT : line.symbol === "USDT" ? USDT_MINT : null;
  return MINT.test(line.underlying) ? line.underlying : null;
}

/** Who issues a line's token, in words: xStocks or Backpack Securities for the stock tokens, Circle and Tether for the cash. */
export function issuerLabel(line: Pick<PortfolioLine, "kind" | "symbol" | "underlying">) {
  if (isNativeSol(line)) return "No issuer (SOL)";
  const mint = lineMint(line);
  const token = mint ? TOKEN_BY_MINT.get(mint) : undefined;
  if (token) return ISSUER_LABEL[token.issuer];
  if (mint === USDC_MINT) return "Circle (USDC)";
  if (mint === USDT_MINT) return "Tether (USDT)";
  return "Other tokens";
}

/** Short words for a power, most serious first. */
export const POWER_WORDS: Record<PowerId, string> = {
  seize: "move or burn tokens",
  freeze: "freeze accounts",
  pause: "pause transfers",
  hook: "transfer rules",
  frozenStart: "new accounts start frozen",
  multiplier: "change the multiplier",
  mint: "create tokens",
};
const ORDER: PowerId[] = ["seize", "freeze", "pause", "hook", "frozenStart", "multiplier", "mint"];

/** `mixed` when the tokens in a group do not all carry the same powers (so `powers` is what at least one of them carries). */
export type PowerGroup = { label: string; symbols: string[]; usd: number; powers: PowerId[]; mixed: boolean };

export type BagPowerSummary = {
  total: number;
  /** Value whose issuer can freeze it, pause it or refuse its transfers. */
  stoppable: number;
  /** Value whose issuer can move or burn it out of the wallet (a permanent delegate). */
  seizable: number;
  /** Value no issuer can stop or move: native SOL, and mints without any of those powers. */
  untouchable: number;
  /** Value whose mint could not be read (or is not known): not judged. */
  unread: number;
  /** Lines whose token has transfers paused right now. */
  pausedNow: string[];
  groups: PowerGroup[];
};

/** Adds up a wallet's lines by what their issuers can do. Lines worth nothing are left out. */
export function bagPowers(lines: PortfolioLine[], mints: MintPowers[]): BagPowerSummary {
  const byMint = new Map(mints.map((entry) => [entry.mint, entry]));
  const summary: BagPowerSummary = { total: 0, stoppable: 0, seizable: 0, untouchable: 0, unread: 0, pausedNow: [], groups: [] };
  const groups = new Map<string, PowerGroup>();
  const firstSet = new Map<string, string>();
  for (const line of lines) {
    if (!(line.usdValue > 0)) continue;
    summary.total += line.usdValue;
    const native = isNativeSol(line);
    const mint = lineMint(line);
    const read = native ? { on: [] as PowerId[], pausedNow: false } : mint ? byMint.get(mint) : undefined;
    if (!read || (!native && !(read as MintPowers).read)) {
      summary.unread += line.usdValue;
      continue;
    }
    const stoppable = read.on.some((power) => STOP.includes(power));
    const seizable = read.on.includes("seize");
    if (stoppable) summary.stoppable += line.usdValue;
    if (seizable) summary.seizable += line.usdValue;
    if (!stoppable && !seizable) summary.untouchable += line.usdValue;
    if (read.pausedNow) summary.pausedNow.push(line.symbol);
    const label = issuerLabel(line);
    const group = groups.get(label) ?? { label, symbols: [], usd: 0, powers: [], mixed: false };
    const set = ORDER.filter((power) => read.on.includes(power)).join(",");
    if (!firstSet.has(label)) firstSet.set(label, set);
    else if (firstSet.get(label) !== set) group.mixed = true;
    group.symbols.push(line.symbol);
    group.usd += line.usdValue;
    for (const power of read.on) if (!group.powers.includes(power)) group.powers.push(power);
    groups.set(label, group);
  }
  summary.groups = [...groups.values()]
    .map((group) => ({ ...group, powers: ORDER.filter((power) => group.powers.includes(power)) }))
    .sort((a, b) => b.usd - a.usd);
  return summary;
}

/** The mints to read for a wallet: every line's mint, once, at most `limit` (the largest lines first). */
export function mintsToRead(lines: PortfolioLine[], limit = 40) {
  const out: string[] = [];
  for (const line of [...lines].sort((a, b) => b.usdValue - a.usdValue)) {
    const mint = lineMint(line);
    if (mint && !out.includes(mint)) out.push(mint);
    if (out.length >= limit) break;
  }
  return out;
}
