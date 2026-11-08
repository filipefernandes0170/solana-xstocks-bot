import type { ReactNode } from "react";
import { botCard } from "../../lib/botText";
import type { Quote } from "../../lib/types";
import { dateFormat } from "../../lib/intl";

/** What someone types: a small Telegram-blue bubble on the right. */
function Bubble({ delay, children }: { delay: number; children: ReactNode }) {
  return (
    <div
      className="chat-in self-end rounded-xl rounded-br-sm bg-[#2b5278] px-3 py-1.5 font-mono text-[13px] text-white"
      style={{ animationDelay: `${delay}s` }}
    >
      {children}
    </div>
  );
}

/** The bot's round avatar: the Par mark as the bot uses it on Telegram. */
function Avatar() {
  return (
    <svg width="28" height="28" viewBox="0 0 140 140" aria-hidden className="shrink-0 rounded-full">
      <rect width="140" height="140" fill="#0b1c26" />
      <g transform="translate(14 14) scale(0.8)">
        <path d="M26 46 C62 46 66 70 100 70" fill="none" stroke="#e0a04a" strokeWidth="10" strokeLinecap="round" />
        <path d="M26 94 C62 94 66 70 100 70" fill="none" stroke="#e7f3ee" strokeWidth="10" strokeLinecap="round" />
        <circle cx="110" cy="70" r="8" fill="#e0a04a" />
      </g>
    </svg>
  );
}

/** One message from the bot: a dark card with the bot's name and the time, like a Telegram message. */
function BotMessage({ delay, time, children }: { delay: number; time: string; children: ReactNode }) {
  return (
    <div className="chat-in rounded-xl bg-field p-3 text-[13px] leading-snug text-foam/90 ring-1 ring-line" style={{ animationDelay: `${delay}s` }}>
      <div className="mb-2 flex items-center gap-2">
        <Avatar />
        <span className="text-xs font-medium text-foam">Par bot</span>
        <span className="ml-auto text-[11px] text-mist">{time}</span>
      </div>
      {children}
    </div>
  );
}

/** The buttons the bot puts under a card. */
function Keys({ delay, rows }: { delay: number; rows: string[][] }) {
  return (
    <div className="chat-in grid gap-1" style={{ animationDelay: `${delay}s` }} aria-hidden>
      {rows.map((row) => (
        <div key={row.join("|")} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}>
          {row.map((key) => (
            <span key={key} className="truncate rounded-md px-2 py-1.5 text-center text-[12px] font-medium text-gold ring-1 ring-gold/40">
              {key}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * A real exchange with @ONPAR_BOT: someone types "nvda" and gets the card, with this page's live numbers; then
 * turns the morning brief on. Messages arrive one by one, once (all at once for visitors who prefer reduced motion).
 * Illustration only: the screen reader gets the summary in the caption instead.
 */
export function PhoneDemo({ quote, asOf }: { quote: Quote | undefined; asOf: number }) {
  const card = quote ? botCard(quote, asOf) : null;
  const time = dateFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" }).format(new Date(asOf));
  return (
    <figure className="flex flex-col">
      <div className="flex flex-col gap-2.5" aria-hidden>
        <Bubble delay={0.4}>nvda</Bubble>
        {card ? (
          <>
            <BotMessage delay={1.3} time={time}>
              <p className="font-semibold text-foam">{card.head}</p>
              <p className="mt-1">{card.verdict}</p>
              <div className="mt-2 space-y-0.5">
                {card.lines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
              {card.meter ? <p className="mt-1 font-mono text-[12px] text-gold">{card.meter}</p> : null}
              {card.foot.map((line) => (
                <p key={line} className="mt-0.5">
                  {line}
                </p>
              ))}
            </BotMessage>
            <Keys delay={1.7} rows={[["🛒 Buy NVDAx"], ["📏 $1k", "📏 $5k", "📏 $25k"], ["🔔 Watch NVDAx"]]} />
          </>
        ) : (
          <BotMessage delay={1.3} time={time}>
            🔎 The price feed is busy. Try again in a minute.
          </BotMessage>
        )}
        <Bubble delay={3}>/brief</Bubble>
        <BotMessage delay={3.8} time={time}>
          <p className="font-semibold text-foam">🌅 Morning brief is on</p>
          <p className="mt-1">Every weekday, in the half hour before Nasdaq opens: the gaps, the names closest to the print, and today&apos;s balance changes.</p>
        </BotMessage>
      </div>
      <figcaption className="mt-3 text-xs text-mist">
        A real card: {quote ? `${quote.symbol} at ${time} UTC, from the live desk.` : "live numbers appear when the feed answers."}
      </figcaption>
    </figure>
  );
}
