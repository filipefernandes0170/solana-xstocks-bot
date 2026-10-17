// Same company, two tokens: an xStock and a Backpack Securities token can track the same share, each with its own
// pool, so the same $1,000 buy can cost a different price. Pure, so the bot's texts and pings share it.

import type { DeskQuote } from "./desk.js";
import { THIN_POOL_USD, basisPct, buyUsable } from "./verdict.js";

/** A ping goes out when one token's $1,000 buy is this many points cheaper against Nasdaq than the other's. */
export const PAIR_POINTS = 0.5;

export type PairLeg = { quote: DeskQuote; gap: number | null; thinPool: number | null };
export type CompanyPair = {
  underlying: string;
  name: string;
  legs: PairLeg[];
  /** The leg with the lowest buy against Nasdaq, once every quotable leg has a fresh $1,000 buy. */
  cheaper: PairLeg | null;
  /** How many points cheaper `cheaper` is than the next leg. */
  points: number | null;
  /** The only leg whose pool can take a $1,000 buy, when the others are too thin. */
  onlyDeep: PairLeg | null;
};

/** Every company with more than one token, with each token's live $1,000 buy against the Nasdaq print. */
export function companyPairs(quotes: DeskQuote[], now: number): CompanyPair[] {
  const groups = new Map<string, DeskQuote[]>();
  for (const quote of quotes) {
    const list = groups.get(quote.underlying) ?? [];
    list.push(quote);
    groups.set(quote.underlying, list);
  }
  const pairs: CompanyPair[] = [];
  for (const [underlying, list] of groups) {
    if (list.length < 2) continue;
    const legs: PairLeg[] = list.map((quote) => {
      const buy = buyUsable(quote.buyAt ?? null, now) ? (quote.buyPrice ?? null) : null;
      const thin = quote.poolUsd != null && quote.poolUsd < THIN_POOL_USD ? quote.poolUsd : null;
      return { quote, gap: thin == null ? basisPct(buy, quote.stockPrice) : null, thinPool: thin };
    });
    const quotable = legs.filter((leg) => leg.thinPool == null);
    const allIn = quotable.length > 1 && quotable.every((leg) => leg.gap != null);
    const sorted = allIn ? [...quotable].sort((a, b) => (a.gap as number) - (b.gap as number)) : [];
    pairs.push({
      underlying,
      name: list[0].name,
      legs,
      cheaper: sorted[0] ?? null,
      points: sorted.length > 1 ? (sorted[1].gap as number) - (sorted[0].gap as number) : null,
      onlyDeep: quotable.length === 1 ? quotable[0] : null,
    });
  }
  return pairs;
}

/** The pairs worth a ping right now: both buys fresh and one at least PAIR_POINTS cheaper. */
export function pairsToPing(pairs: CompanyPair[]) {
  return pairs.filter((pair) => pair.cheaper != null && pair.points != null && pair.points >= PAIR_POINTS);
}
