import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatGap, formatImpact, formatUsd, impactHint, multiplierLabel } from "../../lib/format";
import { NO_PRINT_UNDERLYING } from "../../lib/tokens";
import { buyUsable, legs, verdict } from "../../lib/verdict";
import { StatCard, GapPill } from "./parts";

export type GapRow = {
  symbol: string;
  name: string;
  underlying: string;
  token: number | null;
  stock: number | null;
  gap: number | null;
  sharesPerToken: number | null;
  buyPrice: number | null;
  buyImpactPct: number | null;
  buyAt: number | null;
  issuerPrice: number | null;
  issuerAt: number | null;
  mint: string;
};

const EXPLAINER =
  "xStocker and the exchange apps show a token price. They do not show whether you are paying above or below the Nasdaq print. Green means the $1,000 buy is cheaper than the stock. Red means you are paying a premium. SpaceX has no public print. A token can also stand for slightly more than one share, because dividends are reinvested into that number instead of paid as cash. That line sits under each name, and it is not the gap. Fair, on Markets, means Nasdaq is open and a $1,000 Jupiter buy, the issuer mark, and the Nasdaq print all sit within 0.4% of each other. The large price is the last trade. The verdict uses the buy, refreshed about once a minute. If that buy is missing, the card stays on Checking and is not called Fair. A tight last trade can still be two errors cancelling. Split means the buy and the issuer mark disagree. The dollar figure is how much, scaled in a straight line, reaches 1% impact on that same buy. It is not a guaranteed fill. Overnight means Kraken quotes that name around the clock, and it is still not the print.";

export function GapView({ rows, session, marketState, now }: { rows: GapRow[]; session: string; marketState: string | null; now: number }) {
  const withGap = rows.filter((row) => row.gap != null);
  const ascending = [...withGap].sort((a, b) => (a.gap ?? 0) - (b.gap ?? 0));
  const cheapest = ascending[0];
  const richest = [...withGap].sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0))[0];

  return (
    <section className="mt-5 grid gap-4">
      <div className="panel p-5 ring-1 ring-line">
        <p className="text-sm text-amber">{session}</p>
        <h2 className="mt-2 font-display text-3xl text-ink">On-chain versus the stock</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{EXPLAINER}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard
          label="Cheapest versus stock"
          value={cheapest ? `${cheapest.symbol} ${formatGap(cheapest.gap)}` : "—"}
          hint="$1,000 buy below the Nasdaq print"
        />
        <StatCard
          label="Richest versus stock"
          value={richest ? `${richest.symbol} ${formatGap(richest.gap)}` : "—"}
          hint="$1,000 buy above the Nasdaq print"
        />
      </div>
      <div className="panel p-4 ring-1 ring-line">
        <div className="h-[32rem]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ascending} layout="vertical" margin={{ left: 8, right: 12, top: 8, bottom: 8 }}>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="symbol"
                width={64}
                tick={{ fill: "var(--color-muted)", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(value) => formatGap(typeof value === "number" ? value : null)}
                labelFormatter={(label) => String(label)}
                cursor={{ fill: "var(--color-foam)" }}
              />
              <Bar dataKey="gap" radius={6} barSize={14}>
                {ascending.map((row) => (
                  <Cell key={row.symbol} fill={(row.gap ?? 0) >= 0 ? "var(--color-clay)" : "var(--color-pine)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <ul className="grid gap-3">
        {rows.map((row) => {
          const buy = buyUsable(row.buyAt, now) ? row.buyPrice : null;
          const l = legs(buy, row.issuerPrice, row.stock);
          const shares = multiplierLabel(row.sharesPerToken);
          return (
            <li key={row.symbol} className="panel p-4 ring-1 ring-line">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-2xl text-ink">{row.name}</h3>
                  <p className="text-sm text-muted">
                    {row.symbol}
                    {" · last trade "}
                    {formatUsd(row.token)}
                    {" · Nasdaq "}
                    {row.underlying === NO_PRINT_UNDERLYING ? "no print" : formatUsd(row.stock)}
                    {buyUsable(row.buyAt, now) && row.buyPrice != null ? ` · $1,000 buy ${formatUsd(row.buyPrice)}` : ""}
                    {row.issuerPrice == null ? "" : ` · issuer ${formatUsd(row.issuerPrice)}`}
                  </p>
                </div>
                <GapPill value={row.gap} />
              </div>
              {shares ? (
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  {"1 "}
                  {row.symbol}
                  {" stands for "}
                  {shares} {shares === "1" ? "share" : "shares"}
                  {". Dividends raise this number. They are not paid as cash."}
                </p>
              ) : null}
              {l.poolVersusIssuer == null ? null : (
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {"Buy versus issuer "}
                  {formatGap(l.poolVersusIssuer)}
                  {". Issuer versus stock"} {formatGap(l.issuerVersusStock)}
                  {"."}
                </p>
              )}
              <p className="mt-2 text-sm leading-relaxed text-ink">
                {
                  verdict(
                    {
                      symbol: row.symbol,
                      underlying: row.underlying,
                      usdPrice: row.token,
                      stockPrice: row.stock,
                      marketState,
                      buyPrice: row.buyPrice,
                      buyImpactPct: row.buyImpactPct,
                      buyAt: row.buyAt,
                      issuerPrice: row.issuerPrice,
                      issuerAt: row.issuerAt,
                    },
                    now,
                  ).line
                }
              </p>
              {buyUsable(row.buyAt, now) && row.buyImpactPct != null && row.buyImpactPct > 0 ? (
                <p className="mt-1 text-sm text-muted">
                  {"A $1,000 buy moves the price "}
                  {formatImpact(row.buyImpactPct)}
                  {"%. "}
                  {impactHint(row.buyImpactPct)}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
