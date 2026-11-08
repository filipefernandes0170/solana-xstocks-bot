import { Link } from "@tanstack/react-router";
import { ArrowRight, Ruler } from "lucide-react";
import type { ReactNode } from "react";
import { THIN_POOL_USD, poolLabel } from "../../lib/brand";
import { ageLabel, formatGap, formatImpact, formatUsd, gapNumber, impactHint } from "../../lib/format";
import { etClock, isSessionOpen, sessionClosed, sessionLabel, timeToOpen } from "../../lib/session";
import { ISSUER_LABEL, TOKEN_BY_SYMBOL } from "../../lib/tokens";
import { verdictPillClass } from "../../lib/verdict";
import { GOLD_BUTTON, OUTLINE_BUTTON } from "../ui";
import { HeroLines } from "./HeroLines";
import { ChangePill, TickerBadge } from "./parts";
import type { DeskRow } from "./StockCard";

/*
 * The top of the desk in the dark dashboard look (8 Nov 2026): the Nasdaq session box, one featured name with its
 * prices and the hero lines, and that name's gap analysis. Every number is one the desk already had.
 */

/** Nasdaq right now: open, closed, premarket or after hours, with the time left or the time to the next open. */
export function MarketBox({ mounted, marketState, now }: { mounted: boolean; marketState: string | null; now: number }) {
  const open = isSessionOpen(marketState);
  const label = mounted ? sessionLabel(marketState, now) : "Checking";
  return (
    <div className="panel flex items-center gap-3 px-4 py-3" data-live>
      <span className={`size-2.5 shrink-0 rounded-full ${open ? "bg-pine" : label === "Closed" ? "bg-clay" : "bg-gold"}`} aria-hidden />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{label === "Open" ? "Nasdaq open" : `Nasdaq ${label.toLowerCase()}`}</span>
        <span className="block text-xs text-muted">{mounted ? (open ? `Live print · ${etClock(now)}` : `Opens in ${timeToOpen(now)} · ${etClock(now)}`) : "Reading the session"}</span>
      </span>
    </div>
  );
}

/** Which way a gap leans, as text colour: green under the stock, red over it, grey near zero or while Nasdaq is closed. */
function gapTone(gap: number | null, closed: boolean) {
  if (gap == null || closed) return "text-muted";
  return gap > 0.02 ? "text-clay" : gap < -0.02 ? "text-pine" : "text-ink";
}

function Metric({
  label,
  value,
  tone = "text-ink",
  sub,
  verdict = false,
  className = "",
}: {
  label: string;
  value: string;
  tone?: string;
  sub: ReactNode;
  verdict?: boolean;
  className?: string;
}) {
  return (
    <div className={`min-w-0 rounded-xl bg-field p-3 ring-1 ring-line sm:p-4 ${className}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 truncate font-display text-xl tabular-nums sm:text-2xl ${tone}`} data-verdict={verdict || undefined}>
        {value}
      </p>
      <div className="mt-1 text-xs text-muted" data-verdict={verdict || undefined}>
        {sub}
      </div>
    </div>
  );
}

