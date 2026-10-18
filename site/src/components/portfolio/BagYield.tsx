import { Sprout } from "lucide-react";
import { yieldIdeas } from "../../lib/bag";
import { formatRate } from "../../lib/format";
import type { Offer, PortfolioLine } from "../../lib/types";
import { numberFormat } from "../../lib/intl";

function money(value: number) {
  return numberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

/** What lending each xStock held would pay in a year at today's best live Kamino supply rate. */
export function BagYield({ lines, offers, error }: { lines: PortfolioLine[]; offers: Offer[] | null; error: string | null }) {
  const idea = offers ? yieldIdeas(lines, offers) : null;
  const largest = idea ? Math.max(0, ...idea.rows.map((row) => row.perYear)) : 0;
  const vaultNote = offers?.find((offer) => offer.kind === "Vault")?.note;
  return (
    <section aria-labelledby="yield-title" className="panel rise p-5 text-ink ring-1 ring-line sm:p-6">
      <p className="flex items-center gap-2 text-sm font-medium text-amber">
        <Sprout className="size-4" aria-hidden />
        Possible yield
      </p>
      <h2 id="yield-title" className="mt-1 font-display text-3xl leading-tight">
        {idea && idea.perYear > 0 ? `About ${money(idea.perYear)} a year` : "Lending your bag"}
      </h2>
      {offers == null && !error ? <p className="mt-2 text-sm text-muted">Reading Kamino's live rates…</p> : null}
      {error ? <p className="mt-2 text-sm text-clay">{error}</p> : null}
      {idea && idea.rows.length > 0 ? (
        <>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {"If you lent "}
            {money(idea.lent)}
            {" of your stock tokens on Kamino at today's best supply rate for each, about "}
            {formatRate(idea.rate)}
            {" overall. It is paid in more of the same token, not in cash."}
          </p>
          <ul className="mt-4 divide-y divide-line">
            {idea.rows.map((row) => (
              <li key={`${row.line.symbol}-${row.offer.venue}`} className="py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {row.line.symbol}
                      <span className="font-normal text-muted">
                        {" · "}
                        {row.offer.venue}
                      </span>
                    </p>
                    <p className="text-xs text-muted">
                      {money(row.line.usdValue)}
                      {" at "}
                      {formatRate(row.offer.supplyApy)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-medium tabular-nums">
                      {money(row.perYear)}
                      <span className="font-normal text-muted"> a year</span>
                    </p>
                    <a href={row.offer.href} target="_blank" rel="noreferrer" className="text-xs underline decoration-line underline-offset-4">
                      Open on Kamino
                    </a>
                  </div>
                </div>
                {/* Each name's share of the yearly sum, against the largest. */}
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foam" aria-hidden>
                  <div
                    className="bar-grow h-full rounded-full"
                    style={{
                      width: largest > 0 ? `${Math.max((row.perYear / largest) * 100, row.perYear > 0 ? 1.5 : 0)}%` : "0%",
                      background: "linear-gradient(90deg, #e0a04ab3, #e0a04a)",
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : idea ? (
        <p className="mt-2 text-sm leading-relaxed text-muted">No live Kamino rate above 0% for the names you hold right now.</p>
      ) : null}
      {idea && idea.vaults.length > 0 && vaultNote ? (
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {idea.vaults.join(", ")}
          {": "}
          {vaultNote}
          {" It is not in the sum."}
        </p>
      ) : null}
      <p className="mt-4 text-xs leading-relaxed text-muted">
        Rates move all the time; this is today's rate stretched over a year. Lending puts the tokens in a smart contract, which is a risk of its own, and
        borrowing against them can be liquidated. Not advice.
      </p>
    </section>
  );
}
