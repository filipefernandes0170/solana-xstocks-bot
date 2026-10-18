import { Telegraf } from "telegraf";
import type { InlineKeyboardMarkup } from "telegraf/types";
import { config } from "../config/index.js";
import {
  activeSizeAlerts,
  bellAlreadySent,
  eventAlreadySent,
  eventRecipients,
  eventsSentOn,
  getPauseStates,
  markEventSent,
  pruneEventLog,
  savePauseState,
  briefAlreadySent,
  deactivateSizeAlert,
  markPairSent,
  pairAlreadySent,
  touchSizeAlert,
  listBriefUsers,
  markBriefSent,
  deleteBagSymbol,
  getBagState,
  getVerdictStates,
  listAllWatches,
  listPingUsers,
  markBellSent,
  markRebaseSent,
  rebaseAlreadySent,
  saveBagState,
  saveVerdictState,
  type UserRow,
} from "../db/index.js";
import { getTokenizedStockHoldings } from "./solana.js";
import { buysReady, getDeskQuotes, pauseFlags, sizeQuote, type DeskQuote } from "./desk.js";
import { addDays } from "./calendar.js";
import {
  EVENT_TEXTS_PER_DAY,
  fetchSiteFilings,
  filingKeyboard,
  filingText,
  filingsToText,
  mintKeyboard,
  pauseText,
  resumeText,
} from "./events.js";
import { SYMBOL_TO_TOKEN } from "../config/tokens.js";
import { holderWallet, walletsHolding } from "./holder.js";
import {
  bagText,
  bellText,
  briefKeyboard,
  briefTeaser,
  briefText,
  buyKeyboard,
  fairText,
  pairAlertText,
  rebaseText,
  richText,
  sizeAlertText,
  teaserKeyboard,
  weekKeyboard,
  weekText,
} from "./messages.js";
import { companyPairs, pairsToPing } from "./pairs.js";
import { fetchRanking } from "./ranking.js";
import { fetchSupply } from "./venues.js";
import {
  etDay,
  etParts,
  fairFlip,
  hasSignal,
  inBellWindow,
  inBriefWindow,
  inWeekWindow,
  basisPct,
  buyUsable,
  isPreMarket,
  isSessionOpen,
  sizeAlertHit,
  sizeWorthQuoting,
  rebaseDue,
  richWhileClosed,
  toSnap,
  tradeVerdict,
  type DeskSnap,
  type VerdictId,
} from "./verdict.js";

const TITLES: Record<VerdictId, string> = {
  fair: "Fair",
  overnight: "Overnight",
  wait: "Wait",
  near: "Near",
  split: "Split",
  checking: "Checking",
  unpriced: "No print",
};

let running = false;
const bagCache = new Map<string, { at: number; symbols: Map<string, number> }>();

async function send(bot: Telegraf, chatId: number | string, text: string, markup?: InlineKeyboardMarkup) {
  await bot.telegram.sendMessage(chatId, text, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(markup ? { reply_markup: markup } : {}),
  });
}

function watches(symbols: string[], symbol: string) {
  return symbols.includes("ALL") || symbols.includes(symbol);
}

async function bagHoldings(wallet: string) {
  const cached = bagCache.get(wallet);
  if (cached && Date.now() - cached.at < 90_000) return cached.symbols;
  const holdings = await getTokenizedStockHoldings(wallet);
  const symbols = new Map(holdings.map((holding) => [holding.symbol, holding.amount]));
  bagCache.set(wallet, { at: Date.now(), symbols });
  return symbols;
}

