// Shared pieces for the pictures Par draws in the browser (the week's ranking, a name's card): 1200 × 675 PNGs
// built from the numbers on the page. Nothing is uploaded.

import { MARK_FOAM, MARK_GOLD } from "../Logo";

export const W = 1200;
export const H = 675;
export const INK = {
  night: "#0b1c26",
  dusk: "#143240",
  foam: "#e7f3ee",
  mist: "#a9c4bc",
  gold: "#e0a04a",
  pine: "#3dbe8b",
  clay: "#ef8571",
} as const;

/** Waits for the site's fonts so the canvas can use them; the fallback fonts still make a readable picture. */
export async function loadFonts() {
  try {
    await Promise.all([
      document.fonts.load("600 64px Fraunces"),
      document.fonts.load("400 26px Outfit"),
      document.fonts.load("500 24px Outfit"),
      document.fonts.load("600 26px Outfit"),
    ]);
  } catch {
    // Fallback fonts.
  }
}

/** A canvas with the night background and the faint grid of the site. */
export function newCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = INK.night;
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
  return { canvas, ctx };
}

/** The mark and the word "Par", top left. */
export function drawBrand(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.translate(56, 38);
  ctx.scale(0.62, 0.62);
  ctx.lineCap = "round";
  ctx.lineWidth = 10;
  ctx.strokeStyle = INK.foam;
  ctx.stroke(new Path2D(MARK_FOAM));
  ctx.strokeStyle = INK.gold;
  ctx.stroke(new Path2D(MARK_GOLD));
  ctx.fillStyle = INK.gold;
  ctx.beginPath();
  ctx.arc(110, 70, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = INK.foam;
  ctx.font = "600 40px Fraunces, Georgia, serif";
  ctx.fillText("Par", 148, 96);
}

/** The address on the left and "Not financial advice" on the right, along the bottom. */
export function drawFooter(ctx: CanvasRenderingContext2D, left: string) {
  ctx.font = "500 24px Outfit, sans-serif";
  ctx.fillStyle = INK.gold;
  ctx.fillText(left, 60, 640);
  ctx.fillStyle = INK.mist;
  const note = "Not financial advice";
  ctx.fillText(note, W - 60 - ctx.measureText(note).width, 640);
}

export function toPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
}

/** Hands a picture to the browser as a file download. */
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