/** One name in full: its prices next to the Nasdaq print, and the hero lines drawn for it. */
export function FeaturedPanel({
  row,
  age,
  asOf,
  feedError,
}: {
  row: DeskRow | undefined;
  age: number;
  asOf: number;
  feedError: string | null;
}) {
  if (!row) {
    return (
      <section className="panel p-5">
        <p className="text-sm text-muted">Loading the live prices…</p>
      </section>
    );
  }
  const issuer = TOKEN_BY_SYMBOL.get(row.symbol)?.issuer;
  const closed = sessionClosed(row.marketState);
  const gap = row.gap ?? row.older?.gap ?? null;
  const older = row.gap == null && row.older != null;
  return (
    <section className="panel min-w-0 p-4 sm:p-5" aria-label={`${row.name}, featured`} data-live>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <TickerBadge underlying={row.underlying} sector={row.sector} />
          <div className="min-w-0">
            <h2 className="truncate font-display text-2xl leading-tight text-ink">{row.symbol}</h2>
            <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
              <span className="truncate">{row.name}</span>
              {issuer ? <span className="rounded-md bg-gold/15 px-1.5 py-0.5 text-xs font-medium text-gold">{ISSUER_LABEL[issuer]}</span> : null}
              <span className="rounded-md bg-field px-1.5 py-0.5 text-xs text-muted ring-1 ring-line">{row.sector}</span>
            </p>
          </div>
        </div>
        <Link to="/s/$symbol" params={{ symbol: row.symbol }} className={OUTLINE_BUTTON}>
          View details
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>

      <div className="mt-4 grid items-center gap-4 lg:grid-cols-[13.5rem_minmax(0,1fr)]">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-1">
        <Metric
          label="Token price (Solana)"
          value={formatUsd(row.usdPrice)}
          sub={
            <span className="inline-flex items-center gap-1">
              <ChangePill value={row.change24h} /> 24h
            </span>
          }
        />
        <Metric label="Nasdaq price" value={formatUsd(row.stockPrice)} sub={closed ? "Last print" : "Live print"} />
        <Metric
          label="$1,000 buy versus Nasdaq"
          className="col-span-2 sm:col-span-1"
          value={gap == null ? "—" : closed || older ? gapNumber(gap) : formatGap(gap)}
          tone={gapTone(gap, closed || older)}
          verdict
          sub={row.buyPrice != null && gap != null ? `Buy at ${formatUsd(row.buyPrice)}${older && row.older ? ` · ${ageLabel(row.older.ageMs)} old` : ""}` : "Loading the $1,000 buy…"}
        />
      </div>

      <div className="mx-auto w-full max-w-[34rem]">
        <HeroLines key={row.symbol} rows={[row]} age={age} asOf={asOf} feedError={feedError} onPick={() => undefined} compact />
      </div>
      </div>
    </section>
  );
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line py-3 last:border-b-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="min-w-0 text-right text-sm text-ink">{children}</span>
    </div>
  );
}

/** The featured name's verdict, its pool, what a $1,000 buy moves, and how fresh the prices are. */
export function GapAnalysis({
  row,
  age,
  asOf,
  feedError,
  onSize,
}: {
  row: DeskRow | undefined;
  age: number;
  asOf: number;
  feedError: string | null;
  onSize: (symbol: string) => void;
}) {
  const impact = row?.buyImpactPct != null && row.buyImpactPct > 0 ? row.buyImpactPct : null;
  return (
    <section className="panel flex min-w-0 flex-col p-4 sm:p-5" aria-label="Price gap analysis" data-live>
      <h2 className="text-base font-semibold text-ink">Price gap analysis</h2>
      <div className="mt-2 flex-1">
        <Line label="Status">
          {row ? (
            <span className="flex flex-col items-end gap-1">
              <span data-verdict className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${verdictPillClass(row.verdict.id)}`}>
                {row.verdict.title}
              </span>
              <span data-verdict className="max-w-[16rem] text-xs leading-snug text-muted">
                {row.verdict.line}
              </span>
            </span>
          ) : (
            "—"
          )}
        </Line>
        <Line label="Pool">
          {row?.poolUsd == null ? (
            "—"
          ) : (
            <span className="flex flex-col items-end">
              <span className="font-semibold">{poolLabel(row.poolUsd)}</span>
              {row.poolUsd < THIN_POOL_USD ? <span className="text-xs text-muted">Too thin to quote a $1,000 buy</span> : null}
            </span>
          )}
        </Line>
        <Line label="$1,000 buy moves the price">
          {impact == null ? (
            "—"
          ) : (
            <span className="flex flex-col items-end">
              <span className="font-semibold">{`${formatImpact(impact)}%`}</span>
              <span className="text-xs text-muted">{impactHint(impact)}</span>
            </span>
          )}
        </Line>
        <Line label="Prices">
          <span className="inline-flex items-center gap-2">
            {/* A new key each time prices land plays the pulse once (styles.css .live-once), instead of looping. */}
            <span key={asOf} className="live-dot live-once" aria-hidden />
            <span className="font-semibold">{feedError ? "Reconnecting" : age < 60 ? `${age}s ago` : `${ageLabel(age * 1000)} ago`}</span>
            <span className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${feedError ? "bg-clay-soft text-clay" : "bg-pine-soft text-pine"}`}>
              {feedError ? "Paused" : "Live"}
            </span>
          </span>
        </Line>
      </div>
      {row ? (
        <div className="mt-4 grid gap-2">
          <Link to="/s/$symbol" params={{ symbol: row.symbol }} className={`${GOLD_BUTTON} h-11 w-full`}>
            View full analysis
            <ArrowRight className="size-4" aria-hidden />
          </Link>
          <button type="button" onClick={() => onSize(row.symbol)} className={`${OUTLINE_BUTTON} h-11 w-full`}>
            <Ruler className="size-4" aria-hidden />
            Size check {row.symbol}
          </button>
        </div>
      ) : null}
    </section>
  );
}