async function sendBag(
  bot: Telegraf,
  user: UserRow,
  quotes: Map<string, DeskQuote>,
  snaps: Map<string, DeskSnap>,
  holds: boolean,
  alreadyTold: Set<string>,
) {
  if (!user.wallet) return;
  const owned = await bagHoldings(user.wallet);
  const previous = new Map(getBagState(user.telegram_id).map((row) => [row.symbol, row]));
  if (owned.size === 0) return;
  const changes: { quote: DeskQuote; from: string; thin: boolean; verdict: ReturnType<typeof tradeVerdict> }[] = [];

  for (const [symbol, amount] of owned) {
    if (amount <= 0) continue;
    const quote = quotes.get(symbol);
    const snap = snaps.get(symbol);
    if (!quote || !snap) continue;
    const prev = previous.get(symbol);
    if (!hasSignal(snap.verdictId)) {
      if (!prev) saveBagState(user.telegram_id, symbol, snap.verdictId, 0);
      continue;
    }
    const verdictChanged = !!prev && hasSignal(prev.verdict_id as VerdictId) && prev.verdict_id !== snap.verdictId;
    const becameThin = !!prev && prev.thin === 0 && snap.thin;
    saveBagState(user.telegram_id, symbol, snap.verdictId, snap.thin ? 1 : 0);
    if (!holds || alreadyTold.has(symbol) || !prev) continue;
    if (!verdictChanged && !becameThin) continue;
    changes.push({
      quote,
      from: verdictChanged ? TITLES[prev.verdict_id as VerdictId] : "",
      thin: becameThin,
      verdict: tradeVerdict(quote),
    });
  }

  for (const row of previous.values()) {
    if (!owned.has(row.symbol)) deleteBagSymbol(user.telegram_id, row.symbol);
  }

  if (!holds || changes.length === 0) return;
  const buyable = changes.filter((change) => change.verdict.id === "fair" || change.verdict.id === "overnight");
  await send(bot, user.telegram_id, bagText(changes), buyKeyboard(buyable.map((change) => change.quote)));
}

/**
 * The morning brief, for $PAR holders who turned it on: weekdays between 9:00 and 9:29 New York time, once a day,
 * and only when Nasdaq reports pre-market (on market holidays it says Closed, so nothing goes out).
 * With BRIEF_CHANNEL_ID set, a short public teaser goes to that channel too.
 */
async function sendBriefs(bot: Telegraf, quotes: DeskQuote[], now: number) {
  if (!inBriefWindow(now)) return;
  if (!isPreMarket(quotes.find((quote) => quote.marketState)?.marketState ?? null)) return;
  const day = etDay(now);
  const wall = etParts(now);
  const minutesToOpen = Math.max(1, 9 * 60 + 30 - (wall.hour * 60 + wall.minute));

  if (config.briefChannelId && !briefAlreadySent(0, day)) {
    // Marked before sending, so a refusal (for example, the bot is not an admin there) is not retried every minute.
    markBriefSent(0, day);
    try {
      await send(bot, config.briefChannelId, briefTeaser(quotes, now), teaserKeyboard());
    } catch (err) {
      console.warn("Brief channel post failed:", (err as Error).message);
    }
  }

  const users = listBriefUsers().filter((user) => !briefAlreadySent(user.telegram_id, day));
  if (users.length === 0) return;
  const holders = await walletsHolding(users.map(holderWallet).filter(Boolean));
  const text = briefText(quotes, now, minutesToOpen);
  for (const user of users) {
    const wallet = holderWallet(user);
    if (!wallet || !holders.has(wallet)) continue;
    try {
      await send(bot, user.telegram_id, text, briefKeyboard());
      markBriefSent(user.telegram_id, day);
    } catch (err) {
      console.warn("Brief failed", user.telegram_id, (err as Error).message);
    }
  }
}

// Size alerts quote Jupiter at the user's size, so they are rationed: at most this many quotes a minute, and each
// alert at most once every SIZE_RECHECK_MS. The background $1,000 rotation shares the same limiter.
const SIZE_CHECKS_PER_RUN = 2;
const SIZE_RECHECK_MS = 5 * 60_000;

/** /sizealert: one-off texts when a holder's order size is at the real price. Holders only; Nasdaq must be open. */
async function sendSizeAlerts(bot: Telegraf, bySymbol: Map<string, DeskQuote>, holderIds: Set<number>, now: number) {
  let quoted = 0;
  for (const alert of activeSizeAlerts()) {
    if (quoted >= SIZE_CHECKS_PER_RUN) break;
    if (!holderIds.has(alert.telegram_id) || now - alert.last_checked < SIZE_RECHECK_MS) continue;
    const quote = bySymbol.get(alert.symbol);
    if (!quote || !isSessionOpen(quote.marketState)) continue;
    touchSizeAlert(alert.id, now);
    const buyGap = basisPct(buyUsable(quote.buyAt ?? null, now) ? (quote.buyPrice ?? null) : null, quote.stockPrice);
    if (!sizeWorthQuoting(buyGap)) continue;
    quoted += 1;
    const result = await sizeQuote(alert.symbol, alert.usd);
    if (!result.ok) continue;
    if (!sizeAlertHit(basisPct(result.price, result.quote.stockPrice), isSessionOpen(result.quote.marketState))) continue;
    try {
      await send(bot, alert.telegram_id, sizeAlertText(result), buyKeyboard([result.quote]));
      deactivateSizeAlert(alert.id);
    } catch (err) {
      console.warn("Size alert failed", alert.telegram_id, (err as Error).message);
    }
  }
}

