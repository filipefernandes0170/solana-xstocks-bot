import { Link } from "@tanstack/react-router";
import { ArrowRight, Bell, LayoutGrid, List, Ruler, Search, Send, Star, Trophy, Wallet } from "lucide-react";
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { formatGap, formatPct, formatUsd } from "../../lib/format";
import { nearLabel } from "../../lib/ranking";
import { closedLine, etClock, isSessionOpen, sessionLabel, sessionLine } from "../../lib/session";
import { EARLY_QUOTES_URL, takeEarlyQuotes } from "../../lib/earlyQuotes";
import { STALE_PAGE_MS } from "../../lib/site";
import { TOKENS } from "../../lib/tokens";
import { useFavourites, watchLink } from "../../lib/useFavourites";
import { useOnScreenSymbols } from "../../lib/useOnScreen";
import { useWantBuys } from "../../lib/useWantBuys";
import type { CryptoRow, HolderStatus, HoldingsResult, Offer, Quote } from "../../lib/types";
import { buyUsable, gapPct, mergeBuys, olderBuy, verdict } from "../../lib/verdict";
import { checkHolder, getHoldings, getOffers, getQuotes, getRanking } from "../../server/functions";
import type { RankingResult } from "../../server/history";
import { SiteFooter } from "../SiteFooter";
import { Backdrop } from "../Backdrop";
import { SiteNav } from "../SiteNav";
import { StaleMark, StaleNote } from "../StaleMark";
import { CryptoPanel } from "./CryptoPanel";
import type { GapRow } from "./GapView";
import { Glossary } from "./Glossary";
import { HeroLines } from "./HeroLines";
import { PassAlong } from "./PassAlong";
import { BuyLink, ChangePill, TickerBadge } from "./parts";
import { SizeSheet } from "./SizeSheet";
import { StatStrip } from "./StatStrip";
import { StockCard, type DeskRow } from "./StockCard";
import { StockList } from "./StockList";
import { Ticker } from "./Ticker";
import { WhyHold } from "./WhyHold";
import { YieldPanel } from "./YieldPanel";

// The Gap tab's chart library is large, so it loads only when that tab is opened.
const GapView = lazy(() => import("./GapView").then((module) => ({ default: module.GapView })));

type Tab = "markets" | "gap" | "portfolio" | "yield" | "alerts";

const TABS: { id: Tab; label: string }[] = [
  { id: "markets", label: "Markets" },
  { id: "gap", label: "Gap" },
  { id: "portfolio", label: "Portfolio" },
  { id: "yield", label: "Yield" },
  { id: "alerts", label: "Alerts" },
];

type Sort = "desk" | "gap" | "move" | "name";
type Filter = "all" | "fair" | "favourites";
type View = "cards" | "list";

const SORTS: { id: Sort; label: string }[] = [
  { id: "desk", label: "Desk order" },
  { id: "gap", label: "Widest gap" },
  { id: "move", label: "Biggest 24h move" },
  { id: "name", label: "Name A–Z" },
];

type Alert = { id: string; symbol: string; direction: "up" | "down"; pct: number; kind?: "move" | "gap" };

// Same storage keys as the published desk, so alerts and the saved wallet carry over.
const ALERTS_KEY = "xstocks-alerts";
const WALLET_KEY = "xstocks-wallet";
// The Markets view and sort are remembered on this device only.
const VIEW_KEY = "par-view";
const SORT_KEY = "par-sort";

function loadAlerts(): Alert[] {
  try {
    const raw = localStorage.getItem(ALERTS_KEY);
    return raw ? (JSON.parse(raw) as Alert[]) : [];
  } catch {
    return [];
  }
}

function readSetting(key: string) {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function saveSetting(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private windows can refuse storage; the setting then lasts for this visit only.
  }
}

// Polling pauses in a hidden tab. Saved alerts keep it going only when this browser may show a ping.
function pageVisible() {
  return document.visibilityState !== "hidden";
}

function canNotify() {
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}

function emptyQuote(token: (typeof TOKENS)[number]): Quote {
  return {
    ...token,
    usdPrice: null,
    change24h: null,
    stockPrice: null,
    marketState: null,
    sharesPerToken: null,
    buyPrice: null,
    buyImpactPct: null,
    buyAt: null,
    issuerPrice: null,
    issuerAt: null,
    rebase: null,
    poolUsd: null,
  };
}

function alertHit(alert: Alert, quote: Quote | undefined) {
  if (!quote) return false;
  if ((alert.kind ?? "move") === "gap") {
    const gap = gapPct(quote.usdPrice, quote.stockPrice);
    return gap == null ? false : alert.direction === "up" ? gap >= alert.pct : gap <= -alert.pct;
  }
  return quote.change24h == null ? false : alert.direction === "up" ? quote.change24h >= alert.pct : quote.change24h <= -alert.pct;
}

