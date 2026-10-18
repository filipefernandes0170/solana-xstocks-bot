// The portfolio's graphics: the allocation donut and its key, share bars, exposure bars, the SPY/QQQ chart, the meter
// for the bag versus Nasdaq, the spread meter and the badge in front of each holding. Every figure drawn here is one the
// page already shows as text; the shapes only make it easier to see.

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { FAIR_BAND, GAP_SCALE, gapPosition, sectorAccent } from "../../lib/brand";
import { isXStock } from "../../lib/bag";
import type { PortfolioLine } from "../../lib/types";
import { TickerBadge } from "../desk/parts";
import { numberFormat } from "../../lib/intl";

export function usd(value: number, digits = 2) {
  return numberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

/** "59.3%", and "<0.1%" for a part too small to show as 0.0% without hiding that it is there. */
export function shareLabel(part: number, total: number) {
  if (!(total > 0)) return "—";
  const pct = (part / total) * 100;
  return part > 0 && pct < 0.05 ? "<0.1%" : `${pct.toFixed(1)}%`;
}

/** A bar's width in percent: its true share, but never thinner than a sliver when the part is above zero. */
function barWidth(part: number, whole: number) {
  if (!(whole > 0) || !(part > 0)) return "0%";
  return `${Math.max((part / whole) * 100, 0.8)}%`;
}

export type Slice = { key: string; label: string; value: number; colour: string };

/** A ring split by value, with a thin gap between the slices, and one figure in the middle. */
export function Donut({ slices, total, label, value }: { slices: Slice[]; total: number; label: string; value: string }) {
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const shown = slices.filter((slice) => slice.value > 0);
  const gap = shown.length > 1 ? 1.4 : 0;
  let offset = 0;
  return (
    <svg viewBox="0 0 120 120" className="h-48 w-48 shrink-0 sm:h-52 sm:w-52" aria-hidden>
      <circle cx="60" cy="60" r={radius} fill="none" stroke="#ffffff12" strokeWidth="14" />
      <g transform="rotate(-90 60 60)">
        <g className="donut-ring">
          {shown.map((slice) => {
            const full = total > 0 ? (slice.value / total) * circumference : 0;
            const length = Math.max(0.6, full - gap);
            const arc = (
              <circle
                key={slice.key}
                cx="60"
                cy="60"
                r={radius}
                fill="none"
                stroke={slice.colour}
                strokeWidth="14"
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
              />
            );
            offset += full;
            return arc;
          })}
        </g>
      </g>
      <circle cx="60" cy="60" r="38" fill="none" stroke="#ffffff0d" strokeWidth="1" />
      <text x="60" y="55" textAnchor="middle" fill="#a9c4bc" fontSize="6.5" letterSpacing="1.4">
        {label.toUpperCase()}
      </text>
      <text x="60" y="73" textAnchor="middle" fill="#e7f3ee" fontSize="17" fontFamily="Fraunces, Georgia, serif">
        {value}
      </text>
    </svg>
  );
}

/** The donut's key: colour, name, share and dollars, with a thin bar for each. */
export function SliceKey({ slices, total }: { slices: Slice[]; total: number }) {
  return (
    <ul className="w-full space-y-3">
      {slices.map((slice) => (
        <li key={slice.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-mist">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: slice.colour }} />
              <span className="truncate">{slice.label}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              <span className="font-medium text-foam">{shareLabel(slice.value, total)}</span>
              <span className="text-mist"> · {usd(slice.value)}</span>
            </span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.07]">
            <div className="bar-grow h-full rounded-full" style={{ width: barWidth(slice.value, total), background: slice.colour }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** One bar per row, as a share of the total, coloured per row. */
export function ShareBars({ rows, total, empty }: { rows: Slice[]; total: number; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-mist">{empty}</p>;
  return (
    <ul className="space-y-4">
      {rows.map((row) => (
        <li key={row.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-mist">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: row.colour }} />
              <span className="truncate">{row.label}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              <span className="font-medium text-foam">{shareLabel(row.value, total)}</span>
              <span className="text-mist"> · {usd(row.value)}</span>
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.07]">
            <div
              className="bar-grow h-full rounded-full"
              style={{ width: barWidth(row.value, total), background: `linear-gradient(90deg, ${row.colour}b3, ${row.colour})` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

const DIRECT = "#5b8def";
const FUND_COLOURS: Record<string, string> = { SPYx: "#e0a04a", QQQx: "#a184f5" };

export type ExposureRow = { symbol: string; name: string; usd: number; direct: number; through: { fund: string; usd: number }[] };

/** Each company's exposure as one bar: the part held directly, then the parts inside each fund, against the largest. */
export function ExposureBars({ rows }: { rows: ExposureRow[] }) {
  const max = Math.max(0, ...rows.map((row) => row.usd));
  const funds = [...new Set(rows.flatMap((row) => row.through.map((t) => t.fund)))];
  const hasDirect = rows.some((row) => row.direct > 0);
  return (
    <>
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-mist" aria-label="Key">
        {hasDirect ? (
          <li className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: DIRECT }} />
            Held directly
          </li>
        ) : null}
        {funds.map((fund) => (
          <li key={fund} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: FUND_COLOURS[fund] ?? "#8fb3c0" }} />
            Inside {fund}
          </li>
        ))}
      </ul>
      <ul className="mt-3 divide-y divide-white/[0.07]">
        {rows.map((row) => (
          <li key={row.symbol} className="py-3">
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <p className="min-w-0 truncate text-foam">{row.name}</p>
              <p className="shrink-0 tabular-nums text-foam">{usd(row.usd)}</p>
            </div>
            <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-white/[0.07]" style={{ width: barWidth(row.usd, max) }}>
              {row.direct > 0 ? <span className="h-full" style={{ width: `${(row.direct / row.usd) * 100}%`, background: DIRECT }} /> : null}
              {row.through.map((t) => (
                <span key={t.fund} className="h-full" style={{ width: `${(t.usd / row.usd) * 100}%`, background: FUND_COLOURS[t.fund] ?? "#8fb3c0" }} />
              ))}
            </div>
            <p className="mt-1.5 text-xs text-mist">
              {row.direct > 0 ? `${usd(row.direct)} direct` : "Only through a fund"}
              {row.through.length > 0 ? ` · ${row.through.map((t) => `${usd(t.usd)} in ${t.fund}`).join(" · ")}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}

/** The same companies' weights in SPY (left) and QQQ (right), on one scale, so the heavier bet shows at a glance. */
export function OverlapChart({ rows }: { rows: { symbol: string; name: string; spy: number; qqq: number }[] }) {
  const max = Math.max(0, ...rows.flatMap((row) => [row.spy, row.qqq]));
  const pct = (weight: number) => `${(weight * 100).toFixed(2)}%`;
  return (
    <div className="mt-5">
      <div className="grid grid-cols-[minmax(0,1fr)_6.5rem_minmax(0,1fr)] gap-3 text-xs font-medium tracking-wide text-mist uppercase sm:grid-cols-[minmax(0,1fr)_9rem_minmax(0,1fr)]">
        <span className="flex items-center justify-end gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: FUND_COLOURS.SPYx }} />
          In SPY
        </span>
        <span />
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: FUND_COLOURS.QQQx }} />
          In QQQ
        </span>
      </div>
      <ul className="mt-2 space-y-2.5">
        {rows.map((row) => (
          <li
            key={row.symbol}
            className="grid grid-cols-[minmax(0,1fr)_6.5rem_minmax(0,1fr)] items-center gap-3 text-sm sm:grid-cols-[minmax(0,1fr)_9rem_minmax(0,1fr)]"
          >
            <span className="flex items-center justify-end gap-2">
              <span className="shrink-0 tabular-nums text-mist">{pct(row.spy)}</span>
              <span className="flex h-2.5 w-full max-w-[16rem] justify-end overflow-hidden rounded-full bg-white/[0.06]">
                <span className="bar-grow h-full rounded-full" style={{ width: barWidth(row.spy, max), background: FUND_COLOURS.SPYx }} />
              </span>
            </span>
            <span className="truncate text-center text-foam">{row.name}</span>
            <span className="flex items-center gap-2">
              <span className="flex h-2.5 w-full max-w-[16rem] overflow-hidden rounded-full bg-white/[0.06]">
                <span className="bar-grow h-full rounded-full" style={{ width: barWidth(row.qqq, max), background: FUND_COLOURS.QQQx }} />
              </span>
              <span className="shrink-0 tabular-nums text-mist">{pct(row.qqq)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "0.31% under Nasdaq", "0.12% over Nasdaq" or "at Nasdaq". */
export function versusNasdaq(pct: number | null) {
  if (pct == null) return "no Nasdaq print";
  if (Math.abs(pct) < 0.005) return "at Nasdaq";
  return `${Math.abs(pct).toFixed(2)}% ${pct > 0 ? "over" : "under"} Nasdaq`;
}

/** Where the bag's mark sits against the same shares at Nasdaq, on the desk's −2% to +2% scale with the fair band. */
export function MarkMeter({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  const { left, off } = gapPosition(pct);
  const tone = Math.abs(pct) < FAIR_BAND ? "bg-pine" : Math.abs(pct) < 1 ? "bg-gold" : "bg-clay";
  const band = 50 - (FAIR_BAND / (2 * GAP_SCALE)) * 100;
  return (
    <div className="mt-3 rounded-2xl bg-foam px-4 pb-2.5 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-sm">
        <span className="text-muted">Your stock tokens versus Nasdaq</span>
        <span className="font-medium tabular-nums">{versusNasdaq(pct)}</span>
      </div>
      <div className="relative mt-3 h-2 rounded-full bg-white ring-1 ring-line" role="img" aria-label={`Your stock tokens are marked ${versusNasdaq(pct)}`}>
        <span className="absolute inset-y-0 rounded-full bg-pine-soft" style={{ left: `${band}%`, right: `${band}%` }} />
        <span className="absolute inset-y-[-3px] left-1/2 w-px bg-muted/50" />
        <span
          className={`gap-dot absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white ${tone}`}
          style={{ left: `${left}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-muted">
        <span>{off === "left" ? "‹ under" : "under"}</span>
        <span>Nasdaq</span>
        <span>{off === "right" ? "over ›" : "over"}</span>
      </div>
    </div>
  );
}

/** Ten small steps, filled up to the spread score (10 is an even bag, 0 is one bet). */
export function SpreadMeter({ score }: { score: number | null }) {
  const filled = score == null ? 0 : Math.round(score);
  return (
    <span className="mt-2 flex gap-0.5" aria-hidden>
      {Array.from({ length: 10 }, (_, index) => (
        <span key={index} className={`h-1.5 flex-1 rounded-full ${index < filled ? "bg-amber" : "bg-line"}`} />
      ))}
    </span>
  );
}

/** Today's move as a pill with an arrow, in dollars and percent. */
export function TodayPill({ usdMove, pct }: { usdMove: number | null; pct: number | null }) {
  if (usdMove == null || pct == null) return <span className="text-muted">—</span>;
  const up = usdMove >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-medium tabular-nums ${up ? "bg-pine-soft text-pine" : "bg-clay-soft text-clay"}`}>
      <Icon className="size-4" aria-hidden />
      {`${up ? "+" : "−"}${usd(Math.abs(usdMove))} (${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(2)}%)`}
    </span>
  );
}

/** A 24h move on the dark panels. */
export function ChangeChip({ value }: { value: number | null }) {
  if (value == null) return <span className="text-mist">—</span>;
  const up = value >= 0;
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${up ? "bg-[#3dbe8b]/15 text-[#3dbe8b]" : "bg-clay-bright/15 text-clay-bright"}`}
    >
      {`${up ? "+" : "−"}${Math.abs(value).toFixed(2)}%`}
    </span>
  );
}

/** The badge in front of a holding: the ticker badge for a stock token, a round coloured mark for crypto and cash. */
export function LineBadge({ line }: { line: PortfolioLine }) {
  if (isXStock(line)) return <TickerBadge underlying={line.underlying} sector={line.sector} size="sm" />;
  const accent = sectorAccent(line.kind === "Cash" ? "Cash" : "Crypto");
  return (
    <span
      aria-hidden
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[0.6rem] font-semibold tracking-wide"
      style={{ background: `${accent}24`, color: accent, boxShadow: `inset 0 0 0 1px ${accent}55` }}
    >
      {line.symbol.slice(0, 4).toUpperCase()}
    </span>
  );
}

/** The colour a line gets in the charts: its sector for stock tokens, Cash or Crypto for the rest. */
export function lineColour(line: Pick<PortfolioLine, "kind" | "sector">) {
  return sectorAccent(line.kind === "Cash" ? "Cash" : line.kind === "Crypto" ? "Crypto" : line.sector);
}
