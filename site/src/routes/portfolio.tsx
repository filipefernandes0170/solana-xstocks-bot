import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { HOLDINGS_AS_OF, exposures, overlap } from "../lib/etf-holdings";
import type { PortfolioLine, PortfolioResult } from "../lib/types";
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
import { getPortfolio } from "../server/functions";

export const Route = createFileRoute("/portfolio")({ component: PortfolioPage });

const KIND_COLOURS: Record<string, string> = { Stock: "#3d7eff", ETF: "#8eb6ff", Crypto: "#3dbe8b", Cash: "#e0a04a" };

function usd(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function pct(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function share(part: number, total: number) {
  return total > 0 ? `${((part / total) * 100).toFixed(1)}%` : "—";
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

function AllocationRing({ rows, total }: { rows: [string, number][]; total: number }) {
  const circumference = 2 * Math.PI * 42;
  let offset = 0;
  const equities = rows.filter(([kind]) => kind === "Stock" || kind === "ETF").reduce((sum, [, value]) => sum + value, 0);
  const equityPct = total > 0 ? Math.round((equities / total) * 100) : 0;
  return (
    <svg viewBox="0 0 120 120" className="h-48 w-48 shrink-0" aria-hidden>
      <circle cx="60" cy="60" r={42} fill="none" stroke="#1c3340" strokeWidth="12" />
      {rows.map(([kind, value]) => {
        const fraction = total > 0 ? value / total : 0;
        const length = Math.max(0, fraction * circumference - 1.5);
        const arc = (
          <circle
            key={kind}
            cx="60"
            cy="60"
            r={42}
            fill="none"
            stroke={KIND_COLOURS[kind] ?? "#8aa"}
            strokeWidth="12"
            strokeDasharray={`${length} ${circumference - length}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 60 60)"
          />
        );
        offset += fraction * circumference;
        return arc;
      })}
      <text x="60" y="56" textAnchor="middle" fill="#a9c4bc" fontSize="7" letterSpacing="1.2">
        EQUITIES
      </text>
      <text x="60" y="74" textAnchor="middle" fill="#e7f3ee" fontSize="16" fontFamily="Fraunces, Georgia, serif">
        {equityPct}%
      </text>
    </svg>
  );
}

function Stat({ label, value, hint, tone = "flat" }: { label: string; value: string; hint: string; tone?: "up" | "down" | "flat" }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-dusk px-4 py-4">
      <p className="text-sm text-mist">{label}</p>
      <p className="mt-2 font-display text-3xl text-foam">{value}</p>
      <p className={`mt-1 text-sm ${tone === "up" ? "text-[#3dbe8b]" : tone === "down" ? "text-clay" : "text-mist"}`}>{hint}</p>
    </div>
  );
}

function Breakdown({ title, rows, total }: { title: string; rows: [string, number][]; total: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-dusk p-5">
      <p className="text-sm font-medium text-foam">{title}</p>
      <ul className="mt-3 space-y-2">
        {rows.length === 0 ? <li className="text-sm text-mist">Nothing priced.</li> : null}
        {rows.map(([label, value]) => (
          <li key={label} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-mist">{label}</span>
            <span className="text-foam">
              {usd(value)}
              {" · "}
              {share(value, total)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PortfolioPage() {
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [book, setBook] = useState<PortfolioResult | null>(null);
  const [wallets, setWallets] = useState<StandardWallet[]>([]);
  const [picking, setPicking] = useState(false);
  const [accounts, setAccounts] = useState<string[] | null>(null);
  const [connected, setConnected] = useState<StandardWallet | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);

  const overlapRows = overlap();
  const lines = (book?.lines ?? []).filter((line) => line.usdValue > 0);
  const total = lines.reduce((sum, line) => sum + line.usdValue, 0);
  const withChange = lines.filter((line) => line.change24h != null);
  const changeBase = withChange.reduce((sum, line) => sum + line.usdValue, 0);
  const dayMove = changeBase > 0 ? withChange.reduce((sum, line) => sum + line.usdValue * ((line.change24h ?? 0) / 100), 0) / changeBase : null;
  const sleeve = lines.filter((line) => line.kind === "Stock" || line.kind === "ETF").filter((line) => line.change24h != null);
  const sleeveBase = sleeve.reduce((sum, line) => sum + line.usdValue, 0);
  const sleeveMove = sleeveBase > 0 ? sleeve.reduce((sum, line) => sum + line.usdValue * ((line.change24h ?? 0) / 100), 0) / sleeveBase : null;
  const companies = exposures(lines.map((line) => ({ symbol: line.symbol, underlying: line.underlying, kind: line.kind, usd: line.usdValue })));
  const apple = companies.find((company) => company.symbol === "AAPL");

  async function readAddress(wallet = address) {
    setBusy(true);
    setError(null);
    try {
      setBook(await getPortfolio({ data: { wallet } }));
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
        setBook(await getPortfolio({ data: { wallet: found[0] } }));
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
      setBook(await getPortfolio({ data: { wallet: account } }));
    } catch (err) {
      setBook(null);
      setError(err instanceof Error ? err.message : "The wallet could not be read.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    try {
      await disconnectWallet(connected);
    } catch {
      // Disconnect is best effort.
    }
    setConnected(null);
    setAccounts(null);
    setPicking(false);
    setWalletName(null);
    setAddress("");
    setBook(null);
  }

  useEffect(() => onWalletsChange(() => setWallets(solanaWallets())), []);

  const cash = lines.filter((line) => line.kind === "Cash").reduce((sum, line) => sum + line.usdValue, 0);
  const todayUsd = dayMove == null ? null : dayMove * changeBase;
  const spread = spreadScore(lines, total);
  const byKind = groupBy(lines, "kind");
  const bySector = groupBy(lines, "sector");

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
    <div className="min-h-screen bg-night text-foam">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 text-sm font-medium text-foam">
            <img src="/logo.jpg" alt="" width={28} height={28} className="h-7 w-7 rounded-lg" />
            Par
          </Link>
          <nav className="flex items-center gap-5 text-sm text-mist">
            <Link to="/" className="hover:text-foam">
              Desk
            </Link>
            <Link to="/portfolio" className="text-foam underline decoration-gold decoration-2 underline-offset-8">
              Portfolio
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <p className="text-sm text-mist">Home · Portfolio</p>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-4xl text-foam sm:text-5xl">Portfolio</h1>
            <p className="mt-2 text-sm text-mist">What this Solana wallet holds, marked in dollars. Today only. Not a profit.</p>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!book || lines.length === 0}
            className="h-10 rounded-lg bg-[#3d7eff] px-4 text-sm font-medium text-white disabled:opacity-40"
          >
            Export
          </button>
        </div>

        {walletName ? (
          <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-white/10 bg-dusk p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-foam">
              {walletName}
              {" · "}
              {shortAddress(address)}
            </p>
            <button type="button" onClick={() => void disconnect()} className="h-11 rounded-xl border border-white/15 px-5 text-sm text-foam">
              Disconnect
            </button>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-white/10 bg-dusk p-4">
            <button
              type="button"
              onClick={() => {
                setPicking(true);
                setAccounts(null);
              }}
              className="h-11 rounded-xl bg-foam px-5 text-sm font-medium text-ink"
            >
              Connect wallet
            </button>
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
                          className="h-11 w-full rounded-xl border border-white/10 px-3 text-left text-sm text-foam disabled:opacity-60"
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
                            className="flex h-12 w-full items-center gap-3 rounded-xl border border-white/10 px-3 text-left text-sm text-foam disabled:opacity-60"
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
                <button
                  type="button"
                  onClick={() => setPasting((open) => !open)}
                  className="mt-3 text-sm text-mist underline decoration-white/30 underline-offset-4"
                >
                  {pasting ? "Hide address" : "Or paste an address"}
                </button>
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
                    className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-night px-3 text-sm text-foam outline-none"
                  />
                </label>
                <button
                  type="submit"
                  disabled={busy}
                  className="h-11 rounded-xl bg-foam px-5 text-sm font-medium text-ink disabled:opacity-60"
                >
                  {busy ? "Reading…" : "Read wallet"}
                </button>
              </form>
            ) : null}
          </div>
        )}

        {error ? <p className="mt-3 text-sm text-clay">{error}</p> : null}

        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Total value" value={book ? usd(total) : "—"} hint={book ? "Marked now" : "Connect a wallet"} />
          <Stat
            label="Today"
            value={todayUsd == null ? "—" : `${todayUsd >= 0 ? "+" : "−"}${usd(Math.abs(todayUsd))}`}
            hint={dayMove == null ? "No 24h print" : pct(dayMove * 100)}
            tone={todayUsd == null ? "flat" : todayUsd >= 0 ? "up" : "down"}
          />
          <Stat label="Cash" value={book ? usd(cash) : "—"} hint="USDC and USDT" />
          <Stat label="Spread" value={spread == null ? "—" : `${spread.toFixed(1)} / 10`} hint="10 is even. 0 is one bet." />
        </section>

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

        <section className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-2xl border border-white/10 bg-dusk p-5">
            <p className="text-sm font-medium text-foam">Asset allocation</p>
            <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row">
              <AllocationRing rows={byKind} total={total} />
              <ul className="w-full space-y-3">
                {byKind.length === 0 ? <li className="text-sm text-mist">Nothing priced yet.</li> : null}
                {byKind.map(([kind, value]) => (
                  <li key={kind} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 text-mist">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: KIND_COLOURS[kind] ?? "#8aa" }} />
                      {kind === "Stock" ? "Stocks" : kind === "ETF" ? "ETFs" : kind}
                    </span>
                    <span className="text-foam">{usd(value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-dusk p-5">
            <p className="text-sm font-medium text-foam">Sector exposure</p>
            <ul className="mt-4 space-y-4">
              {bySector.length === 0 ? <li className="text-sm text-mist">Nothing priced yet.</li> : null}
              {bySector.map(([sector, value]) => (
                <li key={sector}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-mist">{sector}</span>
                    <span className="text-foam">{share(value, total)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-[#3d7eff]" style={{ width: total > 0 ? `${(value / total) * 100}%` : "0%" }} />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs leading-relaxed text-mist">An ETF stays one sector here. The companies inside it are in the exposure list.</p>
          </div>
        </section>

        <section className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-dusk">
          <div className="px-5 py-4">
            <p className="text-sm font-medium text-foam">Holdings</p>
          </div>
          <div className="overflow-x-auto">
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
                      Connect a wallet to fill this table.
                    </td>
                  </tr>
                ) : null}
                {lines.map((line) => {
                  const price = line.amount > 0 ? line.usdValue / line.amount : null;
                  const change = line.change24h;
                  const up = change != null && change >= 0;
                  return (
                    <tr key={`${line.kind}-${line.symbol}-${line.underlying}`} className="border-b border-white/5">
                      <td className="px-5 py-4">
                        <p className="font-medium text-foam">{line.name}</p>
                        <p className="text-xs text-mist">
                          {line.symbol}
                          {" · "}
                          {line.kind}
                        </p>
                      </td>
                      <td className="px-3 py-4">
                        <p className="text-foam">{share(line.usdValue, total)}</p>
                        <div className="mt-1 h-1 w-24 overflow-hidden rounded-full bg-white/10">
                          <div className="h-full rounded-full bg-[#3d7eff]" style={{ width: total > 0 ? `${(line.usdValue / total) * 100}%` : "0%" }} />
                        </div>
                      </td>
                      <td className="px-3 py-4 text-foam">{price == null ? "—" : usd(price)}</td>
                      <td className={`px-3 py-4 ${change == null ? "text-mist" : up ? "text-[#3dbe8b]" : "text-clay"}`}>
                        {change == null ? "—" : pct(change)}
                      </td>
                      <td className="px-5 py-4 text-right text-foam">{usd(line.usdValue)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {book ? (
          <section className="mt-3 rounded-2xl border border-white/10 bg-dusk p-5">
            <p className="text-sm font-medium text-foam">Effective exposure</p>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mist">
              {"A direct stock counts in full. SPYx and QQQx are opened with published top holdings as of "}
              {HOLDINGS_AS_OF}
              {". Those lists are the top of each fund, not every company, so this sum is a floor."}
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
            <ul className="mt-4 divide-y divide-white/10">
              {companies.slice(0, 12).map((company) => (
                <li key={company.symbol} className="flex items-baseline justify-between gap-4 py-3 text-sm">
                  <div>
                    <p className="text-foam">{company.name}</p>
                    <p className="text-mist">
                      {company.direct > 0 ? `${usd(company.direct)} direct` : "Only through a fund"}
                      {company.through.length > 0 ? ` · ${company.through.map((t) => t.fund).join(", ")}` : ""}
                    </p>
                  </div>
                  <p className="text-foam">{usd(company.usd)}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-3 rounded-2xl border border-white/10 bg-dusk p-5">
          <p className="text-sm font-medium text-foam">SPYx and QQQx are not the same bet</p>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mist">
            {"Published top holdings as of "}
            {HOLDINGS_AS_OF}
            {". Owning both is the same company twice. QQQx is the heavier chip bet."}
          </p>
          <ul className="mt-4 divide-y divide-white/10">
            {overlapRows.map((row) => (
              <li key={row.symbol} className="flex items-baseline justify-between gap-4 py-3 text-sm">
                <p className="text-foam">{row.name}</p>
                <p className="text-mist">
                  {"SPY "}
                  {(row.spy * 100).toFixed(2)}
                  {"% · QQQ "}
                  {(row.qqq * 100).toFixed(2)}
                  {"%"}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-3 grid gap-3 sm:grid-cols-2">
          <Breakdown title="Country" rows={groupBy(lines, "country")} total={total} />
          <Breakdown title="Currency" rows={groupBy(lines, "currency")} total={total} />
        </section>

        <section className="mt-8 max-w-2xl text-sm leading-relaxed text-mist">
          <p className="font-medium text-foam">What this page will not invent</p>
          <ul className="mt-3 space-y-2">
            <li>Total return and profit. A balance does not know what you paid.</li>
            <li>Cash dividends. On an xStock they are already in the share count.</li>
            <li>A week, a month, or a year. Only today's mark is on the chain from here.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
