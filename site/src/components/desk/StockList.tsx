import { formatUsd } from "../../lib/format";
import { sessionClosed } from "../../lib/session";
import { verdictPillClass } from "../../lib/verdict";
import { BuyLink, ChangePill, GapPill, TickerBadge } from "./parts";
import { FavouriteButton, type DeskRow } from "./StockCard";

/** The compact view of Markets: one line per name, for scanning all of them at once. */
export function StockList({
  rows,
  onOpen,
  favourites,
  onFavourite,
}: {
  rows: DeskRow[];
  onOpen: (symbol: string) => void;
  favourites: string[];
  onFavourite: (symbol: string) => void;
}) {
  return (
    <div className="panel mt-4 overflow-hidden ring-1 ring-line">
      <div className="hidden grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_10rem] gap-3 border-b border-line px-4 py-2 text-xs tracking-wide text-muted uppercase sm:grid">
        <span>Name</span>
        <span className="text-right">Last trade</span>
        <span className="text-right">24h</span>
        <span className="text-right">Buy vs Nasdaq</span>
        <span />
      </div>
      <ul className="divide-y divide-line">
        {rows.map((row) => (
          <li
            key={row.mint}
            data-want-symbol={row.symbol}
            data-live
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_10rem]"
          >
            <span className="flex min-w-0 items-center gap-1">
              <FavouriteButton symbol={row.symbol} on={favourites.includes(row.symbol)} onToggle={onFavourite} />
              <button type="button" onClick={() => onOpen(row.symbol)} className="flex min-w-0 items-center gap-3 text-left">
              <TickerBadge underlying={row.underlying} sector={row.sector} size="sm" />
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">{row.name}</span>
                <span className="block text-sm text-muted">
                  {row.symbol}
                  <span className="sm:hidden">
                    {" · "}
                    {formatUsd(row.usdPrice)}
                  </span>
                </span>
              </span>
              </button>
            </span>
            <span className="hidden text-right tabular-nums text-ink sm:block">{formatUsd(row.usdPrice)}</span>
            <span className="hidden text-right sm:block">
              <ChangePill value={row.change24h} />
            </span>
            <span className="hidden text-right sm:block" data-verdict>
              <GapPill value={row.gap ?? row.older?.gap ?? null} closed={sessionClosed(row.marketState)} older={row.gap == null && row.older != null} />
            </span>
            <span className="flex items-center justify-end gap-2">
              <span className="sm:hidden" data-verdict>
                <GapPill value={row.gap ?? row.older?.gap ?? null} closed={sessionClosed(row.marketState)} older={row.gap == null && row.older != null} />
              </span>
              <span
                data-verdict
                className={`hidden rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex ${verdictPillClass(row.verdict.id)}`}
              >
                {row.verdict.title}
              </span>
              <BuyLink mint={row.mint} symbol={row.symbol} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
