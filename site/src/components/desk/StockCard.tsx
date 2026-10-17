import { Link } from "@tanstack/react-router";
import { Ruler, Star } from "lucide-react";
import { formatUsd } from "../../lib/format";
import { cardShareText, stockUrl } from "../../lib/share";
import { ShareButton } from "../ShareButton";
import type { Quote, Verdict } from "../../lib/types";
import { rebaseLine, verdictBarClass, verdictPillClass } from "../../lib/verdict";
import { BuyLink, ChangePill, GapMeter, MultiplierNote, TickerBadge, VerdictDetail } from "./parts";

export type DeskRow = Quote & { verdict: Verdict; gap: number | null };

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

/** One name on the Markets tab: price, the gap meter, the verdict, and Buy. */
export function StockCard({
  row,
  now,
  tick,
  onSize,
  favourite,
  onFavourite,
}: {
  row: DeskRow;
  now: number;
  tick: "up" | "down" | undefined;
  onSize: (symbol: string) => void;
  favourite: boolean;
  onFavourite: (symbol: string) => void;
}) {
  return (
    <li id={`stock-${row.symbol}`} className="stock-card panel scroll-mt-24 overflow-hidden ring-1 ring-line">
      <div className="flex h-full">
        <div className={`w-1.5 shrink-0 ${verdictBarClass(row.verdict.id)}`} />
        <div className="flex min-w-0 flex-1 flex-col p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <TickerBadge underlying={row.underlying} sector={row.sector} />
              <div className="min-w-0">
                <h2 className="truncate font-display text-2xl leading-tight text-ink sm:text-3xl">
                  <Link to="/s/$symbol" params={{ symbol: row.symbol }} className="hover:underline hover:decoration-line hover:underline-offset-4">
                    {row.name}
                  </Link>
                </h2>
                <p className="text-sm text-muted">
                  {row.symbol}
                  {" · "}
                  {row.sector}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className={`rounded-full px-3 py-1 text-sm font-medium ${verdictPillClass(row.verdict.id)}`}>{row.verdict.title}</span>
              <FavouriteButton symbol={row.symbol} on={favourite} onToggle={onFavourite} />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <div>
              <p className="text-sm text-muted">Last trade, per share</p>
              <p className={`font-display text-4xl tabular-nums text-ink sm:text-5xl ${tick === "up" ? "tick-up" : tick === "down" ? "tick-down" : ""}`}>
                {formatUsd(row.usdPrice)}
              </p>
            </div>
            <div className="flex items-center gap-2 pb-1 text-sm text-muted">
              24h <ChangePill value={row.change24h} />
            </div>
          </div>

          <div className="mt-4">
            <GapMeter
              gap={row.gap}
              waiting={row.underlying === "SPCX" ? "SpaceX has no public stock price to compare." : "Waiting for a live $1,000 buy quote."}
            />
          </div>

          <p className="mt-4 max-w-md text-base leading-relaxed text-ink">{row.verdict.line}</p>
          {row.rebase && row.rebase.at * 1000 > now ? (
            <p className="mt-2 max-w-md rounded-xl bg-gold/15 px-3 py-2 text-sm leading-relaxed text-ink">{rebaseLine(row.symbol, row.rebase)}</p>
          ) : null}

          <div className="mt-3">
            <MultiplierNote symbol={row.symbol} multiplier={row.sharesPerToken} />
          </div>

          <div className="mt-auto pt-5">
            <div className="flex flex-wrap items-end justify-between gap-3 border-t border-line pt-4">
              <div className="min-w-0 flex-1 basis-56">
                <VerdictDetail row={row} now={now} />
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <ShareButton
                  title={`${row.symbol} on Par`}
                  text={cardShareText(row.symbol, row.gap, row.verdict.title)}
                  url={stockUrl(row.symbol)}
                  label=""
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
      </div>
    </li>
  );
}
