import { CalendarClock, Clock3, Scale, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { formatGap } from "../../lib/format";
import { etClock, isSessionOpen, sessionLabel, timeToOpen, utcStamp } from "../../lib/session";
import type { Quote } from "../../lib/types";

function Tile({ icon, label, value, hint, onClick }: { icon: ReactNode; label: string; value: string; hint: string; onClick?: () => void }) {
  const body = (
    <>
      <span className="flex items-center gap-2 text-sm text-mist">
        {icon}
        {label}
      </span>
      <span className="mt-2 block font-display text-2xl leading-tight text-foam sm:text-3xl">{value}</span>
      <span className="mt-1 block text-sm text-mist">{hint}</span>
    </>
  );
  const tile = "rounded-2xl bg-dusk/80 p-4 text-left ring-1 ring-white/10 backdrop-blur";
  return onClick ? (
    <button type="button" onClick={onClick} className={`${tile} transition-colors hover:bg-dusk`}>
      {body}
    </button>
  ) : (
    <div className={tile}>{body}</div>
  );
}

/** Four live numbers under the headline: the session, how many names are fair, the widest gap, the next rebase. */
export function StatStrip({
  mounted,
  marketState,
  now,
  fairCount,
  total,
  widest,
  rebases,
  onPick,
}: {
  mounted: boolean;
  marketState: string | null;
  now: number;
  fairCount: number;
  total: number;
  widest: { symbol: string; gap: number | null } | undefined;
  rebases: Quote[];
  onPick: (symbol: string) => void;
}) {
  const open = isSessionOpen(marketState);
  const next = rebases[0];
  return (
    <section aria-label="The desk right now" className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile
        icon={<Clock3 className="size-4" aria-hidden />}
        label="Nasdaq"
        value={mounted ? sessionLabel(marketState, now) : "Checking"}
        hint={mounted ? (open ? `Live print · ${etClock(now)}` : `Opens in ${timeToOpen(now)}`) : "Reading the session"}
      />
      <Tile
        icon={<ShieldCheck className="size-4" aria-hidden />}
        label="Fair now"
        value={`${fairCount} of ${total}`}
        hint={open ? "Within 0.4% of the print" : "Only while Nasdaq is open"}
      />
      <Tile
        icon={<Scale className="size-4" aria-hidden />}
        label="Widest gap"
        value={widest?.gap == null ? "—" : widest.symbol}
        hint={
          widest?.gap == null
            ? "Waiting for the buy quotes"
            : `${formatGap(widest.gap)} · ${widest.gap > 0 ? "paying over the stock" : "paying under the stock"}`
        }
        onClick={widest?.gap == null ? undefined : () => onPick(widest.symbol)}
      />
      <Tile
        icon={<CalendarClock className="size-4" aria-hidden />}
        label="Next balance change"
        value={next ? next.symbol : "None"}
        hint={
          next?.rebase
            ? `${utcStamp(next.rebase.at)} UTC${rebases.length > 1 ? ` · +${rebases.length - 1} more` : ""}`
            : "Nothing scheduled on these names"
        }
        onClick={next ? () => onPick(next.symbol) : undefined}
      />
    </section>
  );
}
