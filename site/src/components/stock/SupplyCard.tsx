import { Layers } from "lucide-react";
import { formatCompactUsd } from "../../lib/format";
import { utcStamp } from "../../lib/session";
import type { SupplyResult } from "../../lib/supply";
import type { StockToken } from "../../lib/tokens";

export function shareCount(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 2 }).format(value);
}

/** "+120 created" or "−80 destroyed" (shares at today's multiplier), or "none created or destroyed". */
export function changeWords(change: number) {
  if (Math.abs(change) < 0.005) return "none created or destroyed";
  return change > 0 ? `+${shareCount(change)} created` : `−${shareCount(-change)} destroyed`;
}

/** How many of one token exist on Solana, and how many were created or destroyed since the base reading. */
export function SupplyCard({ token, supply, price }: { token: StockToken; supply: SupplyResult; price: number | null }) {
  const row = supply.rows.find((entry) => entry.symbol === token.symbol);
  if (!supply.ok || !row) return null;
  return (
    <section aria-labelledby="supply-title" className="panel mt-8 p-6 text-ink ring-1 ring-line sm:p-7">
      <p className="flex items-center gap-2 text-sm font-medium text-amber">
        <Layers className="size-4" aria-hidden />
        Supply on Solana
      </p>
      <h2 id="supply-title" className="mt-1 font-display text-3xl">
        {shareCount(row.shares)} {token.symbol}
        {price != null ? <span className="text-muted">{` · about ${formatCompactUsd(row.shares * price)}`}</span> : null}
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed">
        {row.change != null && supply.since != null
          ? `Since ${utcStamp(Math.floor(supply.since / 1000))} UTC: ${changeWords(row.change)}${row.changePct != null && Math.abs(row.change) >= 0.005 ? ` (${row.changePct > 0 ? "+" : "−"}${Math.abs(row.changePct).toFixed(2)}%)` : ""}${price != null && Math.abs(row.change) >= 0.005 ? `, about ${formatCompactUsd(Math.abs(row.change) * price)}` : ""}.`
          : "Par keeps one reading a day. Tokens created or destroyed show here once a reading is a day old."}
      </p>
      <p className="mt-2 max-w-3xl text-xs leading-relaxed text-muted">
        Read from the token's mint on Solana. Only the issuer can create tokens, and the supply falls when tokens are burned. A rebase changes every
        balance without creating any, so it is not counted. Only Solana: the same stock also exists as tokens on other chains.
      </p>
    </section>
  );
}
