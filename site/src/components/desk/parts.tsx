import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { FAIR_BAND, GAP_SCALE, gapPosition, sectorColours } from "../../lib/brand";
import { ageLabel, formatGap, formatImpact, formatPct, formatUsd, gapNumber, impactHint, jupiterBuyUrl, multiplierLabel } from "../../lib/format";
import type { Quote, VerdictId } from "../../lib/types";
import { buyUsable, legs, type OlderBuy } from "../../lib/verdict";

/**
 * The token's balance multiplier. Splits and reinvested dividends are added to every holder's balance,
 * so one token in a wallet tracks one share; the multiplier only says how much balances have grown.
 */
export function MultiplierNote({ symbol, multiplier }: { symbol: string; multiplier: number | null }) {
  const label = multiplierLabel(multiplier);
  if (!label) return <p className="text-sm text-muted">Balance multiplier is loading.</p>;
  return (
    <p className="text-sm leading-relaxed text-muted">
      {label === "1"
        ? `Each ${symbol} tracks one share. No split or dividend has been added yet.`
        : `Each ${symbol} tracks one share. Splits and dividends have grown balances ×${label}.`}
    </p>
  );
}

/** The underlying ticker on a tile coloured by sector. */
export function TickerBadge({ underlying, sector, size = "md" }: { underlying: string; sector: string; size?: "sm" | "md" }) {
  const colours = sectorColours(sector);
  const box = size === "sm" ? "h-9 w-9 rounded-lg" : "h-12 w-12 rounded-xl";
  const text = underlying.length > 4 ? "text-[0.6rem]" : size === "sm" ? "text-[0.65rem]" : "text-xs";
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center font-semibold tracking-wide ${box} ${text}`}
      style={{ background: colours.bg, color: colours.fg }}
    >
      {underlying}
    </span>
  );
}

/** Opens Jupiter to buy the token with USDC. Par takes no fee. */
export function BuyLink({ mint, symbol, compact = false }: { mint: string; symbol: string; compact?: boolean }) {
  return (
    <a
      href={jupiterBuyUrl(mint)}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex shrink-0 items-center rounded-lg bg-gold text-sm font-semibold text-night hover:brightness-105 ${compact ? "h-8 px-3" : "h-10 px-4"}`}
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

/**
 * Gap pill: red when the buy is rich, green when cheap. The number alone, in grey, while Nasdaq is closed (`closed`: the
 * print is the last one, and Par calls nothing cheap, rich or fair until the next open) or for an older buy (`older`:
 * past the 90 s the verdict uses, see BUY_SHOWN_MS).
 */
export function GapPill({ value, closed = false, older = false }: { value: number | null; closed?: boolean; older?: boolean }) {
  if (value == null) return <span className="text-muted">—</span>;
  if (closed || older) {
    return (
      <span
        className="inline-flex rounded-full bg-field px-2 py-0.5 text-sm font-medium text-muted ring-1 ring-line"
        title={older ? "An older $1,000 quote: a newer one is on its way" : "Nasdaq is closed: this is against the last Nasdaq print"}
      >
        {gapNumber(value)}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-sm font-medium ${value > 0.02 ? "bg-clay-soft text-clay" : value < -0.02 ? "bg-pine-soft text-pine" : "bg-field text-ink"}`}
    >
      {formatGap(value)}
    </span>
  );
}

/**
 * Where the $1,000 buy sits against the Nasdaq print, on a -2% to +2% scale with the fair band shaded. With no buy the
 * verdict can use, `older` (a recent but older buy, verdict.ts olderBuy) is drawn in grey with its age instead of
 * "Loading", while a newer one comes.
 */
export function GapMeter({
  gap,
  waiting,
  loading = false,
  closed = false,
  older = null,
}: {
  gap: number | null;
  waiting: string;
  loading?: boolean;
  closed?: boolean;
  older?: OlderBuy | null;
}) {
  const title = closed ? "Buy versus last Nasdaq print" : "Buy versus Nasdaq";
  const olderAge = gap == null && older != null ? ageLabel(older.ageMs) : null;
  const value = gap ?? older?.gap ?? null;
  if (value == null && loading) {
    // Same shape as the meter, shimmering, so the card does not jump when the buy arrives.
    return (
      <div className="rounded-2xl bg-field px-4 pb-2.5 pt-3" aria-busy="true">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted">{title}</span>
          <span className="shimmer h-5 w-24 rounded-full" aria-hidden />
        </div>
        <div className="shimmer mt-3 h-2 rounded-full" aria-hidden />
        <p className="mt-1.5 text-xs text-muted">{waiting}</p>
      </div>
    );
  }
  if (value == null) {
    return (
      <div className="rounded-2xl bg-field px-4 py-3">
        <p className="text-sm text-muted">{waiting}</p>
      </div>
    );
  }
  const { left, off } = gapPosition(value);
  const tone = closed || olderAge ? "bg-muted" : Math.abs(value) < FAIR_BAND ? "bg-pine" : Math.abs(value) < 1 ? "bg-gold" : "bg-clay";
  const print = closed ? "the last Nasdaq print" : "the Nasdaq print";
  const where = Math.abs(value) < 0.005 ? `at ${print}` : `${Math.abs(value).toFixed(2)}% ${value > 0 ? "above" : "below"} ${print}`;
  const label = olderAge ? `The last $1,000 quote, ${olderAge} old, was ${where}` : `The $1,000 buy is ${where}`;
  return (
    <div className="rounded-2xl bg-field px-4 pb-2.5 pt-3">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-muted">{title}</span>
        <GapPill value={value} closed={closed} older={olderAge != null} />
      </div>
      <div className="relative mt-3 h-2 rounded-full bg-field ring-1 ring-line" role="img" aria-label={label}>
        <span
          className="absolute inset-y-0 rounded-full bg-pine-soft"
          style={{ left: `${50 - (FAIR_BAND / (2 * GAP_SCALE)) * 100}%`, right: `${50 - (FAIR_BAND / (2 * GAP_SCALE)) * 100}%` }}
        />
        <span className="absolute inset-y-[-3px] left-1/2 w-px bg-muted/50" />
        <span
          className={`gap-dot absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card ${tone}`}
          style={{ left: `${left}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-muted">
        <span>{off === "left" ? "‹ cheaper" : "cheaper"}</span>
        <span>Nasdaq</span>
        <span>{off === "right" ? "pricier ›" : "pricier"}</span>
      </div>
      {olderAge ? <p className="mt-1.5 text-xs text-muted">{`Last $1,000 quote ${olderAge} old. A newer one is on its way.`}</p> : null}
    </div>
  );
}

/** A small coloured dot for a verdict, used in the ticker and the list view. */
export function verdictDotClass(id: VerdictId) {
  return id === "fair" ? "bg-[#3dbe8b]" : id === "wait" || id === "split" ? "bg-clay-bright" : id === "overnight" || id === "near" ? "bg-gold" : "bg-mist/60";
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
      {row.stockPrice == null ? "print not in yet" : formatUsd(row.stockPrice)}
      {buy == null ? " · The $1,000 buy is still loading" : ` · A $1,000 buy pays ${formatUsd(buy)} a share`}
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
