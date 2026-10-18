import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Backdrop } from "../components/Backdrop";
import { BagEvents } from "../components/portfolio/BagEvents";
import { BagMap } from "../components/portfolio/BagMap";
import { BagPromise } from "../components/portfolio/BagPromise";
import { BagYield } from "../components/portfolio/BagYield";
import {
  ChangeChip,
  Donut,
  ExposureBars,
  LineBadge,
  OverlapChart,
  ShareBars,
  SliceKey,
  SpreadMeter,
  TodayPill,
  lineColour,
  shareLabel,
  type Slice,
} from "../components/portfolio/charts";
import { RealPrice } from "../components/portfolio/RealPrice";
import { WatchBag } from "../components/portfolio/WatchBag";
import { SiteFooter } from "../components/SiteFooter";
import { SiteNav } from "../components/SiteNav";
import { bagEvents, forgetWallet, isXStock, liveLines, readSavedWallet, realPriceRows, saveWallet, withoutDust } from "../lib/bag";
import { HOLDINGS_AS_OF, exposures, holdingsMayBeStale, overlap } from "../lib/etf-holdings";
import { SHELL_PAGE_CACHE, SITE_URL } from "../lib/site";
import type { Offer, PortfolioLine, PortfolioResult } from "../lib/types";
import { useLiveQuotes } from "../lib/useLiveQuotes";
import { useWantBuys } from "../lib/useWantBuys";
import {
  cleanName,
  connectError,
  connectWallet,
  disconnectWallet,
  onWalletsChange,
  safeIcon,
  solanaWallets,
  type StandardWallet,
} from "../lib/wallet-standard";
import { getOffers, getPortfolio } from "../server/functions";

const DESCRIPTION =
  "Your Solana wallet's stock tokens next to the shares they track: the Nasdaq value, a live exit price, possible yield and coming rebases. Read-only.";

