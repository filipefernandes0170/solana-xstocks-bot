import { createFileRoute } from "@tanstack/react-router";
import { Download, Layers, Scale, Sprout, Wallet } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Backdrop } from "../components/Backdrop";
import { FIELD_BUTTON, GOLD_BUTTON, PageTitle, Panel, StatTile, UnderlineTabs } from "../components/ui";
import { BagEvents } from "../components/portfolio/BagEvents";
import { BagMap } from "../components/portfolio/BagMap";
import { BagPowers } from "../components/portfolio/BagPowers";
import { BagSupply } from "../components/portfolio/BagSupply";
import { LastLook } from "../components/portfolio/LastLook";
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
import {
  bagEvents,
  forgetWallet,
  isXStock,
  liveLines,
  readSavedWallet,
  realPriceRows,
  realPriceTotals,
  saveWallet,
  withoutDust,
  yieldIdeas,
} from "../lib/bag";
import { FAIR_BAND } from "../lib/brand";
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
import { bagPowers, mintsToRead, type BagPowersResult } from "../lib/bagPowers";
import {
  LAST_LOOK_MIN_AGE_MS,
  forgetLastLook,
  lookChange,
  readLastLook,
  saveLastLook,
  shouldSave,
  snapshotOf,
  type Snapshot,
} from "../lib/lastLook";
import type { SupplyResult } from "../lib/supply";
import { getBagPowers, getOffers, getPortfolio, getSupply } from "../server/functions";
import { numberFormat } from "../lib/intl";

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
  return numberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

/** Whole dollars from $1,000 and $1.2M style from a million, so the small boxes never overflow. */
function usdShort(value: number) {
  if (value >= 1_000_000) {
    return numberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(value);
  }
  return numberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: value >= 1000 ? 0 : 2 }).format(value);
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
    <div className="rounded-xl bg-field px-3 py-3 ring-1 ring-line">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-display text-lg tabular-nums text-ink">{value}</dd>
      {children ? <dd>{children}</dd> : null}
      {hint ? <dd className="mt-1 text-xs text-muted">{hint}</dd> : null}
    </div>
  );
}

function shareCount(value: number) {
  return numberFormat("en-US", { maximumFractionDigits: 4 }).format(value);
}

/**
 * Every line in the wallet, largest first: a table on wider screens, a list on a phone. Allocation is its share of the
 * total; the bars are drawn against the largest line, so the biggest holding fills its track and the rest compare to it.
 */
