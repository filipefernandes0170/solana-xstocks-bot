// The bot's card, written the way @ONPAR_BOT writes it (src/services/messages.ts in the repo root), so the
// /bot page can show a real card with live numbers. Plain text lines; the page styles them.

import { formatGap, formatUsd, onePercentUsd } from "./format";
import { TOKEN_BY_SYMBOL } from "./tokens";
import type { Quote, VerdictId } from "./types";
import { buyUsable, gapPct, verdict } from "./verdict";

export const VERDICT_EMOJI: Record<VerdictId, string> = {
  fair: "🟢",
  near: "🟡",
  overnight: "🌙",
  wait: "🔴",
  split: "⚖️",
  checking: "⏳",
  unpriced: "⚪",
};

/** The bot's text gap meter from -2% to +2%: "cheap ────┼─●── rich". Same as gapBar in the bot. */
export function gapBar(gap: number | null) {
  if (gap == null) return null;
  const slots = 11;
  const center = (slots - 1) / 2;
  const clamped = Math.max(-2, Math.min(2, gap));
  const at = Math.round(((clamped + 2) / 4) * (slots - 1));
  return `cheap ${Array.from({ length: slots }, (_, i) => (i === at ? "●" : i === center ? "┼" : "─")).join("")} rich`;
}

function pct(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (Math.abs(value) < 0.005) return "0.00%";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}%`;
}

export type BotCard = { head: string; verdict: string; lines: string[]; meter: string | null; foot: string[] };

/** The card @ONPAR_BOT sends when someone types a name, built from live desk data. */
export function botCard(quote: Quote, now: number): BotCard {
  const v = verdict(quote, now);
  const fresh = buyUsable(quote.buyAt, now);
  const buy = fresh ? quote.buyPrice : null;
  const gap = gapPct(buy, quote.stockPrice);
  const slice = fresh ? onePercentUsd(quote.buyImpactPct) : null;
  const lines = [
    `💵 Last trade ${formatUsd(quote.usdPrice)}${quote.change24h != null ? ` · 24h ${pct(quote.change24h)}` : ""}`,
    buy != null ? `🛒 $1,000 buy ${formatUsd(buy)} a share` : "🛒 The $1,000 buy is still loading",
    quote.stockPrice == null ? "🏛 Nasdaq: the print is not in yet" : `🏛 Nasdaq ${formatUsd(quote.stockPrice)}${quote.marketState ? ` · ${quote.marketState}` : ""}`,
  ];
  if (gap != null) lines.push(`📏 Gap ${formatGap(gap)}`);
  const foot: string[] = [];
  if (fresh && quote.buyImpactPct != null && quote.buyImpactPct > 0) {
    foot.push(
      `🌊 $1,000 moves the pool ${quote.buyImpactPct.toFixed(3)}%${slice != null ? ` · about $${Math.round(slice).toLocaleString("en-US")} reaches 1%` : ""}`,
    );
  }
  const issuer = TOKEN_BY_SYMBOL.get(quote.symbol)?.issuer === "Backpack" ? " · Backpack" : "";
  return { head: `${VERDICT_EMOJI[v.id]} ${quote.name} · ${quote.symbol}${issuer}`, verdict: `${v.title}. ${v.line}`, lines, meter: gapBar(gap), foot };
}
