import { useEffect, useMemo, useState } from "react";
import { ageLabel, formatGap, formatUsd, gapNumber } from "../../lib/format";
import { sessionClosed } from "../../lib/session";
import { gapPct, verdictPillClass } from "../../lib/verdict";
import type { DeskRow } from "./StockCard";

const W = 560;
const H = 340;
const MEET = { x: 452, y: 170 };
const START_X = 64;

/** How far apart the two lines start: close together near par, wide apart when the gap is large. */
export function spread(gap: number) {
  return 30 + (Math.min(Math.abs(gap), 2) / 2) * 100;
}

function curve(y0: number) {
  return `M${START_X} ${y0} C250 ${y0} 300 ${MEET.y} ${MEET.x - 8} ${MEET.y}`;
}

type Shown = { row: DeskRow; price: number; gap: number; source: "buy" | "last" };

/**
 * The hero: one name at a time, drawn as the logo draws it. Gold is the token's price on Solana, pale is the
 * Nasdaq print, and the dot is where they would meet. The lines start further apart the bigger the gap.
 * Every number shown is live; names rotate every 7 s. Clicking opens that name's card.
 */
export function HeroLines({
  rows,
  age,
  feedError,
  onPick,
}: {
  rows: DeskRow[];
  age: number;
  feedError: string | null;
  onPick: (symbol: string) => void;
}) {
  const shown: Shown[] = useMemo(() => {
    const out: Shown[] = [];
    for (const row of rows) {
      if (row.stockPrice == null) continue;
      if (row.gap != null && row.buyPrice != null) out.push({ row, price: row.buyPrice, gap: row.gap, source: "buy" });
      else if (row.usdPrice != null) {
        const gap = gapPct(row.usdPrice, row.stockPrice);
        if (gap != null) out.push({ row, price: row.usdPrice, gap, source: "last" });
      }
    }
    // Fair names first, then the rest in desk order.
    return [...out.filter((s) => s.row.verdict.id === "fair"), ...out.filter((s) => s.row.verdict.id !== "fair")];
  }, [rows]);

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || shown.length < 2) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % shown.length), 7000);
    return () => window.clearInterval(timer);
  }, [paused, shown.length]);

  const current = shown.length ? shown[index % shown.length] : null;
  const d = current ? spread(current.gap) : 70;
  const goldY = MEET.y - d;
  const foamY = MEET.y + d;
  const pct = (value: number, of: number) => `${(value / of) * 100}%`;

  return (
    <figure
      data-live
      className="hero-lines relative w-full select-none"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        {current ? (
          <button type="button" onClick={() => onPick(current.row.symbol)} className="min-w-0 text-left">
            <span className="block truncate font-display text-2xl text-foam">{current.row.name}</span>
            <span className="block text-sm text-mist">
              {current.row.symbol}
              {" · "}
              {current.source === "buy" ? "a $1,000 buy versus Nasdaq" : "the last trade versus Nasdaq"}
            </span>
          </button>
        ) : (
          <span className="text-sm text-mist">Waiting for live prices</span>
        )}
        <span className="inline-flex shrink-0 items-center gap-2 text-sm font-medium text-foam">
          {current ? (
            <span data-verdict className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${verdictPillClass(current.row.verdict.id)}`}>
              {current.row.verdict.title}
            </span>
          ) : null}
          <span className="live-dot" aria-hidden />
          <span aria-hidden>{feedError ? "Reconnecting" : age < 60 ? `${age}s` : ageLabel(age * 1000)}</span>
          {/* Screen readers hear only the change between live and reconnecting, not every second. */}
          <span className="sr-only" role="status">
            {feedError ? "Prices reconnecting" : "Prices live"}
          </span>
        </span>
      </div>

      <div className="relative" style={{ aspectRatio: `${W} / ${H}` }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" aria-hidden>
          <g stroke="#143240" strokeWidth="1">
            {Array.from({ length: 13 }, (_, i) => (
              <line key={`v${i}`} x1={40 + i * 40} y1="10" x2={40 + i * 40} y2={H - 10} />
            ))}
            {Array.from({ length: 8 }, (_, i) => (
              <line key={`h${i}`} x1="20" y1={30 + i * 40} x2={W - 20} y2={30 + i * 40} />
            ))}
          </g>
          <path className="hero-line" d={curve(goldY)} fill="none" stroke="#e0a04a" strokeWidth="5" strokeLinecap="round" />
          <path className="hero-line" d={curve(foamY)} fill="none" stroke="#e7f3ee" strokeWidth="5" strokeLinecap="round" />
          <path className="hero-flow hero-line" d={curve(goldY)} fill="none" stroke="#f8edd4" strokeWidth="2" strokeLinecap="round" />
          <path className="hero-flow hero-line" d={curve(foamY)} fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
          <circle className="hero-halo" cx={MEET.x} cy={MEET.y} r="26" fill="#e0a04a" />
          <circle cx={MEET.x} cy={MEET.y} r="9" fill="#e0a04a" />
        </svg>

        {current ? (
          <>
            <div className="hero-label absolute" style={{ left: pct(START_X, W), top: pct(goldY, H), transform: "translateY(calc(-100% - 10px))" }}>
              <span className="block text-xs text-mist">{current.source === "buy" ? "$1,000 buy on Solana" : "Last trade on Solana"}</span>
              <span className="block font-display text-xl tabular-nums text-gold sm:text-2xl">{formatUsd(current.price)}</span>
            </div>
            <div className="hero-label absolute" style={{ left: pct(START_X, W), top: pct(foamY, H), transform: "translateY(10px)" }}>
              <span className="block font-display text-xl tabular-nums text-foam sm:text-2xl">{formatUsd(current.row.stockPrice)}</span>
              <span className="block text-xs text-mist">Nasdaq print</span>
            </div>
            <div
              className="hero-label absolute text-center"
              style={{ left: pct(MEET.x, W), top: pct(MEET.y, H), transform: "translate(-50%, calc(-100% - 22px))" }}
            >
              <span className="block whitespace-nowrap text-sm font-medium text-gold">{sessionClosed(current.row.marketState) ? gapNumber(current.gap) : formatGap(current.gap)}</span>
            </div>
          </>
        ) : null}
      </div>
      <figcaption className="mt-2 text-xs leading-relaxed text-mist">
        Gold is the token on Solana, pale is the share on Nasdaq. The closer they start, the closer the price is to real.
      </figcaption>
    </figure>
  );
}
