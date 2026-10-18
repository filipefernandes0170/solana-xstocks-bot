import { Link } from "@tanstack/react-router";
import { formatCompactUsd } from "../../lib/format";
import { utcStamp } from "../../lib/session";
import { byChange, type SupplyResult } from "../../lib/supply";
import { TOKEN_BY_SYMBOL } from "../../lib/tokens";
import type { Quote } from "../../lib/types";
import { changeWords, shareCount } from "../stock/SupplyCard";

/** Every name's supply on Solana, the biggest creations first once there is a base reading. */
export function SupplyTable({ supply, quotes }: { supply: SupplyResult; quotes: Quote[] }) {
  if (!supply.ok || supply.rows.length === 0) return null;
  const price = (symbol: string) => quotes.find((quote) => quote.symbol === symbol)?.usdPrice ?? null;
  const rows = supply.since != null ? byChange(supply.rows, price) : [...supply.rows].sort((a, b) => (price(b.symbol) ?? 0) * b.shares - (price(a.symbol) ?? 0) * a.shares);
  return (
    <section aria-labelledby="supply-title" className="panel mt-6 overflow-hidden text-ink ring-1 ring-line">
      <div className="px-5 pt-5 sm:px-6">
        <p className="text-sm font-medium text-amber">Supply on Solana</p>
        <h2 id="supply-title" className="mt-1 font-display text-2xl">
          Tokens created and destroyed
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">
          {supply.since != null
            ? `Since ${utcStamp(Math.floor(supply.since / 1000))} UTC, read from each mint. Only the issuer can create tokens; the supply falls when tokens are burned. Rebases are not counted.`
            : "Par keeps one reading a day from each mint. The change shows here once a reading is a day old; until then, this is how many exist."}
        </p>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-xs tracking-wide text-muted uppercase">
            <tr className="border-y border-line">
              <th className="px-5 py-3 font-medium sm:px-6">Name</th>
              <th className="px-3 py-3 font-medium">On Solana</th>
              <th className="px-3 py-3 font-medium">Value</th>
              <th className="px-5 py-3 font-medium sm:px-6">Created or destroyed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const usd = price(row.symbol);
              const token = TOKEN_BY_SYMBOL.get(row.symbol);
              return (
                <tr key={row.symbol} className="border-b border-line/70">
                  <td className="px-5 py-3 sm:px-6">
                    <Link to="/s/$symbol" params={{ symbol: row.symbol }} className="font-medium hover:underline hover:underline-offset-4">
                      {row.symbol}
                    </Link>
                    <span className="block text-xs text-muted">{token?.name ?? ""}</span>
                  </td>
                  <td className="px-3 py-3 tabular-nums">{shareCount(row.shares)}</td>
                  <td className="px-3 py-3 tabular-nums">{usd != null ? formatCompactUsd(row.shares * usd) : "—"}</td>
                  <td className="px-5 py-3 tabular-nums sm:px-6">
                    {row.change == null
                      ? "—"
                      : `${changeWords(row.change)}${row.changePct != null && Math.abs(row.change) >= 0.005 ? ` (${row.changePct > 0 ? "+" : "−"}${Math.abs(row.changePct).toFixed(2)}%)` : ""}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="px-5 py-4 text-xs leading-relaxed text-muted sm:px-6">
        Only Solana: the same stocks also exist as tokens on other chains. Value uses each token's last trade.
      </p>
    </section>
  );
}
