import { Markup } from "telegraf";
import type { DeskQuote } from "./desk.js";
import { buyHref, buyUsable, escapeHtml, gapLabel, basisPct, money, poolSliceUsd, type Rebase, type Verdict } from "./verdict.js";

export function buyKeyboard(rows: { symbol: string; mint: string }[]) {
  if (rows.length === 0) return undefined;
  return Markup.inlineKeyboard(
    rows.map((row) => [Markup.button.url(`Buy ${row.symbol}`, buyHref(row.mint))]),
  ).reply_markup;
}

function lines(quote: DeskQuote) {
  const buy = buyUsable(quote.buyAt ?? null, Date.now()) ? (quote.buyPrice ?? null) : null;
  const gap = basisPct(buy, quote.stockPrice);
  const stock = quote.underlying === "SPCX" ? "no public print" : money(quote.stockPrice);
  return [
    `Last trade ${money(quote.usdPrice)}`,
    buy != null ? `A $1,000 buy pays ${money(buy)}` : "The $1,000 buy is still loading",
    `Nasdaq ${stock}`,
    `Buy versus stock ${gapLabel(gap)}`,
  ];
}

export function cardText(quote: DeskQuote, verdict: Verdict) {
  const fresh = buyUsable(quote.buyAt ?? null, Date.now());
  const size = fresh ? poolSliceUsd(quote.buyImpactPct ?? null) : null;
  const impact =
    fresh && quote.buyImpactPct != null && quote.buyImpactPct > 0 && size != null
      ? `A $1,000 buy moves the price ${quote.buyImpactPct.toFixed(3)}%. About $${Math.round(size).toLocaleString("en-US")} reaches 1% impact.`
      : "";
  return [
    `<b>${escapeHtml(quote.symbol)}</b> · ${escapeHtml(quote.name)}`,
    ...lines(quote),
    `<b>${escapeHtml(verdict.title)}</b>`,
    escapeHtml(verdict.line),
    impact,
  ]
    .filter(Boolean)
    .join("\n");
}

export function fairText(quotes: DeskQuote[]) {
  if (quotes.length === 1) {
    const quote = quotes[0];
    const size = buyUsable(quote.buyAt ?? null, Date.now()) ? poolSliceUsd(quote.buyImpactPct ?? null) : null;
    return [
      `<b>${escapeHtml(quote.symbol)} just turned Fair</b>`,
      ...lines(quote),
      "The buy agrees with the issuer.",
      size != null ? `About $${Math.round(size).toLocaleString("en-US")} reaches 1% impact.` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }
  return [
    "<b>These just turned Fair</b>",
    ...quotes.map((quote) => `${escapeHtml(quote.symbol)} ${money(quote.buyPrice ?? quote.usdPrice)} · gap ${gapLabel(basisPct(quote.buyPrice ?? null, quote.stockPrice))}`),
  ].join("\n");
}

export function richText(quotes: DeskQuote[]) {
  const blocks = quotes.map((quote) =>
    [
      `<b>Wait on ${escapeHtml(quote.symbol)}</b>`,
      ...lines(quote),
      "The market is closed and this price is above the stock. The next open usually pulls it back.",
    ].join("\n"),
  );
  return blocks.join("\n\n");
}

export function bellText(fair: DeskQuote[]) {
  if (fair.length === 0) {
    return "<b>Nasdaq is open</b>\nNothing is Fair yet. Prices are still away from the print, or the pool is thin.";
  }
  return [
    "<b>Nasdaq is open</b>",
    "Fair now:",
    ...fair.map((quote) => `${escapeHtml(quote.symbol)} ${money(quote.usdPrice)}`),
  ].join("\n");
}

export function rebaseText(quote: DeskQuote, rebase: Rebase) {
  const when = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(rebase.at * 1000));
  const move = rebase.direction === "up" ? "Your balance goes up." : "The multiplier drops.";
  return `<b>${escapeHtml(quote.symbol)} rebases ${escapeHtml(when)} UTC</b>\n${move} Don't trade through it.`;
}

export function bagText(changes: { quote: DeskQuote; from: string; thin: boolean; verdict: Verdict }[]) {
  const blocks = changes.map((change) => {
    const bits = [`<b>${escapeHtml(change.quote.symbol)}</b> is now ${escapeHtml(change.verdict.title)}`];
    if (change.from) bits.push(`It was ${escapeHtml(change.from)}.`);
    bits.push(escapeHtml(change.verdict.line));
    if (change.thin && change.quote.buyImpactPct != null) {
      bits.push(`A $1,000 buy moves the price ${change.quote.buyImpactPct.toFixed(2)}%.`);
    }
    return bits.join("\n");
  });
  return blocks.join("\n\n");
}