export const Route = createFileRoute("/portfolio")({
  headers: () => ({ "Netlify-CDN-Cache-Control": SHELL_PAGE_CACHE }),
  head: () => ({
    meta: [
      { title: "Portfolio · Par" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "Your bag, at the real price · Par" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: `${SITE_URL}/portfolio` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/portfolio` }],
  }),
  component: PortfolioPage,
});

// Asset kinds in the allocation donut. Stocks blue, ETFs gold (as the Index sector), crypto green, cash sand.
const KIND_COLOURS: Record<string, string> = { Stock: "#5b8def", ETF: "#e0a04a", Crypto: "#2fd3a5", Cash: "#cdb88e" };
const KIND_LABELS: Record<string, string> = { Stock: "Stocks", ETF: "ETFs", Crypto: "Crypto", Cash: "Cash" };
// Country and currency bars, in order of size.
const PLAIN_COLOURS = ["#5b8def", "#e0a04a", "#2fd3a5", "#a184f5", "#e472b0", "#8fb3c0"];

function usd(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

/** Whole dollars from $1,000 and $1.2M style from a million, so the small boxes never overflow. */
function usdShort(value: number) {
  if (value >= 1_000_000) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(value);
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: value >= 1000 ? 0 : 2 }).format(value);
}

function pct(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

type GroupKey = "kind" | "sector" | "country" | "currency";

function groupBy(lines: PortfolioLine[], key: GroupKey): [string, number][] {
  const totals = new Map<string, number>();
  for (const line of lines) if (line.usdValue > 0) totals.set(line[key], (totals.get(line[key]) ?? 0) + line.usdValue);
  return [...totals.entries()].sort((a, b) => b[1] - a[1]);
}

/** 0–10 spread score from the Herfindahl index: 10 is even, 0 is one bet. */
function spreadScore(lines: PortfolioLine[], total: number) {
  if (!(total > 0) || lines.length === 0) return null;
  const concentration = lines.reduce((sum, line) => {
    const weight = line.usdValue / total;
    return sum + weight * weight;
  }, 0);
  return Math.round((1 - concentration) * 100) / 10;
}

function shortAddress(address: string) {
  return address.length < 12 ? address : `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function Fact({ label, value, hint, children }: { label: string; value: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-foam px-3 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-display text-lg tabular-nums sm:text-xl">{value}</dd>
      {children ? <dd>{children}</dd> : null}
      {hint ? <dd className="mt-1 text-xs text-muted">{hint}</dd> : null}
    </div>
  );
}

function PortfolioPage() {
  const [address, setAddress] = useState("");
  const [loadedAddress, setLoadedAddress] = useState("");
  const [savedWallet, setSavedWallet] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [book, setBook] = useState<PortfolioResult | null>(null);
  const [wallets, setWallets] = useState<StandardWallet[]>([]);
  const [picking, setPicking] = useState(false);
  const [accounts, setAccounts] = useState<string[] | null>(null);
  const [connected, setConnected] = useState<StandardWallet | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [offersError, setOffersError] = useState<string | null>(null);
  const [exitRunning, setExitRunning] = useState(false);

  // Live prices only once a wallet is read; paused while the exit checks use Jupiter's rate limit.
  const live = useLiveQuotes([], 0, { enabled: book != null, paused: exitRunning });
  const { lines, dust } = useMemo(() => withoutDust(liveLines(book?.lines ?? [], live.quotes)), [book, live.quotes]);
  const marketState = live.quotes.find((quote) => quote.marketState)?.marketState ?? null;
  const rows = realPriceRows(lines, live.quotes, live.now);
  const events = bagEvents(lines, live.quotes, live.now);
  const heldSymbols = rows.map((row) => row.line.symbol);
  // The stock tokens in this bag, largest first, get their $1,000 buys quoted before the rest of the list.
  useWantBuys(
    () =>
      lines
        .filter(isXStock)
        .sort((a, b) => b.usdValue - a.usdValue)
        .map((line) => line.symbol),
    live.quotes,
  );

  const overlapRows = overlap();
  const total = lines.reduce((sum, line) => sum + line.usdValue, 0);
  const withChange = lines.filter((line) => line.change24h != null);
  const changeBase = withChange.reduce((sum, line) => sum + line.usdValue, 0);
  const dayMove = changeBase > 0 ? withChange.reduce((sum, line) => sum + line.usdValue * ((line.change24h ?? 0) / 100), 0) / changeBase : null;
  const sleeve = lines.filter((line) => line.kind === "Stock" || line.kind === "ETF").filter((line) => line.change24h != null);
  const sleeveBase = sleeve.reduce((sum, line) => sum + line.usdValue, 0);
  const sleeveMove = sleeveBase > 0 ? sleeve.reduce((sum, line) => sum + line.usdValue * ((line.change24h ?? 0) / 100), 0) / sleeveBase : null;
  const companies = exposures(lines.map((line) => ({ symbol: line.symbol, underlying: line.underlying, kind: line.kind, usd: line.usdValue, name: line.name })));
  const apple = companies.find((company) => company.symbol === "AAPL");

  /** Reads the wallet, shows it, and keeps it on this device (the desk's Portfolio tab uses the same key). */
  async function load(wallet: string) {
    const result = await getPortfolio({ data: { wallet } });
    setBook(result);
    setLoadedAddress(wallet.trim());
    saveWallet(wallet);
    setSavedWallet(wallet.trim());
  }

  async function readAddress(wallet = address) {
    setBusy(true);
    setError(null);
    try {
      await load(wallet);
    } catch (err) {
      setBook(null);
      setError(err instanceof Error ? err.message : "The wallet could not be read.");
    } finally {
      setBusy(false);
    }
  }

  async function pickWallet(wallet: StandardWallet) {
    setBusy(true);
    setError(null);
    try {
      const found = await connectWallet(wallet);
      if (found.length === 0) {
        setError("That wallet returned no mainnet address.");
        return;
      }
      setConnected(wallet);
      if (found.length === 1) {
        setPicking(false);
        setAccounts(null);
        setWalletName(cleanName(wallet.name) ?? "Wallet");
        setAddress(found[0]);
        await load(found[0]);
        return;
      }
      setAccounts(found);
    } catch (err) {
      setError(connectError(err));
    } finally {
      setBusy(false);
    }
  }

  async function pickAccount(account: string) {
    setBusy(true);
    setError(null);
    try {
      setPicking(false);
      setAccounts(null);
      setWalletName(cleanName(connected?.name ?? "") ?? "Wallet");
      setAddress(account);
      await load(account);
    } catch (err) {
      setBook(null);
      setError(err instanceof Error ? err.message : "The wallet could not be read.");
    } finally {
      setBusy(false);
    }
  }

  /** Disconnects a connected wallet (best effort) and forgets the address on this device. */
  async function disconnect() {
    try {
      await disconnectWallet(connected);
    } catch {
      // Disconnect is best effort.
    }
    forgetWallet();
    setSavedWallet("");
    setConnected(null);
    setAccounts(null);
    setPicking(false);
    setWalletName(null);
    setAddress("");
    setLoadedAddress("");
    setBook(null);
    setError(null);
  }

  useEffect(() => onWalletsChange(() => setWallets(solanaWallets())), []);
  useEffect(() => setSavedWallet(readSavedWallet()), []);

  // Kamino's rates, once, after the first wallet is read.
  useEffect(() => {
    if (!book || offers || offersError) return;
    let alive = true;
    getOffers()
      .then((result) => {
        if (!alive) return;
        setOffers(result.offers);
        setOffersError(result.ok ? null : result.message);
      })
      .catch(() => {
        if (alive) setOffersError("Yield markets unavailable.");
      });
    return () => {
      alive = false;
    };
  }, [book, offers, offersError]);

  const cash = lines.filter((line) => line.kind === "Cash").reduce((sum, line) => sum + line.usdValue, 0);
  const todayUsd = dayMove == null ? null : dayMove * changeBase;
  const spread = spreadScore(lines, total);
  const byKind = groupBy(lines, "kind");
  const bySector = groupBy(lines, "sector");
  const stockCount = lines.filter(isXStock).length;
  const kindSlices: Slice[] = byKind.map(([kind, value]) => ({ key: kind, label: KIND_LABELS[kind] ?? kind, value, colour: KIND_COLOURS[kind] ?? "#8fb3c0" }));
  const sectorRows: Slice[] = bySector.map(([sector, value]) => ({
    key: sector,
    label: sector,
    value,
    colour: lineColour({ kind: sector === "Cash" ? "Cash" : sector === "Crypto" ? "Crypto" : "Stock", sector }),
  }));
  const equities = byKind.filter(([kind]) => kind === "Stock" || kind === "ETF").reduce((sum, [, value]) => sum + value, 0);
  const plainRows = (rows: [string, number][]): Slice[] =>
    rows.map(([label, value], index) => ({ key: label, label, value, colour: PLAIN_COLOURS[index % PLAIN_COLOURS.length] }));

  function exportCsv() {
    const body = lines
      .map((line) =>
        [
          line.symbol,
          line.name,
          line.kind,
          line.sector,
          line.country,
          line.currency,
          line.amount,
          line.usdValue.toFixed(2),
          line.change24h ?? "",
          total > 0 ? ((line.usdValue / total) * 100).toFixed(2) : "",
        ].join(","),
      )
      .join("\n");
    const blob = new Blob([`symbol,name,kind,sector,country,currency,amount,value_usd,change_24h_pct,weight_pct\n${body}\n`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "par-portfolio.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="relative min-h-screen text-foam">
      <Backdrop />
      <SiteNav current="/portfolio" />
      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <header className="rise pt-4">
          <p className="text-sm font-medium text-gold">Portfolio</p>
          <h1 className="hero-title mt-2 max-w-3xl font-display text-4xl leading-[1.05] sm:text-6xl">Your bag, at the real price.</h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-mist">
            Connect or paste a Solana wallet. Par reads the public balances, sets each stock token next to the shares it tracks, and shows what a sale would really
            return. It never asks you to sign anything.
          </p>
        </header>

        {walletName ? (
          <div className="mt-6 flex flex-col gap-3 rounded-2xl bg-dusk/80 p-4 ring-1 ring-white/10 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-foam">
              {walletName}
              {" · "}
              {shortAddress(loadedAddress || address)}
            </p>
            <button type="button" onClick={() => void disconnect()} className="h-11 rounded-full px-5 text-sm text-foam ring-1 ring-white/20">
              Disconnect
            </button>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl bg-dusk/80 p-4 ring-1 ring-white/10 sm:p-5">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setPicking(true);
                  setAccounts(null);
                }}
                className="h-11 rounded-full bg-gold px-5 text-sm font-medium text-ink"
              >
                Connect wallet
              </button>
              <button
                type="button"
                onClick={() => setPasting((open) => !open)}
                className="h-11 rounded-full px-5 text-sm text-foam ring-1 ring-white/20"
              >
                {pasting ? "Hide address" : "Paste an address"}
              </button>
              {savedWallet && !book ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setAddress(savedWallet);
                    void readAddress(savedWallet);
                  }}
                  className="h-11 rounded-full px-5 text-sm text-foam ring-1 ring-white/20 disabled:opacity-60"
                >
                  {busy ? "Reading…" : `Use ${shortAddress(savedWallet)}, saved on this device`}
                </button>
              ) : null}
            </div>
            {picking ? (
              <div className="mt-4">
                <p className="max-w-xl text-sm leading-relaxed text-mist">
                  Pick a wallet you installed yourself. Par only reads the public address. It will not ask you to sign or send a transaction. If a popup
                  asks you to approve a transaction, refuse it.
                </p>
                {accounts ? (
                  <ul className="mt-3 grid gap-2">
                    {accounts.map((account) => (
                      <li key={account}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void pickAccount(account)}
                          className="h-11 w-full rounded-xl px-3 text-left text-sm text-foam ring-1 ring-white/10 disabled:opacity-60"
                        >
                          {shortAddress(account)}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : wallets.length === 0 ? (
                  <p className="mt-3 text-sm text-mist">No Solana wallet responded. Install one, or paste an address.</p>
                ) : (
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {wallets.map((wallet, index) => {
                      const icon = safeIcon(wallet.icon);
                      const name = cleanName(wallet.name) ?? "Wallet";
                      return (
                        <li key={`${name}-${index}`}>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void pickWallet(wallet)}
                            className="flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-foam ring-1 ring-white/10 disabled:opacity-60"
                          >
                            {icon ? (
                              <img src={icon} alt="" width={24} height={24} className="h-6 w-6 rounded-md" />
                            ) : (
                              <span className="h-6 w-6 rounded-md bg-white/10" />
                            )}
                            {name}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : null}
            {pasting ? (
              <form
                className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
                onSubmit={(event) => {
                  event.preventDefault();
                  setConnected(null);
                  setWalletName(null);
                  void readAddress();
                }}
              >
                <label className="block flex-1 text-sm text-mist">
                  Any Solana address
                  <input
                    id="book-wallet"
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    placeholder="Paste a wallet"
                    autoComplete="off"
                    spellCheck={false}
                    className="mt-2 h-11 w-full rounded-xl bg-night px-3 text-sm text-foam ring-1 ring-white/10"
                  />
                </label>
                <button type="submit" disabled={busy} className="h-11 rounded-full bg-foam px-5 text-sm font-medium text-ink disabled:opacity-60">
                  {busy ? "Reading…" : "Read wallet"}
                </button>
              </form>
            ) : null}
          </div>
        )}

        {error ? <p className="mt-3 text-sm text-clay-bright">{error}</p> : null}

        {book ? (
          <section aria-labelledby="total-title" className="panel rise mt-6 p-5 text-ink ring-1 ring-line sm:p-7">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p id="total-title" className="text-sm font-medium text-amber">
                    Total value · marked now
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={exportCsv}
                      disabled={lines.length === 0}
                      className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-3.5 text-sm font-medium text-foam disabled:opacity-40"
                    >
                      <Download className="size-4" aria-hidden />
                      CSV
                    </button>
                    {walletName ? null : (
                      <button type="button" onClick={() => void disconnect()} className="h-9 rounded-full px-3.5 text-sm ring-1 ring-line">
                        Forget
                      </button>
                    )}
                  </div>
                </div>
                <p className="mt-2 font-display text-5xl tabular-nums sm:text-6xl">{usd(total)}</p>
                <p className="mt-3 flex flex-wrap items-center gap-2 text-base">
                  {"Today "}
                  <TodayPill usdMove={todayUsd} pct={dayMove == null ? null : dayMove * 100} />
                </p>
                <dl className="mt-5 grid grid-cols-3 gap-2">
                  <Fact label="Positions" value={String(lines.length)} hint={`${stockCount} stock token${stockCount === 1 ? "" : "s"}`} />
                  <Fact label="Cash" value={usdShort(cash)} hint={`USDC and USDT · ${shareLabel(cash, total)}`}>
                    <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
                      <span className="bar-grow block h-full rounded-full bg-[#cdb88e]" style={{ width: total > 0 ? `${(cash / total) * 100}%` : "0%" }} />
                    </span>
                  </Fact>
                  <Fact label="Spread" value={spread == null ? "—" : `${spread.toFixed(1)}/10`} hint="10 is even">
                    <SpreadMeter score={spread} />
                  </Fact>
                </dl>
                <p className="mt-4 text-sm text-muted">
                  {shortAddress(loadedAddress)}
                  {" · "}
                  {live.feedError
                    ? "Live prices paused; values are from the wallet read."
                    : live.quotes.length > 0
                      ? `Stock tokens marked live, ${live.age}s ago`
                      : "Loading live prices…"}
                </p>
              </div>
              <BagMap lines={lines} total={total} />
            </div>
          </section>
        ) : (
          <BagPromise />
        )}

        {book && sleeveMove != null && book.spyChange != null ? (
          <p className="mt-3 text-sm text-mist">
            {"The stock and ETF sleeve moved "}
            {pct(sleeveMove * 100)}
            {" today. SPYx moved "}
            {pct(book.spyChange)}
            {". That is one day, not a track record."}
          </p>
        ) : null}
        {book && book.unpriced > 0 ? (
          <p className="mt-2 text-sm text-mist">
            {book.unpriced}
            {" token"}
            {book.unpriced === 1 ? "" : "s"}
            {" had no price and "}
            {book.unpriced === 1 ? "is" : "are"}
            {" left out."}
          </p>
        ) : null}
        {book && dust > 0 ? (
          <p className="mt-2 text-sm text-mist">
            {dust}
            {dust === 1 ? " position is" : " positions are"}
            {" worth under $0.01 and not shown."}
          </p>
        ) : null}

        {book && rows.length > 0 ? (
          <>
            <RealPrice key={loadedAddress} rows={rows} now={live.now} marketState={marketState} onRunning={setExitRunning} />
            <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
              <BagYield lines={lines} offers={offers} error={offersError} />
              <BagEvents events={events} marketState={marketState} now={live.now} />
            </div>
            <WatchBag address={loadedAddress} symbols={heldSymbols} />
          </>
        ) : null}
        {book && rows.length === 0 && lines.some(isXStock) ? (
          <p className="panel mt-6 p-5 text-sm leading-relaxed text-muted ring-1 ring-line">
            {live.feedError ? "Live prices are paused, so the Nasdaq comparison waits. Try again in a minute." : "Loading live prices for your stock tokens…"}
          </p>
        ) : null}
        {book && rows.length === 0 && !lines.some(isXStock) ? (
          <p className="panel mt-6 p-5 text-sm leading-relaxed text-ink ring-1 ring-line">
            No tracked stock tokens in this wallet, so there is no Nasdaq comparison, exit price or rebase to show. The desk lists every name Par tracks.
          </p>
        ) : null}

        {book ? (
          <>
            <h2 className="mt-12 font-display text-3xl">The mix</h2>
            <p className="mt-1 text-sm text-mist">Every line in the wallet, by what it is, by sector, and by the companies behind it.</p>
            <section className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
              <div className="chart-panel p-5">
                <p className="text-sm font-medium text-foam">Asset allocation</p>
                <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row">
                  <Donut slices={kindSlices} total={total} label="Equities" value={shareLabel(equities, total)} />
                  {kindSlices.length === 0 ? <p className="text-sm text-mist">Nothing priced yet.</p> : <SliceKey slices={kindSlices} total={total} />}
                </div>
              </div>
              <div className="chart-panel p-5">
                <p className="text-sm font-medium text-foam">Sector exposure</p>
                <div className="mt-4">
                  <ShareBars rows={sectorRows} total={total} empty="Nothing priced yet." />
                </div>
                <p className="mt-4 text-xs leading-relaxed text-mist">An ETF stays one sector here. The companies inside it are in the exposure list.</p>
              </div>
            </section>

            <section className="chart-panel mt-3 overflow-hidden">
              <div className="flex items-baseline justify-between gap-3 px-5 py-4">
                <p className="text-sm font-medium text-foam">Holdings</p>
                <p className="text-xs text-mist">{lines.length === 1 ? "1 line" : `${lines.length} lines`}, largest first</p>
              </div>
              <ul className="divide-y divide-white/5 border-t border-white/10 sm:hidden">
                {lines.length === 0 ? <li className="px-5 py-6 text-sm text-mist">Nothing priced in this wallet.</li> : null}
                {lines.map((line) => (
                  <li key={`${line.kind}-${line.symbol}-${line.underlying}`} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <LineBadge line={line} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foam">{line.name}</p>
                        <p className="text-xs text-mist">
                          {line.symbol}
                          {" · "}
                          {shareLabel(line.usdValue, total)}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular-nums text-foam">{usd(line.usdValue)}</p>
                      <ChangeChip value={line.change24h} />
                    </div>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="text-xs tracking-wide text-mist uppercase">
                    <tr className="border-y border-white/10">
                      <th className="px-5 py-3 font-medium">Asset</th>
                      <th className="px-3 py-3 font-medium">Allocation</th>
                      <th className="px-3 py-3 font-medium">Price</th>
                      <th className="px-3 py-3 font-medium">Today</th>
                      <th className="px-5 py-3 text-right font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-5 py-8 text-mist">
                          Nothing priced in this wallet.
                        </td>
                      </tr>
                    ) : null}
                    {lines.map((line) => {
                      const price = line.amount > 0 ? line.usdValue / line.amount : null;
                      return (
                        <tr key={`${line.kind}-${line.symbol}-${line.underlying}`} className="border-b border-white/5 transition-colors hover:bg-white/[0.03]">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <LineBadge line={line} />
                              <div className="min-w-0">
                                <p className="font-medium text-foam">{line.name}</p>
                                <p className="text-xs text-mist">
                                  {line.symbol}
                                  {" · "}
                                  {line.kind}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3.5">
                            <p className="tabular-nums text-foam">{shareLabel(line.usdValue, total)}</p>
                            <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-white/10">
                              <div
                                className="bar-grow h-full rounded-full"
                                style={{ width: total > 0 ? `${Math.max((line.usdValue / total) * 100, line.usdValue > 0 ? 2 : 0)}%` : "0%", background: lineColour(line) }}
                              />
                            </div>
                          </td>
                          <td className="px-3 py-3.5 tabular-nums text-foam">{price == null ? "—" : usd(price)}</td>
                          <td className="px-3 py-3.5">
                            <ChangeChip value={line.change24h} />
                          </td>
                          <td className="px-5 py-3.5 text-right tabular-nums text-foam">{usd(line.usdValue)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="chart-panel mt-3 p-5">
              <p className="text-sm font-medium text-foam">Effective exposure</p>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mist">
                {"A direct stock counts in full. SPYx and QQQx are opened with published top holdings as of "}
                {HOLDINGS_AS_OF}
                {". Those lists are the top of each fund, not every company, so this sum is a floor."}
                {holdingsMayBeStale() ? " These weights may have changed since." : ""}
              </p>
              {apple && apple.usd > 0 ? (
                <p className="mt-4 text-sm leading-relaxed text-foam">
                  {"Apple is "}
                  {usd(apple.usd)}
                  {". "}
                  {usd(apple.direct)}
                  {" is the Apple token"}
                  {apple.through.length > 0 ? `, and ${apple.through.map((t) => `${usd(t.usd)} sits inside ${t.fund}`).join(", ")}` : ""}
                  {"."}
                </p>
              ) : (
                <p className="mt-4 text-sm text-mist">No Apple exposure in the published top holdings or as a direct token.</p>
              )}
              {companies.length > 0 ? <ExposureBars rows={companies.slice(0, 12)} /> : null}
            </section>
          </>
        ) : null}

        <section className="chart-panel mt-3 p-5">
          <p className="text-sm font-medium text-foam">SPYx and QQQx are not the same bet</p>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mist">
            {"Published top holdings as of "}
            {HOLDINGS_AS_OF}
            {". Owning both is the same company twice. QQQx is the heavier chip bet."}
            {holdingsMayBeStale() ? " These weights may have changed since." : ""}
          </p>
          <OverlapChart rows={overlapRows} />
        </section>

        {book ? (
          <section className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="chart-panel p-5">
              <p className="text-sm font-medium text-foam">Country</p>
              <div className="mt-4">
                <ShareBars rows={plainRows(groupBy(lines, "country"))} total={total} empty="Nothing priced." />
              </div>
            </div>
            <div className="chart-panel p-5">
              <p className="text-sm font-medium text-foam">Currency</p>
              <div className="mt-4">
                <ShareBars rows={plainRows(groupBy(lines, "currency"))} total={total} empty="Nothing priced." />
              </div>
            </div>
          </section>
        ) : null}

        <section className="mt-8 max-w-2xl text-sm leading-relaxed text-mist">
          <p className="font-medium text-foam">What this page will not invent</p>
          <ul className="mt-3 space-y-2">
            <li>Total return and profit. A balance does not know what you paid.</li>
            <li>Cash dividends. On an xStock they are already in the share count.</li>
            <li>A week, a month, or a year. Only today's mark is on the chain from here.</li>
            <li>A fill. The exit price is a live quote, not a trade, and Par never trades for you.</li>
            <li>A yield you will get. Possible yield is today's rate, and rates change.</li>
          </ul>
        </section>
        <SiteFooter />
      </main>
    </div>
  );
}
