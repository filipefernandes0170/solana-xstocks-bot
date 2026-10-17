// The Par mark: two lines, the token price (gold) and the stock price (pale), meeting at one point.
// One source for every image tools/brand/make-images.mjs renders. The site draws the same geometry in
// site/src/components/Logo.tsx; site/tests/features.test.ts checks the two stay identical.

export const COLORS = {
  night: "#0b1c26",
  dusk: "#143240",
  foam: "#e7f3ee",
  mist: "#a9c4bc",
  gold: "#e0a04a",
};

// Geometry on a 140 x 140 tile.
export const MARK = {
  size: 140,
  radius: 30,
  gold: "M26 46 C62 46 66 70 100 70",
  foam: "M26 94 C62 94 66 70 100 70",
  stroke: 10,
  dot: { cx: 110, cy: 70, r: 8 },
};

/** The mark's lines and dot, drawn in a 140-unit box (no background). */
export function markShapes() {
  return [
    `<path d="${MARK.gold}" fill="none" stroke="${COLORS.gold}" stroke-width="${MARK.stroke}" stroke-linecap="round"/>`,
    `<path d="${MARK.foam}" fill="none" stroke="${COLORS.foam}" stroke-width="${MARK.stroke}" stroke-linecap="round"/>`,
    `<circle cx="${MARK.dot.cx}" cy="${MARK.dot.cy}" r="${MARK.dot.r}" fill="${COLORS.gold}"/>`,
  ].join("");
}

/** The mark on its rounded night tile, as a standalone SVG. */
export function tileSvg(pixels = MARK.size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels}" height="${pixels}" viewBox="0 0 ${MARK.size} ${MARK.size}"><rect width="${MARK.size}" height="${MARK.size}" rx="${MARK.radius}" fill="${COLORS.night}"/>${markShapes()}</svg>`;
}

/** The mark on a square, edge-to-edge night background (for icons that the platform rounds or crops itself). */
export function squareSvg(pixels, scale = 0.86) {
  const s = MARK.size;
  const offset = (s - s * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels}" height="${pixels}" viewBox="0 0 ${s} ${s}"><rect width="${s}" height="${s}" fill="${COLORS.night}"/><g transform="translate(${offset} ${offset}) scale(${scale})">${markShapes()}</g></svg>`;
}

/** The mark placed on a larger canvas at (x, y) with the given size, on its tile. */
export function placedTile(x, y, size) {
  const k = size / MARK.size;
  return `<g transform="translate(${x} ${y}) scale(${k})"><rect width="${MARK.size}" height="${MARK.size}" rx="${MARK.radius}" fill="${COLORS.night}" stroke="${COLORS.dusk}" stroke-width="2"/>${markShapes()}</g>`;
}
