import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, Send, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { Backdrop } from "../components/Backdrop";
import { NotFound } from "../components/NotFound";
import { StaleMark, StaleNote } from "../components/StaleMark";
import { HeroLines } from "../components/desk/HeroLines";
import { SizeCheck } from "../components/desk/SizeCheck";
import { BuyLink, ChangePill, GapMeter, MultiplierNote, TickerBadge, VerdictDetail } from "../components/desk/parts";
import { meterWaiting, type DeskRow } from "../components/desk/StockCard";
import { YieldPanel } from "../components/desk/YieldPanel";
import { ShareButton } from "../components/ShareButton";
import { drawCardImage } from "../components/share/cardImage";
import { SiteFooter } from "../components/SiteFooter";
import { SiteNav } from "../components/SiteNav";
import { GapHistory } from "../components/stock/GapHistory";
import { IssuerPowers } from "../components/stock/IssuerPowers";
import { OtherTokens } from "../components/stock/OtherTokens";
import { SupplyCard } from "../components/stock/SupplyCard";
import { Venues } from "../components/stock/Venues";
import { FILING_DAYS, SEC_CIK } from "../lib/events";
import { formatUsd } from "../lib/format";
import { EARLY_QUOTES_URL } from "../lib/earlyQuotes";
import type { HistoryPoint } from "../lib/history";
import type { IssuerResult } from "../lib/issuer";
import { sessionClosed } from "../lib/session";
import { cardShareText, stockUrl } from "../lib/share";
import { LIVE_PAGE_CACHE, SITE_URL } from "../lib/site";
import { ISSUER_LABEL, TOKENS } from "../lib/tokens";
import type { SupplyResult } from "../lib/supply";
import type { Offer, Quote } from "../lib/types";
import type { VenuesResult } from "../lib/venues";
import { useFavourites, watchLink } from "../lib/useFavourites";
import { useLiveQuotes } from "../lib/useLiveQuotes";
import { useWantBuys } from "../lib/useWantBuys";
import { buyUsable, gapPct, olderBuy, rebaseLine, verdict, verdictPillClass } from "../lib/verdict";
import { getHistory, getIssuer, getOffers, getQuotes, getSupply, getVenues } from "../server/functions";

function tokenFor(param: string) {
  return TOKENS.find((token) => token.symbol.toLowerCase() === param.toLowerCase());
}

