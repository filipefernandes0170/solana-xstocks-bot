// "Save image" on a name: its card as a 1200 × 675 PNG drawn in the browser from the numbers on screen, with the
// time it was drawn. Ready to post on X or Telegram; nothing is uploaded.

import { FAIR_BAND, GAP_SCALE, THIN_POOL_USD, gapPosition, poolLabel } from "../../lib/brand";
import { formatGap, formatUsd } from "../../lib/format";
import { ISSUER_LABEL, TOKEN_BY_SYMBOL } from "../../lib/tokens";
import type { Quote, Verdict, VerdictId } from "../../lib/types";
import { INK, W, drawBrand, drawFooter, loadFonts, newCanvas, toPng } from "./canvas";
import { dateFormat } from "../../lib/intl";

export type CardImageRow = Pick<Quote, "symbol" | "name" | "usdPrice" | "stockPrice" | "poolUsd"> & { verdict: Verdict; gap: number | null };

const PILL: Record<VerdictId, string> = {
  fair: INK.pine,
  near: INK.foam,
  overnight: INK.gold,
  wait: INK.clay,
  split: INK.clay,
  checking: INK.mist,
  unpriced: INK.mist,
};

/** "17 Oct 2026, 17:40 UTC" */
export function stampUtc(ms: number) {
  const when = dateFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(ms));
  return `${when} UTC`;
}

/** The sentence under the meter: what the gap means, or plainly why there is none. */
export function cardImageLine(row: Pick<CardImageRow, "gap" | "poolUsd" | "stockPrice">) {
  if (row.gap != null) {
    if (Math.abs(row.gap) < 0.005) return "A $1,000 buy is at the Nasdaq print.";
    return `A $1,000 buy is ${Math.abs(row.gap).toFixed(2)}% ${row.gap > 0 ? "over" : "under"} the Nasdaq print.`;
  }
  if (row.poolUsd != null && row.poolUsd < THIN_POOL_USD) return `The pool holds about ${poolLabel(row.poolUsd)}, too thin for a $1,000 buy.`;
  if (row.stockPrice == null) return "The Nasdaq print is not in yet.";
  return "The $1,000 buy is still loading.";
}

function gapColour(gap: number) {
  return Math.abs(gap) < FAIR_BAND ? INK.pine : Math.abs(gap) < 1 ? INK.gold : INK.clay;
}

/** The card as a PNG. `url` is the name's page, shown at the bottom with the time. */
export async function drawCardImage(row: CardImageRow, now: number, url: string) {
  await loadFonts();
  const drawn = newCanvas();
  if (!drawn) return null;
  const { canvas, ctx } = drawn;
  const token = TOKEN_BY_SYMBOL.get(row.symbol);
  drawBrand(ctx);

  // The verdict, top right.
  ctx.font = "600 26px Outfit, sans-serif";
  const pillWidth = ctx.measureText(row.verdict.title).width + 44;
  ctx.fillStyle = PILL[row.verdict.id];
  ctx.beginPath();
  ctx.roundRect(W - 60 - pillWidth, 56, pillWidth, 50, 25);
  ctx.fill();
  ctx.fillStyle = INK.night;
  ctx.fillText(row.verdict.title, W - 60 - pillWidth + 22, 90);

  // The name and what it is.
  ctx.fillStyle = INK.foam;
  ctx.font = "600 72px Fraunces, Georgia, serif";
  ctx.fillText(row.name, 60, 214);
  ctx.fillStyle = INK.mist;
  ctx.font = "400 28px Outfit, sans-serif";
  ctx.fillText(`${row.symbol}${token ? ` · ${ISSUER_LABEL[token.issuer]} · tracks ${token.underlying}` : ""}`, 60, 262);

  // Last trade and the Nasdaq print, then the gap on the right.
  ctx.font = "500 24px Outfit, sans-serif";
  ctx.fillText("Last trade, per share", 60, 330);
  ctx.fillText("Nasdaq print", 460, 330);
  ctx.fillStyle = INK.foam;
  ctx.font = "600 52px Fraunces, Georgia, serif";
  ctx.fillText(formatUsd(row.usdPrice), 60, 392);
  ctx.fillText(row.stockPrice == null ? "—" : formatUsd(row.stockPrice), 460, 392);
  if (row.gap != null) {
    const label = formatGap(row.gap);
    ctx.fillStyle = gapColour(row.gap);
    ctx.fillText(label, W - 60 - ctx.measureText(label).width, 392);
    ctx.fillStyle = INK.mist;
    ctx.font = "500 24px Outfit, sans-serif";
    const title = "$1,000 buy vs Nasdaq";
    ctx.fillText(title, W - 60 - ctx.measureText(title).width, 330);
  }

  // The meter: -2% to +2%, the fair band shaded, the dot where the $1,000 buy sits.
  const left = 60;
  const width = W - 120;
  const y = 468;
  ctx.fillStyle = INK.dusk;
  ctx.beginPath();
  ctx.roundRect(left, y - 7, width, 14, 7);
  ctx.fill();
  const half = (FAIR_BAND / (2 * GAP_SCALE)) * width;
  ctx.fillStyle = "#3dbe8b55";
  ctx.beginPath();
  ctx.roundRect(left + width / 2 - half, y - 7, half * 2, 14, 7);
  ctx.fill();
  ctx.fillStyle = INK.mist;
  ctx.fillRect(left + width / 2 - 1, y - 16, 2, 32);
  if (row.gap != null) {
    const x = left + (gapPosition(row.gap).left / 100) * width;
    ctx.fillStyle = gapColour(row.gap);
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK.night;
    ctx.stroke();
  }
  ctx.fillStyle = INK.mist;
  ctx.font = "400 22px Outfit, sans-serif";
  ctx.fillText("cheaper", left, y + 46);
  const middle = "Nasdaq";
  ctx.fillText(middle, left + width / 2 - ctx.measureText(middle).width / 2, y + 46);
  const end = "pricier";
  ctx.fillText(end, left + width - ctx.measureText(end).width, y + 46);

  ctx.fillStyle = INK.foam;
  ctx.font = "500 30px Outfit, sans-serif";
  ctx.fillText(cardImageLine(row), 60, 576);

  drawFooter(ctx, `${url.replace(/^https:\/\//, "")} · ${stampUtc(now)}`);
  return toPng(canvas);
}