/** /pairs on: a text when one token of a company is PAIR_POINTS cheaper than the other. Holders; once a day per company. */
async function sendPairAlerts(bot: Telegraf, quotes: DeskQuote[], users: UserRow[], holderIds: Set<number>, now: number, day: string) {
  const due = pairsToPing(companyPairs(quotes, now));
  if (due.length === 0) return;
  for (const user of users) {
    if (!user.pairs || !holderIds.has(user.telegram_id)) continue;
    for (const pair of due) {
      if (!pair.cheaper || pairAlreadySent(user.telegram_id, pair.underlying, day)) continue;
      try {
        await send(bot, user.telegram_id, pairAlertText(pair), buyKeyboard([pair.cheaper.quote]));
        markPairSent(user.telegram_id, pair.underlying, day);
      } catch (err) {
        console.warn("Pair ping failed", user.telegram_id, (err as Error).message);
      }
    }
  }
}

/** With BRIEF_CHANNEL_ID set: the week's ranking goes to that channel once, on Friday after the close. */
async function sendWeekly(bot: Telegraf, now: number) {
  if (!config.briefChannelId || !inWeekWindow(now)) return;
  const day = etDay(now);
  if (briefAlreadySent(-1, day)) return;
  const ranking = await fetchRanking();
  if (!ranking || ranking.rows.length === 0) return;
  const [supply, quotes] = await Promise.all([fetchSupply(), getDeskQuotes({ allowStale: true }).catch(() => [])]);
  const prices = new Map(quotes.filter((quote) => quote.usdPrice != null).map((quote) => [quote.symbol, quote.usdPrice as number]));
  // Marked before sending, so a refusal (the bot is not an admin there) is not retried every minute.
  markBriefSent(-1, day);
  try {
    await send(bot, config.briefChannelId, weekText(ranking, supply, prices), weekKeyboard());
  } catch (err) {
    console.warn("Ranking channel post failed:", (err as Error).message);
  }
}

let eventsRunning = false;
let lastPrune = 0;

/**
 * Every few minutes, for proven $PAR holders: a pause alert the moment a token they hold or watch stops transfers
 * on chain (and a "resumed" text after), then key SEC filings for those names, at most EVENT_TEXTS_PER_DAY a day.
 * The pause state is tracked even when no one is listening, so an old change is never sent late.
 */
export async function checkEvents(bot: Telegraf) {
  if (eventsRunning) return;
  eventsRunning = true;
  try {
    const now = Date.now();
    const day = etDay(now);
    const users = listPingUsers();
    const proven = users.filter((user) => holderWallet(user));
    const holding = await walletsHolding(proven.map(holderWallet));
    const holders = proven.filter((user) => holding.has(holderWallet(user)));

    const watched = new Map<number, string[]>();
    for (const watch of listAllWatches()) watched.set(watch.telegram_id, [...(watched.get(watch.telegram_id) ?? []), watch.symbol]);
    // The names a holder follows: the watch list, and the stock tokens in the bag wallet and the proven wallet.
    // Read only when something is due, and once per run.
    const follows = new Map<number, { all: boolean; symbols: Set<string> }>();
    const followed = async (user: UserRow) => {
      const known = follows.get(user.telegram_id);
      if (known) return known;
      const list = watched.get(user.telegram_id) ?? [];
      const result = { all: list.includes("ALL"), symbols: new Set(list.filter((symbol) => symbol !== "ALL")) };
      if (!result.all) {
        for (const wallet of new Set([user.wallet, user.verified_wallet].filter((w): w is string => !!w))) {
          try {
            for (const [symbol, amount] of await bagHoldings(wallet)) if (amount > 0) result.symbols.add(symbol);
          } catch (err) {
            console.warn("Event bag read failed", user.telegram_id, (err as Error).message);
          }
        }
      }
      follows.set(user.telegram_id, result);
      return result;
    };

    await pausePings(bot, holders, followed, now, day).catch((err) => console.warn("Pause alerts failed:", (err as Error).message));
    await filingPings(bot, holders, followed, now, day).catch((err) => console.warn("Filing texts failed:", (err as Error).message));
    if (now - lastPrune > 24 * 3600_000) {
      pruneEventLog(addDays(day, -30));
      lastPrune = now;
    }
  } catch (err) {
    console.error("Event check failed:", err);
  } finally {
    eventsRunning = false;
  }
}

