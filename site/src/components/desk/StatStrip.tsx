import { CalendarClock, Layers, Scale, ShieldCheck } from "lucide-react";
import { formatGap, gapNumber } from "../../lib/format";
import { isSessionOpen, sessionClosed, utcStamp } from "../../lib/session";
import { TOKENS } from "../../lib/tokens";
import type { Quote } from "../../lib/types";
import { StatTile } from "../ui";

const XSTOCKS = TOKENS.filter((t) => t.issuer === "xStocks").length;
const BACKPACK = TOKENS.filter((t) => t.issuer === "Backpack").length;

/** Four live numbers under the headline: the names followed, how many are fair, the widest gap, the next rebase. */
export function StatStrip({
  marketState,
  now,
  fairCount,
  total,
  widest,
  rebases,
  onPick,
}: {
  marketState: string | null;
  now: number;
  fairCount: number;
  total: number;
  widest: { symbol: string; gap: number | null } | undefined;
  rebases: Quote[];
  onPick: (symbol: string) => void;
}) {
  const open = isSessionOpen(marketState);
  const next = rebases.find((q) => q.rebase && q.rebase.at * 1000 > now);
  return (
    <section aria-label="The desk right now" className="mt-6 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4" data-live>
      <StatTile icon={<Layers className="size-5" aria-hidden />} label="Tokenized stocks" value={String(total)} hint={`xStocks ${XSTOCKS} · Backpack ${BACKPACK}`} />
      <StatTile
        icon={<ShieldCheck className="size-5" aria-hidden />}
        label="Fair now"
        verdict
        value={`${fairCount} of ${total}`}
        tone={fairCount > 0 ? "text-pine" : "text-ink"}
        hint={open ? "Within 0.4% of the print" : "Only while Nasdaq is open"}
      />
      <StatTile
        icon={<Scale className="size-5" aria-hidden />}
        label="Widest gap"
        verdict
        value={widest?.gap == null ? "—" : widest.symbol}
        hint={
          widest?.gap == null
            ? "Waiting for the buy quotes"
            : sessionClosed(marketState)
              ? `${gapNumber(widest.gap)} versus the last Nasdaq print`
              : `${formatGap(widest.gap)} · ${widest.gap > 0 ? "paying over the stock" : "paying under the stock"}`
        }
        onClick={widest?.gap == null ? undefined : () => onPick(widest.symbol)}
      />
      <StatTile
        icon={<CalendarClock className="size-5" aria-hidden />}
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
