import { Ruler } from "lucide-react";
import { useState } from "react";
import { premiumUsd } from "../../lib/brand";
import { formatAmount, formatGap, formatImpact, formatUsd } from "../../lib/format";
import { isSessionOpen } from "../../lib/session";
import { SIZE_PRESETS, parseUsd, sizeCall } from "../../lib/size";
import { TOKENS, TOKEN_BY_SYMBOL } from "../../lib/tokens";
import type { SizeCheck as SizeResult } from "../../lib/types";
import { gapPct } from "../../lib/verdict";
import { checkSize } from "../../server/functions";
import { sizeShareText, stockUrl } from "../../lib/share";
import { ShareButton } from "../ShareButton";
import { BuyLink, TickerBadge } from "./parts";
import { numberFormat, dateFormat } from "../../lib/intl";

const TONE_CLASS = {
  fair: "bg-pine-soft text-pine",
  close: "bg-gold/25 text-ink",
  far: "bg-clay-soft text-clay",
  none: "bg-foam text-ink",
} as const;

const money = (value: number) =>
  numberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

/**
 * Size check: a live Jupiter quote at the amount the visitor types, priced per share and set against the
 * Nasdaq print. The $1,000 buy on each card answers "is it fair?"; this answers "is it fair for my order?".
 */
export function SizeCheck({
  symbol,
  onSymbol,
  variant = "section",
}: {
  symbol: string;
  onSymbol: (symbol: string) => void;
  /** "section": a panel on the page. "sheet": the body of the desk's Size check dialog, one column. */
  variant?: "section" | "sheet";
}) {
  const [amount, setAmount] = useState("1,000");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(SizeResult & { ok: true }) | null>(null);
  const token = TOKEN_BY_SYMBOL.get(symbol);

  async function run(usdText = amount, pick = symbol) {
    const usd = parseUsd(usdText);
    if (usd == null || usd < 10 || usd > 250_000) {
      setError("Type an amount from $10 to $250,000.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const answer = await checkSize({ data: { symbol: pick, usd } });
      if (answer.ok) setResult(answer);
      else {
        setResult(null);
        setError(answer.message);
      }
    } catch {
      setResult(null);
      setError("The check did not go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const gap = result ? gapPct(result.price, result.stockPrice) : null;
  const call = result ? sizeCall({ gap, impactPct: result.impactPct, open: isSessionOpen(result.marketState) }) : null;
  const premium = result ? premiumUsd(result.usd, result.shares, result.stockPrice) : null;
  const resultToken = result ? TOKEN_BY_SYMBOL.get(result.symbol) : undefined;
  // Two columns only once there is a result to show beside the form; before that the form stands alone.
  const twoColumns = variant === "section" && result != null;

  const body = (
    <div className={twoColumns ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-10" : "grid gap-6"}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
      >
        <p className="flex items-center gap-2 text-sm font-medium text-amber">
          <Ruler className="size-4" aria-hidden />
          Size check
        </p>
        <h2 id="size-check-title" className="mt-2 font-display text-3xl leading-tight text-ink sm:text-4xl">
          What does your order really cost?
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          The cards use a $1,000 buy. A thin pool can look fair at that size and cost several percent more at $25,000. Type your own amount
          for a live Jupiter quote, priced per share and set against Nasdaq.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <label className="text-sm text-muted">
            Name
            <select
              value={symbol}
              onChange={(event) => onSymbol(event.target.value)}
              className="mt-1 h-12 w-full rounded-2xl bg-foam px-3 text-base text-ink ring-1 ring-line"
            >
              {TOKENS.map((t) => (
                <option key={t.symbol} value={t.symbol}>
                  {t.name} ({t.symbol})
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-muted">
            Amount in USDC
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              autoComplete="off"
              className="mt-1 h-12 w-full rounded-2xl bg-foam px-3 text-base tabular-nums text-ink ring-1 ring-line"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Quick amounts">
          {SIZE_PRESETS.map((preset) => {
            const label = `$${preset.toLocaleString("en-US")}`;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setAmount(preset.toLocaleString("en-US"));
                  void run(String(preset));
                }}
                className="h-9 rounded-full bg-foam px-3 text-sm font-medium text-ink ring-1 ring-line"
              >
                {label}
              </button>
            );
          })}
        </div>
        <button
          type="submit"
          disabled={busy}
          className="mt-5 h-12 w-full rounded-full bg-ink px-6 text-sm font-medium text-foam disabled:opacity-60 sm:w-auto"
        >
          {busy ? "Asking Jupiter…" : `Check ${token?.symbol ?? "this name"}`}
        </button>
        {error ? (
          <p className="mt-3 text-sm text-clay" role="alert">
            {error}
          </p>
        ) : null}
      </form>

      <div aria-live="polite" className="min-w-0">
        {result && call ? (
          <div className="h-full rounded-2xl bg-foam p-5">
            <div className="flex items-center gap-3">
              {resultToken ? <TickerBadge underlying={resultToken.underlying} sector={resultToken.sector} /> : null}
              <div className="min-w-0">
                <p className="text-sm text-muted">
                  {money(result.usd)} of {result.symbol}
                </p>
                <p className="font-display text-2xl leading-tight text-ink sm:text-3xl">
                  {formatAmount(result.shares)} shares at {formatUsd(result.price)}
                </p>
              </div>
            </div>
            <p className={`mt-4 inline-flex rounded-full px-3 py-1 text-sm font-medium ${TONE_CLASS[call.tone]}`}>{call.title}</p>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-muted">Nasdaq print</dt>
                <dd className="mt-0.5 text-base font-medium tabular-nums text-ink">{formatUsd(result.stockPrice)}</dd>
              </div>
              <div>
                <dt className="text-muted">Gap versus Nasdaq</dt>
                <dd className="mt-0.5 text-base font-medium tabular-nums text-ink">{formatGap(gap)}</dd>
              </div>
              <div>
                <dt className="text-muted">{premium != null && premium < 0 ? "Saved versus Nasdaq" : "Extra versus Nasdaq"}</dt>
                <dd className="mt-0.5 text-base font-medium tabular-nums text-ink">{premium == null ? "—" : money(Math.abs(premium))}</dd>
              </div>
              <div>
                <dt className="text-muted">Pool impact</dt>
                <dd className="mt-0.5 text-base font-medium tabular-nums text-ink">{formatImpact(result.impactPct)}%</dd>
              </div>
            </dl>
            <p className="mt-4 text-sm leading-relaxed text-ink">{call.line}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {resultToken && call.tone !== "far" ? <BuyLink mint={resultToken.mint} symbol={resultToken.symbol} /> : null}
              <ShareButton
                title={`${result.symbol} size check on Par`}
                text={sizeShareText(result.symbol, result.usd, gap)}
                url={stockUrl(result.symbol)}
              />
              <p className="text-xs leading-relaxed text-muted">
                Live Jupiter quote,{" "}
                {dateFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(
                  new Date(result.at),
                )}
                . Prices move, so the fill is not guaranteed.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  return variant === "sheet" ? (
    body
  ) : (
    <section id="size-check" aria-labelledby="size-check-title" className="panel mt-8 scroll-mt-24 p-5 ring-1 ring-line sm:p-7">
      {body}
    </section>
  );
}
