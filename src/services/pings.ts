import { Telegraf } from "telegraf";
import type { InlineKeyboardMarkup } from "telegraf/types";
import {
  bellAlreadySent,
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
import { getDeskQuotes, type DeskQuote } from "./desk.js";
import { holderWallet, walletsHolding } from "./holder.js";
import { bagText, bellText, buyKeyboard, fairText, rebaseText, richText } from "./messages.js";
import {
  etDay,
  fairFlip,
  hasSignal,
  inBellWindow,
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

async function send(bot: Telegraf, chatId: number, text: string, markup?: InlineKeyboardMarkup) {
  await bot.telegram.sendMessage(chatId, text, {
    parse_mode: "HTML",
    disable_web_page_preview: true,
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

export async function checkDesk(bot: Telegraf) {
  if (running) return;
  running = true;
  try {
    const quotes = await getDeskQuotes();
    if (quotes.length === 0) return;
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
  } catch (err) {
    console.error("Desk check failed:", err);
  } finally {
    running = false;
  }
}