export const Route = createFileRoute("/s/$symbol")({
  headers: () => ({ "Netlify-CDN-Cache-Control": LIVE_PAGE_CACHE }),
  head: ({ params }) => {
    const token = tokenFor(params.symbol);
    if (!token) return {};
    const title = `${token.symbol}: is the ${token.name} token at the share price?`;
    const description = `Live: ${token.symbol} on Solana against the ${token.underlying} Nasdaq print. The $1,000 buy, the gap, the verdict and a week of history.`;
    const url = `${SITE_URL}/s/${token.symbol}`;
    const image = `${SITE_URL}/og/s/${token.symbol}.png`;
    return {
      meta: [
        { title: `${token.symbol} · ${token.name}${token.issuer === "Backpack" ? " by Backpack" : ""} · Par` },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:image", content: image },
        { property: "og:image:alt", content: `${token.symbol}, ${token.name}: is the token at the share price? Check it live on Par.` },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  loader: async ({ params }) => {
    const token = tokenFor(params.symbol);
    if (!token) throw notFound();
    const [quotes, offers, history, issuer, venues, supply] = await Promise.all([
      getQuotes(),
      getOffers(),
      getHistory({ data: { symbol: token.symbol } }),
      getIssuer({ data: { symbol: token.symbol } }),
      getVenues({ data: { symbol: token.symbol } }),
      getSupply(),
    ]);
    return {
      symbol: token.symbol,
      quotes: quotes.quotes,
      asOf: quotes.asOf,
      offers: offers.offers,
      offersError: offers.ok ? null : offers.message,
      history: history.points,
      issuer,
      venues,
      supply,
    };
  },
  component: StockPage,
});

type StockData = {
  symbol: string;
  quotes: Quote[];
  asOf: number;
  offers: Offer[];
  offersError: string | null;
  history: HistoryPoint[];
  issuer: IssuerResult;
  venues: VenuesResult;
  supply: SupplyResult;
};

function StockPage() {
  const data = Route.useLoaderData();
  return data ? <StockView data={data} /> : <NotFound />;
}

function StockView({ data }: { data: StockData }) {
  const token = tokenFor(data.symbol)!;
  const live = useLiveQuotes(data.quotes, data.asOf);
  const [favourites, toggleFavourite] = useFavourites();
  const [sizeSymbol, setSizeSymbol] = useState(token.symbol);
  const [yieldSymbol, setYieldSymbol] = useState(token.symbol);

  const row: DeskRow | null = useMemo(() => {
    const quote = live.quotes.find((q) => q.symbol === token.symbol);
    if (!quote) return null;
    return {
      ...quote,
      verdict: verdict(quote, live.now),
      gap: gapPct(buyUsable(quote.buyAt, live.now) ? quote.buyPrice : null, quote.stockPrice),
      older: olderBuy(quote, live.now),
    };
  }, [live.quotes, live.now, token.symbol]);
  const favourite = favourites.includes(token.symbol);
  // This page is about one name, so its $1,000 buy is quoted before the rest of the list.
  useWantBuys(() => [token.symbol], live.quotes);

  return (
    <div className="relative min-h-screen text-foam">
      <StaleMark asOf={data.asOf} stale={live.stale} ready={live.ready} prefetch={EARLY_QUOTES_URL} />
      <Backdrop />
      <SiteNav current={null} />
      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <nav aria-label="Breadcrumb" className="pt-2 text-sm text-mist">
          <Link to="/" className="hover:text-foam">
            Desk
          </Link>
          <span aria-hidden> / </span>
          <span className="text-foam">{token.symbol}</span>
        </nav>

        <header className="rise mt-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <TickerBadge underlying={token.underlying} sector={token.sector} />
            <div className="min-w-0">
              <h1 className="font-display text-4xl leading-tight sm:text-6xl">{token.name}</h1>
              <p className="text-sm text-mist">
                {token.symbol}
                {" · "}
                {ISSUER_LABEL[token.issuer]}
                {" · "}
                {token.sector}
                {" · tracks "}
                {token.underlying}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {row ? (
              <span data-verdict className={`rounded-full px-3 py-1 text-sm font-medium ${verdictPillClass(row.verdict.id)}`}>
                {row.verdict.title}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => toggleFavourite(token.symbol)}
              aria-pressed={favourite}
              aria-label={favourite ? `Remove ${token.symbol} from favourites` : `Add ${token.symbol} to favourites`}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-white/15 ${favourite ? "text-gold" : "text-mist hover:text-foam"}`}
            >
              <Star className="size-5" fill={favourite ? "currentColor" : "none"} aria-hidden />
            </button>
          </div>
        </header>

        <StaleNote age={live.now - live.asOf} ready={live.ready} className="mt-6 rounded-2xl bg-dusk/80 px-4 py-3 text-mist ring-1 ring-white/10" />

        <section className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
          <div className="panel p-6 text-ink ring-1 ring-line sm:p-7" data-live>
            {row ? (
              <>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-sm text-muted">Last trade, per share</p>
                    <p className="font-display text-5xl tabular-nums sm:text-6xl">{formatUsd(row.usdPrice)}</p>
                  </div>
                  <div className="flex items-center gap-2 pb-2 text-sm text-muted">
                    24h <ChangePill value={row.change24h} />
                  </div>
                </div>
                <div className="mt-5" data-verdict-slot>
                  <GapMeter gap={row.gap} waiting={meterWaiting(row).text} loading={meterWaiting(row).loading} closed={sessionClosed(row.marketState)} older={row.older ?? null} />
                </div>
                <p className="mt-5 text-lg leading-relaxed" data-verdict>
                  {row.verdict.line}
                </p>
                {row.rebase && row.rebase.at * 1000 > live.now ? (
                  <p className="mt-3 rounded-xl bg-gold/15 px-3 py-2 text-sm leading-relaxed">{rebaseLine(row.symbol, row.rebase)}</p>
                ) : null}
                <div className="mt-4 space-y-2">
                  <MultiplierNote symbol={row.symbol} multiplier={row.sharesPerToken} />
                  <VerdictDetail row={row} now={live.now} />
                </div>
                <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-5">
                  <BuyLink mint={token.mint} symbol={token.symbol} />
                  <ShareButton
                    title={`${token.symbol} on Par`}
                    text={cardShareText(token.symbol, row.gap, row.verdict.title)}
                    url={stockUrl(token.symbol)}
                    image={{ name: `par-${token.symbol}.png`, make: () => drawCardImage(row, Date.now(), stockUrl(token.symbol)) }}
                  />
                  <a href={watchLink([token.symbol])} className="inline-flex h-11 items-center gap-1.5 rounded-full bg-foam px-4 text-sm font-medium text-ink ring-1 ring-line">
                    <Send className="size-4" aria-hidden />
                    Watch in Telegram
                  </a>
                </div>
              </>
            ) : (
              <p className="text-muted">The price feed for {token.symbol} is reconnecting.</p>
            )}
          </div>
          {row ? <HeroLines rows={[row]} age={live.age} asOf={live.asOf} feedError={live.feedError} onPick={() => undefined} /> : null}
        </section>

        <div data-live>
          <OtherTokens symbol={token.symbol} quotes={live.quotes} now={live.now} />
          <Venues token={token} quote={live.quotes.find((q) => q.symbol === token.symbol) ?? null} initial={data.venues} now={live.now} />
        </div>

        <SupplyCard token={token} supply={data.supply} price={live.quotes.find((q) => q.symbol === token.symbol)?.usdPrice ?? null} />

        <section aria-labelledby="history-title" className="panel mt-8 p-6 text-ink ring-1 ring-line sm:p-7">
          <p className="text-sm font-medium text-amber">Last 7 days</p>
          <h2 id="history-title" className="mt-1 font-display text-3xl">
            How close has {token.symbol} been?
          </h2>
          <p className="mt-1 text-sm text-muted">The last trade versus the Nasdaq print, every 15 minutes during US trading hours.</p>
          <div className="mt-5">
            <GapHistory symbol={token.symbol} points={data.history} />
          </div>
        </section>

        <IssuerPowers result={data.issuer} />

        <Link
          to="/events"
          search={{ name: token.symbol }}
          className="mt-6 flex items-center justify-between gap-4 rounded-2xl bg-dusk/80 px-5 py-4 ring-1 ring-white/10 hover:ring-white/25"
        >
          <span className="flex items-center gap-3">
            <CalendarDays className="size-5 shrink-0 text-gold" aria-hidden />
            <span>
              <span className="block font-medium text-foam">Events for {token.name}</span>
              <span className="block text-sm leading-relaxed text-mist">
                {SEC_CIK[token.underlying]
                  ? `SEC filings from the last ${FILING_DAYS} days, balance changes and market days off.`
                  : "Balance changes and market days off. A fund files no company news."}
              </span>
            </span>
          </span>
          <ArrowRight className="size-5 shrink-0 text-foam" aria-hidden />
        </Link>

        <SizeCheck symbol={sizeSymbol} onSymbol={setSizeSymbol} />

        <YieldPanel offers={data.offers} error={data.offersError} symbol={yieldSymbol} onSymbol={setYieldSymbol} hidePicker />

        <section aria-labelledby="others-title" className="mt-12">
          <h2 id="others-title" className="font-display text-3xl">
            Other names
          </h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {TOKENS.filter((t) => t.symbol !== token.symbol).map((t) => (
              <li key={t.symbol}>
                <Link
                  to="/s/$symbol"
                  params={{ symbol: t.symbol }}
                  className="inline-flex h-10 items-center rounded-full bg-dusk px-4 text-sm text-foam ring-1 ring-white/10 hover:bg-dusk/70"
                >
                  {t.symbol}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <SiteFooter />
      </main>
    </div>
  );
}
