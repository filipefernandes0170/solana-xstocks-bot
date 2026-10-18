import { ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { THIN_POOL_USD, poolLabel } from "../../lib/brand";
import { formatUsd, jupiterBuyUrl } from "../../lib/format";
import type { StockToken } from "../../lib/tokens";
import type { Quote } from "../../lib/types";
import { STALE_PAGE_MS } from "../../lib/site";
import type { VenueQuote, VenuesResult } from "../../lib/venues";
import { buyUsable, gapPct } from "../../lib/verdict";
import { getVenues } from "../../server/functions";
import { GapPill } from "../desk/parts";

type Row = {
  key: string;
  name: string;
  market: string;
  price: number | null;
  /** Why there is no price, when there is none. */
  status: string | null;
  fee: string;
  href: string;
  linkLabel: string;
};

function venueRow(venue: VenueQuote): Row {
  const status =
    venue.state === "open"
      ? null
      : venue.state === "limited"
        ? `${venue.name} takes only some orders on this market right now (for example resting limit orders), so a $1,000 buy at the ask is not possible.`
        : venue.state === "thin"
          ? "Its order book holds less than $1,000 to buy right now."
          : `${venue.name} did not answer. Try again in a minute.`;
  return {
    key: venue.venue,
    name: venue.name,
    market: venue.market,
    price: venue.state === "open" ? venue.price : null,
    status,
    fee: `Order book, before ${venue.name}'s trading fee${venue.quoteCurrency === "USDC" ? ", in USDC" : ""}`,
    href: venue.href,
    linkLabel: `Open ${venue.name}`,
  };
}

/**
 * "Where to buy": the live $1,000 buy on Solana next to what $1,000 pays at the exchanges that list the same token.
 * Shown only for names an exchange lists. Exchange prices are before their own fee, so the lowest is marked as lowest
 * before fees, never as the cheapest.
 */
export function Venues({ token, quote, initial, now }: { token: StockToken; quote: Quote | null; initial: VenuesResult; now: number }) {
  const [result, setResult] = useState(initial);

  // Every minute while the tab is visible, and at once when the page arrived as a cached copy over a minute old.
  useEffect(() => {
    let alive = true;
    async function load() {
      if (document.hidden) return;
      try {
        const next = await getVenues({ data: { symbol: token.symbol } });
        if (alive) setResult(next);
      } catch {
        // Keep the last answer; the next round tries again.
      }
    }
    if (Date.now() - initial.asOf > STALE_PAGE_MS) void load();
    const timer = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
    // initial.asOf is read once, when the page arrives.
  }, [token.symbol]);

  if (result.venues.length === 0) return null;

  const thin = quote?.poolUsd != null && quote.poolUsd < THIN_POOL_USD;
  const jupiterPrice = quote && buyUsable(quote.buyAt, now) ? quote.buyPrice : null;
  const rows: Row[] = [
    {
      key: "jupiter",
      name: "Jupiter",
      market: `${token.symbol} on Solana`,
      price: thin ? null : jupiterPrice,
      status: thin ? `The pool holds about ${poolLabel(quote?.poolUsd ?? 0)}, too thin to quote a $1,000 buy.` : jupiterPrice == null ? "The $1,000 buy is loading." : null,
      fee: "Live swap quote, pool fees included. Par adds no fee",
      href: jupiterBuyUrl(token.mint),
      linkLabel: "Open Jupiter",
    },
    ...result.venues.map(venueRow),
  ];
  const priced = rows.filter((row) => row.price != null);
  const lowest = priced.length > 1 ? priced.reduce((a, b) => ((b.price as number) < (a.price as number) ? b : a)) : null;
  const stock = quote?.stockPrice ?? null;

  return (
    <section aria-labelledby="venues-title" className="panel mt-8 p-6 text-ink ring-1 ring-line sm:p-7">
      <p className="text-sm font-medium text-amber">Where to buy</p>
      <h2 id="venues-title" className="mt-1 font-display text-3xl">
        What $1,000 of {token.symbol} costs, by venue
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
        The same token is also sold on exchanges. Each price is per share, for a $1,000 buy right now, next to the Nasdaq print. Lower against Nasdaq
        is better.
      </p>
      <ul className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <li key={row.key} className={`flex flex-col rounded-2xl p-4 ${row === lowest ? "bg-pine-soft ring-1 ring-pine/30" : "bg-foam"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{row.name}</p>
                <p className="text-xs text-muted">{row.market}</p>
              </div>
              {row.price != null ? <GapPill value={gapPct(row.price, stock)} /> : null}
            </div>
            {row.price != null ? (
              <p className="mt-3 font-display text-2xl tabular-nums">
                {formatUsd(row.price)}
                <span className="font-sans text-sm text-muted"> a share</span>
              </p>
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-muted">{row.status}</p>
            )}
            {row === lowest ? <p className="mt-1 text-xs font-medium text-pine">Lowest right now, before exchange fees</p> : null}
            {row.price != null ? <p className="mt-2 text-xs leading-relaxed text-muted">{row.fee}</p> : null}
            <a
              href={row.href}
              target="_blank"
              rel="noreferrer"
              className="mt-auto inline-flex min-h-10 items-center gap-1 pt-3 text-sm font-medium underline decoration-line underline-offset-4"
            >
              {row.linkLabel}
              <ArrowUpRight className="size-4" aria-hidden />
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-4 max-w-3xl text-xs leading-relaxed text-muted">
        {"Exchange prices are their order books for $1,000 right now, before their trading fee; the fee is on their own sites. "}
        {"Each exchange decides who can open an account and trade there, and not every country is served. Par has no link with them, takes no fee, and never sees your order. "}
        {stock != null ? `Nasdaq print ${formatUsd(stock)}.` : "No Nasdaq print yet."}
      </p>
    </section>
  );
}