function HoldingsTable({ lines, total }: { lines: PortfolioLine[]; total: number }) {
  const largest = lines.reduce((max, line) => Math.max(max, line.usdValue), 0);
  return (
    <>
      <ul className="divide-y divide-line sm:hidden">
        {lines.length === 0 ? <li className="py-6 text-sm text-muted">Nothing priced in this wallet.</li> : null}
        {lines.map((line) => (
          <li key={`${line.kind}-${line.symbol}-${line.underlying}`} className="py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <LineBadge line={line} />
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{line.symbol}</p>
                  <p className="truncate text-xs text-muted">
                    {shareCount(line.amount)}
                    {" · "}
                    {line.name}
                  </p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="tabular-nums text-ink">{usd(line.usdValue)}</p>
                <ChangeChip value={line.change24h} />
              </div>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-field" aria-hidden>
                <div
                  className="bar-grow h-full rounded-full bg-gold"
                  style={{ width: largest > 0 ? `${Math.max((line.usdValue / largest) * 100, line.usdValue > 0 ? 2 : 0)}%` : "0%" }}
                />
              </div>
              <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted">{shareLabel(line.usdValue, total)}</span>
            </div>
          </li>
        ))}
      </ul>
      <div className="-mx-4 hidden overflow-x-auto sm:-mx-5 sm:block">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th className="px-4 py-2.5 font-medium sm:px-5">Asset</th>
              <th className="px-3 py-2.5 text-right font-medium">Amount</th>
              <th className="px-3 py-2.5 text-right font-medium">Price</th>
              <th className="px-3 py-2.5 text-right font-medium">Today</th>
              <th className="px-3 py-2.5 text-right font-medium">Value</th>
              <th className="px-4 py-2.5 font-medium sm:px-5">Allocation</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-muted">
                  Nothing priced in this wallet.
                </td>
              </tr>
            ) : null}
            {lines.map((line) => {
              const price = line.amount > 0 ? line.usdValue / line.amount : null;
              return (
                <tr key={`${line.kind}-${line.symbol}-${line.underlying}`} className="border-b border-line/60 transition-colors last:border-b-0 hover:bg-white/[0.03]">
                  <td className="px-4 py-3 sm:px-5">
                    <div className="flex items-center gap-3">
                      <LineBadge line={line} />
                      <div className="min-w-0">
                        <p className="font-medium text-ink">{line.symbol}</p>
                        <p className="max-w-[12rem] truncate text-xs text-muted">{line.name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-ink">{shareCount(line.amount)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-ink">{price == null ? "—" : usd(price)}</td>
                  <td className="px-3 py-3 text-right">
                    <ChangeChip value={line.change24h} />
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-medium text-ink">{usd(line.usdValue)}</td>
                  <td className="px-4 py-3 sm:px-5">
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-field lg:w-28" aria-hidden>
                        <div
                          className="bar-grow h-full rounded-full bg-gold"
                          style={{ width: largest > 0 ? `${Math.max((line.usdValue / largest) * 100, line.usdValue > 0 ? 2 : 0)}%` : "0%" }}
                        />
                      </div>
                      <span className="w-12 text-right tabular-nums text-muted">{shareLabel(line.usdValue, total)}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
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
  const [powers, setPowers] = useState<BagPowersResult | null>(null);
  const [powersError, setPowersError] = useState<string | null>(null);
  const [supply, setSupply] = useState<SupplyResult | null>(null);
  const [supplyError, setSupplyError] = useState<string | null>(null);
  // The view this device saw on an earlier visit, for "Since you last looked". Kept per wallet for this page's life, so
  // reading the same wallet again compares with the same earlier visit, not with the view saved a minute ago.
  const [lookBase, setLookBase] = useState<Snapshot | null>(null);
  const lookDone = useRef<PortfolioResult | null>(null);
  const lookBases = useRef(new Map<string, Snapshot | null>());
  const [tab, setTab] = useState<"holdings" | "look">("holdings");

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
  const powerSummary = useMemo(() => (powers?.ok ? bagPowers(lines, powers.mints) : null), [powers, lines]);
  const livePrices = useMemo(() => new Map(live.quotes.map((quote) => [quote.symbol, quote.usdPrice])), [live.quotes]);
  const sinceLastLook = useMemo(() => (lookBase ? lookChange(lookBase, snapshotOf(lines, live.now)) : null), [lookBase, lines, live.now]);
  const companies = exposures(lines.map((line) => ({ symbol: line.symbol, underlying: line.underlying, kind: line.kind, usd: line.usdValue, name: line.name })));
  const apple = companies.find((company) => company.symbol === "AAPL");

  /** Reads the wallet, shows it, and keeps it on this device (the desk's Portfolio tab uses the same key). */
  async function load(wallet: string) {
    const result = await getPortfolio({ data: { wallet } });
    if (wallet.trim() !== loadedAddress) setLookBase(null);
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
    if (loadedAddress) {
      forgetLastLook(loadedAddress);
      lookBases.current.delete(loadedAddress);
    }
    setLookBase(null);
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

  // Who can freeze this bag: its mints, read on Solana, for every wallet read.
  useEffect(() => {
    if (!book) return;
    let alive = true;
    setPowers(null);
    setPowersError(null);
    getBagPowers({ data: { mints: mintsToRead(book.lines) } })
      .then((result) => {
        if (!alive) return;
        if (result.ok) setPowers(result);
        else setPowersError(result.message);
      })
      .catch(() => {
        if (alive) setPowersError("The token mints could not be read right now.");
      });
    return () => {
      alive = false;
    };
  }, [book]);

  // Supply on Solana is the same for every wallet: read once, after the first wallet is read.
  useEffect(() => {
    if (!book || supply) return;
    let alive = true;
    getSupply()
      .then((result) => {
        if (!alive) return;
        setSupply(result);
        setSupplyError(result.ok ? null : "The supply could not be read right now.");
      })
      .catch(() => {
        if (alive) setSupplyError("The supply could not be read right now.");
      });
    return () => {
      alive = false;
    };
  }, [book, supply]);

  // "Since you last looked": once live prices are in, compare with the view this device kept, and keep this one
  // (at most once an hour, so a quick reload does not erase the earlier visit). Nothing leaves the device.
  useEffect(() => {
    if (!book || !loadedAddress || lookDone.current === book) return;
    if (live.quotes.length === 0 || live.feedError) return;
    lookDone.current = book;
    const known = lookBases.current.get(loadedAddress);
    if (known !== undefined) {
      setLookBase(known);
      return;
    }
    const now = Date.now();
    const previous = readLastLook(loadedAddress);
    const base = previous && now - previous.at >= LAST_LOOK_MIN_AGE_MS ? previous : null;
    lookBases.current.set(loadedAddress, base);
    setLookBase(base);
    if (shouldSave(previous, now)) saveLastLook(loadedAddress, snapshotOf(lines, now));
  }, [book, loadedAddress, live.quotes, live.feedError, lines]);

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
  // The tiles at the top: the same sums the sections below show in full.
  const markTotals = realPriceTotals(rows);
  const yieldIdea = offers ? yieldIdeas(lines, offers) : null;
  const markTone =
    markTotals.diffPct == null ? "text-ink" : Math.abs(markTotals.diffPct) < FAIR_BAND ? "text-pine" : Math.abs(markTotals.diffPct) < 1 ? "text-gold" : "text-clay";
  const liveNote = live.feedError
    ? "Live prices paused; values are from the wallet read."
    : live.quotes.length > 0
      ? `Stock tokens marked live, ${live.age}s ago`
      : "Loading live prices…";

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

  const connectButtons = (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => {
          setPicking(true);
          setAccounts(null);
        }}
        className={GOLD_BUTTON}
      >
        <Wallet className="size-4" aria-hidden />
        Connect wallet
      </button>
      <button type="button" onClick={() => setPasting((open) => !open)} className={FIELD_BUTTON}>
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
          className={FIELD_BUTTON}
        >
          {busy ? "Reading…" : `Use ${shortAddress(savedWallet)}, saved on this device`}
        </button>
      ) : null}
    </div>
  );

  const disconnectButton = (
    <button type="button" onClick={() => void disconnect()} className={FIELD_BUTTON}>
      Disconnect
    </button>
  );

  // The wallet list and the address field open under the wallet row, across the page.
  const chooser =
    !walletName && (picking || pasting) ? (
      <section aria-label="Choose a wallet" className="panel rise mt-3 p-4 sm:p-5">
        {picking ? (
          <div>
            <p className="max-w-2xl text-sm leading-relaxed text-muted">
              Pick a wallet you installed yourself. Par only reads the public address. It will not ask you to sign or send a transaction. If a popup asks
              you to approve a transaction, refuse it.
            </p>
            {accounts ? (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {accounts.map((account) => (
                  <li key={account}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void pickAccount(account)}
                      className="h-11 w-full rounded-lg bg-field px-3 text-left text-sm text-foam ring-1 ring-line hover:bg-white/10 disabled:opacity-60"
                    >
                      {shortAddress(account)}
                    </button>
                  </li>
                ))}
              </ul>
            ) : wallets.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No Solana wallet responded. Install one, or paste an address.</p>
            ) : (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {wallets.map((wallet, index) => {
                  const icon = safeIcon(wallet.icon);
                  const name = cleanName(wallet.name) ?? "Wallet";
                  return (
                    <li key={`${name}-${index}`}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void pickWallet(wallet)}
                        className="flex h-12 w-full items-center gap-3 rounded-lg bg-field px-3 text-left text-sm text-foam ring-1 ring-line hover:bg-white/10 disabled:opacity-60"
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
            className={`flex flex-col gap-3 sm:flex-row sm:items-end ${picking ? "mt-5 border-t border-line pt-5" : ""}`}
            onSubmit={(event) => {
              event.preventDefault();
              setConnected(null);
              setWalletName(null);
              void readAddress();
            }}
          >
            <label className="block flex-1 text-sm text-muted">
              Any Solana address
              <input
                id="book-wallet"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="Paste a wallet"
                autoComplete="off"
                spellCheck={false}
                className="mt-2 h-11 w-full rounded-lg bg-night px-3 text-sm text-foam ring-1 ring-line placeholder:text-mist"
              />
            </label>
            <button type="submit" disabled={busy} className={`${GOLD_BUTTON} h-11`}>
              {busy ? "Reading…" : "Read wallet"}
            </button>
          </form>
        ) : null}
      </section>
    ) : null;

  return (
    <div className="relative min-h-screen text-foam">
      <Backdrop />
      <SiteNav current="/portfolio" />
      <main className="relative z-10 mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6">
        <div className="rise">
          <PageTitle
            title={
              <>
                Your bag, at the <span className="text-gold">real price.</span>
              </>
            }
            line="Connect or paste a Solana wallet. Par reads the public balances, sets each stock token next to the shares it tracks, and shows what a sale would really return. It never asks you to sign anything."
          />
        </div>

        {book ? (
          <section aria-label="Your bag right now" className="rise mt-6 grid gap-3 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
            <div className="panel flex flex-col justify-between gap-4 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-field text-gold ring-1 ring-line">
                  <Wallet className="size-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-muted">{walletName ? `Connected · ${walletName}` : "Wallet · read-only"}</p>
                  <p className="truncate font-display text-xl text-ink" title={loadedAddress}>
                    {shortAddress(loadedAddress)}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">{liveNote}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {walletName ? (
                  disconnectButton
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setPicking(true);
                        setAccounts(null);
                      }}
                      className={GOLD_BUTTON}
                    >
                      <Wallet className="size-4" aria-hidden />
                      Connect wallet
                    </button>
                    <button type="button" onClick={() => setPasting((open) => !open)} className={FIELD_BUTTON}>
                      {pasting ? "Hide address" : "Paste an address"}
                    </button>
                    <button type="button" onClick={() => void disconnect()} className={FIELD_BUTTON}>
                      Forget
                    </button>
                  </>
                )}
                <button type="button" onClick={exportCsv} disabled={lines.length === 0} className={FIELD_BUTTON} aria-label="Download the holdings as CSV">
                  <Download className="size-4" aria-hidden />
                  CSV
                </button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <StatTile
                icon={<Wallet className="size-5" aria-hidden />}
                label="Total value · marked now"
                value={usd(total)}
                hint={
                  <span className="mt-1 inline-flex flex-wrap items-center gap-1.5">
                    Today <TodayPill usdMove={todayUsd} pct={dayMove == null ? null : dayMove * 100} />
                  </span>
                }
              />
              <StatTile
                icon={<Scale className="size-5" aria-hidden />}
                label="Stock tokens versus Nasdaq"
                value={markTotals.diffPct == null ? "—" : `${markTotals.diffPct >= 0 ? "+" : "−"}${Math.abs(markTotals.diffPct).toFixed(2)}%`}
                tone={markTone}
                hint={
                  markTotals.diffPct == null
                    ? rows.length > 0
                      ? "Nasdaq prints are loading"
                      : "No stock tokens to compare"
                    : `${markTotals.diffUsd >= 0 ? "+" : "−"}${usd(Math.abs(markTotals.diffUsd))} against the same shares at Nasdaq`
                }
              />
              <StatTile
                icon={<Layers className="size-5" aria-hidden />}
                label="Positions"
                value={String(lines.length)}
                hint={`${stockCount} stock token${stockCount === 1 ? "" : "s"} · cash ${shareLabel(cash, total)}`}
              />
              <StatTile
                icon={<Sprout className="size-5" aria-hidden />}
                label="Possible yield a year"
                value={yieldIdea && yieldIdea.perYear > 0 ? usdShort(yieldIdea.perYear) : offers == null && !offersError ? "…" : "—"}
                hint={
                  offersError
                    ? "Kamino's rates are unavailable"
                    : offers == null
                      ? "Reading Kamino's live rates"
                      : "Lending on Kamino at today's rates, which change"
                }
              />
            </div>
          </section>
        ) : (
          <section aria-label="Your wallet" className="panel rise mt-6 flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-field text-gold ring-1 ring-line">
                <Wallet className="size-6" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-ink">{walletName ?? "Connect your wallet"}</h2>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted">
                  {walletName
                    ? shortAddress(loadedAddress || address)
                    : "See your stock tokens, ETFs and cash next to the shares they track. Read-only: Par sees the public balances and nothing else."}
                </p>
              </div>
            </div>
            {walletName ? disconnectButton : connectButtons}
          </section>
        )}

        {chooser}
        {error ? <p className="mt-3 text-sm text-clay-bright">{error}</p> : null}

        {book ? null : <BagPromise />}

        {book && sleeveMove != null && book.spyChange != null ? (
          <p className="mt-4 text-sm text-mist">
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

        {book ? (
          <div className={`mt-6 grid items-start gap-6 ${rows.length > 0 ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]" : ""}`}>
            <section aria-label="Holdings" className="panel rise p-4 sm:p-5">
              <UnderlineTabs
                label="Holdings views"
                value={tab}
                onChange={setTab}
                tabs={[
                  { id: "holdings", label: "Holdings" },
                  { id: "look", label: "Since you last looked" },
                ]}
              />
              <div className="mt-4">
                {tab === "holdings" ? (
                  <>
                    <HoldingsTable lines={lines} total={total} />
                    <p className="mt-3 text-xs text-muted">
                      {lines.length === 1 ? "1 line" : `${lines.length} lines`}
                      {", largest first. Today is each price's move over 24 hours."}
                    </p>
                  </>
                ) : sinceLastLook ? (
                  <LastLook change={sinceLastLook} />
                ) : (
                  <p className="text-sm leading-relaxed text-muted">
                    This device keeps a view of this wallet, at most once an hour. Come back after 10 minutes or more to see what changed since, split into
                    price moves and balance changes. Nothing leaves the device.
                  </p>
                )}
              </div>
            </section>
            {rows.length > 0 ? (
              <div className="grid gap-6">
                <BagYield lines={lines} offers={offers} error={offersError} />
                <BagEvents events={events} marketState={marketState} now={live.now} />
              </div>
            ) : null}
          </div>
        ) : null}

        {book && rows.length > 0 ? <RealPrice key={loadedAddress} rows={rows} now={live.now} marketState={marketState} onRunning={setExitRunning} /> : null}
        {book && rows.length === 0 && lines.some(isXStock) ? (
          <p className="panel mt-6 p-5 text-sm leading-relaxed text-muted">
            {live.feedError ? "Live prices are paused, so the Nasdaq comparison waits. Try again in a minute." : "Loading live prices for your stock tokens…"}
          </p>
        ) : null}
        {book && rows.length === 0 && !lines.some(isXStock) ? (
          <p className="panel mt-6 p-5 text-sm leading-relaxed text-ink">
            No tracked stock tokens in this wallet, so there is no Nasdaq comparison, exit price or rebase to show. The desk lists every name Par tracks.
          </p>
        ) : null}

        {book && lines.length > 0 ? (
          <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <Panel title="Your bag as a map">
              <BagMap lines={lines} total={total} />
              <dl className="mt-4 grid grid-cols-2 gap-2">
                <Fact label="Cash" value={usdShort(cash)} hint={`USDC and USDT · ${shareLabel(cash, total)}`}>
                  <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-night" aria-hidden>
                    <span className="bar-grow block h-full rounded-full bg-[#cdb88e]" style={{ width: total > 0 ? `${(cash / total) * 100}%` : "0%" }} />
                  </span>
                </Fact>
                <Fact label="Spread" value={spread == null ? "—" : `${spread.toFixed(1)}/10`} hint="10 is even, 0 is one bet">
                  <SpreadMeter score={spread} />
                </Fact>
              </dl>
            </Panel>
            <div className="grid gap-6">
              <Panel title="Asset allocation">
                <div className="flex flex-col items-center gap-6 sm:flex-row lg:flex-col">
                  <Donut slices={kindSlices} total={total} label="Equities" value={shareLabel(equities, total)} />
                  {kindSlices.length === 0 ? <p className="text-sm text-muted">Nothing priced yet.</p> : <SliceKey slices={kindSlices} total={total} />}
                </div>
              </Panel>
              <Panel title="Sector exposure">
                <ShareBars rows={sectorRows} total={total} empty="Nothing priced yet." />
                <p className="mt-4 text-xs leading-relaxed text-muted">An ETF stays one sector here. The companies inside it are in the exposure list.</p>
              </Panel>
            </div>
          </div>
        ) : null}

        {book && lines.length > 0 ? (
          <div className={`mt-6 grid items-start gap-6 ${lines.some(isXStock) ? "lg:grid-cols-2" : ""}`}>
            <BagPowers summary={powerSummary} error={powersError} />
            {lines.some(isXStock) ? <BagSupply lines={lines} supply={supply} prices={livePrices} error={supplyError} /> : null}
          </div>
        ) : null}
        {book && rows.length > 0 ? <WatchBag address={loadedAddress} symbols={heldSymbols} /> : null}

        {book ? (
          <>
            <h2 className="mt-12 font-display text-2xl text-foam">The mix</h2>
            <p className="mt-1 text-sm text-mist">The companies behind every line, and where the money sits.</p>
            <div className="mt-4 grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <Panel title="Effective exposure">
                <p className="max-w-2xl text-sm leading-relaxed text-muted">
                  {"A direct stock counts in full. SPYx and QQQx are opened with published top holdings as of "}
                  {HOLDINGS_AS_OF}
                  {". Those lists are the top of each fund, not every company, so this sum is a floor."}
                  {holdingsMayBeStale() ? " These weights may have changed since." : ""}
                </p>
                {apple && apple.usd > 0 ? (
                  <p className="mt-4 text-sm leading-relaxed text-ink">
                    {"Apple is "}
                    {usd(apple.usd)}
                    {". "}
                    {usd(apple.direct)}
                    {" is the Apple token"}
                    {apple.through.length > 0 ? `, and ${apple.through.map((t) => `${usd(t.usd)} sits inside ${t.fund}`).join(", ")}` : ""}
                    {"."}
                  </p>
                ) : (
                  <p className="mt-4 text-sm text-muted">No Apple exposure in the published top holdings or as a direct token.</p>
                )}
                {companies.length > 0 ? <ExposureBars rows={companies.slice(0, 12)} /> : null}
              </Panel>
              <div className="grid gap-6">
                <Panel title="Country">
                  <ShareBars rows={plainRows(groupBy(lines, "country"))} total={total} empty="Nothing priced." />
                </Panel>
                <Panel title="Currency">
                  <ShareBars rows={plainRows(groupBy(lines, "currency"))} total={total} empty="Nothing priced." />
                </Panel>
              </div>
            </div>
          </>
        ) : null}

        <Panel title="SPYx and QQQx are not the same bet" className="mt-6">
          <p className="max-w-2xl text-sm leading-relaxed text-muted">
            {"Published top holdings as of "}
            {HOLDINGS_AS_OF}
            {". Owning both is the same company twice. QQQx is the heavier chip bet."}
            {holdingsMayBeStale() ? " These weights may have changed since." : ""}
          </p>
          <OverlapChart rows={overlapRows} />
        </Panel>

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
