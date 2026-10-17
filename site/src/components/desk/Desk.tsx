import { Bell, Search, Wallet } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatAmount, formatGap, formatPct, formatUsd, perSharePrice } from "../../lib/format";
import { etClock, isSessionOpen, sessionLabel, sessionLine, timeToOpen, utcStamp } from "../../lib/session";
import { NO_PRINT_UNDERLYING, TOKENS } from "../../lib/tokens";
import type { CryptoRow, HolderStatus, HoldingsResult, Offer, Quote } from "../../lib/types";
import { buyUsable, gapPct, rebaseLine, verdict, verdictBarClass, verdictPillClass } from "../../lib/verdict";
import { checkHolder, getHoldings, getOffers, getQuotes } from "../../server/functions";
import { Sky } from "../Sky";
import { CryptoPanel } from "./CryptoPanel";
import { GapView, type GapRow } from "./GapView";
import { Glossary } from "./Glossary";
import { PassAlong } from "./PassAlong";
import { BuyLink, ChangePill, GapPill, ShareMeter, VerdictDetail } from "./parts";
import { WhyHold } from "./WhyHold";
import { YieldPanel } from "./YieldPanel";

type Tab = "markets" | "gap" | "portfolio" | "yield" | "alerts";

const TABS: { id: Tab; label: string }[] = [
  { id: "markets", label: "Markets" },
  { id: "gap", label: "Gap" },
  { id: "portfolio", label: "Portfolio" },
  { id: "yield", label: "Yield" },
  { id: "alerts", label: "Alerts" },
];

type Alert = { id: string; symbol: string; direction: "up" | "down"; pct: number; kind?: "move" | "gap" };

// Same storage keys as the published desk, so alerts and the saved wallet carry over.
const ALERTS_KEY = "xstocks-alerts";
const WALLET_KEY = "xstocks-wallet";

