// Every message the bot sends, in one place. Telegram HTML: <b>, <i>, <code>; names always go through escapeHtml.

import { Markup } from "telegraf";
import type { InlineKeyboardMarkup } from "telegraf/types";
import { TOKENIZED_STOCKS } from "../config/tokens.js";
import type { DeskQuote, SizeResult } from "./desk.js";
import type { PortfolioSummary } from "./portfolio.js";
import {
  VERDICT_EMOJI,
  basisPct,
  buyHref,
  buyUsable,
  escapeHtml,
  gapBar,
  gapLabel,
  isSessionOpen,
  money,
  poolSliceUsd,
  sizeCall,
  tradeVerdict,
  type Rebase,
  type SizeTone,
  type Verdict,
} from "./verdict.js";
import { KRAKEN_VAULT, type LendingOffer } from "./yield.js";

export const DESK_URL = "https://xstocks-tracker.netlify.app";
const SIZE_BUTTONS = [1000, 5000, 25000];

const TONE_EMOJI: Record<SizeTone, string> = { fair: "🟢", close: "🟡", far: "🔴", none: "⚪" };

function pct(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (Math.abs(value) < 0.005) return "0.00%";
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(2)}%`;
}

/** Joins message lines: null or false drops a line, "" keeps a blank one. */
function join(lines: (string | null | false)[]) {
  return lines.filter((line): line is string => line !== null && line !== false).join("\n");
}

function dollars(value: number) {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function cents(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function shares(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(value);
}

function sizeLabel(usd: number) {
  return usd >= 1000 ? `$${usd / 1000}k` : `$${usd}`;
}

/** The $1,000 buy if it is fresh, else the last trade: the same price the pings judge. */
function judgedGap(quote: DeskQuote, now = Date.now()) {
  const buy = buyUsable(quote.buyAt ?? null, now) ? (quote.buyPrice ?? null) : null;
  return basisPct(buy ?? quote.usdPrice, quote.stockPrice);
}

function multiplierLine(quote: DeskQuote) {
  const m = quote.sharesPerToken;
  if (m == null || !Number.isFinite(m) || m <= 0) return "";
  if (Math.abs(m - 1) < 1e-6) return `🔁 Each ${escapeHtml(quote.symbol)} tracks one share.`;
  return `🔁 Each ${escapeHtml(quote.symbol)} tracks one share. Splits and dividends have grown balances ×${m.toFixed(4)}.`;
}

function rebaseWhen(rebase: Rebase) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(rebase.at * 1000));
}

// ── Keyboards ────────────────────────────────────────────────────────────────

export function buyKeyboard(rows: { symbol: string; mint: string }[]) {
  if (rows.length === 0) return undefined;
  return Markup.inlineKeyboard(rows.map((row) => [Markup.button.url(`🛒 Buy ${row.symbol}`, buyHref(row.mint))])).reply_markup;
}

/** Under a card: Buy, three size checks, and Watch. */
export function cardKeyboard(quote: { symbol: string; mint: string }): InlineKeyboardMarkup {
  return Markup.inlineKeyboard([
    [Markup.button.url(`🛒 Buy ${quote.symbol}`, buyHref(quote.mint))],
    SIZE_BUTTONS.map((usd) => Markup.button.callback(`📏 ${sizeLabel(usd)}`, `size:${quote.symbol}:${usd}`)),
    [Markup.button.callback(`🔔 Watch ${quote.symbol}`, `watch:${quote.symbol}`)],
  ]).reply_markup;
}

/** Under a size check: Buy (unless the price is far off) and the other sizes. */
export function sizeKeyboard(result: Extract<SizeResult, { ok: true }>, tone: SizeTone): InlineKeyboardMarkup {
  const rows = [];
  if (tone !== "far") rows.push([Markup.button.url(`🛒 Buy ${result.quote.symbol}`, buyHref(result.quote.mint))]);
  rows.push(
    SIZE_BUTTONS.filter((usd) => usd !== result.usd).map((usd) =>
      Markup.button.callback(`📏 ${sizeLabel(usd)}`, `size:${result.quote.symbol}:${usd}`),
    ),
  );
  return Markup.inlineKeyboard(rows).reply_markup;
}

export function startKeyboard(): InlineKeyboardMarkup {
  return Markup.inlineKeyboard([
    [Markup.button.callback("📈 The desk", "menu:prices"), Markup.button.callback("📏 Size check", "menu:size")],
    [Markup.button.callback("🌅 Morning brief", "menu:brief"), Markup.button.callback("🔔 Watch every name", "menu:watchall")],
    [Markup.button.url("🌐 Open the Par site", DESK_URL)],
  ]).reply_markup;
}

// ── Cards and pings ──────────────────────────────────────────────────────────

export function cardText(quote: DeskQuote, verdict: Verdict) {
  const now = Date.now();
  const fresh = buyUsable(quote.buyAt ?? null, now);
  const buy = fresh ? (quote.buyPrice ?? null) : null;
  const gap = basisPct(buy, quote.stockPrice);
  const slice = fresh ? poolSliceUsd(quote.buyImpactPct ?? null) : null;
  const bar = gapBar(gap);
  const nasdaq =
    quote.underlying === "SPCX"
      ? "🏛 Nasdaq: no public print"
      : `🏛 Nasdaq <b>${money(quote.stockPrice)}</b>${quote.marketState ? ` · ${escapeHtml(quote.marketState)}` : ""}`;
  return join([
    `${VERDICT_EMOJI[verdict.id]} <b>${escapeHtml(quote.name)}</b> · ${escapeHtml(quote.symbol)}`,
    `<b>${escapeHtml(verdict.title)}.</b> ${escapeHtml(verdict.line)}`,
    "",
    `💵 Last trade <b>${money(quote.usdPrice)}</b>${quote.change24h != null ? ` · 24h ${pct(quote.change24h)}` : ""}`,
    buy != null ? `🛒 $1,000 buy <b>${money(buy)}</b> a share` : "🛒 The $1,000 buy is still loading",
    nasdaq,
    gap != null && `📏 Gap <b>${escapeHtml(gapLabel(gap))}</b>`,
    bar != null && `<code>${bar}</code>`,
    fresh &&
      quote.buyImpactPct != null &&
      quote.buyImpactPct > 0 &&
      `🌊 $1,000 moves the pool ${quote.buyImpactPct.toFixed(3)}%${slice != null ? ` · about ${dollars(slice)} reaches 1%` : ""}`,
    quote.rebase != null &&
      quote.rebase.at * 1000 > now &&
      `📅 Rebase ${escapeHtml(rebaseWhen(quote.rebase))} UTC: ${quote.rebase.direction === "up" ? "your balance goes up" : "the multiplier drops"}. Don't trade through it.`,
    multiplierLine(quote) || null,
  ]);
}

