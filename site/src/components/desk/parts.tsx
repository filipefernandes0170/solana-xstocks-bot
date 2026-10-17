import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { formatGap, formatImpact, formatPct, formatUsd, impactHint, jupiterBuyUrl, multiplierLabel, perSharePrice } from "../../lib/format";
import { NO_PRINT_UNDERLYING } from "../../lib/tokens";
import type { Quote } from "../../lib/types";
import { buyUsable, legs } from "../../lib/verdict";

/** "1 NVDAx = 1.0017 shares" and the price per share. */
export function ShareMeter({
  symbol,
  multiplier,
  usdPrice,
  stockPrice,
}: {
  symbol: string;
  multiplier: number | null;
  usdPrice: number | null;
  stockPrice: number | null;
}) {
  const label = multiplierLabel(multiplier);
  const perShare = perSharePrice(usdPrice, multiplier);
  return (
    <div className="mt-4 rounded-2xl bg-foam px-4 py-3">
      <p className="text-sm text-muted">Share meter</p>
      <p className="mt-1 text-base font-medium text-ink">
        {label ? `1 ${symbol} = ${label} ${label === "1" ? "share" : "shares"}` : "Share count is loading."}
      </p>
      <p className="mt-1 text-sm text-muted">
        {perShare == null ? "Price per share is loading" : `${formatUsd(perShare)} per share`}
        {stockPrice == null ? "" : ` · Nasdaq ${formatUsd(stockPrice)}`}
      </p>
    </div>
  );
}

/** Opens Jupiter to buy the token with USDC. Par takes no fee. */
export function BuyLink({ mint, symbol }: { mint: string; symbol: string }) {
  return (
    <a
      href={jupiterBuyUrl(mint)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-11 shrink-0 items-center rounded-full bg-ink px-4 text-sm font-medium text-foam"
      aria-label={`Buy ${symbol} with USDC on Jupiter`}
    >
      Buy
    </a>
  );
}

/** 24h change pill with an arrow. */
export function ChangePill({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted">—</span>;
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-sm font-medium ${up ? "bg-pine-soft text-pine" : "bg-clay-soft text-clay"}`}
    >
      <Icon className="size-3.5" aria-hidden />
      {formatPct(value)}
    </span>
  );
}

/** Gap pill: red when the buy is rich, green when cheap. */
export function GapPill({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted">—</span>;
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-sm font-medium ${value > 0.02 ? "bg-clay-soft text-clay" : value < -0.02 ? "bg-pine-soft text-pine" : "bg-foam text-ink"}`}
    >
      {formatGap(value)}
    </span>
  );
}

/** The small print under each card: Nasdaq, the $1,000 buy, impact, and the issuer legs. */
export function VerdictDetail({ row, now }: { row: Quote; now: number }) {
  const buy = buyUsable(row.buyAt, now) ? row.buyPrice : null;
  const l = legs(buy, row.issuerPrice, row.stockPrice);
  const impact = buy != null && row.buyImpactPct != null && row.buyImpactPct > 0 ? row.buyImpactPct : null;
  const hint = impactHint(impact);
  return (
    <p className="text-sm leading-relaxed text-muted">
      {"Nasdaq "}
      {row.underlying === NO_PRINT_UNDERLYING ? "has no public print" : formatUsd(row.stockPrice)}
      {buy == null ? " · The $1,000 buy is still loading" : ` · A $1,000 buy pays ${formatUsd(buy)}`}
      {impact == null ? "" : ` and moves the price ${formatImpact(impact)}%`}
      {hint ? ` · ${hint}` : ""}
      {l.poolVersusIssuer != null && l.issuerVersusStock != null
        ? ` · Buy versus issuer ${formatGap(l.poolVersusIssuer)}. Issuer versus stock ${formatGap(l.issuerVersusStock)}.`
        : ""}
    </p>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="panel px-4 py-4 ring-1 ring-line">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl text-ink">{value}</p>
      <p className="mt-1 text-sm text-muted">{hint}</p>
    </div>
  );
}
