import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { sectorColours } from "../../lib/brand";
import { isXStock } from "../../lib/bag";
import { treemap } from "../../lib/treemap";
import type { PortfolioLine } from "../../lib/types";
import { lineColour, shareLabel } from "./charts";
import { numberFormat } from "../../lib/intl";

// The map is laid out in a 100 × 64 box (100 × 96 on a phone, so the tiles have room for their labels) and drawn in
// percent, so it scales with the page.
const W = 100;
const WIDE_H = 64;
const NARROW_H = 96;

/** True on a phone-width screen; follows rotation and resizing. */
function useNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return narrow;
}

const OTHER_COLOURS = {
  Crypto: { bg: "#17493a", fg: "#d4f2e4" },
  Cash: { bg: "#5a4a2a", fg: "#fff1cf" },
};

function colours(line: PortfolioLine) {
  if (line.kind === "Crypto") return OTHER_COLOURS.Crypto;
  if (line.kind === "Cash") return OTHER_COLOURS.Cash;
  return sectorColours(line.sector);
}

function usd(value: number) {
  return numberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function keyLabel(line: PortfolioLine) {
  return line.kind === "Cash" ? "Cash" : line.kind === "Crypto" ? "Crypto" : line.sector;
}

/**
 * Every position as a tile sized by its value, in its sector's colour (a strip of the chart colour on top, the same
 * colour as the bars below), with a key under the map. xStock tiles open that name's page.
 */
export function BagMap({ lines, total }: { lines: PortfolioLine[]; total: number }) {
  const H = useNarrow() ? NARROW_H : WIDE_H;
  const tiles = useMemo(() => treemap(lines.map((line) => ({ value: line.usdValue, item: line })), W, H), [lines, H]);
  const key = useMemo(() => {
    const sums = new Map<string, { value: number; colour: string }>();
    for (const line of lines) {
      if (!(line.usdValue > 0)) continue;
      const label = keyLabel(line);
      const held = sums.get(label);
      sums.set(label, { value: (held?.value ?? 0) + line.usdValue, colour: lineColour(line) });
    }
    return [...sums.entries()].sort((a, b) => b[1].value - a[1].value);
  }, [lines]);
  if (tiles.length === 0) return null;
  const shownKey = key.slice(0, 6);
  return (
    <div>
      <ul aria-label="Positions by value" className="relative w-full overflow-hidden rounded-2xl bg-white/5" style={{ aspectRatio: `${W} / ${H}` }}>
        {tiles.map((tile, index) => {
          const line = tile.item;
          const weight = total > 0 ? (line.usdValue / total) * 100 : 0;
          const colour = colours(line);
          const accent = lineColour(line);
          const label = `${line.name} (${line.symbol}): ${usd(line.usdValue)}, ${shareLabel(line.usdValue, total)} of the wallet`;
          const body = (
            <span
              className="bag-tile relative flex h-full w-full flex-col justify-between overflow-hidden rounded-xl p-2 sm:p-2.5"
              style={{
                backgroundColor: colour.bg,
                backgroundImage: `linear-gradient(150deg, color-mix(in srgb, ${colour.bg} 72%, white) 0%, ${colour.bg} 52%, color-mix(in srgb, ${colour.bg} 82%, black) 100%)`,
                color: colour.fg,
                animationDelay: `${Math.min(index, 12) * 35}ms`,
              }}
            >
              <span className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} aria-hidden />
              {/* Which labels show depends on the tile's real size on screen (container queries in styles.css). */}
              <span className="bag-name truncate pt-0.5 font-semibold leading-tight">{line.symbol}</span>
              <span className="leading-tight">
                <span className="bag-weight font-display tabular-nums">{weight < 0.05 ? "<0.1" : weight.toFixed(1)}%</span>
                <span className="bag-value truncate text-xs tabular-nums opacity-80">{usd(line.usdValue)}</span>
              </span>
            </span>
          );
          const style = { left: `${tile.x}%`, top: `${(tile.y / H) * 100}%`, width: `${tile.w}%`, height: `${(tile.h / H) * 100}%` };
          return (
            <li key={`${line.kind}-${line.symbol}-${line.underlying}`} className="bag-cell absolute p-[3px]" style={style}>
              {isXStock(line) ? (
                <Link to="/s/$symbol" params={{ symbol: line.symbol }} aria-label={label} title={label} className="block h-full w-full">
                  {body}
                </Link>
              ) : (
                <span role="img" aria-label={label} title={label} className="block h-full w-full">
                  {body}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-muted" aria-label="Colours by sector">
        {shownKey.map(([name, { colour }]) => (
          <li key={name} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: colour }} />
            {name}
          </li>
        ))}
        {key.length > shownKey.length ? <li>+{key.length - shownKey.length} more</li> : null}
      </ul>
    </div>
  );
}