export function fairText(quotes: DeskQuote[]) {
  if (quotes.length === 1) {
    const quote = quotes[0];
    const fresh = buyUsable(quote.buyAt ?? null, Date.now());
    const size = fresh ? poolSliceUsd(quote.buyImpactPct ?? null) : null;
    return [
      `🟢 <b>${escapeHtml(quote.symbol)} just turned Fair</b>`,
      `$1,000 buy <b>${money(fresh ? (quote.buyPrice ?? null) : quote.usdPrice)}</b> a share · Nasdaq ${money(quote.stockPrice)} · gap ${escapeHtml(gapLabel(judgedGap(quote)))}`,
      `The buy agrees with the issuer.${size != null ? ` About ${dollars(size)} reaches 1% impact.` : ""}`,
    ].join("\n");
  }
  return [
    "🟢 <b>These just turned Fair</b>",
    ...quotes.map((quote) => `• <b>${escapeHtml(quote.symbol)}</b> ${money(quote.buyPrice ?? quote.usdPrice)} · gap ${escapeHtml(gapLabel(judgedGap(quote)))}`),
  ].join("\n");
}

export function richText(quotes: DeskQuote[]) {
  return quotes
    .map((quote) =>
      [
        `🌙 <b>Wait on ${escapeHtml(quote.symbol)}</b>`,
        `Nasdaq is closed and ${escapeHtml(quote.symbol)} trades <b>${pct(judgedGap(quote))}</b> over the last print (${money(quote.usdPrice)} versus ${money(quote.stockPrice)}).`,
        "The next open usually pulls it back.",
      ].join("\n"),
    )
    .join("\n\n");
}