type Followed = (user: UserRow) => Promise<{ all: boolean; symbols: Set<string> }>;

async function pausePings(bot: Telegraf, holders: UserRow[], followed: Followed, now: number, day: string) {
  const flags = await pauseFlags();
  const states = getPauseStates();
  for (const [symbol, paused] of flags) {
    if (paused == null) continue;
    const row = states.get(symbol);
    // The first reading only records the state: nothing changed that anyone was told about.
    if (!row) {
      savePauseState(symbol, paused, now);
      continue;
    }
    if ((row.paused === 1) === paused) continue;
    savePauseState(symbol, paused, now);
    const mint = SYMBOL_TO_TOKEN.get(symbol.toUpperCase())?.mint;
    if (paused) {
      const eventId = `pause:${symbol}:${now}`;
      for (const user of holders) {
        const follows = await followed(user);
        if (!follows.all && !follows.symbols.has(symbol)) continue;
        try {
          await send(bot, user.telegram_id, pauseText(symbol), mint ? mintKeyboard(mint) : undefined);
        } catch (err) {
          console.warn("Pause alert failed", user.telegram_id, (err as Error).message);
        }
        markEventSent(user.telegram_id, eventId, day, false);
      }
    } else {
      // Everyone told about the pause hears that it lifted, holder or not.
      for (const telegramId of eventRecipients(`pause:${symbol}:${row.since}`)) {
        try {
          await send(bot, telegramId, resumeText(symbol));
        } catch (err) {
          console.warn("Resume text failed", telegramId, (err as Error).message);
        }
        markEventSent(telegramId, `resume:${symbol}:${now}`, day, false);
      }
    }
  }
}

async function filingPings(bot: Telegraf, holders: UserRow[], followed: Followed, now: number, day: string) {
  const listeners = holders.filter((user) => user.events !== 0);
  if (listeners.length === 0) return;
  const filings = await fetchSiteFilings();
  if (!filings) return;
  const due = filingsToText(filings, now);
  if (due.length === 0) return;
  for (const user of listeners) {
    let sent = eventsSentOn(user.telegram_id, day);
    for (const filing of due) {
      if (sent >= EVENT_TEXTS_PER_DAY) break;
      if (eventAlreadySent(user.telegram_id, filing.id)) continue;
      const follows = await followed(user);
      if (!follows.all && !filing.symbols.some((symbol) => follows.symbols.has(symbol))) continue;
      let delivered = false;
      try {
        await send(bot, user.telegram_id, filingText(filing), filingKeyboard(filing));
        delivered = true;
        sent += 1;
      } catch (err) {
        console.warn("Filing text failed", user.telegram_id, (err as Error).message);
      }
      // Marked either way, so a blocked chat is not retried every few minutes; only delivered texts count.
      markEventSent(user.telegram_id, filing.id, day, delivered);
    }
  }
}