function loadAlerts(): Alert[] {
  try {
    const raw = localStorage.getItem(ALERTS_KEY);
    return raw ? (JSON.parse(raw) as Alert[]) : [];
  } catch {
    return [];
  }
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

export function Desk({
  initial,
  initialError = null,
  initialOffers = [],
  offersError = null,
  initialCryptos = [],
}: {
  initial: Quote[];
  initialError?: string | null;
  initialOffers?: Offer[];
  offersError?: string | null;
  initialCryptos?: CryptoRow[];
}) {
  const [tab, setTab] = useState<Tab>("markets");
  const [quotes, setQuotes] = useState(initial);
  const [feedError, setFeedError] = useState(initialError);
  const [asOf, setAsOf] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [ticks, setTicks] = useState<Record<string, "up" | "down">>({});
  const lastPrices = useRef(new Map<string, number>());
  const alertsPrimed = useRef(false);
  const alertsLive = useRef(new Set<string>());
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
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [fairOnly, setFairOnly] = useState(false);
  const [holderWallet, setHolderWallet] = useState("");
  const [holderBusy, setHolderBusy] = useState(false);
  const [holderError, setHolderError] = useState<string | null>(null);
  const [holder, setHolder] = useState<HolderStatus | null>(null);

  useEffect(() => {
    setMounted(true);
    setAlerts(loadAlerts());
    const wallet = localStorage.getItem(WALLET_KEY) ?? "";
    setSavedWallet(wallet);
    setWalletDraft(wallet);
  }, []);

  useEffect(() => {
    for (const quote of initial) if (quote.usdPrice != null) lastPrices.current.set(quote.symbol, quote.usdPrice);
  }, [initial]);

  useEffect(() => {
    localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
  }, [alerts]);

  // Prices every 10 s, the clock every second. Prices that moved flash green or red.
  useEffect(() => {
    let alive = true;
    async function refresh() {
      const result = await getQuotes();
      if (!alive) return;
      if (!result.ok) {
        setFeedError(result.message ?? "Price feed paused.");
        return;
      }
      const moved: Record<string, "up" | "down"> = {};
      for (const quote of result.quotes) {
        if (quote.usdPrice == null) continue;
        const previous = lastPrices.current.get(quote.symbol);
        if (previous != null && previous !== quote.usdPrice) moved[quote.symbol] = quote.usdPrice > previous ? "up" : "down";
        lastPrices.current.set(quote.symbol, quote.usdPrice);
      }
      setFeedError(null);
      setQuotes(result.quotes);
      setAsOf(result.asOf);
      if (Object.keys(moved).length > 0) {
        setTicks(moved);
        window.setTimeout(() => {
          if (alive) setTicks({});
        }, 700);
      }
    }
    void refresh();
    const poll = window.setInterval(() => void refresh(), 10_000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, []);

  // Keep a loaded wallet's values in step with the latest prices.
  useEffect(() => {
    setHoldings((current) => {
      if (!current) return current;
      let changed = false;
      const next = current.holdings.map((h) => {
        const quote = quotes.find((q) => q.symbol === h.symbol);
        if (!quote || quote.usdPrice == null || (quote.usdPrice === h.usdPrice && quote.change24h === h.change24h)) return h;
        changed = true;
        const perShare = perSharePrice(quote.usdPrice, quote.sharesPerToken) ?? quote.usdPrice;
        return { ...h, usdPrice: quote.usdPrice, change24h: quote.change24h, usdValue: h.amount * perShare };
      });
      if (!changed) return current;
      const totalUsd = next.reduce((sum, h) => sum + h.usdValue, 0);
      const moved = next.reduce((sum, h) => (h.change24h == null || h.usdValue <= 0 ? sum : sum + h.usdValue * (h.change24h / 100)), 0);
      return { holdings: next, totalUsd, change24hPct: totalUsd > 0 ? (moved / totalUsd) * 100 : null };
    });
  }, [quotes]);

  // Yield offers every minute.
  useEffect(() => {
    let alive = true;
    async function refresh() {
      const result = await getOffers();
      if (!alive) return;
      if (result.ok) {
        setOffers(result.offers);
        setOffersErr(null);
      } else if (offers.length === 0) {
        setOffersErr(result.message ?? "Yield markets unavailable");
      }
    }
    const poll = window.setInterval(() => void refresh(), 60_000);
    return () => {
      alive = false;
      window.clearInterval(poll);
    };
  }, [offers.length]);

  const rows = useMemo(
    () => (quotes.length ? quotes : TOKENS.map(emptyQuote)).map((quote) => ({ ...quote, verdict: verdict(quote, now) })),
    [quotes, now],
  );
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (!term || row.symbol.toLowerCase().includes(term) || row.name.toLowerCase().includes(term) || row.sector.toLowerCase().includes(term)) &&
        (!fairOnly || row.verdict.id === "fair"),
    );
  }, [rows, search, fairOnly]);
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
  const widest = gapRows.find((row) => row.gap != null);
  const fairNames = rows
    .filter((row) => row.verdict.id === "fair")
    .map((row) => ({ symbol: row.symbol, gap: gapPct(buyUsable(row.buyAt, now) ? row.buyPrice : null, row.stockPrice) }))
    .sort((a, b) => Math.abs(a.gap ?? 99) - Math.abs(b.gap ?? 99));
  const closestFair = fairNames[0] ?? null;
  const rebases = quotes
    .filter((q) => q.rebase && q.rebase.at * 1000 > now)
    .sort((a, b) => (a.rebase as NonNullable<Quote["rebase"]>).at - (b.rebase as NonNullable<Quote["rebase"]>).at);

  function jumpTo(symbol: string) {
    setFairOnly(false);
    setSearch(symbol);
    setTab("markets");
    window.setTimeout(() => {
      document.getElementById(`stock-${symbol}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  }

  async function loadHoldings(wallet = walletDraft) {
    setHoldingsBusy(true);
    setHoldingsError(null);
    try {
      const result = await getHoldings({ data: { wallet } });
      setHoldings(result);
      setSavedWallet(wallet.trim());
      localStorage.setItem(WALLET_KEY, wallet.trim());
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

  return (
    <>
      <Sky />
      <div className="relative z-10 mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6">
        <header className="rise flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 max-w-2xl">
            <div className="flex items-center gap-3">
              <img src="/logo.jpg" alt="" width={44} height={44} className="h-11 w-11 rounded-xl" />
              <p className="text-sm font-medium tracking-wide text-gold">Par · stocks on Solana</p>
            </div>
            <h1 className="mt-3 font-display text-5xl leading-none text-foam sm:text-7xl">Is the price real?</h1>
            <p className="mt-4 text-sm font-medium tracking-wide text-gold">
              {mounted ? `${sessionLabel(marketState, now)} · ${etClock(now)}` : "Checking the session"}
            </p>
            {closestFair ? (
              <button
                type="button"
                onClick={() => jumpTo(closestFair.symbol)}
                className="mt-3 block text-left text-lg text-foam underline decoration-gold/70 underline-offset-4"
              >
                {fairNames.length === 1 ? `${closestFair.symbol} is the fair one.` : `${closestFair.symbol} is the closest fair name.`}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => widest && jumpTo(widest.symbol)}
                disabled={!widest}
                className="mt-3 block text-left text-lg text-foam underline decoration-gold/70 underline-offset-4 disabled:no-underline"
              >
                {widest ? `Nothing is fair. The widest gap is ${widest.symbol}.` : "Checking which name is fair."}
              </button>
            )}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a href="https://t.me/ONPAR_BOT" className="inline-flex h-12 items-center rounded-full bg-foam px-5 text-sm font-medium text-ink">
                Open @ONPAR_BOT
              </a>
              <a href="/portfolio" className="inline-flex h-12 items-center gap-2 rounded-full bg-gold px-5 text-sm font-medium text-ink">
                Your portfolio
              </a>
            </div>
            <p className="mt-3 max-w-xl text-sm text-mist">See every stock, ETF, coin, and dollar in the wallet.</p>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-mist">
              An xStock tracks the share. It is not the share, it does not vote, and a dividend shows up as more tokens, not cash.
            </p>
          </div>
          <div className="grid w-full items-start gap-4 sm:grid-cols-2 lg:w-[40rem] lg:shrink-0">
            <div className="panel w-full p-6 text-ink">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted">Fair right now</p>
                <span className="inline-flex items-center gap-2 text-sm font-medium text-ink" role="status">
                  <span className="live-dot" aria-hidden />
                  {feedError ? "Reconnecting" : `${age}s`}
                </span>
              </div>
              <p className="mt-2 font-display text-6xl leading-none text-ink">{fairCount}</p>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                {mounted
                  ? isSessionOpen(marketState)
                    ? fairCount > 0
                      ? "Nasdaq is open. These sit within 0.4% of the print and are easy to sell."
                      : "Nasdaq is open, but nothing is close enough to call fair."
                    : `Nasdaq is closed, so nothing is fair yet. It opens in ${timeToOpen(now)}.`
                  : "Checking the US session."}
                {widest?.gap == null ? "" : ` Widest gap is ${widest.symbol}, ${formatGap(widest.gap)}.`}
              </p>
            </div>
            <CryptoPanel initial={initialCryptos} />
          </div>
        </header>

        <section className="mt-8" aria-label="Next balance change">
          <p className="text-sm font-medium tracking-wide text-gold">Next balance change</p>
          {rebases.length === 0 ? (
            <p className="mt-2 max-w-xl text-base leading-relaxed text-mist">No balance changes are scheduled on the names we track.</p>
          ) : (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {rebases.map((q) => (
                <li key={q.symbol}>
                  <button type="button" onClick={() => jumpTo(q.symbol)} className="panel w-full px-4 py-3 text-left ring-1 ring-line">
                    <span className="font-medium text-ink">{q.symbol}</span>
                    <span className="mt-1 block text-sm text-muted">
                      {utcStamp(q.rebase!.at)}
                      {" UTC · "}
                      {q.rebase!.direction === "up" ? "balance goes up" : "multiplier drops"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

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

        {feedError ? <p className="mt-4 rounded-2xl bg-clay-soft px-4 py-3 text-sm text-clay">{feedError}</p> : null}
        {hits.length > 0 ? (
          <p className="mt-4 rounded-2xl bg-pine-soft px-4 py-3 text-sm text-pine">
            {hits.length}
            {" alert"}
            {hits.length === 1 ? "" : "s"} {hits.length === 1 ? "is" : "are"}
            {" live. Open Alerts to review."}
          </p>
        ) : null}

        <nav className="mt-8 flex gap-1 overflow-x-auto rounded-full bg-dusk p-1 ring-1 ring-white/10" aria-label="Sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`h-11 shrink-0 rounded-full px-4 text-sm font-medium ${tab === t.id ? "bg-gold text-ink" : "text-foam"}`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {tab === "markets" ? (
          <section className="mt-6">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="panel flex flex-1 items-center gap-2 px-4 ring-1 ring-line">
                <Search className="size-4 text-muted" aria-hidden />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search a company"
                  className="h-12 w-full bg-transparent text-base text-ink outline-none placeholder:text-muted"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFairOnly(false)}
                  className={`h-12 rounded-full px-4 text-sm font-medium ${fairOnly ? "bg-dusk text-foam ring-1 ring-white/10" : "bg-gold text-ink"}`}
                >
                  All names
                </button>
                <button
                  type="button"
                  onClick={() => setFairOnly(true)}
                  className={`h-12 rounded-full px-4 text-sm font-medium ${fairOnly ? "bg-gold text-ink" : "bg-dusk text-foam ring-1 ring-white/10"}`}
                >
                  Fair now
                </button>
              </div>
            </div>
            {visible.length === 0 ? (
              <p className="panel mt-4 px-5 py-10 text-base leading-relaxed text-muted ring-1 ring-line">
                {fairOnly
                  ? "Nothing is fair right now. The session is closed, or the gap is too wide. All names are still listed."
                  : "Nothing matches that search."}
              </p>
            ) : (
              <ul className="mt-4 grid gap-4 lg:grid-cols-2">
                {visible.map((row) => (
                  <li key={row.mint} id={`stock-${row.symbol}`} className="panel overflow-hidden ring-1 ring-line">
                    <div className="flex h-full">
                      <div className={`w-1.5 shrink-0 ${verdictBarClass(row.verdict.id)}`} />
                      <div className="flex min-w-0 flex-1 flex-col p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm text-muted">
                              {row.symbol}
                              {" · xStock · "}
                              {row.sector}
                            </p>
                            <h2 className="mt-1 font-display text-3xl text-ink">{row.name}</h2>
                          </div>
                          <span className={`rounded-full px-3 py-1 text-sm font-medium ${verdictPillClass(row.verdict.id)}`}>{row.verdict.title}</span>
                        </div>
                        <p className="mt-5 text-sm text-muted">Last trade</p>
                        <p
                          className={`font-display text-4xl text-ink sm:text-5xl ${ticks[row.symbol] === "up" ? "tick-up" : ticks[row.symbol] === "down" ? "tick-down" : ""}`}
                        >
                          {formatUsd(row.usdPrice)}
                        </p>
                        <ShareMeter
                          symbol={row.symbol}
                          multiplier={row.sharesPerToken}
                          usdPrice={row.usdPrice}
                          stockPrice={row.underlying === NO_PRINT_UNDERLYING ? null : row.stockPrice}
                        />
                        <p className="mt-3 max-w-md text-base leading-relaxed text-ink">{row.verdict.line}</p>
                        {row.rebase && row.rebase.at * 1000 > now ? (
                          <p className="mt-2 max-w-md text-sm leading-relaxed text-ink">{rebaseLine(row.symbol, row.rebase)}</p>
                        ) : null}
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <GapPill value={gapPct(buyUsable(row.buyAt, now) ? row.buyPrice : null, row.stockPrice)} />
                          <ChangePill value={row.change24h} />
                        </div>
                        <div className="mt-5 flex items-end justify-between gap-3">
                          <VerdictDetail row={row} now={now} />
                          <BuyLink mint={row.mint} symbol={row.symbol} />
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-mist">
              Buy opens Jupiter, selling USDC for that xStock. You pay the pool, not Par. These are not Backpack stock tokens, even when the company
              name matches.
            </p>
          </section>
        ) : null}

        {tab === "gap" ? (
          <GapView rows={gapRows} session={mounted ? session : "Checking the US session."} marketState={marketState} now={now} />
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
                className="mt-3 w-full resize-none rounded-2xl bg-foam px-3 py-3 text-sm text-ink ring-1 ring-line outline-none"
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
                        const quote = quotes.find((q) => q.symbol === h.symbol);
                        const perShare = perSharePrice(quote?.usdPrice ?? h.usdPrice, quote?.sharesPerToken ?? null);
                        return sum + (perShare == null ? h.usdValue : h.amount * perShare);
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
                    <p className="mt-6 text-sm text-muted">No tracked xStocks in this wallet. Prices above still cover the major names.</p>
                  ) : (
                    <ul className="mt-5 divide-y divide-line">
                      {holdings.holdings.map((h) => {
                        const token = TOKENS.find((t) => t.symbol === h.symbol);
                        const quote = quotes.find((q) => q.symbol === h.symbol);
                        const multiplier = quote?.sharesPerToken ?? null;
                        const shares = h.amount;
                        const raw = multiplier != null && multiplier > 0 ? shares / multiplier : null;
                        const perShare = perSharePrice(quote?.usdPrice ?? h.usdPrice, multiplier);
                        const value = perShare == null ? h.usdValue : shares * perShare;
                        const showRaw = raw != null && Math.abs(raw - shares) / Math.max(shares, 1) > 5e-5;
                        return (
                          <li key={h.symbol} className="flex items-center justify-between gap-3 py-3">
                            <div>
                              <div className="font-medium">{h.symbol}</div>
                              <div className="text-sm text-muted">
                                {formatAmount(shares)}
                                {" shares"}
                                {showRaw && raw != null ? ` · ${formatAmount(raw)} raw` : ""}
                                {" · "}
                                {h.name}
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
      </div>
    </>
  );
}