export function bellText(fair: DeskQuote[]) {
  if (fair.length === 0) {
    return "🔔 <b>Nasdaq is open</b>\nNothing is Fair yet. Prices are still away from the print, or the pools are thin. Pings follow if that changes.";
  }
  return [
    "🔔 <b>Nasdaq is open</b>",
    `Fair now, within 0.4% of the print:`,
    ...fair.map((quote) => `🟢 <b>${escapeHtml(quote.symbol)}</b> ${money(quote.usdPrice)} · gap ${escapeHtml(gapLabel(judgedGap(quote)))}`),
  ].join("\n");
}

export function rebaseText(quote: DeskQuote, rebase: Rebase) {
  const move = rebase.direction === "up" ? "Your balance goes up." : "The multiplier drops.";
  return `📅 <b>${escapeHtml(quote.symbol)} rebases ${escapeHtml(rebaseWhen(rebase))} UTC</b>\n${move} Don't trade through it.`;
}

export function bagText(changes: { quote: DeskQuote; from: string; thin: boolean; verdict: Verdict }[]) {
  const blocks = changes.map((change) => {
    const bits = [
      `${VERDICT_EMOJI[change.verdict.id]} <b>${escapeHtml(change.quote.symbol)}</b> is now <b>${escapeHtml(change.verdict.title)}</b>${change.from ? ` (was ${escapeHtml(change.from)})` : ""}`,
      escapeHtml(change.verdict.line),
    ];
    if (change.thin && change.quote.buyImpactPct != null) {
      bits.push(`🌊 A $1,000 buy now moves the price ${change.quote.buyImpactPct.toFixed(2)}%.`);
    }
    return bits.join("\n");
  });
  return [`💼 <b>A stock in your bag changed</b>`, ...blocks].join("\n\n");
}

// ── Commands ─────────────────────────────────────────────────────────────────

export function startText(firstName?: string) {
  return [
    `👋 <b>Welcome to Par${firstName ? `, ${escapeHtml(firstName)}` : ""}</b>`,
    `Is the price real? Par checks ${TOKENIZED_STOCKS.length} tokenized stocks on Solana against Nasdaq, live, and tells you when a buy is fair.`,
    "",
    "<b>Free for everyone</b>",
    "• Send a name, like <code>nvda</code> or <code>tesla</code>, for its card",
    "• /prices · the whole desk at a glance",
    "• /size NVDAx 5000 · what your order really costs",
    "• /portfolio · paste a wallet to see your bag",
    "• /yield · live lending rates on Kamino",
    "",
    "<b>For $PAR holders</b>",
    "• /watch · a text the moment a name turns Fair",
    "• /brief · the morning brief before the open",
    "• /bell · one message as Nasdaq opens",
    "• Bag watch · a note when a stock you hold changes",
    "",
    "<i>Par takes no fee, never holds funds, and never asks you to sign anything.</i>",
  ].join("\n");
}

export function helpText() {
  return [
    "📖 <b>How Par works</b>",
    "",
    "<b>One name</b>",
    "Send <code>nvda</code>, <code>nvdax</code> or <code>nvidia</code>. You get the last trade, a live $1,000 buy, the Nasdaq print, the gap and the verdict.",
    "",
    "<b>Verdicts</b>",
    "🟢 Fair: Nasdaq is open and a $1,000 buy is within 0.4% of the print",
    "🟡 Near: close to the stock, check the gap first",
    "🌙 Overnight: Kraken quotes it around the clock, still not the print",
    "🔴 Wait or Careful: away from the print, or the pool is thin",
    "⚖️ Split: the pool and the issuer mark disagree",
    "",
    "<b>Your order</b>",
    "/size NVDAx 5000 · a live quote at your size, per share, against Nasdaq",
    "",
    "<b>Texts for $PAR holders</b>",
    "/watch NVDAx · /watch all · /watch list · /watch off",
    "/brief · the morning brief, on or off",
    "/bell · the open bell, on or off",
    "/hold &lt;wallet&gt; · the wallet that holds the coin, if it is not your bag wallet",
    "",
    "<b>Also</b>",
    "/portfolio or /p · /prices · /yield NVDAx · /alert NVDAx up 5 · /alert list · /alert clear",
    "",
    "<i>Buy opens Jupiter on that stock, paid with USDC. You pay the pool, not Par.</i>",
  ].join("\n");
}

