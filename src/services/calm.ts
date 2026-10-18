// Calm texts: a name whose price sits on a verdict's edge (0.4% for Fair, 1% for Overnight and Wait) can change
// verdict every minute. These rules keep that from becoming a text every minute, without leaving anyone with an
// outdated picture. Pure, so the tests can play out a flip-flopping morning.
//
// - Fair pings (/watch): at most one per person per name per hour.
// - "Rich while closed" pings: at most one per person per name every 12 hours.
// - Bag notes: the bot remembers what it last told each person about each name. A change is texted at most once an
//   hour; if the name ends somewhere other than what they were told, one catch-up text follows when the hour is up,
//   and if it comes back to what they were told, nothing is sent at all.

import { hasSignal, type VerdictId } from "./verdict.js";

export const FAIR_PING_EVERY_MS = 60 * 60_000;
export const RICH_PING_EVERY_MS = 12 * 60 * 60_000;
export const BAG_TEXT_EVERY_MS = 60 * 60_000;

/** True when no ping of this kind went out within `everyMs`. */
export function pingAllowed(lastAt: number | null | undefined, now: number, everyMs: number) {
  return lastAt == null || !Number.isFinite(lastAt) || now - lastAt >= everyMs;
}

/** What the bot last told one person about one name in their bag. `told` null: nothing yet (a new name). */
export type BagTold = { told: VerdictId | null; toldAt: number; toldThin: boolean };

export type BagNews = {
  /** Send a bag note now. */
  send: boolean;
  /** The verdict they were told before, when the note is about a new verdict; null when it is only about a thin pool. */
  from: VerdictId | null;
  /** The note says the pool got thin. */
  thin: boolean;
  /** What to remember. */
  next: BagTold;
};

/**
 * The decision for one name in one bag, each round.
 * `holds`: the person holds $PAR (only holders get bag notes; for anyone else the memory just follows along, so a
 * later holder is never sent old news). `coveredElsewhere`: a /watch ping about this name just went out this round.
 */
export function bagNews(
  prev: BagTold | null,
  current: { verdictId: VerdictId; thin: boolean },
  now: number,
  options: { holds: boolean; coveredElsewhere: boolean },
): BagNews {
  const quiet = (next: BagTold): BagNews => ({ send: false, from: null, thin: false, next });

  // No real verdict this round (still loading, no print): nothing to say, and nothing forgotten.
  if (!hasSignal(current.verdictId)) return quiet(prev ?? { told: null, toldAt: 0, toldThin: false });

  // The first real verdict for this name is only remembered.
  if (!prev || prev.told == null) return quiet({ told: current.verdictId, toldAt: 0, toldThin: current.thin });

  if (!options.holds) return quiet({ told: current.verdictId, toldAt: prev.toldAt, toldThin: current.thin });
  if (options.coveredElsewhere) return quiet({ told: current.verdictId, toldAt: now, toldThin: current.thin });

  const verdictNews = current.verdictId !== prev.told;
  const thinNews = current.thin && !prev.toldThin;
  // A pool that is deep again is only remembered; it was never the point of a text.
  const toldThin = current.thin ? prev.toldThin : false;

  if ((verdictNews || thinNews) && pingAllowed(prev.toldAt, now, BAG_TEXT_EVERY_MS)) {
    return {
      send: true,
      from: verdictNews ? prev.told : null,
      thin: thinNews,
      next: { told: current.verdictId, toldAt: now, toldThin: current.thin },
    };
  }
  // News inside the hour waits; back to what they were told needs no text at all.
  return quiet({ told: prev.told, toldAt: prev.toldAt, toldThin });
}
