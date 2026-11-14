// Renders every Par image from tools/brand/mark.mjs:
//   site/public/favicon.svg, favicon.ico (16, 32, 48), favicon.png (48), apple-touch-icon.png, icon-192.png, icon-512.png
//   site/public/og.png, og/bot.png, og/s/<SYMBOL>.png   (1200 x 630 link previews, no prices on purpose:
//                                                         chat apps cache previews for days)
//   site/public/qr-bot.svg                              (QR code for t.me/ONPAR_BOT)
//   tools/brand/out/bot-avatar.png                      (640 x 640, for @BotFather)
// Usage: cd tools/brand && npm install && npm run images
// Fonts (Inter for the link previews since the dark look of 8 Nov 2026; Fraunces and Outfit before; SIL Open Font
// License) are downloaded from Google Fonts into .fonts/ on first run. The mark itself (mark.mjs) never changes.

import { Resvg } from "@resvg/resvg-js";
import QRCode from "qrcode";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COLORS, MARK, markShapes, placedTile, squareSvg, tileSvg } from "./mark.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, "..", "..", "site");
const pub = join(site, "public");
const out = join(here, "out");

const FONTS = {
  "fraunces-600.ttf":
    "https://fonts.gstatic.com/s/fraunces/v38/6NUh8FyLNQOQZAnv9bYEvDiIdE9Ea92uemAk_WBq8U_9v0c2Wa0K7iN7hzFUPJH58njr1a03gg7S2nfgRYIcaRyjDg.ttf",
  "outfit-400.ttf": "https://fonts.gstatic.com/s/outfit/v15/QGYyz_MVcBeNP4NjuGObqx1XmO1I4TC1C4E.ttf",
  "outfit-500.ttf": "https://fonts.gstatic.com/s/outfit/v15/QGYyz_MVcBeNP4NjuGObqx1XmO1I4QK1C4E.ttf",
  "inter-400.ttf": "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf",
  "inter-500.ttf": "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuI6fMZg.ttf",
  "inter-700.ttf": "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf",
};

// The site's dark look (site/src/styles.css): near-black page, light text, grey secondary text, gold.
const SITE = { page: "#0a0c0f", text: "#eceef1", muted: "#9aa1ab", gold: "#f2b84b" };