export function pricesText(quotes: DeskQuote[]) {
  const now = Date.now();
  const rows = quotes.map((quote) => ({ quote, verdict: tradeVerdict(quote, now), gap: judgedGap(quote, now) }));
  const fair = rows.filter((row) => row.verdict.id === "fair").length;
  const widest = [...rows].filter((row) => row.gap != null).sort((a, b) => Math.abs(b.gap as number) - Math.abs(a.gap as number))[0];
  const state = quotes.find((quote) => quote.marketState)?.marketState ?? "";
  return [
    `📈 <b>The Par desk</b>${state ? ` · Nasdaq ${escapeHtml(state)}` : ""}`,
    `🟢 ${fair} of ${rows.length} Fair${widest ? ` · widest gap ${escapeHtml(widest.quote.symbol)} ${pct(widest.gap)}` : ""}`,
    "",
    ...rows.map(
      ({ quote, verdict, gap }) =>
        `${VERDICT_EMOJI[verdict.id]} <b>${escapeHtml(quote.symbol)}</b> ${money(quote.usdPrice)}${gap != null ? ` · ${pct(gap)}` : ""}${quote.change24h != null ? ` · 24h ${pct(quote.change24h)}` : ""}`,
    ),
    "",
    "<i>Gap: the $1,000 buy (or the last trade) versus the Nasdaq print. Send a name for its card.</i>",
  ].join("\n");
}

export function sizeText(result: Extract<SizeResult, { ok: true }>) {
  const { quote } = result;
  const gap = basisPct(result.price, quote.underlying === "SPCX" ? null : quote.stockPrice);
  const call = sizeCall({ gap, impactPct: result.impactPct, open: isSessionOpen(quote.marketState) });
  const premium = gap == null || quote.stockPrice == null ? null : result.usd - result.shares * quote.stockPrice;
  return {
    tone: call.tone,
    text: join([
      `📏 <b>Size check · ${escapeHtml(quote.symbol)}</b>`,
      `${cents(result.usd)} buys <b>${shares(result.shares)}</b> shares at <b>${money(result.price)}</b> each`,
      gap != null ? `🏛 Nasdaq ${money(quote.stockPrice)} · gap <b>${escapeHtml(gapLabel(gap))}</b>` : "🏛 No public Nasdaq print to compare",
      premium != null && `💸 ${cents(Math.abs(premium))} ${premium >= 0 ? "more" : "less"} than the same shares at the print`,
      `🌊 Pool impact ${result.impactPct.toFixed(result.impactPct >= 0.1 ? 2 : 3)}%`,
      "",
      `${TONE_EMOJI[call.tone]} <b>${escapeHtml(call.title)}.</b> ${escapeHtml(call.line)}`,
      "<i>Live Jupiter quote. Prices move, so the fill is not guaranteed.</i>",
    ]),
  };
}

export function sizeUsage() {
  return [
    "📏 <b>Size check</b>",
    "What would your order really cost? Send a name and an amount in USDC:",
    "<code>/size NVDAx 5000</code>",
    "<code>/size tesla 25000</code>",
    "",
    "Par asks Jupiter for a live quote at that size, prices it per share and sets it against Nasdaq.",
  ].join("\n");
}

