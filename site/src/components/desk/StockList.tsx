import { poolLabel } from "../../lib/brand";
import { formatUsd } from "../../lib/format";
import { sessionClosed } from "../../lib/session";
import { verdictPillClass } from "../../lib/verdict";
import { BuyLink, ChangePill, GapPill, TickerBadge } from "./parts";
import { FavouriteButton, type DeskRow } from "./StockCard";

// Columns: # · name · last trade · Nasdaq · $1,000 buy versus Nasdaq · pool · 24h · verdict · Buy. Fewer on smaller screens.
const GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[minmax(0,2fr)_1fr_1fr_8.5rem] lg:grid-cols-[2rem_minmax(0,2fr)_1fr_1fr_1fr_0.8fr_0.9fr_6.5rem_4.5rem]";

/**
 * The table view of Markets: one line per name, for scanning all of them at once. Clicking a name shows it in the
 * featured panel at the top of the desk.
 */
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
    <div className="panel mt-4 overflow-hidden">
      <div className={`${GRID} hidden border-b border-line px-4 py-2.5 text-xs font-medium text-muted sm:grid`}>
        <span className="hidden lg:block">#</span>
        <span>Asset</span>
        <span className="text-right">Token price</span>
        <span className="hidden text-right lg:block">Nasdaq price</span>
        <span className="text-right">Difference</span>
        <span className="hidden text-right lg:block">Pool</span>
        <span className="hidden text-right lg:block">24h</span>
        <span className="hidden lg:block">Status</span>
        <span className="text-right">Action</span>
      </div>
      <ul className="divide-y divide-line">
        {rows.map((row, index) => {
          const closed = sessionClosed(row.marketState);
          const gap = <GapPill value={row.gap ?? row.older?.gap ?? null} closed={closed} older={row.gap == null && row.older != null} />;
          return (
            <li key={row.mint} data-want-symbol={row.symbol} data-live className={`${GRID} px-4 py-1.5 hover:bg-white/[0.02]`}>
              <span className="hidden text-sm tabular-nums text-muted lg:block">{index + 1}</span>
              <span className="flex min-w-0 items-center gap-1">
                <FavouriteButton symbol={row.symbol} on={favourites.includes(row.symbol)} onToggle={onFavourite} />
                <button
                  type="button"
                  onClick={() => onOpen(row.symbol)}
                  className="flex min-w-0 items-center gap-3 text-left"
                  aria-label={`Show ${row.name} at the top`}
                >
                  <TickerBadge underlying={row.underlying} sector={row.sector} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">{row.symbol}</span>
                    <span className="block truncate text-xs text-muted">
                      {row.name}
                      <span className="sm:hidden">
                        {" · "}
                        {formatUsd(row.usdPrice)}
                      </span>
                    </span>
                  </span>
                </button>
              </span>
              <span className="hidden text-right text-sm tabular-nums text-ink sm:block">{formatUsd(row.usdPrice)}</span>
              <span className="hidden text-right text-sm tabular-nums text-muted lg:block">{formatUsd(row.stockPrice)}</span>
              <span className="hidden text-right sm:block" data-verdict>
                {gap}
              </span>
              <span className="hidden text-right text-sm tabular-nums text-muted lg:block">{row.poolUsd == null ? "—" : poolLabel(row.poolUsd)}</span>
              <span className="hidden text-right lg:block">
                <ChangePill value={row.change24h} />
              </span>
              <span className="hidden lg:block">
                <span data-verdict className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${verdictPillClass(row.verdict.id)}`}>
                  {row.verdict.title}
                </span>
              </span>
              <span className="flex items-center justify-end gap-2">
                <span className="sm:hidden" data-verdict>
                  {gap}
                </span>
                <BuyLink mint={row.mint} symbol={row.symbol} compact />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
