import { formatCompactUsd, formatRate } from "../../lib/format";
import { TOKENS, TOKEN_BY_SYMBOL } from "../../lib/tokens";
import type { Offer } from "../../lib/types";

export function YieldPanel({
  offers,
  error,
  symbol,
  onSymbol,
  hidePicker = false,
}: {
  offers: Offer[];
  error: string | null;
  symbol: string;
  onSymbol: (symbol: string) => void;
  hidePicker?: boolean;
}) {
  const name = TOKEN_BY_SYMBOL.get(symbol)?.name ?? symbol;
  const mine = offers.filter((offer) => offer.symbol === symbol);
  return (
    <section className="mt-5">
      <div className="panel p-5 ring-1 ring-line">
        <h2 className="font-display text-3xl text-ink">What you can do with {name}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          {hidePicker ? "" : "Pick a stock. "}These are the live offers on Kamino’s two xStock markets, plus Kraken’s vault when that stock has one. It is not every
          protocol on Solana. A name with no card is simply not listed there yet.
        </p>
        <div className={hidePicker ? "hidden" : "mt-4 flex gap-2 overflow-x-auto pb-1"}>
          {TOKENS.map((token) => (
            <button
              key={token.symbol}
              type="button"
              onClick={() => onSymbol(token.symbol)}
              aria-pressed={symbol === token.symbol}
              className={`h-11 shrink-0 rounded-full px-4 text-sm font-medium ${symbol === token.symbol ? "bg-gold text-ink" : "bg-foam text-ink ring-1 ring-line"}`}
            >
              {token.name}
            </button>
          ))}
        </div>
      </div>
      {error ? <p className="mt-3 rounded-2xl bg-clay-soft px-4 py-3 text-sm text-clay">{error}</p> : null}
      {mine.length === 0 ? (
        <p className="mt-3 panel px-4 py-8 text-sm text-muted ring-1 ring-line">
          No lending market lists {name} yet. You can still buy the token from Markets.
        </p>
      ) : (
        <ul className="mt-3 grid gap-3">
          {mine.map((offer) => (
            <li key={`${offer.venue}-${offer.kind}`} className="panel p-5 ring-1 ring-line">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-2xl text-ink">{offer.venue}</h3>
                <span className="rounded-full bg-foam px-3 py-1 text-sm text-ink ring-1 ring-line">{offer.kind}</span>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{offer.note}</p>
              {offer.kind === "Collateral" ? (
                <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div>
                    <dt className="text-sm text-muted">Supply rate</dt>
                    <dd className="font-display text-2xl text-ink">{formatRate(offer.supplyApy)}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted">Borrow USDC</dt>
                    <dd className="font-display text-2xl text-ink">{formatRate(offer.borrowApy)}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted">You can borrow up to</dt>
                    <dd className="font-display text-2xl text-ink">{offer.maxLtv == null ? "—" : `${Math.round(offer.maxLtv * 100)}%`}</dd>
                  </div>
                </dl>
              ) : null}
              {offer.depositsUsd == null ? null : <p className="mt-3 text-sm text-muted">{formatCompactUsd(offer.depositsUsd)} deposited</p>}
              <a
                href={offer.href}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex h-11 items-center text-sm font-medium text-ink underline decoration-line underline-offset-4"
              >
                Open this market
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