export async function checkDesk(bot: Telegraf) {
  if (running) return;
  running = true;
  try {
    await sendWeekly(bot, Date.now()).catch((err) => console.warn("Weekly ranking failed:", (err as Error).message));
    const quotes = await getDeskQuotes();
    if (quotes.length === 0) return;
    // Right after a restart, wait for the first round of buy quotes so no verdict is judged without them.
    if (!buysReady()) return;
    await sendBriefs(bot, quotes, Date.now()).catch((err) => console.warn("Briefs failed:", (err as Error).message));
    const bySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
    const snaps = new Map(quotes.map((quote) => [quote.symbol, toSnap(quote)]));
    const previous = getVerdictStates();
    const fair: DeskQuote[] = [];
    const rich: DeskQuote[] = [];

    for (const quote of quotes) {
      const next = snaps.get(quote.symbol)!;
      const row = previous.get(quote.symbol);
      const prev: DeskSnap | null = row
        ? {
            symbol: quote.symbol,
            verdictId: row.verdict_id as VerdictId,
            gap: row.gap,
            open: row.open === 1,
            thin: row.thin === 1,
          }
        : null;
      if (next.verdictId === "checking" || next.verdictId === "unpriced") {
        if (!prev || !hasSignal(prev.verdictId)) {
          saveVerdictState({
            symbol: next.symbol,
            verdict_id: next.verdictId,
            gap: next.gap,
            open: next.open ? 1 : 0,
            thin: next.thin ? 1 : 0,
          });
        }
        continue;
      }
      if (fairFlip(prev, next)) fair.push(quote);
      if (richWhileClosed(prev, next)) rich.push(quote);
      saveVerdictState({
        symbol: next.symbol,
        verdict_id: next.verdictId,
        gap: next.gap,
        open: next.open ? 1 : 0,
        thin: next.thin ? 1 : 0,
      });
    }

    const users = listPingUsers();
    const watchByUser = new Map<number, string[]>();
    for (const watch of listAllWatches()) {
      const list = watchByUser.get(watch.telegram_id) ?? [];
      list.push(watch.symbol);
      watchByUser.set(watch.telegram_id, list);
    }

    const wallets = users.map(holderWallet).filter(Boolean);
    const holders = await walletsHolding(wallets);
    const now = Date.now();
    const day = etDay(now);
    const bellOpen = inBellWindow(now) && [...snaps.values()].some((snap) => snap.open);
    const bellRecipients = new Set<number>();

    for (const user of users) {
      if (!bellOpen || !user.bell || bellAlreadySent(user.telegram_id, day)) continue;
      const wallet = holderWallet(user);
      if (!wallet || !holders.has(wallet)) continue;
      const fairNow = quotes.filter((quote) => snaps.get(quote.symbol)?.verdictId === "fair");
      try {
        await send(bot, user.telegram_id, bellText(fairNow), buyKeyboard(fairNow));
        markBellSent(user.telegram_id, day);
        bellRecipients.add(user.telegram_id);
      } catch (err) {
        console.warn("Bell failed", user.telegram_id, (err as Error).message);
      }
    }

    for (const user of users) {
      const wallet = holderWallet(user);
      const holds = !!wallet && holders.has(wallet);
      const watched = watchByUser.get(user.telegram_id) ?? [];
      const told = new Set<string>();
      if (holds && watched.length > 0) {
        const mineFair = bellRecipients.has(user.telegram_id)
          ? []
          : fair.filter((quote) => watches(watched, quote.symbol));
        const mineRich = rich.filter((quote) => watches(watched, quote.symbol));
        try {
          if (mineFair.length > 0) {
            await send(bot, user.telegram_id, fairText(mineFair), buyKeyboard(mineFair));
            mineFair.forEach((quote) => told.add(quote.symbol));
          }
          if (mineRich.length > 0) {
            await send(bot, user.telegram_id, richText(mineRich));
            mineRich.forEach((quote) => told.add(quote.symbol));
          }
        } catch (err) {
          console.warn("Watch ping failed", user.telegram_id, (err as Error).message);
        }
      }
      try {
        await sendBag(bot, user, bySymbol, snaps, holds, told);
      } catch (err) {
        console.warn("Bag ping failed", user.telegram_id, (err as Error).message);
      }
      if (!holds || !user.wallet) continue;
      const due = quotes.filter((quote) => {
        const rebase = quote.rebase;
        if (!rebase || !rebaseDue(rebase.at, now) || rebaseAlreadySent(user.telegram_id, quote.symbol, rebase.at)) return false;
        return true;
      });
      if (due.length === 0) continue;
      try {
        const owned = await bagHoldings(user.wallet);
        for (const quote of due) {
          if ((owned.get(quote.symbol) ?? 0) <= 0 || !quote.rebase) continue;
          if (rebaseAlreadySent(user.telegram_id, quote.symbol, quote.rebase.at)) continue;
          await send(bot, user.telegram_id, rebaseText(quote, quote.rebase));
          markRebaseSent(user.telegram_id, quote.symbol, quote.rebase.at);
        }
      } catch (err) {
        console.warn("Rebase ping failed", user.telegram_id, (err as Error).message);
      }
    }

    const holderIds = new Set(
      users
        .filter((user) => {
          const wallet = holderWallet(user);
          return !!wallet && holders.has(wallet);
        })
        .map((user) => user.telegram_id),
    );
    await sendPairAlerts(bot, quotes, users, holderIds, now, day).catch((err) => console.warn("Pair pings failed:", (err as Error).message));
    await sendSizeAlerts(bot, bySymbol, holderIds, now).catch((err) => console.warn("Size alerts failed:", (err as Error).message));
  } catch (err) {
    console.error("Desk check failed:", err);
  } finally {
    running = false;
  }
}
