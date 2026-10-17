import { Link } from "@tanstack/react-router";
import { THIN_POOL_USD, poolLabel } from "../../lib/brand";
import { formatImpact, formatUsd } from "../../lib/format";
import { ISSUER_LABEL, TOKENS, TOKEN_BY_SYMBOL } from "../../lib/tokens";
import type { Quote } from "../../lib/types";
import { buyUsable, gapPct } from "../../lib/verdict";
import { GapPill } from "../desk/parts";

export type TokenBuy = {
  symbol: string;
  issuer: string;
  lastTrade: number | null;
  buy: number | null;
  gap: number | null;
  impact: number | null;
  /** The pool's dollars when it is too thin to quote a $1,000 buy (it is never quoted), else null. */
  thinPool: number | null;
};

/**
 * Every token of the same company with its live $1,000 buy. `cheaper` is the lower buy against Nasdaq once every
 * quotable token has one; `onlyDeep` is the one token whose pool can take a $1,000 buy when the others are too thin.
 */
export function companyBuys(symbol: string, quotes: Quote[], now: number) {
  const token = TOKEN_BY_SYMBOL.get(symbol);
  if (!token) return { rows: [] as TokenBuy[], cheaper: null as TokenBuy | null, onlyDeep: null as TokenBuy | null };
  const rows: TokenBuy[] = TOKENS.filter((other) => other.underlying === token.underlying).map((other) => {
    const quote = quotes.find((q) => q.symbol === other.symbol);
    const buy = quote && buyUsable(quote.buyAt, now) ? quote.buyPrice : null;
    const pool = quote?.poolUsd ?? null;
    return {
      symbol: other.symbol,
      issuer: ISSUER_LABEL[other.issuer],
      lastTrade: quote?.usdPrice ?? null,
      buy,
      gap: gapPct(buy, quote?.stockPrice),
      impact: buy != null ? (quote?.buyImpactPct ?? null) : null,
      thinPool: pool != null && pool < THIN_POOL_USD ? pool : null,
    };
  });
  const quotable = rows.filter((row) => row.thinPool == null);
  const allIn = quotable.length > 1 && quotable.every((row) => row.gap != null);
  const cheaper = allIn ? [...quotable].sort((a, b) => (a.gap as number) - (b.gap as number))[0] : null;
  const onlyDeep = rows.length > 1 && quotable.length === 1 ? quotable[0] : null;
  return { rows, cheaper, onlyDeep };
}

/** "Same company, two tokens": shown on a name's page when another issuer has a token of the same share. */
export function OtherTokens({ symbol, quotes, now }: { symbol: string; quotes: Quote[]; now: number }) {
  const token = TOKEN_BY_SYMBOL.get(symbol);
  const { rows, cheaper, onlyDeep } = companyBuys(symbol, quotes, now);
  if (!token || rows.length < 2) return null;
  const others = rows.filter((row) => row !== cheaper && row.thinPool == null);
  const spread = cheaper && others[0]?.gap != null ? (others[0].gap as number) - (cheaper.gap as number) : null;
  const thin = rows.filter((row) => row.thinPool != null);
  const highlight = cheaper ?? onlyDeep;
  return (
    <section aria-labelledby="family-title" className="panel mt-8 p-6 text-ink ring-1 ring-line sm:p-7">
      <p className="text-sm font-medium text-amber">Same company, two tokens</p>
      <h2 id="family-title" className="mt-1 font-display text-3xl">
        {token.name}
        {" on Solana, "}
        {rows.length === 2 ? "twice" : `${rows.length} times`}
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
        {token.underlying}
        {" has a token from each of these issuers. Each has its own pool, so the same $1,000 buy can cost a different price. Lower against Nasdaq is cheaper."}
      </p>
      <ul className="mt-5 grid gap-3 md:grid-cols-2">
        {rows.map((row) => (
          <li key={row.symbol} className={`rounded-2xl p-4 ${row === highlight ? "bg-pine-soft ring-1 ring-pine/30" : "bg-foam"}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Link to="/s/$symbol" params={{ symbol: row.symbol }} className="font-medium hover:underline hover:underline-offset-4">
                  {row.symbol}
                </Link>
                <p className="text-xs text-muted">{row.issuer}</p>
              </div>
              {row.thinPool == null ? <GapPill value={row.gap} /> : null}
            </div>
            <p className="mt-3 text-sm text-muted">
              {row.thinPool != null
                ? `The pool holds about ${poolLabel(row.thinPool)}, too thin to quote a $1,000 buy`
                : row.buy == null
                  ? "The $1,000 buy is loading"
                  : `A $1,000 buy pays ${formatUsd(row.buy)} a share`}
              {row.impact != null && row.impact > 0 ? ` and moves the price ${formatImpact(row.impact)}%` : ""}
              {row.lastTrade != null ? ` · last trade ${formatUsd(row.lastTrade)}` : ""}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm leading-relaxed">
        {cheaper
          ? `Right now ${cheaper.symbol} is the cheaper $1,000 buy${spread != null && spread >= 0.005 ? `, ${spread.toFixed(2)} points lower against Nasdaq` : ""}. A bigger order moves a thin pool more, so check your size too.`
          : onlyDeep
            ? `Only ${onlyDeep.symbol} has a pool deep enough for a $1,000 buy. ${thin.map((row) => row.symbol).join(" and ")} has too little in its pool to quote one.`
            : "Waiting for both $1,000 buys before saying which is cheaper."}
      </p>
    </section>
  );
}
