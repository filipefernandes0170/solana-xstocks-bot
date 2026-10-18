import { Link } from "@tanstack/react-router";
import { ChevronDown, Ruler, Star } from "lucide-react";
import { THIN_POOL_USD, poolLabel } from "../../lib/brand";
import { formatUsd } from "../../lib/format";
import { sessionClosed } from "../../lib/session";
import { ISSUER_LABEL, TOKENS, TOKEN_BY_SYMBOL } from "../../lib/tokens";
import { cardShareText, stockUrl } from "../../lib/share";
import { ShareButton } from "../ShareButton";
import { drawCardImage } from "../share/cardImage";
import type { Quote, Verdict } from "../../lib/types";
import { rebaseLine, verdictBarClass, verdictPillClass, type OlderBuy } from "../../lib/verdict";
import { BuyLink, ChangePill, GapMeter, MultiplierNote, TickerBadge, VerdictDetail } from "./parts";

/** `gap`: from a buy the verdict uses (up to 90 s old). `older`: from a recent but older one, drawn in grey (verdict.ts). */
export type DeskRow = Quote & { verdict: Verdict; gap: number | null; older?: OlderBuy | null };

/** A star that keeps a name in Favourites, on this device. */
export function FavouriteButton({ symbol, on, onToggle }: { symbol: string; on: boolean; onToggle: (symbol: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(symbol)}
      aria-pressed={on}
      aria-label={on ? `Remove ${symbol} from favourites` : `Add ${symbol} to favourites`}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full ${on ? "text-amber" : "text-muted hover:text-ink"}`}
    >
      <Star className="size-5" fill={on ? "currentColor" : "none"} aria-hidden />
    </button>
  );
}

/** What the gap meter says while it has no gap: the pool is too thin, the print is missing, or the $1,000 buy is on its way. */
export function meterWaiting(row: Pick<Quote, "stockPrice" | "usdPrice" | "poolUsd">) {
  if (row.poolUsd != null && row.poolUsd < THIN_POOL_USD) {
    return { loading: false, text: `The pool holds about ${poolLabel(row.poolUsd)}, too thin to quote a $1,000 buy. Use the Size check for a small order.` };
  }
  return row.stockPrice == null
    ? { loading: row.usdPrice == null, text: row.usdPrice == null ? "Loading the prices…" : "The Nasdaq print is not in yet." }
    : { loading: true, text: "Loading the $1,000 buy…" };
}

/**
 * One name on the Markets tab: price, the gap meter, the verdict, and Buy. The small print (the legs, impact and
 * multiplier) sits under Details. While Nasdaq is closed the verdict line moves there too: the banner above the
 * cards says it once for every name.
 */
export function StockCard({
  row,
  now,
  tick,
  onSize,
  favourite,
  onFavourite,
  sessionOpen,
}: {
  row: DeskRow;
  now: number;
  tick: "up" | "down" | undefined;
  onSize: (symbol: string) => void;
  favourite: boolean;
  onFavourite: (symbol: string) => void;
  sessionOpen: boolean;
}) {
  const waiting = meterWaiting(row);
  const issuer = TOKEN_BY_SYMBOL.get(row.symbol)?.issuer;
  // The same company's token from another issuer, if Par tracks one (for example AMDx and AMD).
  const siblings = TOKENS.filter((token) => token.underlying === row.underlying && token.symbol !== row.symbol);
  return (
    <li id={`stock-${row.symbol}`} data-want-symbol={row.symbol} data-live className="stock-card panel scroll-mt-24 overflow-hidden ring-1 ring-line">
      <div className="flex h-full">
        <div data-verdict className={`w-1.5 shrink-0 ${verdictBarClass(row.verdict.id)}`} />
        <div className="flex min-w-0 flex-1 flex-col p-4 sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-3">
              <TickerBadge underlying={row.underlying} sector={row.sector} />
              <div className="min-w-0">
                <h2 className="truncate font-display text-2xl leading-tight text-ink">
                  <Link to="/s/$symbol" params={{ symbol: row.symbol }} className="hover:underline hover:decoration-line hover:underline-offset-4">
                    {row.name}
                  </Link>
                </h2>
                <p className="truncate text-sm text-muted">
                  {row.symbol}
                  {" · "}
                  {issuer ? ISSUER_LABEL[issuer] : row.sector}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <span data-verdict className={`rounded-full px-2.5 py-1 text-sm font-medium ${verdictPillClass(row.verdict.id)}`}>
                {row.verdict.title}
              </span>
              <FavouriteButton symbol={row.symbol} on={favourite} onToggle={onFavourite} />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
            <div>
              <p className="text-xs text-muted">Last trade, per share</p>
              <p className={`font-display text-4xl tabular-nums text-ink ${tick === "up" ? "tick-up" : tick === "down" ? "tick-down" : ""}`}>
                {formatUsd(row.usdPrice)}
              </p>
            </div>
            <div className="flex items-center gap-2 pb-1 text-sm text-muted">
              24h <ChangePill value={row.change24h} />
            </div>
          </div>

          <div className="mt-3" data-verdict-slot>
            <GapMeter gap={row.gap} waiting={waiting.text} loading={waiting.loading} closed={sessionClosed(row.marketState)} older={row.older ?? null} />
          </div>

          {sessionOpen ? (
            <p data-verdict className="mt-3 text-sm leading-relaxed text-ink">
              {row.verdict.line}
            </p>
          ) : null}
          {row.rebase && row.rebase.at * 1000 > now ? (
            <p className="mt-3 rounded-xl bg-gold/15 px-3 py-2 text-sm leading-relaxed text-ink">{rebaseLine(row.symbol, row.rebase)}</p>
          ) : null}

          <details className="group mt-3">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-full py-1 text-sm font-medium text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
              Details
            </summary>
            <div className="mt-2 space-y-2">
              {sessionOpen ? null : <p className="text-sm leading-relaxed text-ink">{row.verdict.line}</p>}
              <VerdictDetail row={row} now={now} />
              <MultiplierNote symbol={row.symbol} multiplier={row.sharesPerToken} />
              {siblings.map((token) => (
                <p key={token.symbol} className="text-sm text-muted">
                  {"Also on Solana: "}
                  <Link to="/s/$symbol" params={{ symbol: token.symbol }} className="font-medium text-ink underline decoration-line underline-offset-4">
                    {token.symbol}
                  </Link>
                  {" from "}
                  {ISSUER_LABEL[token.issuer]}
                  {". Its page compares the two buys."}
                </p>
              ))}
            </div>
          </details>

          <div className="mt-auto pt-3">
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
              <ShareButton
                title={`${row.symbol} on Par`}
                text={cardShareText(row.symbol, row.gap, row.verdict.title)}
                url={stockUrl(row.symbol)}
                label=""
                image={{ name: `par-${row.symbol}.png`, make: () => drawCardImage(row, Date.now(), stockUrl(row.symbol)) }}
              />
              <button
                type="button"
                onClick={() => onSize(row.symbol)}
                className="inline-flex h-11 items-center gap-1.5 rounded-full bg-foam px-4 text-sm font-medium text-ink ring-1 ring-line"
                aria-label={`Size check ${row.symbol}`}
              >
                <Ruler className="size-4" aria-hidden />
                Size
              </button>
              <BuyLink mint={row.mint} symbol={row.symbol} />
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}
