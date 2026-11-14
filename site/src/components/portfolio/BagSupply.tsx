import { Factory } from "lucide-react";
import { formatCompactUsd } from "../../lib/format";
import { utcStamp } from "../../lib/session";
import { SUPPLY_MIN_AGE_MS, type SupplyResult } from "../../lib/supply";
import type { PortfolioLine } from "../../lib/types";
import { changeWords } from "../stock/SupplyCard";

/**
 * "Your bag's flows": for the stock tokens held, how many exist on Solana and how many were created or burned since
 * the site's daily reading (lib/supply.ts), plus where the bot's live flow alerts are. The "Watch this bag" panel follows it.
 */
export function BagSupply({
  lines,
  supply,
  prices,
  error,
}: {
  lines: PortfolioLine[];
  supply: SupplyResult | null;
  prices: Map<string, number | null>;
  error: string | null;
}) {
  const held = lines.filter((line) => line.kind === "Stock" || line.kind === "ETF").sort((a, b) => b.usdValue - a.usdValue);
  const rows = held.flatMap((line) => {
    const row = supply?.rows.find((entry) => entry.symbol === line.symbol);
    return row ? [{ line, row, price: prices.get(line.symbol) ?? null }] : [];
  });
  const startsAt = supply?.firstReading != null ? supply.firstReading + SUPPLY_MIN_AGE_MS : null;
  return (
    <section aria-labelledby="bag-supply-title" className="panel rise p-4 text-ink sm:p-5">
      <p className="flex items-center gap-2 text-sm font-medium text-amber">
        <Factory className="size-4" aria-hidden />
        Supply on Solana
      </p>
      <h2 id="bag-supply-title" className="mt-1 font-display text-xl leading-tight">
        Your bag&apos;s flows
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {"Tokens are created when the issuer issues new ones and burned when they are redeemed. "}
        {supply?.since != null
          ? `Changes since ${utcStamp(Math.floor(supply.since / 1000))} UTC, read from each mint.`
          : startsAt != null
            ? `Par keeps one reading a day; changes show here from ${utcStamp(Math.floor(startsAt / 1000))} UTC.`
            : "Par keeps one reading a day; changes show here once a reading is a day old."}
      </p>
      {error ? <p className="mt-2 text-sm text-clay">{error}</p> : null}
      {!supply && !error ? <p className="mt-3 text-sm text-muted">Reading the supply…</p> : null}
      {rows.length > 0 ? (
        <ul className="mt-4 divide-y divide-line text-sm">
          {rows.map(({ line, row, price }) => {
            const moved = row.change != null && Math.abs(row.change) >= 0.005;
            return (
              <li key={line.symbol} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-medium">{line.symbol}</p>
                  <p className="text-xs text-muted">{price != null ? `${formatCompactUsd(row.shares * price)} on Solana` : "On Solana"}</p>
                </div>
                <div className="shrink-0 text-right">
                  {row.change == null ? (
                    <p className="text-muted">—</p>
                  ) : (
                    <>
                      <p className={`font-medium tabular-nums ${!moved ? "text-muted" : row.change > 0 ? "text-pine" : "text-clay"}`}>{changeWords(row.change)}</p>
                      {moved ? (
                        <p className="text-xs tabular-nums text-muted">
                          {row.changePct != null ? `${row.changePct > 0 ? "+" : "−"}${Math.abs(row.changePct).toFixed(2)}%` : ""}
                          {price != null ? ` · about ${formatCompactUsd(Math.abs(row.change) * price)}` : ""}
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : supply && !error ? (
        <p className="mt-3 text-sm text-muted">No stock tokens in this wallet.</p>
      ) : null}
      <p className="mt-4 rounded-xl bg-field px-4 py-3 text-sm leading-relaxed text-ink ring-1 ring-line">
        Large batches, $500,000 and 1% of a token&apos;s supply within an hour, show in @ONPAR_BOT with /flows. $PAR holders who watch this bag get an
        alert when one hits a name in it.
      </p>
    </section>
  );
}
