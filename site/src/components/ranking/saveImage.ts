// "Save image" on /ranking: draws the week's ranking as a 1200 × 675 PNG in the browser, ready to post on X or
// Telegram. Nothing is uploaded; the picture is built from the numbers on the page.

import { MARK_FOAM, MARK_GOLD } from "../Logo";
import { nearLabel, type Ranking } from "../../lib/ranking";

const W = 1200;
const H = 675;
const NIGHT = "#0b1c26";
const DUSK = "#143240";
const FOAM = "#e7f3ee";
const MIST = "#a9c4bc";
const GOLD = "#e0a04a";
const PINE = "#3dbe8b";
const CLAY = "#ef8571";

function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.lineCap = "round";
  ctx.lineWidth = 10;
  ctx.strokeStyle = FOAM;
  ctx.stroke(new Path2D(MARK_FOAM));
  ctx.strokeStyle = GOLD;
  ctx.stroke(new Path2D(MARK_GOLD));
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.arc(110, 70, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function rows(ctx: CanvasRenderingContext2D, title: string, list: Ranking["rows"], x: number, y: number, colour: string) {
  ctx.fillStyle = MIST;
  ctx.font = "500 24px Outfit, sans-serif";
  ctx.fillText(title, x, y);
  list.forEach((row, index) => {
    const top = y + 22 + index * 56;
    ctx.fillStyle = DUSK;
    ctx.beginPath();
    ctx.roundRect(x, top, 500, 46, 14);
    ctx.fill();
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.roundRect(x, top, Math.max(14, 500 * row.near), 46, 14);
    ctx.globalAlpha = 0.22;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = FOAM;
    ctx.font = "600 26px Outfit, sans-serif";
    ctx.fillText(row.symbol, x + 18, top + 32);
    ctx.font = "500 24px Outfit, sans-serif";
    const label = `${nearLabel(row.near)} near`;
    ctx.fillText(label, x + 482 - ctx.measureText(label).width, top + 32);
  });
}

/** Draws the picture and hands it to the browser as par-ranking.png. */
export async function saveRankingImage(ranking: Ranking, siteUrl: string) {
  try {
    await Promise.all([document.fonts.load("600 64px Fraunces"), document.fonts.load("500 24px Outfit"), document.fonts.load("600 26px Outfit")]);
  } catch {
    // The fallback fonts still make a readable picture.
  }
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = NIGHT;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#ffffff0d";
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  drawMark(ctx, 56, 38, 0.62);
  ctx.fillStyle = FOAM;
  ctx.font = "600 40px Fraunces, Georgia, serif";
  ctx.fillText("Par", 148, 96);
  ctx.font = "600 52px Fraunces, Georgia, serif";
  ctx.fillText("Which tokens stayed at the real price?", 60, 190);
  ctx.fillStyle = MIST;
  ctx.font = "400 26px Outfit, sans-serif";
  ctx.fillText("Last 7 days · share of open-market readings within 0.4% of the Nasdaq print", 60, 236);

  const closest = ranking.rows.slice(0, 5);
  const furthest = ranking.rows.slice(-5).reverse().filter((row) => !closest.includes(row));
  rows(ctx, "Closest to Nasdaq", closest, 60, 290, PINE);
  if (furthest.length > 0) rows(ctx, "Furthest from Nasdaq", furthest, 640, 290, CLAY);

  ctx.fillStyle = GOLD;
  ctx.font = "500 24px Outfit, sans-serif";
  ctx.fillText(siteUrl.replace(/^https:\/\//, ""), 60, 640);
  ctx.fillStyle = MIST;
  const note = "Not financial advice";
  ctx.fillText(note, W - 60 - ctx.measureText(note).width, 640);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "par-ranking.png";
  anchor.click();
  URL.revokeObjectURL(url);
}