export function portfolioText(wallet: string, pf: PortfolioSummary, quotes: Map<string, DeskQuote>) {
  const short = `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
  const lines = pf.positions.slice(0, 15).map((position) => {
    const quote = quotes.get(position.symbol);
    const emoji = quote ? VERDICT_EMOJI[tradeVerdict(quote).id] : "⚪";
    return `${emoji} <b>${escapeHtml(position.symbol)}</b> ${shares(position.amount)} shares · <b>${cents(position.usdValue)}</b>${position.change24h != null ? ` · 24h ${pct(position.change24h)}` : ""}`;
  });
  return join([
    `💼 <b>Your bag</b> · <code>${escapeHtml(short)}</code>`,
    `<b>${cents(pf.totalUsd)}</b>${pf.change24hPct != null ? ` · 24h ${pct(pf.change24hPct)}` : ""} · ${pf.positions.length} position${pf.positions.length === 1 ? "" : "s"}`,
    "",
    ...lines,
    pf.positions.length > 15 && `<i>…and ${pf.positions.length - 15} more</i>`,
    "",
    "Pings use this wallet while it holds $PAR. /watch · /brief · /bell",
  ]);
}

function rate(value: number | null) {
  return value == null ? "—" : `${(value * 100).toFixed(2)}%`;
}

export function yieldText(offers: LendingOffer[], symbol: string | null) {
  if (symbol) {
    const mine = offers.filter((offer) => offer.symbol === symbol);
    const kraken = KRAKEN_VAULT.symbols.includes(symbol);
    if (mine.length === 0 && !kraken) {
      return `💰 <b>${escapeHtml(symbol)}</b>\nNo Kamino xStock market lists ${escapeHtml(symbol)} yet.`;
    }
    return join([
      `💰 <b>Earn with ${escapeHtml(symbol)}</b> · live from Kamino`,
      ...mine.map((offer) =>
        [
          "",
          `<b>${escapeHtml(offer.venue)}</b>`,
          `Supply ${rate(offer.supplyApy)} · borrow USDC ${rate(offer.borrowApy)} · borrow up to ${offer.maxLtv == null ? "—" : `${Math.round(offer.maxLtv * 100)}%`}`,
          offer.depositsUsd != null ? `${dollars(offer.depositsUsd)} deposited · <a href="${offer.href}">open</a>` : `<a href="${offer.href}">open</a>`,
        ].join("\n"),
      ),
      kraken && `\n<b>${KRAKEN_VAULT.venue}</b>\n${escapeHtml(KRAKEN_VAULT.note)} <a href="${KRAKEN_VAULT.href}">open</a>`,
      "",
      "<i>Rates move with every block. Lending carries smart-contract and liquidation risk.</i>",
    ]);
  }
  const best = new Map<string, LendingOffer>();
  for (const offer of offers) {
    const current = best.get(offer.symbol);
    if (!current || (offer.supplyApy ?? -1) > (current.supplyApy ?? -1)) best.set(offer.symbol, offer);
  }
  const rows = [...best.values()].sort((a, b) => (b.supplyApy ?? -1) - (a.supplyApy ?? -1));
  return [
    "💰 <b>Lending rates on your xStocks</b> · live from Kamino",
    "Best supply rate per name, and how much you can borrow against it:",
    "",
    ...rows.map(
      (offer) =>
        `<b>${escapeHtml(offer.symbol)}</b> supply ${rate(offer.supplyApy)} · borrow up to ${offer.maxLtv == null ? "—" : `${Math.round(offer.maxLtv * 100)}%`} · ${escapeHtml(offer.venue)}`,
    ),
    "",
    "Send <code>/yield NVDAx</code> for every market on one name.",
    "<i>Rates move with every block. Lending carries smart-contract and liquidation risk.</i>",
  ].join("\n");
}

// ── Morning brief ────────────────────────────────────────────────────────────

function dayLabel(now: number) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "America/New_York", weekday: "short", day: "numeric", month: "short" }).format(new Date(now));
}

function briefParts(quotes: DeskQuote[], now: number) {
  const priced = quotes
    .filter((quote) => quote.underlying !== "SPCX")
    .map((quote) => ({ quote, gap: judgedGap(quote, now) }))
    .filter((row): row is { quote: DeskQuote; gap: number } => row.gap != null);
  const over = priced.filter((row) => row.gap > 0.02).sort((a, b) => b.gap - a.gap).slice(0, 3);
  const under = priced.filter((row) => row.gap < -0.02).sort((a, b) => a.gap - b.gap).slice(0, 3);
  const closest = [...priced].sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap)).slice(0, 3);
  const movers = quotes
    .filter((quote) => quote.change24h != null)
    .sort((a, b) => Math.abs(b.change24h as number) - Math.abs(a.change24h as number))
    .slice(0, 3);
  const rebases = quotes
    .filter((quote) => quote.rebase && quote.rebase.at * 1000 > now && quote.rebase.at * 1000 - now <= 24 * 3600_000)
    .sort((a, b) => (a.rebase as Rebase).at - (b.rebase as Rebase).at);
  return { over, under, closest, movers, rebases };
}

const listGaps = (rows: { quote: DeskQuote; gap: number }[]) =>
  rows.map((row) => `<b>${escapeHtml(row.quote.symbol)}</b> ${pct(row.gap)}`).join(" · ");

/** The holders' brief, sent in the half hour before the open. */
export function briefText(quotes: DeskQuote[], now: number, minutesToOpen: number) {
  const { over, under, closest, movers, rebases } = briefParts(quotes, now);
  return [
    `🌅 <b>Par morning brief</b> · ${escapeHtml(dayLabel(now))}`,
    `Nasdaq opens at 9:30 ET, in ${minutesToOpen} min. The tokens trade around the clock; this is what a $1,000 buy costs against the last Nasdaq print.`,
    "",
    "🔴 <b>Dearest to buy</b>",
    over.length ? listGaps(over) : "Nothing costs more than the print.",
    "",
    "🟢 <b>Cheapest to buy</b>",
    under.length ? listGaps(under) : "Nothing costs less than the print.",
    "",
    "🎯 <b>Closest to the print</b>",
    closest.length ? listGaps(closest) : "No prints yet.",
    "",
    "📊 <b>Biggest 24h moves</b>",
    movers.length ? movers.map((quote) => `<b>${escapeHtml(quote.symbol)}</b> ${pct(quote.change24h)}`).join(" · ") : "No 24h data yet.",
    "",
    "📅 <b>Balance changes in the next 24h</b>",
    rebases.length
      ? rebases
          .map((quote) => `<b>${escapeHtml(quote.symbol)}</b> ${escapeHtml(rebaseWhen(quote.rebase as Rebase))} UTC, ${(quote.rebase as Rebase).direction === "up" ? "balance up" : "multiplier down"}`)
          .join("\n")
      : "None scheduled.",
    "",
    "<i>Gaps use the live $1,000 buy where it is fresh, else the last trade. Pings follow when a watched name turns Fair. /brief turns this off.</i>",
  ].join("\n");
}

/** The short public version for a channel, pointing holders to the full brief. */
export function briefTeaser(quotes: DeskQuote[], now: number) {
  const { over, under } = briefParts(quotes, now);
  return join([
    `🌅 <b>Par morning brief</b> · ${escapeHtml(dayLabel(now))}`,
    over[0] != null && `🔴 Dearest to buy, versus the print: <b>${escapeHtml(over[0].quote.symbol)}</b> ${pct(over[0].gap)}`,
    under[0] != null && `🟢 Cheapest to buy: <b>${escapeHtml(under[0].quote.symbol)}</b> ${pct(under[0].gap)}`,
    "",
    "$PAR holders get the full brief in their DMs, plus live Fair pings. The desk stays free for everyone.",
  ]);
}

export function briefKeyboard(): InlineKeyboardMarkup {
  return Markup.inlineKeyboard([
    [Markup.button.callback("📈 The whole desk", "menu:prices"), Markup.button.callback("📏 Size check", "menu:size")],
    [Markup.button.url("🌐 Open the Par site", DESK_URL)],
  ]).reply_markup;
}

/** Under the public channel teaser: links only, so nobody's tap makes the bot answer inside the channel. */
export function teaserKeyboard(): InlineKeyboardMarkup {
  return Markup.inlineKeyboard([
    [Markup.button.url("🌅 Get the full brief", "https://t.me/ONPAR_BOT?start=brief")],
    [Markup.button.url("🌐 Open the Par site", DESK_URL)],
  ]).reply_markup;
}
