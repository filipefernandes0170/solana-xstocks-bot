import { CalendarClock } from "lucide-react";
import type { BagEvent } from "../../lib/bag";
import { multiplierLabel } from "../../lib/format";
import { etClock, sessionLabel, sessionLine, utcStamp } from "../../lib/session";
import { numberFormat } from "../../lib/intl";

function count(value: number) {
  return numberFormat("en-US", { maximumFractionDigits: 4 }).format(value);
}

/** Rebases ahead for the names held, and where the US session stands. */
export function BagEvents({ events, marketState, now }: { events: BagEvent[]; marketState: string | null; now: number }) {
  return (
    <section aria-labelledby="events-title" className="panel rise p-4 text-ink sm:p-5">
      <p className="flex items-center gap-2 text-sm font-medium text-amber">
        <CalendarClock className="size-4" aria-hidden />
        Coming up
      </p>
      <h2 id="events-title" className="mt-1 font-display text-xl leading-tight">
        {events.length === 0 ? "No rebase scheduled" : events.length === 1 ? "One rebase ahead" : `${events.length} rebases ahead`}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        A rebase changes how many tokens your balance shows, for a split or a dividend added as more tokens. The price per token moves the other way, so the
        value should not change. Don't trade through it.
      </p>
      {events.length > 0 ? (
        <ul className="mt-4 divide-y divide-line">
          {events.map((event) => (
            <li key={`${event.line.symbol}-${event.rebase.at}`} className="py-3 text-sm">
              <p className="font-medium">
                {event.line.symbol}
                {" · "}
                {utcStamp(event.rebase.at)}
                {" UTC"}
              </p>
              <p className="leading-relaxed text-muted">
                {"Multiplier "}
                {multiplierLabel(event.rebase.current) ?? event.rebase.current}
                {" → "}
                {multiplierLabel(event.rebase.next) ?? event.rebase.next}
                {". Your "}
                {count(event.line.amount)}
                {" tokens will show as about "}
                {count(event.amountAfter)}
                {"."}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm leading-relaxed">Jupiter lists no multiplier change for the names you hold. The bot texts holders the evening before one.</p>
      )}
      <div className="mt-4 rounded-xl bg-field px-4 py-3 text-sm ring-1 ring-line">
        <p className="font-medium">
          {"Nasdaq: "}
          {sessionLabel(marketState, now)}
          {" · "}
          {etClock(now)}
        </p>
        <p className="mt-0.5 leading-relaxed text-muted">{sessionLine(marketState, now)}</p>
      </div>
    </section>
  );
}
