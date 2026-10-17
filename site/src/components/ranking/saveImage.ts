// "Save image" on /ranking: draws the week's ranking as a 1200 × 675 PNG in the browser, ready to post on X or
// Telegram. Nothing is uploaded; the picture is built from the numbers on the page.

import { nearLabel, type Ranking } from "../../lib/ranking";
import { INK, W, downloadBlob, drawBrand, drawFooter, loadFonts, newCanvas, toPng } from "../share/canvas";

function rows(ctx: CanvasRenderingContext2D, title: string, list: Ranking["rows"], x: number, y: number, colour: string) {
  ctx.fillStyle = INK.mist;
  ctx.font = "500 24px Outfit, sans-serif";
  ctx.fillText(title, x, y);
  list.forEach((row, index) => {
    const top = y + 22 + index * 56;
    ctx.fillStyle = INK.dusk;
    ctx.beginPath();
    ctx.roundRect(x, top, 500, 46, 14);
    ctx.fill();
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.roundRect(x, top, Math.max(14, 500 * row.near), 46, 14);
    ctx.globalAlpha = 0.22;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = INK.foam;
    ctx.font = "600 26px Outfit, sans-serif";
    ctx.fillText(row.symbol, x + 18, top + 32);
    ctx.font = "500 24px Outfit, sans-serif";
    const label = `${nearLabel(row.near)} near`;
    ctx.fillText(label, x + 482 - ctx.measureText(label).width, top + 32);
  });
}

/** The ranking as a PNG. */
export async function drawRankingImage(ranking: Ranking, siteUrl: string) {
  await loadFonts();
  const drawn = newCanvas();
  if (!drawn) return null;
  const { canvas, ctx } = drawn;
  drawBrand(ctx);
  ctx.fillStyle = INK.foam;
  ctx.font = "600 52px Fraunces, Georgia, serif";
  ctx.fillText("Which tokens stayed at the real price?", 60, 190);
  ctx.fillStyle = INK.mist;
  ctx.font = "400 26px Outfit, sans-serif";
  ctx.fillText("Last 7 days · share of open-market readings within 0.4% of the Nasdaq print", 60, 236);

  const closest = ranking.rows.slice(0, 5);
  const furthest = ranking.rows
    .slice(-5)
    .reverse()
    .filter((row) => !closest.includes(row));
  rows(ctx, "Closest to Nasdaq", closest, 60, 290, INK.pine);
  if (furthest.length > 0) rows(ctx, "Furthest from Nasdaq", furthest, W / 2 + 40, 290, INK.clay);

  drawFooter(ctx, siteUrl.replace(/^https:\/\//, ""));
  return toPng(canvas);
}

/** Draws the picture and hands it to the browser as par-ranking.png. */
export async function saveRankingImage(ranking: Ranking, siteUrl: string) {
  const blob = await drawRankingImage(ranking, siteUrl);
  if (blob) downloadBlob(blob, "par-ranking.png");
}
