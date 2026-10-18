import { formatUsd } from "../../lib/format";
import { TOKENS, TOKEN_BY_SYMBOL } from "../../lib/tokens";
import type { Quote } from "../../lib/types";
import { verdict } from "../../lib/verdict";
import { BuyLink } from "./parts";
import { numberFormat } from "../../lib/intl";

/** One plain sentence about a token versus its Nasdaq print. */
export function plainLine(quote: Quote | undefined) {
  if (!quote || quote.usdPrice == null) return "The price for this name is reconnecting.";
  if (quote.stockPrice == null) {
    return `One ${quote.name} token is ${formatUsd(quote.usdPrice)} on Solana. There is no public stock print to compare.`;
  }
  const diff = quote.usdPrice - quote.stockPrice;
  const relation = diff < -0.005 ? "under" : diff > 0.005 ? "over" : "in line with";
  const amount =
    relation === "in line with"
      ? ""
      : `${numberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(diff))} `;
  return `One ${quote.name} token is ${formatUsd(quote.usdPrice)} on Solana, ${amount}${relation} the Nasdaq print of ${formatUsd(quote.stockPrice)}.`;
}

export function PassAlong({
  quote,
  symbol,
  now,
  onSymbol,
  copied,
  onCopy,
}: {
  quote: Quote | undefined;
  symbol: string;
  now: number;
  onSymbol: (symbol: string) => void;
  copied: boolean;
  onCopy: (text: string) => void;
}) {
  const v = quote ? verdict(quote, now) : null;
  const text = v ? `${plainLine(quote)} ${v.line}` : plainLine(quote);
  const token = TOKEN_BY_SYMBOL.get(symbol);
  return (
    <section className="panel p-5 ring-1 ring-line sm:p-7">
      <p className="text-sm text-amber">Pass this along</p>
      <h2 className="mt-2 max-w-3xl font-display text-2xl leading-snug text-ink sm:text-3xl">{text}</h2>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="text-sm text-muted">
          Name
          <select
            value={symbol}
            onChange={(event) => onSymbol(event.target.value)}
            className="mt-1 h-11 w-full rounded-full bg-foam px-3 text-sm text-ink ring-1 ring-line sm:w-52"
          >
            {TOKENS.map((t) => (
              <option key={t.symbol} value={t.symbol}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => onCopy(text)} className="h-11 rounded-full bg-ink px-4 text-sm font-medium text-foam">
          {copied ? "Copied" : "Copy the line"}
        </button>
        {token ? <BuyLink mint={token.mint} symbol={token.symbol} /> : null}
      </div>
    </section>
  );
}
