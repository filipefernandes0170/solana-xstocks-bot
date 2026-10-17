import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { sectorColours } from "../../lib/brand";
import { isXStock } from "../../lib/bag";
import { treemap } from "../../lib/treemap";
import type { PortfolioLine } from "../../lib/types";

// The map is laid out in a 100 × 64 box and drawn in percent, so it scales with the page.
const W = 100;
const H = 64;

const OTHER_COLOURS = {
  Crypto: { bg: "#1d4d3c", fg: "#d4f2e4" },
  Cash: { bg: "#4d4636", fg: "#f6f1e6" },
};

function colours(line: PortfolioLine) {
  if (line.kind === "Crypto") return OTHER_COLOURS.Crypto;
  if (line.kind === "Cash") return OTHER_COLOURS.Cash;
  return sectorColours(line.sector);
}

function usd(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

/** Every position as a tile sized by its value, coloured by sector. xStock tiles open that name's page. */
export function BagMap({ lines, total }: { lines: PortfolioLine[]; total: number }) {
  const tiles = useMemo(() => treemap(lines.map((line) => ({ value: line.usdValue, item: line })), W, H), [lines]);
  if (tiles.length === 0) return null;
  return (
    <ul aria-label="Positions by value" className="relative aspect-[100/64] w-full overflow-hidden rounded-2xl">
      {tiles.map((tile) => {
        const line = tile.item;
        const weight = total > 0 ? (line.usdValue / total) * 100 : 0;
        const colour = colours(line);
        const showName = tile.w >= 11 && tile.h >= 7;
        const showWeight = tile.w >= 14 && tile.h >= 13;
        const label = `${line.name} (${line.symbol}): ${usd(line.usdValue)}, ${weight.toFixed(1)}% of the wallet`;
        const body = (
          <span
            className="flex h-full w-full flex-col justify-between overflow-hidden rounded-xl p-2 transition-[filter] hover:brightness-125"
            style={{ background: colour.bg, color: colour.fg }}
          >
            {showName ? <span className="truncate text-sm font-semibold leading-tight">{line.symbol}</span> : null}
            {showWeight ? (
              <span className="text-xs leading-tight opacity-80">
                {weight.toFixed(1)}
                {"% · "}
                {usd(line.usdValue)}
              </span>
            ) : null}
          </span>
        );
        const style = { left: `${tile.x}%`, top: `${(tile.y / H) * 100}%`, width: `${tile.w}%`, height: `${(tile.h / H) * 100}%` };
        return (
          <li key={`${line.kind}-${line.symbol}-${line.underlying}`} className="absolute p-0.5" style={style}>
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
  );
}