async function fontFiles() {
  const dir = join(here, ".fonts");
  mkdirSync(dir, { recursive: true });
  const files = [];
  for (const [name, url] of Object.entries(FONTS)) {
    const path = join(dir, name);
    if (!existsSync(path)) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Font download failed (${response.status}): ${url}`);
      writeFileSync(path, Buffer.from(await response.arrayBuffer()));
    }
    files.push(path);
  }
  return files;
}

const fonts = await fontFiles();

function png(svg, width) {
  return new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: { fontFiles: fonts, loadSystemFonts: false, defaultFontFamily: "Outfit" },
  })
    .render()
    .asPng();
}

function write(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
  console.log("wrote", path.replace(join(here, "..", ".."), "."), data.length, "bytes");
}

/** A .ico holding PNG images (supported by every current browser). */
function ico(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const at = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, at);
    header.writeUInt8(size >= 256 ? 0 : size, at + 1);
    header.writeUInt8(0, at + 2);
    header.writeUInt8(0, at + 3);
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(data.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}

const esc = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ── The 1200 x 630 link-preview backdrop: grid, and the two lines meeting on the right ──────────────
function backdrop() {
  const grid = [];
  for (let x = 60; x < 1200; x += 60) grid.push(`<line x1="${x}" y1="0" x2="${x}" y2="630"/>`);
  for (let y = 60; y < 630; y += 60) grid.push(`<line x1="0" y1="${y}" x2="1200" y2="${y}"/>`);
  return `
  <defs>
    <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${SITE.gold}" stop-opacity="0.45"/><stop offset="1" stop-color="${SITE.gold}" stop-opacity="0"/></radialGradient>
    <radialGradient id="ground" cx="0.8" cy="0.4" r="0.7"><stop offset="0" stop-color="${SITE.gold}" stop-opacity="0.08"/><stop offset="1" stop-color="${SITE.page}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1200" height="630" fill="${SITE.page}"/>
  <rect width="1200" height="630" fill="url(#ground)"/>
  <g stroke="#ffffff" stroke-width="1.5" opacity="0.05">${grid.join("")}</g>
  <path d="M640 120 C800 116 860 300 1030 312" fill="none" stroke="${SITE.gold}" stroke-width="6" stroke-linecap="round"/>
  <path d="M640 520 C800 524 864 324 1030 312" fill="none" stroke="${SITE.text}" stroke-width="6" stroke-linecap="round"/>
  <circle cx="1046" cy="312" r="70" fill="url(#halo)"/>
  <circle cx="1046" cy="312" r="14" fill="${SITE.gold}"/>`;
}

function brandRow(y = 70) {
  return `${placedTile(80, y, 72)}<text x="172" y="${y + 47}" font-family="Inter" font-weight="500" font-size="32" fill="${SITE.gold}">Par · stocks on Solana</text>`;
}

function previewSvg(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">${backdrop()}${brandRow()}${body}</svg>`;
}

// ── Site icons ──────────────────────────────────────────────────────────────────────────────────────
write(join(pub, "favicon.svg"), Buffer.from(tileSvg(64)));
write(join(pub, "favicon.ico"), ico([16, 32, 48].map((size) => ({ size, data: png(tileSvg(size), size) }))));
// Some apps and crawlers ask for /favicon.png whatever the page links to.
write(join(pub, "favicon.png"), png(tileSvg(48), 48));
write(join(pub, "apple-touch-icon.png"), png(squareSvg(180), 180));
write(join(pub, "icon-512.png"), png(squareSvg(512), 512));
// The "Add to home screen" icon (site/public/manifest.webmanifest lists 192 and 512).
write(join(pub, "icon-192.png"), png(squareSvg(192), 192));
// Telegram crops avatars to a circle, so the mark sits well inside it.
write(join(out, "bot-avatar.png"), png(squareSvg(640, 0.72), 640));

// ── Link previews ───────────────────────────────────────────────────────────────────────────────────
const heading = `font-family="Inter" font-weight="700" letter-spacing="-2"`;

write(
  join(pub, "og.png"),
  png(
    previewSvg(`
  <text x="76" y="292" ${heading} font-size="100" fill="${SITE.text}">Is the price</text>
  <text x="76" y="402" ${heading} font-size="100" fill="${SITE.gold}">real?</text>
  <text x="80" y="478" font-family="Inter" font-size="32" fill="${SITE.muted}">Tokenized stocks on Solana, checked</text>
  <text x="80" y="522" font-family="Inter" font-size="32" fill="${SITE.muted}">against Nasdaq, live.</text>`),
    1200,
  ),
);

write(
  join(pub, "og", "bot.png"),
  png(
    previewSvg(`
  <text x="76" y="292" ${heading} font-size="96" fill="${SITE.text}">Par on</text>
  <text x="76" y="398" ${heading} font-size="96" fill="${SITE.gold}">Telegram</text>
  <text x="80" y="470" font-family="Inter" font-size="32" fill="${SITE.muted}">An alert the moment a tokenized stock</text>
  <text x="80" y="512" font-family="Inter" font-size="32" fill="${SITE.muted}">is back at the share price.</text>
  <text x="80" y="566" font-family="Inter" font-weight="500" font-size="32" fill="${SITE.gold}">@ONPAR_BOT</text>`),
    1200,
  ),
);

// Per-name previews: badge in the sector's colours, the token and the company. No prices: they would be stale.
const tokensSource = readFileSync(join(site, "src", "lib", "tokens.ts"), "utf8");
const tokens = [
  ...tokensSource.matchAll(/symbol: "(\w+)", name: "([^"]+)", mint: "\w+", underlying: "(\w+)", sector: "([^"]+)", issuer: "(\w+)"/g),
].map((m) => ({ symbol: m[1], name: m[2], underlying: m[3], sector: m[4], issuer: m[5] }));
const brandSource = readFileSync(join(site, "src", "lib", "brand.ts"), "utf8");
const sectors = new Map(
  [...brandSource.matchAll(/(?:"([^"]+)"|(\w+)): \{ bg: "(#[0-9a-f]{6})", fg: "(#[0-9a-f]{6})" \}/g)].map((m) => [m[1] ?? m[2], { bg: m[3], fg: m[4] }]),
);
const expected = (tokensSource.match(/\{ symbol: "/g) ?? []).length;
if (tokens.length !== expected) throw new Error(`Expected ${expected} tokens, found ${tokens.length}`);

for (const token of tokens) {
  const colours = sectors.get(token.sector) ?? { bg: COLORS.dusk, fg: COLORS.foam };
  const badgeText = token.underlying.length > 4 ? 30 : 36;
  write(
    join(pub, "og", "s", `${token.symbol}.png`),
    png(
      previewSvg(`
  <rect x="80" y="196" width="132" height="132" rx="28" fill="${colours.bg}"/>
  <text x="146" y="${262 + badgeText / 3}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="${badgeText}" fill="${colours.fg}">${esc(token.underlying)}</text>
  <text x="240" y="290" ${heading} font-size="92" fill="${SITE.text}">${esc(token.symbol)}</text>
  <text x="244" y="336" font-family="Inter" font-size="32" fill="${SITE.muted}">${esc(token.name)} · ${token.issuer === "Backpack" ? "Backpack Securities" : esc(token.sector)}</text>
  <text x="80" y="448" font-family="Inter" font-weight="500" font-size="40" fill="${SITE.text}">Is the token at the share price?</text>
  <text x="80" y="504" font-family="Inter" font-size="32" fill="${SITE.gold}">Check it live on Par</text>`),
      1200,
    ),
  );
}

// A QR code for the /bot page, so a visitor on a computer can open the bot on their phone.
const qr = await QRCode.toString("https://t.me/ONPAR_BOT", {
  type: "svg",
  errorCorrectionLevel: "M",
  margin: 2,
  color: { dark: COLORS.night, light: COLORS.foam },
});
write(join(pub, "qr-bot.svg"), Buffer.from(qr));

console.log(`done: ${tokens.length} name previews, mark ${MARK.size}px source`);
