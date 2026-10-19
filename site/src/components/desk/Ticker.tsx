import { useEffect, useRef, useState } from "react";
import { formatPct, formatUsd } from "../../lib/format";
import type { Quote, VerdictId } from "../../lib/types";
import { verdictDotClass } from "./parts";

type TickerRow = Quote & { verdict: { id: VerdictId; title: string } };

/**
 * A running tape of every name: verdict dot, last trade and 24h move. It pauses on hover and stands still
 * (scrollable) for visitors who prefer reduced motion, and stops while it is scrolled out of view (a moving tape keeps
 * the browser drawing frames, which a phone pays for). Clicking a name jumps to its card. It is a visual shortcut only:
 * screen readers and the keyboard skip it, because Markets lists the same names.
 */
export function Ticker({ rows, onPick }: { rows: TickerRow[]; onPick: (symbol: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const element = box.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, [rows.length > 0]);
  if (rows.length === 0) return null;
  const items = (copy: number) =>
    rows.map((row) => (
      <li key={`${copy}-${row.symbol}`} className="shrink-0">
        <button
          type="button"
          tabIndex={-1}
          onClick={() => onPick(row.symbol)}
          className="inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm text-foam hover:bg-white/5"
          title={`${row.name}: ${row.verdict.title}`}
        >
          <span data-verdict className={`h-2 w-2 rounded-full ${verdictDotClass(row.verdict.id)}`} aria-hidden />
          <span className="font-medium">{row.symbol}</span>
          <span className="tabular-nums text-mist">{formatUsd(row.usdPrice)}</span>
          {row.change24h == null ? null : (
            <span className={`tabular-nums ${row.change24h < 0 ? "text-clay-bright" : "text-[#3dbe8b]"}`}>{formatPct(row.change24h)}</span>
          )}
        </button>
      </li>
    ));
  return (
    <div ref={box} aria-hidden className="ticker relative z-10 border-b border-white/10 bg-night/70 backdrop-blur" data-live>
      <div className="ticker-window">
        <div className={`ticker-track flex w-max py-1.5${onScreen ? "" : " ticker-offscreen"}`}>
          <ul className="flex items-center gap-1 pr-1">{items(0)}</ul>
          <ul className="flex items-center gap-1 pr-1">{items(1)}</ul>
        </div>
      </div>
    </div>
  );
}
