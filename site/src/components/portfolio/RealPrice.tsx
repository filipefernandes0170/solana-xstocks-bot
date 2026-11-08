import { Link } from "@tanstack/react-router";
import { DoorOpen } from "lucide-react";
import { useState } from "react";
import { EXIT_LIMIT, exitTotals, exitVersus, realPriceTotals, type RealPriceRow } from "../../lib/bag";
import { THIN_POOL_USD } from "../../lib/brand";
import { formatImpact, formatUsd } from "../../lib/format";
import { sessionLine } from "../../lib/session";
import type { ExitCheck } from "../../lib/types";
import { verdictPillClass } from "../../lib/verdict";
import { checkExit } from "../../server/functions";
import { GapPill, TickerBadge } from "../desk/parts";
import { MarkMeter, versusNasdaq } from "./charts";
import { numberFormat } from "../../lib/intl";

type ExitOk = Extract<ExitCheck, { ok: true }>;
type ExitState = ExitCheck | "queued" | "checking" | "small" | "beyond";

function money(value: number) {
  return numberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function signed(value: number) {
  return `${value >= 0 ? "+" : "−"}${money(Math.abs(value))}`;
}

function signedPct(value: number | null) {
  return value == null ? "" : `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}%`;
}

function shareCount(value: number) {
  return numberFormat("en-US", { maximumFractionDigits: 4 }).format(value);
}

/** What the $1,000 buy column says: the buy against Nasdaq, or why there is none (a thin pool is never quoted). */
function buyNote(row: RealPriceRow) {
  if (row.buyGap != null) return versusNasdaq(row.buyGap);
  if (row.quote.poolUsd != null && row.quote.poolUsd < THIN_POOL_USD) return "Pool too thin to quote $1,000";
  return "Buy quote loading";
}

/** One sale quote, asked once more after a pause when Jupiter is busy. */
async function exitFor(symbol: string, shares: number): Promise<ExitCheck> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await checkExit({ data: { symbol, shares } });
      if (result.ok || !result.message.includes("busy") || attempt === 1) return result;
    } catch {
      if (attempt === 1) return { ok: false, message: "The check did not go through. Try again." };
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  return { ok: false, message: "The check did not go through. Try again." };
}

function ExitCell({ state }: { state: ExitState | undefined }) {
  if (state == null) return <span className="text-muted">—</span>;
  if (state === "queued") return <span className="text-muted">In line</span>;
  if (state === "checking") return <span className="text-ink">Asking Jupiter…</span>;
  if (state === "small") return <span className="text-muted">Under $1</span>;
  if (state === "beyond") return <span className="text-muted">Only the {EXIT_LIMIT} largest are checked</span>;
  if (!state.ok) return <span className="text-sm text-clay">{state.message}</span>;
  const versus = exitVersus(state);
  return (
    <span className="block">
      <span className="block font-medium tabular-nums text-ink">{money(state.usd)}</span>
      <span className="block text-xs leading-relaxed text-muted">
        {formatUsd(state.price)}
        {" a share · "}
        {versusNasdaq(versus.vsNasdaqPct)}
        {" · moves the price "}
        {formatImpact(state.impactPct)}
        {"%"}
      </span>
    </span>
  );
}

function NameCell({ row }: { row: RealPriceRow }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <TickerBadge underlying={row.line.underlying} sector={row.line.sector} size="sm" />
      <span className="min-w-0">
        <Link to="/s/$symbol" params={{ symbol: row.line.symbol }} className="block font-medium text-ink hover:underline hover:underline-offset-4">
          {row.line.symbol}
        </Link>
        <span className="block truncate text-xs text-muted">
          {shareCount(row.line.amount)}
          {" shares · "}
          {row.line.name}
        </span>
      </span>
    </span>
  );
}

/**
 * The bag next to the shares it tracks: each xStock at the last trade and at the Nasdaq print, the desk's verdict
 * on a $1,000 buy, and, on request, what selling each position would return now (a live Jupiter quote at that size).
 */
