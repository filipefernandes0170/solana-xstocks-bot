import { useEffect, useState } from "react";
import { formatPct, formatUsd } from "../../lib/format";
import type { CryptoRow } from "../../lib/types";
import { getCryptos } from "../../server/functions";

/** Top ten coins, refreshed every minute while the tab is visible, with a highlight that walks down the list every 3 s. */
export function CryptoPanel({ initial }: { initial: CryptoRow[] }) {
  const [rows, setRows] = useState(initial);
  const [step, setStep] = useState(0);
  const [asOf, setAsOf] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function refresh() {
      let result: Awaited<ReturnType<typeof getCryptos>>;
      try {
        result = await getCryptos();
      } catch {
        if (alive) setError("Crypto prices paused.");
        return;
      }
      if (!alive) return;
      if (!result.ok || result.rows.length === 0) setError(("message" in result ? result.message : undefined) ?? "Crypto prices paused.");
      else {
        setError(null);
        setRows(result.rows);
        setAsOf(result.asOf);
      }
    }
    if (initial.length === 0) void refresh();
    const poll = window.setInterval(() => {
      if (document.visibilityState !== "hidden") void refresh();
    }, 60_000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [initial.length]);

  useEffect(() => {
    if (rows.length < 2) return;
    const timer = window.setInterval(() => setStep((s) => (s + 1) % rows.length), 3000);
    return () => window.clearInterval(timer);
  }, [rows.length]);

  const age = Math.max(0, Math.round((now - asOf) / 1000));
  const active = rows.length === 0 ? 0 : step % rows.length;

  return (
    <div className="panel w-full p-6 text-ink">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">Crypto</p>
        <p className="text-sm text-muted">{error ? "Paused" : rows.length === 0 ? "—" : `${age}s`}</p>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm leading-relaxed text-muted">{error ?? "Checking the top ten."}</p>
      ) : (
        <ol className="mt-3">
          {rows.map((row, index) => (
            <li
              key={row.id}
              className={`flex items-baseline justify-between gap-3 rounded-lg px-2 py-1.5 text-sm ${index === active ? "bg-pine-soft text-ink" : "text-muted"}`}
            >
              <span className="w-12 shrink-0 truncate font-medium" title={row.symbol}>
                {row.symbol}
              </span>
              <span className="min-w-0 flex-1 truncate">{row.name}</span>
              <span className="shrink-0 font-medium text-ink">{formatUsd(row.usd)}</span>
              <span className={`w-16 shrink-0 text-right ${row.change24h != null && row.change24h < 0 ? "text-clay" : "text-pine"}`}>
                {formatPct(row.change24h)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