function sortRows(rows: DeskRow[], sort: Sort) {
  const last = (value: number | null) => (value == null ? -1 : Math.abs(value));
  if (sort === "gap") return [...rows].sort((a, b) => last(b.gap) - last(a.gap));
  if (sort === "move") return [...rows].sort((a, b) => last(b.change24h) - last(a.change24h));
  if (sort === "name") return [...rows].sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

export function Desk({
  initial,
  initialAsOf,
  initialError = null,
  initialOffers = [],
  offersError = null,
  initialCryptos = [],
}: {
  initial: Quote[];
  /** When the server read these prices. The page may be a cached copy, so this can be well in the past. */
  initialAsOf: number;
  initialError?: string | null;
  initialOffers?: Offer[];
  offersError?: string | null;
  initialCryptos?: CryptoRow[];
}) {
  const [tab, setTab] = useState<Tab>("markets");
  const [quotes, setQuotes] = useState(initial);
  const [feedError, setFeedError] = useState(initialError);
  // Both start at the time of the server's prices, so the first render in the browser matches the server's page.
  const [asOf, setAsOf] = useState(initialAsOf);
  const [now, setNow] = useState(initialAsOf);
  const newestAsOf = useRef(initialAsOf);
  const [ticks, setTicks] = useState<Record<string, "up" | "down">>({});
  const lastPrices = useRef(new Map<string, number>());
  const alertsPrimed = useRef(false);
  const alertsLive = useRef(new Set<string>());
  const alertsActive = useRef(false);
  const [search, setSearch] = useState("");
  const [walletDraft, setWalletDraft] = useState("");
  const [savedWallet, setSavedWallet] = useState("");
  const [holdings, setHoldings] = useState<HoldingsResult | null>(null);
  const [holdingsError, setHoldingsError] = useState<string | null>(null);
  const [holdingsBusy, setHoldingsBusy] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertSymbol, setAlertSymbol] = useState("NVDAx");
  const [alertDirection, setAlertDirection] = useState<"up" | "down">("up");
  const [alertKind, setAlertKind] = useState<"move" | "gap">("move");
  const [alertPct, setAlertPct] = useState("5");
  const [offers, setOffers] = useState(initialOffers);
  const [offersErr, setOffersErr] = useState(offersError);
  const [yieldSymbol, setYieldSymbol] = useState("NVDAx");
  const [passSymbol, setPassSymbol] = useState("NVDAx");
  const [sizeSymbol, setSizeSymbol] = useState("NVDAx");
  const [sizeOpen, setSizeOpen] = useState(false);
  const [ranking, setRanking] = useState<RankingResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [favourites, toggleFavourite] = useFavourites();
  const [sort, setSort] = useState<Sort>("desk");
  const [view, setView] = useState<View>("cards");
  const [holderWallet, setHolderWallet] = useState("");
  const [holderBusy, setHolderBusy] = useState(false);
  const [holderError, setHolderError] = useState<string | null>(null);
  const [holder, setHolder] = useState<HolderStatus | null>(null);

  useEffect(() => {
    setNow(Date.now());
    setMounted(true);
    setAlerts(loadAlerts());
    const wallet = readSetting(WALLET_KEY);
    setSavedWallet(wallet);
    setWalletDraft(wallet);
    const savedView = readSetting(VIEW_KEY);
    if (savedView === "cards" || savedView === "list") setView(savedView);
    const savedSort = readSetting(SORT_KEY);
    if (SORTS.some((s) => s.id === savedSort)) setSort(savedSort as Sort);
  }, []);

  useEffect(() => {
    for (const quote of initial) if (quote.usdPrice != null) lastPrices.current.set(quote.symbol, quote.usdPrice);
  }, [initial]);

  // The week's leader for the teaser under the stat tiles. Shared by the CDN for 5 minutes; nothing shows until there is one.
  useEffect(() => {
    let alive = true;
    getRanking()
      .then((result) => {
        if (alive) setRanking(result);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    saveSetting(ALERTS_KEY, JSON.stringify(alerts));
  }, [alerts]);

  useEffect(() => {
    alertsActive.current = alerts.length > 0;
  }, [alerts]);

  // Prices every 10 s, the clock every second. Prices that moved flash green or red.
  // Polling pauses while the tab is hidden, unless a saved alert could still ping this browser.
  // A page that arrived as an old cached copy first asks for prices alone (no buy rotation), which answers fastest; its
  // script has usually started that request already, before this code loaded (lib/earlyQuotes.ts).
  // Answers older than the prices already shown are ignored, so a slower answer never takes the page back in time.
  useEffect(() => {
    let alive = true;
    async function refresh(rotate = true) {
      let result: Awaited<ReturnType<typeof getQuotes>>;
      try {
        const early = rotate ? null : await takeEarlyQuotes();
        result = early?.ok ? early : await (rotate ? getQuotes({ data: { refreshBuys: true } }) : getQuotes());
      } catch {
        if (alive) setFeedError("Price feed paused.");
        return;
      }
      if (!alive) return;
      if (!result.ok) {
        setFeedError(result.message ?? "Price feed paused.");
        return;
      }
      setFeedError(null);
      if (result.asOf < newestAsOf.current) return;
      newestAsOf.current = result.asOf;
      const moved: Record<string, "up" | "down"> = {};
      for (const quote of result.quotes) {
        if (quote.usdPrice == null) continue;
        const previous = lastPrices.current.get(quote.symbol);
        if (previous != null && previous !== quote.usdPrice) moved[quote.symbol] = quote.usdPrice > previous ? "up" : "down";
        lastPrices.current.set(quote.symbol, quote.usdPrice);
      }
      setQuotes((previous) => mergeBuys(previous, result.quotes, Date.now()));
      setAsOf(result.asOf);
      if (Object.keys(moved).length > 0) {
        setTicks(moved);
        window.setTimeout(() => {
          if (alive) setTicks({});
        }, 700);
      }
    }
    if (Date.now() - initialAsOf > STALE_PAGE_MS) void refresh(false);
    void refresh();
    const poll = window.setInterval(() => {
      if (pageVisible() || (alertsActive.current && canNotify())) void refresh();
    }, 10_000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    const onVisibility = () => {
      if (pageVisible()) void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      window.clearInterval(poll);
      window.clearInterval(clock);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Keep a loaded wallet's values in step with the latest prices. Wallet amounts and Jupiter's price are both per share.
  useEffect(() => {
    setHoldings((current) => {
      if (!current) return current;
      let changed = false;
      const next = current.holdings.map((h) => {
        const quote = quotes.find((q) => q.symbol === h.symbol);
        if (!quote || quote.usdPrice == null || (quote.usdPrice === h.usdPrice && quote.change24h === h.change24h)) return h;
        changed = true;
        return { ...h, usdPrice: quote.usdPrice, change24h: quote.change24h, usdValue: h.amount * quote.usdPrice };
      });
      if (!changed) return current;
      const totalUsd = next.reduce((sum, h) => sum + h.usdValue, 0);
      const moved = next.reduce((sum, h) => (h.change24h == null || h.usdValue <= 0 ? sum : sum + h.usdValue * (h.change24h / 100)), 0);
      return { holdings: next, totalUsd, change24hPct: totalUsd > 0 ? (moved / totalUsd) * 100 : null };
    });
  }, [quotes]);

  // Yield offers every minute, only while the tab is visible.
  useEffect(() => {
    let alive = true;
    async function refresh() {
      let result: Awaited<ReturnType<typeof getOffers>>;
      try {
        result = await getOffers();
      } catch {
        if (alive && offers.length === 0) setOffersErr("Yield markets unavailable");
        return;
      }
      if (!alive) return;
      if (result.ok) {
        setOffers(result.offers);
        setOffersErr(null);
      } else if (offers.length === 0) {
        setOffersErr(result.message ?? "Yield markets unavailable");
      }
    }
    const poll = window.setInterval(() => {
      if (pageVisible()) void refresh();
    }, 60_000);
    return () => {
      alive = false;
      window.clearInterval(poll);
    };
  }, [offers.length]);

  const rows: DeskRow[] = useMemo(
    () =>
      (quotes.length ? quotes : TOKENS.map(emptyQuote)).map((quote) => ({
        ...quote,
        verdict: verdict(quote, now),
        gap: gapPct(buyUsable(quote.buyAt, now) ? quote.buyPrice : null, quote.stockPrice),
        older: olderBuy(quote, now),
      })),
    [quotes, now],
  );
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = rows.filter(
      (row) =>
        (!term || row.symbol.toLowerCase().includes(term) || row.name.toLowerCase().includes(term) || row.sector.toLowerCase().includes(term)) &&
        (filter === "all" || (filter === "fair" ? row.verdict.id === "fair" : favourites.includes(row.symbol))),
    );
    return sortRows(filtered, sort);
  }, [rows, search, filter, favourites, sort]);
  const fairCount = rows.filter((row) => row.verdict.id === "fair").length;
  const gapRows: GapRow[] = useMemo(
    () =>
      quotes
        .map((q) => ({
          symbol: q.symbol,
          name: q.name,
          underlying: q.underlying,
          token: q.usdPrice,
          stock: q.stockPrice,
          gap: gapPct(buyUsable(q.buyAt, now) ? q.buyPrice : null, q.stockPrice),
          sharesPerToken: q.sharesPerToken,
          buyPrice: q.buyPrice,
          buyImpactPct: q.buyImpactPct,
          buyAt: q.buyAt,
          issuerPrice: q.issuerPrice,
          issuerAt: q.issuerAt,
          mint: q.mint,
        }))
        .sort((a, b) => Math.abs(b.gap ?? 0) - Math.abs(a.gap ?? 0)),
    [quotes, now],
  );
  const marketState = quotes.find((q) => q.marketState)?.marketState ?? null;
  const session = sessionLine(marketState, now);
  const sessionOpen = isSessionOpen(marketState);
  // Before the first answer, or before the browser has its own clock, the session is not known yet.
  const sessionKnown = mounted && quotes.some((q) => q.usdPrice != null);
  const widest = gapRows.find((row) => row.gap != null);
  const fairNames = rows
    .filter((row) => row.verdict.id === "fair")
    .map((row) => ({ symbol: row.symbol, gap: row.gap }))
    .sort((a, b) => Math.abs(a.gap ?? 99) - Math.abs(b.gap ?? 99));
  const closestFair = fairNames[0] ?? null;
  const rebases = quotes
    .filter((q) => q.rebase && q.rebase.at * 1000 > now)
    .sort((a, b) => (a.rebase as NonNullable<Quote["rebase"]>).at - (b.rebase as NonNullable<Quote["rebase"]>).at);

  function jumpTo(symbol: string) {
    setFilter("all");
    setSearch(symbol);
    setTab("markets");
    window.setTimeout(() => {
      const target = document.getElementById(`stock-${symbol}`) ?? document.getElementById("markets");
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  }

  function openSize(symbol: string) {
    setSizeSymbol(symbol);
    setSizeOpen(true);
  }

  /** Switching tabs from further down the page brings the tab content back into view. */
  function chooseTab(next: Tab) {
    setTab(next);
    const top = document.getElementById("sections")?.getBoundingClientRect().top ?? 0;
    if (top < 0) document.getElementById("sections")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function chooseView(next: View) {
    setView(next);
    saveSetting(VIEW_KEY, next);
  }

  function chooseSort(next: Sort) {
    setSort(next);
    saveSetting(SORT_KEY, next);
  }

  async function loadHoldings(wallet = walletDraft) {
    setHoldingsBusy(true);
    setHoldingsError(null);
    try {
      const result = await getHoldings({ data: { wallet } });
      setHoldings(result);
      setSavedWallet(wallet.trim());
      saveSetting(WALLET_KEY, wallet.trim());
      setTab("portfolio");
    } catch (error) {
      setHoldings(null);
      setHoldingsError(error instanceof Error ? error.message : "Lookup failed.");
    } finally {
      setHoldingsBusy(false);
    }
  }

  function addAlert() {
    const pct = Number(alertPct);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return;
    setAlerts((list) => [{ id: crypto.randomUUID(), symbol: alertSymbol, direction: alertDirection, pct, kind: alertKind }, ...list]);
  }

  const hits = alerts.filter((alert) =>
    alertHit(
      alert,
      quotes.find((q) => q.symbol === alert.symbol),
    ),
  );

  // Browser notifications for alerts that start hitting while the page is open.
  useEffect(() => {
    const ids = new Set(hits.map((alert) => alert.id));
    if (!alertsPrimed.current) {
      alertsPrimed.current = true;
      alertsLive.current = ids;
      return;
    }
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      for (const alert of hits) {
        if (alertsLive.current.has(alert.id)) continue;
        const quote = quotes.find((q) => q.symbol === alert.symbol);
        const gap = quote ? gapPct(quote.usdPrice, quote.stockPrice) : null;
        const body =
          (alert.kind ?? "move") === "gap"
            ? `${alert.symbol} is ${formatGap(gap)} versus Nasdaq.`
            : `${alert.symbol} is ${formatPct(quote?.change24h ?? null)} today.`;
        new Notification(`${alert.symbol} on Par`, { body });
      }
    }
    alertsLive.current = ids;
  }, [hits, quotes]);

  const age = Math.max(0, Math.round((now - asOf) / 1000));
  const stale = mounted && now - asOf > STALE_PAGE_MS;

  // The $1,000 buys to quote first: this visitor's favourites, then the names on screen, in the order the desk shows them.
  const onScreen = useOnScreenSymbols(`${tab}|${view}|${visible.map((row) => row.symbol).join(",")}`);
  useWantBuys(() => [...favourites, ...visible.filter((row) => onScreen.current.has(row.symbol)).map((row) => row.symbol)], quotes);

  return (
    <>
      <StaleMark asOf={initialAsOf} stale={stale} ready={mounted} prefetch={EARLY_QUOTES_URL} />
      <Backdrop />
      <Ticker rows={rows} onPick={jumpTo} />
      <SiteNav current="/" />
      <div className="relative z-10 mx-auto max-w-6xl px-4 pb-20 pt-4 sm:px-6 sm:pt-6">
        <header className="rise grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
          <div className="min-w-0 max-w-2xl">
            <p className="text-sm font-medium tracking-wide text-gold">Par · stocks on Solana</p>
            <h1 className="hero-title mt-4 font-display text-5xl leading-[0.95] text-foam sm:text-7xl">
              Is the price <span className="text-gold">real?</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-mist">
              Par checks {TOKENS.length} tokenized stocks on Solana against Nasdaq, live, and says when a buy is fair.
            </p>
            <p className="mt-4 text-sm font-medium tracking-wide text-gold">
              {mounted ? `${sessionLabel(marketState, now)} · ${etClock(now)}` : "Checking the session"}
            </p>
            {closestFair ? (
              <button
                type="button"
                data-verdict
                onClick={() => jumpTo(closestFair.symbol)}
                className="mt-2 block text-left text-lg text-foam underline decoration-gold/70 underline-offset-4"
              >
                {fairNames.length === 1 ? `${closestFair.symbol} is the fair one.` : `${closestFair.symbol} is the closest fair name.`}
              </button>
            ) : !sessionKnown ? (
              <p className="mt-2 text-lg text-foam">Loading the live prices…</p>
            ) : !sessionOpen ? (
              <p className="mt-2 max-w-xl text-lg leading-snug text-foam">{closedLine(marketState, now)}</p>
            ) : (
              <button
                type="button"
                data-verdict
                onClick={() => widest && jumpTo(widest.symbol)}
                disabled={!widest}
                className="mt-2 block text-left text-lg text-foam underline decoration-gold/70 underline-offset-4 disabled:no-underline"
              >
                {widest ? `Nothing is fair right now. The widest gap is ${widest.symbol}.` : "Waiting for the $1,000 buys."}
              </button>
            )}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a
                href="https://t.me/ONPAR_BOT"
                className="inline-flex h-12 items-center gap-2 rounded-full bg-gold px-5 text-sm font-medium text-ink shadow-[0_8px_24px_#e0a04a33]"
              >
                <Send className="size-4" aria-hidden />
                Open @ONPAR_BOT
              </a>
              <a href="/portfolio" className="inline-flex h-12 items-center gap-2 rounded-full bg-foam px-5 text-sm font-medium text-ink">
                <Wallet className="size-4" aria-hidden />
                Your portfolio
              </a>
              <button
                type="button"
                onClick={() => openSize(sizeSymbol)}
                className="inline-flex h-12 items-center gap-2 rounded-full px-4 text-sm font-medium text-foam ring-1 ring-white/20"
              >
                <Ruler className="size-4" aria-hidden />
                Size check
              </button>
            </div>
            <a href="/bot" className="mt-4 inline-flex text-sm font-medium text-foam underline decoration-gold/70 underline-offset-4">
              How the bot works
            </a>
            <p className="mt-5 max-w-xl text-sm leading-relaxed text-mist">
              A tokenized stock tracks the share. It is not the share, it does not vote, and a dividend shows up as more tokens, not cash.
            </p>
          </div>
          <HeroLines rows={rows} age={age} feedError={feedError} onPick={jumpTo} />
        </header>

        <StatStrip
          mounted={mounted}
          marketState={marketState}
          now={now}
          fairCount={fairCount}
          total={rows.length}
          widest={widest}
          rebases={rebases}
          onPick={jumpTo}
        />

        <StaleNote age={now - asOf} ready={mounted} className="mt-4 rounded-2xl bg-dusk/80 px-4 py-3 text-mist ring-1 ring-white/10" />

        {ranking && ranking.rows.length > 0 ? (
          <Link
            to="/ranking"
            className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-dusk/80 px-4 py-3 text-sm ring-1 ring-white/10 hover:bg-dusk"
          >
            <span className="flex min-w-0 items-center gap-2 text-mist">
              <Trophy className="size-4 shrink-0 text-gold" aria-hidden />
              <span>
                <span className="font-medium text-foam">Last 7 days: </span>
                {ranking.rows[0].symbol}
                {" stayed nearest to Nasdaq, "}
                {nearLabel(ranking.rows[0].near)}
                {" of the time."}
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 font-medium text-foam">
              Ranking
              <ArrowRight className="size-4" aria-hidden />
            </span>
          </Link>
        ) : null}

        {feedError ? <p className="mt-4 rounded-2xl bg-clay-soft px-4 py-3 text-sm text-clay">{feedError}</p> : null}
        {hits.length > 0 ? (
          <p className="mt-4 rounded-2xl bg-pine-soft px-4 py-3 text-sm text-pine">
            {hits.length}
            {" alert"}
            {hits.length === 1 ? "" : "s"} {hits.length === 1 ? "is" : "are"}
            {" live. Open Alerts to review."}
          </p>
        ) : null}

        {/* The tab bar sticks to the top only while the tab content is on screen. */}
        <div id="sections" className="mt-10 scroll-mt-0">
          <div className="sticky top-0 z-30 -mx-4 bg-night/75 px-4 py-2 backdrop-blur-md sm:-mx-6 sm:px-6">
            <nav className="flex gap-0.5 overflow-x-auto rounded-full bg-dusk p-1 ring-1 ring-white/10 sm:gap-1" aria-label="Sections">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => chooseTab(t.id)}
                  aria-pressed={tab === t.id}
                  className={`h-11 shrink-0 rounded-full px-2.5 text-sm font-medium transition-colors sm:px-5 ${tab === t.id ? "bg-gold text-ink" : "text-foam hover:bg-white/5"}`}
                >
                  {t.label}
                </button>
              ))}
            </nav>
          </div>

          {tab === "markets" ? (
            <section id="markets" className="mt-4 scroll-mt-24">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="panel flex flex-1 items-center gap-2 px-4 ring-1 ring-line">
                  <Search className="size-4 text-muted" aria-hidden />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search a company"
                    aria-label="Search a company"
                    className="h-12 w-full bg-transparent text-base text-ink placeholder:text-muted"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      ["all", "All names"],
                      ["fair", "Fair now"],
                      ["favourites", `Favourites${favourites.length ? ` ${favourites.length}` : ""}`],
                    ] as [Filter, string][]
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setFilter(id)}
                      aria-pressed={filter === id}
                      className={`inline-flex h-12 items-center gap-1.5 rounded-full px-4 text-sm font-medium ${filter === id ? "bg-gold text-ink" : "bg-dusk text-foam ring-1 ring-white/10"}`}
                    >
                      {id === "favourites" ? <Star className="size-4" aria-hidden /> : null}
                      {label}
                    </button>
                  ))}
                  <label className="sr-only" htmlFor="markets-sort">
                    Sort
                  </label>
                  <select
                    id="markets-sort"
                    value={sort}
                    onChange={(event) => chooseSort(event.target.value as Sort)}
                    className="h-12 rounded-full bg-dusk px-4 text-sm font-medium text-foam ring-1 ring-white/10"
                  >
                    {SORTS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex rounded-full bg-dusk p-1 ring-1 ring-white/10" role="group" aria-label="View">
                    <button
                      type="button"
                      onClick={() => chooseView("cards")}
                      aria-pressed={view === "cards"}
                      aria-label="Cards"
                      className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${view === "cards" ? "bg-gold text-ink" : "text-foam"}`}
                    >
                      <LayoutGrid className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => chooseView("list")}
                      aria-pressed={view === "list"}
                      aria-label="List"
                      className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${view === "list" ? "bg-gold text-ink" : "text-foam"}`}
                    >
                      <List className="size-4" aria-hidden />
                    </button>
                  </div>
                </div>
              </div>
              {filter === "favourites" && favourites.length > 0 ? (
                <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-dusk/80 px-4 py-3 ring-1 ring-white/10 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-mist">
                    Get a text when {favourites.length === 1 ? "this name turns" : "these turn"} Fair.
                    {favourites.length > 8 ? " The link carries the first 8." : ""}
                  </p>
                  <a
                    href={watchLink(favourites)}
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-gold px-4 text-sm font-medium text-ink"
                  >
                    <Send className="size-4" aria-hidden />
                    Watch in Telegram
                  </a>
                </div>
              ) : null}
              {sessionKnown && !sessionOpen ? (
                <p className="mt-4 rounded-2xl bg-dusk/80 px-4 py-3 text-sm leading-relaxed text-mist ring-1 ring-white/10">
                  <span className="font-medium text-foam">{closedLine(marketState, now)}</span>
                  {" Tokens keep trading on Solana, so gaps drift. Overnight means Kraken quotes that name around the clock, which is still not the Nasdaq print. Each card's own line is under Details."}
                </p>
              ) : null}
              {visible.length === 0 ? (
                <p className="panel mt-4 px-5 py-10 text-base leading-relaxed text-muted ring-1 ring-line">
                  {filter === "fair"
                    ? "Nothing is fair right now. The session is closed, or the gap is too wide. All names are still listed."
                    : filter === "favourites"
                      ? "No favourites yet. Tap the star on any card to keep it here, on this device."
                      : "Nothing matches that search."}
                </p>
              ) : view === "list" ? (
                <StockList
                  rows={visible}
                  favourites={favourites}
                  onFavourite={toggleFavourite}
                  onOpen={(symbol) => {
                    setSearch(symbol);
                    chooseView("cards");
                  }}
                />
              ) : (
                <ul className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {visible.map((row) => (
                    <StockCard
                      key={row.mint}
                      row={row}
                      now={now}
                      tick={ticks[row.symbol]}
                      onSize={openSize}
                      favourite={favourites.includes(row.symbol)}
                      onFavourite={toggleFavourite}
                      sessionOpen={sessionOpen}
                    />
                  ))}
                </ul>
              )}
              {search ? (
                <button type="button" onClick={() => setSearch("")} className="mt-3 text-sm text-foam underline decoration-gold/70 underline-offset-4">
                  Show every name
                </button>
              ) : null}
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-mist">
                Buy opens Jupiter, selling USDC for that token. You pay the pool, not Par. Each card names its issuer, xStocks or Backpack
                Securities: the same company can have two tokens, each with its own pool and its own price.
              </p>
            </section>
          ) : null}

          {tab === "gap" ? (
            <Suspense fallback={<p className="panel mt-5 px-5 py-10 text-base text-muted ring-1 ring-line">Loading the gap chart…</p>}>
              <GapView rows={gapRows} session={mounted ? session : "Checking the US session."} marketState={marketState} now={now} />
            </Suspense>
          ) : null}

          {tab === "portfolio" ? (
            <section className="mt-5 grid gap-4 lg:grid-cols-[320px_1fr]">
              <form
                className="panel p-4 ring-1 ring-line"
                onSubmit={(event) => {
                  event.preventDefault();
                  void loadHoldings();
                }}
              >
                <div className="flex items-center gap-2 text-sm font-medium text-ink">
                  <Wallet className="size-4" aria-hidden />
                  Wallet
                </div>
                <p className="mt-2 text-sm text-muted">Paste any Solana address. We only read tokenized-stock balances.</p>
                <textarea
                  value={walletDraft}
                  onChange={(event) => setWalletDraft(event.target.value)}
                  rows={3}
                  placeholder="Solana address"
                  aria-label="Solana address"
                  className="mt-3 w-full resize-none rounded-2xl bg-foam px-3 py-3 text-sm text-ink ring-1 ring-line"
                />
                <button
                  type="submit"
                  disabled={holdingsBusy}
                  className="mt-3 h-11 w-full rounded-full bg-pine text-sm font-medium text-foam disabled:opacity-60"
                >
                  {holdingsBusy ? "Reading chain…" : "Show holdings"}
                </button>
                {savedWallet ? (
                  <p className="mt-3 truncate text-xs text-muted">
                    {"Saved on this device: "}
                    {savedWallet}
                  </p>
                ) : null}
                <a href="/portfolio" className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-3 text-foam">
                  <span>
                    <span className="block text-sm font-medium">Open the full portfolio</span>
                    <span className="block text-xs leading-relaxed text-mist">Next to Nasdaq, the exit price, yield, rebases, a map, and a Telegram watch</span>
                  </span>
                  <ArrowRight className="size-4 shrink-0" aria-hidden />
                </a>
              </form>
              <div className="panel p-4 ring-1 ring-line">
                {holdingsError ? <p className="text-sm text-clay">{holdingsError}</p> : null}
                {!holdings && !holdingsError ? <p className="text-sm text-muted">No wallet loaded yet.</p> : null}
                {holdings ? (
                  <>
                    <p className="text-xs tracking-wide text-muted uppercase">Total marked value</p>
                    <p className="mt-1 font-display text-4xl text-ink">
                      {formatUsd(
                        holdings.holdings.reduce((sum, h) => {
                          const price = quotes.find((q) => q.symbol === h.symbol)?.usdPrice ?? h.usdPrice;
                          return sum + (price == null ? h.usdValue : h.amount * price);
                        }, 0),
                      )}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {"24h "}
                      {holdings.change24hPct == null ? "—" : formatPct(holdings.change24hPct)}
                      {" ·"} {holdings.holdings.length}
                      {" position"}
                      {holdings.holdings.length === 1 ? "" : "s"}
                    </p>
                    {holdings.holdings.length === 0 ? (
                      <p className="mt-6 text-sm text-muted">No tracked stock tokens in this wallet. Prices above still cover the major names.</p>
                    ) : (
                      <ul className="mt-5 divide-y divide-line">
                        {holdings.holdings.map((h) => {
                          const token = TOKENS.find((t) => t.symbol === h.symbol);
                          const price = quotes.find((q) => q.symbol === h.symbol)?.usdPrice ?? h.usdPrice;
                          const value = price == null ? h.usdValue : h.amount * price;
                          return (
                            <li key={h.symbol} className="flex items-center justify-between gap-3 py-3">
                              <div className="flex min-w-0 items-center gap-3">
                                {token ? <TickerBadge underlying={token.underlying} sector={token.sector} size="sm" /> : null}
                                <div className="min-w-0">
                                  <div className="font-medium">{h.symbol}</div>
                                  <div className="truncate text-sm text-muted">
                                    {new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(h.amount)}
                                    {" shares · "}
                                    {h.name}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="text-right">
                                  <div className="font-medium tabular-nums">{formatUsd(value)}</div>
                                  <ChangePill value={h.change24h} />
                                </div>
                                {token ? <BuyLink mint={token.mint} symbol={h.symbol} /> : null}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </>
                ) : null}
              </div>
            </section>
          ) : null}

          {tab === "yield" ? <YieldPanel offers={offers} error={offersErr} symbol={yieldSymbol} onSymbol={setYieldSymbol} /> : null}

          {tab === "alerts" ? (
            <section className="mt-5 grid gap-4 lg:grid-cols-[320px_1fr]">
              <form
                className="panel p-4 ring-1 ring-line"
                onSubmit={(event) => {
                  event.preventDefault();
                  addAlert();
                }}
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Bell className="size-4" aria-hidden />
                  New alert
                </div>
                <label className="mt-3 block text-xs text-muted">
                  Token
                  <select
                    value={alertSymbol}
                    onChange={(event) => setAlertSymbol(event.target.value)}
                    className="mt-1 h-11 w-full rounded-2xl bg-foam px-3 text-sm text-ink ring-1 ring-line"
                  >
                    {TOKENS.map((t) => (
                      <option key={t.symbol}>{t.symbol}</option>
                    ))}
                  </select>
                </label>
                <label className="mt-3 block text-xs text-muted">
                  Watch
                  <select
                    value={alertKind}
                    onChange={(event) => setAlertKind(event.target.value as "move" | "gap")}
                    className="mt-1 h-11 w-full rounded-2xl bg-foam px-3 text-sm text-ink ring-1 ring-line"
                  >
                    <option value="move">The day's move</option>
                    <option value="gap">The gap versus Nasdaq</option>
                  </select>
                </label>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label className="text-xs text-muted">
                    {alertKind === "gap" ? "When it is" : "Direction"}
                    <select
                      value={alertDirection}
                      onChange={(event) => setAlertDirection(event.target.value as "up" | "down")}
                      className="mt-1 h-11 w-full rounded-2xl bg-foam px-3 text-sm text-ink ring-1 ring-line"
                    >
                      <option value="up">{alertKind === "gap" ? "Rich" : "Up"}</option>
                      <option value="down">{alertKind === "gap" ? "Cheap" : "Down"}</option>
                    </select>
                  </label>
                  <label className="text-xs text-muted">
                    {alertKind === "gap" ? "Gap %" : "Move %"}
                    <input
                      value={alertPct}
                      onChange={(event) => setAlertPct(event.target.value)}
                      inputMode="decimal"
                      className="mt-1 h-11 w-full rounded-2xl bg-foam px-3 text-sm text-ink ring-1 ring-line"
                    />
                  </label>
                </div>
                <button type="submit" className="mt-4 h-11 w-full rounded-full bg-ink text-sm font-medium text-foam">
                  Save alert
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (typeof Notification !== "undefined") void Notification.requestPermission();
                  }}
                  className="mt-2 h-11 w-full rounded-full bg-foam text-sm font-medium text-ink ring-1 ring-line"
                >
                  Ping this browser
                </button>
                <p className="mt-3 text-xs leading-relaxed text-muted">
                  A day-move alert watches the 24h change. A gap alert watches the difference versus Nasdaq. Pings fire in this browser while Par stays
                  open, including in a background tab. Closing the tab stops them. Nothing is stored on a server.
                </p>
              </form>
              <ul className="panel ring-1 ring-line">
                {alerts.length === 0 ? (
                  <li className="px-4 py-8 text-sm text-muted">No alerts yet.</li>
                ) : (
                  alerts.map((alert) => {
                    const quote = quotes.find((q) => q.symbol === alert.symbol);
                    const hit = alertHit(alert, quote);
                    const gap = quote ? gapPct(quote.usdPrice, quote.stockPrice) : null;
                    const isGap = (alert.kind ?? "move") === "gap";
                    return (
                      <li key={alert.id} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0">
                        <div>
                          <div className="font-medium">
                            {alert.symbol} {isGap ? "gap" : "day"} {alert.direction === "up" ? (isGap ? "rich" : "up") : isGap ? "cheap" : "down"}{" "}
                            {alert.pct}%
                          </div>
                          <div className="text-sm text-muted">
                            {"Now "}
                            {isGap ? formatGap(gap) : formatPct(quote?.change24h ?? null)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {hit ? <span className="rounded-full bg-pine-soft px-2 py-1 text-xs font-medium text-pine">Hit</span> : null}
                          <button
                            type="button"
                            onClick={() => setAlerts((list) => list.filter((a) => a.id !== alert.id))}
                            className="h-11 px-2 text-sm text-clay"
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    );
                  })
                )}
              </ul>
            </section>
          ) : null}

        </div>

        <div className="mt-10 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <PassAlong
            quote={quotes.find((q) => q.symbol === passSymbol)}
            symbol={passSymbol}
            now={now}
            onSymbol={setPassSymbol}
            copied={copied}
            onCopy={(text) => {
              void navigator.clipboard.writeText(text).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1600);
              });
            }}
          />
          <CryptoPanel initial={initialCryptos} />
        </div>

        <WhyHold
          wallet={holderWallet}
          onWallet={setHolderWallet}
          busy={holderBusy}
          error={holderError}
          status={holder}
          onCheck={async () => {
            setHolderBusy(true);
            setHolderError(null);
            setHolder(null);
            try {
              const result = await checkHolder({ data: { wallet: holderWallet } });
              setHolder(result.status);
            } catch (error) {
              setHolder(null);
              setHolderError(error instanceof Error ? error.message : "Lookup failed.");
            } finally {
              setHolderBusy(false);
            }
          }}
        />
        <Glossary />
        <SiteFooter />
      </div>
      <SizeSheet open={sizeOpen} symbol={sizeSymbol} onSymbol={setSizeSymbol} onClose={() => setSizeOpen(false)} />
    </>
  );
}
