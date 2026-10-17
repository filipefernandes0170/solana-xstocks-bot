import { botCard } from "../../lib/botText";
import type { Quote } from "../../lib/types";

function Bubble({ from, delay, children }: { from: "you" | "bot"; delay: number; children: React.ReactNode }) {
  return (
    <div
      className={`chat-in max-w-[88%] rounded-2xl px-3 py-2 text-[13px] leading-snug ${from === "you" ? "self-end rounded-br-md bg-[#2b5278] text-white" : "self-start rounded-bl-md bg-[#182533] text-[#f5f5f5]"}`}
      style={{ animationDelay: `${delay}s` }}
    >
      {children}
    </div>
  );
}

function Keys({ delay, rows }: { delay: number; rows: string[][] }) {
  return (
    <div className="chat-in grid w-[88%] gap-1 self-start" style={{ animationDelay: `${delay}s` }} aria-hidden>
      {rows.map((row) => (
        <div key={row.join("|")} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}>
          {row.map((key) => (
            <span key={key} className="truncate rounded-lg bg-[#2b5278]/55 px-2 py-1.5 text-center text-[12px] text-white">
              {key}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * A phone showing a real exchange with @ONPAR_BOT: someone types "nvda" and gets the card, with this
 * page's live numbers; then turns the morning brief on. Messages arrive one by one; all at once for
 * visitors who prefer reduced motion. Illustration only: the screen reader gets the summary instead.
 */
export function PhoneDemo({ quote, asOf }: { quote: Quote | undefined; asOf: number }) {
  const card = quote ? botCard(quote, asOf) : null;
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" }).format(new Date(asOf));
  return (
    <figure className="mx-auto w-full max-w-[22rem]">
      <div className="rounded-[2.6rem] bg-[#05090c] p-2.5 shadow-[0_40px_80px_#020608aa] ring-1 ring-white/10">
        <div className="overflow-hidden rounded-[2.1rem] bg-[#0e1621]">
          <div className="flex items-center gap-3 border-b border-white/5 bg-[#17212b] px-4 pb-3 pt-5">
            <svg width="36" height="36" viewBox="0 0 140 140" aria-hidden className="shrink-0 rounded-full">
              <rect width="140" height="140" fill="#0b1c26" />
              <g transform="translate(14 14) scale(0.8)">
                <path d="M26 46 C62 46 66 70 100 70" fill="none" stroke="#e0a04a" strokeWidth="10" strokeLinecap="round" />
                <path d="M26 94 C62 94 66 70 100 70" fill="none" stroke="#e7f3ee" strokeWidth="10" strokeLinecap="round" />
                <circle cx="110" cy="70" r="8" fill="#e0a04a" />
              </g>
            </svg>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">Par</p>
              <p className="text-xs text-[#7f91a4]">bot</p>
            </div>
          </div>
          <div className="flex min-h-[30rem] flex-col gap-2 px-3 py-4" aria-hidden>
            <Bubble from="you" delay={0.4}>
              nvda
            </Bubble>
            {card ? (
              <>
                <Bubble from="bot" delay={1.3}>
                  <p className="font-medium">{card.head}</p>
                  <p className="mt-1">{card.verdict}</p>
                  <div className="mt-2 space-y-0.5">
                    {card.lines.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                  {card.meter ? <p className="mt-1 font-mono text-[12px] text-[#e0a04a]">{card.meter}</p> : null}
                  {card.foot.map((line) => (
                    <p key={line} className="mt-0.5">
                      {line}
                    </p>
                  ))}
                  <p className="mt-1 text-right text-[11px] text-[#7f91a4]">{time}</p>
                </Bubble>
                <Keys delay={1.7} rows={[["🛒 Buy NVDAx"], ["📏 $1k", "📏 $5k", "📏 $25k"], ["🔔 Watch NVDAx"]]} />
              </>
            ) : (
              <Bubble from="bot" delay={1.3}>
                🔎 The price feed is busy. Try again in a minute.
              </Bubble>
            )}
            <Bubble from="you" delay={3}>
              /brief
            </Bubble>
            <Bubble from="bot" delay={3.8}>
              <p className="font-medium">🌅 Morning brief is on</p>
              <p className="mt-1">Every weekday, in the half hour before Nasdaq opens: the gaps, the names closest to the print, and today&apos;s balance changes.</p>
            </Bubble>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-mist">
        A real card: {quote ? `${quote.symbol} at ${time} UTC, from the live desk.` : "live numbers appear when the feed answers."}
      </figcaption>
    </figure>
  );
}