export function RealPrice({
  rows,
  now,
  marketState,
  onRunning,
}: {
  rows: RealPriceRow[];
  now: number;
  marketState: string | null;
  onRunning: (running: boolean) => void;
}) {
  const [exits, setExits] = useState<Record<string, ExitState>>({});
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const totals = realPriceTotals(rows);
  const targets = rows
    .filter((row) => row.marked >= 1)
    .sort((a, b) => b.marked - a.marked)
    .slice(0, EXIT_LIMIT);
  const answered = Object.values(exits).filter((state): state is ExitOk => typeof state === "object" && state.ok);
  const sale = answered.length > 0 ? exitTotals(answered) : null;

  async function runExits() {
    if (running || targets.length === 0) return;
    setRunning(true);
    onRunning(true);
    setDone(0);
    const chosen = new Set(targets.map((row) => row.line.symbol));
    setExits(Object.fromEntries(rows.map((row) => [row.line.symbol, chosen.has(row.line.symbol) ? "queued" : row.marked < 1 ? "small" : "beyond"])));
    try {
      for (const [index, row] of targets.entries()) {
        setExits((previous) => ({ ...previous, [row.line.symbol]: "checking" }));
        const result = await exitFor(row.line.symbol, row.line.amount);
        setExits((previous) => ({ ...previous, [row.line.symbol]: result }));
        setDone(index + 1);
      }
    } finally {
      setRunning(false);
      onRunning(false);
    }
  }

  const markLine =
    totals.diffPct == null
      ? "The Nasdaq prints are still loading."
      : Math.abs(totals.diffPct) < 0.02
        ? "Your tokens are marked at the shares they track."
        : totals.diffUsd > 0
          ? `Your tokens are marked ${money(totals.diffUsd)} above the shares they track. A sale only gets that if the pool pays it.`
          : `Your tokens are marked ${money(Math.abs(totals.diffUsd))} under the shares they track.`;

  return (
    <section aria-labelledby="real-title" className="panel rise mt-6 p-4 text-ink sm:p-6">
      <p className="text-sm font-medium text-amber">At the real price</p>
      <h2 id="real-title" className="mt-1 font-display text-2xl leading-tight">
        Your tokens, next to the shares they track
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
        {"Marked is the last trade on Solana. At Nasdaq is the same number of shares at the Nasdaq print. "}
        {sessionLine(marketState, now)}
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-field px-4 py-3 ring-1 ring-line">
          <p className="text-sm text-muted">Marked on Solana</p>
          <p className="mt-1 font-display text-2xl tabular-nums">{money(totals.marked)}</p>
        </div>
        <div className="rounded-xl bg-field px-4 py-3 ring-1 ring-line">
          <p className="text-sm text-muted">Same shares at Nasdaq</p>
          <p className="mt-1 font-display text-2xl tabular-nums">{totals.diffPct == null ? "—" : money(totals.atNasdaq)}</p>
        </div>
        <div className="rounded-xl bg-field px-4 py-3 ring-1 ring-line">
          <p className="text-sm text-muted">Difference</p>
          <p className="mt-1 font-display text-2xl tabular-nums">{totals.diffPct == null ? "—" : signed(totals.diffUsd)}</p>
          <p className="text-sm text-muted">{signedPct(totals.diffPct)}</p>
        </div>
      </div>
      <MarkMeter pct={totals.diffPct} />
      <p className="mt-3 text-sm leading-relaxed">
        {markLine}
        {totals.unprinted > 0 ? " Names whose Nasdaq print has not come in are left out of these sums." : ""}
      </p>

      <div className="mt-6 rounded-xl bg-field p-4 ring-1 ring-line sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <p className="flex items-center gap-2 font-medium">
              <DoorOpen className="size-4" aria-hidden />
              Exit price
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              What selling each position for USDC on Jupiter would return right now, quoted at your size. Par only asks for a quote: nothing is signed or
              sent.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void runExits()}
            disabled={running || targets.length === 0}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-gold px-4 text-sm font-semibold text-night hover:brightness-105 disabled:opacity-60"
          >
            {running ? `Checking ${Math.min(done + 1, targets.length)} of ${targets.length}…` : sale ? "Check again" : "Check exit prices"}
          </button>
        </div>
        <p className="sr-only" aria-live="polite">
          {running ? `Checking ${Math.min(done + 1, targets.length)} of ${targets.length}` : sale ? "Exit prices checked" : ""}
        </p>
        {sale ? (
          <p className="mt-4 text-base leading-relaxed">
            {"Selling the "}
            {answered.length === 1 ? "checked name" : `${answered.length} checked names`}
            {" now returns about "}
            <b>{money(sale.usd)}</b>
            {". That is "}
            {signed(sale.vsMarkUsd)}
            {sale.vsMarkPct == null ? "" : ` (${signedPct(sale.vsMarkPct)})`}
            {" versus the mark"}
            {sale.vsNasdaqUsd == null ? "" : `, and ${signed(sale.vsNasdaqUsd)} versus the same shares at Nasdaq`}
            {"."}
          </p>
        ) : null}
        <p className="mt-3 text-xs leading-relaxed text-muted">
          A quote is not a fill: the price can move before a trade, and each name is quoted on its own. Quotes wait for Jupiter's free rate limit, so a full
          check takes a few seconds per name.
        </p>
      </div>

      <div className="mt-6 hidden overflow-x-auto md:block">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th className="py-3 pr-3 font-medium">Name</th>
              <th className="px-3 py-3 font-medium">Marked</th>
              <th className="px-3 py-3 font-medium">At Nasdaq</th>
              <th className="px-3 py-3 font-medium">Token vs print</th>
              <th className="px-3 py-3 font-medium">$1,000 buy</th>
              <th className="py-3 pl-3 font-medium">Exit now</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.line.symbol} className="border-b border-line/70 align-top">
                <td className="py-4 pr-3">
                  <NameCell row={row} />
                </td>
                <td className="px-3 py-4 tabular-nums">
                  <span className="block font-medium">{money(row.marked)}</span>
                  <span className="block text-xs text-muted">{formatUsd(row.quote.usdPrice)} a share</span>
                </td>
                <td className="px-3 py-4 tabular-nums">
                  <span className="block font-medium">{row.atNasdaq == null ? "—" : money(row.atNasdaq)}</span>
                  <span className="block text-xs text-muted">{row.quote.stockPrice == null ? "No print" : `${formatUsd(row.quote.stockPrice)} a share`}</span>
                </td>
                <td className="px-3 py-4">
                  <GapPill value={row.tokenGap} />
                </td>
                <td className="px-3 py-4">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-sm font-medium ${verdictPillClass(row.verdict.id)}`}>{row.verdict.title}</span>
                  <span className="mt-1 block text-xs text-muted">{buyNote(row)}</span>
                </td>
                <td className="max-w-[16rem] py-4 pl-3">
                  <ExitCell state={exits[row.line.symbol]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="mt-6 grid gap-3 md:hidden">
        {rows.map((row) => (
          <li key={row.line.symbol} className="rounded-xl bg-field p-4 ring-1 ring-line">
            <div className="flex items-start justify-between gap-3">
              <NameCell row={row} />
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-sm font-medium ${verdictPillClass(row.verdict.id)}`}>{row.verdict.title}</span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted">Marked</dt>
                <dd className="font-medium tabular-nums">{money(row.marked)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">At Nasdaq</dt>
                <dd className="font-medium tabular-nums">{row.atNasdaq == null ? "No print" : money(row.atNasdaq)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Token vs print</dt>
                <dd className="mt-0.5">
                  <GapPill value={row.tokenGap} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">$1,000 buy</dt>
                <dd>{buyNote(row)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-muted">Exit now</dt>
                <dd>
                  <ExitCell state={exits[row.line.symbol]} />
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}
