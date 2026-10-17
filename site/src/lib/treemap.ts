// Squarified treemap: each value gets a rectangle whose area is its share of the box, with the rectangles
// kept as close to square as the values allow (Bruls, Huizing and van Wijk, 2000). Used by the portfolio's map.

export type Tile<T> = { item: T; value: number; x: number; y: number; w: number; h: number };

/** The worst (largest) aspect ratio of a row of areas laid along a side of this length. */
function worst(areas: number[], side: number) {
  const sum = areas.reduce((total, area) => total + area, 0);
  const max = Math.max(...areas);
  const min = Math.min(...areas);
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
}

/** Lays out positive values in a width × height box, largest first. Values that are not positive are left out. */
export function treemap<T>(entries: { value: number; item: T }[], width: number, height: number): Tile<T>[] {
  const items = entries.filter((entry) => Number.isFinite(entry.value) && entry.value > 0).sort((a, b) => b.value - a.value);
  const total = items.reduce((sum, entry) => sum + entry.value, 0);
  if (!(total > 0) || !(width > 0) || !(height > 0)) return [];
  const scale = (width * height) / total;
  const tiles: Tile<T>[] = [];
  let x = 0;
  let y = 0;
  let w = width;
  let h = height;
  let i = 0;
  while (i < items.length) {
    const side = Math.min(w, h);
    const row = [items[i]];
    i += 1;
    while (i < items.length) {
      const current = worst(row.map((entry) => entry.value * scale), side);
      const next = worst([...row, items[i]].map((entry) => entry.value * scale), side);
      if (next > current) break;
      row.push(items[i]);
      i += 1;
    }
    const rowArea = row.reduce((sum, entry) => sum + entry.value * scale, 0);
    if (w >= h) {
      // A column along the left edge.
      const columnWidth = i >= items.length ? w : rowArea / h;
      let top = y;
      for (const entry of row) {
        const tileHeight = (entry.value * scale) / columnWidth;
        tiles.push({ item: entry.item, value: entry.value, x, y: top, w: columnWidth, h: tileHeight });
        top += tileHeight;
      }
      x += columnWidth;
      w -= columnWidth;
    } else {
      // A row along the top edge.
      const rowHeight = i >= items.length ? h : rowArea / w;
      let left = x;
      for (const entry of row) {
        const tileWidth = (entry.value * scale) / rowHeight;
        tiles.push({ item: entry.item, value: entry.value, x: left, y, w: tileWidth, h: rowHeight });
        left += tileWidth;
      }
      y += rowHeight;
      h -= rowHeight;
    }
  }
  return tiles;
}
