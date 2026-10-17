import { BellRing, Briefcase, Send, Sunrise, Zap } from "lucide-react";
import type { ReactNode } from "react";
import type { HolderStatus } from "../../lib/types";

function statusLine(status: HolderStatus) {
  return status === "unminted"
    ? "The coin is not live yet, so no wallet gets the texts."
    : status === "holds"
      ? "This wallet would get the texts."
      : status === "absent"
        ? "This wallet would not get the texts."
        : "The chain did not answer. Try again.";
}

const PERKS: { icon: ReactNode; title: string; line: string; tag?: string }[] = [
  {
    icon: <Zap className="size-5" aria-hidden />,
    title: "Fair pings",
    line: "A text the moment a name you watch turns Fair, and when one trades rich while Nasdaq is closed.",
  },
  {
    icon: <Sunrise className="size-5" aria-hidden />,
    title: "Morning brief",
    tag: "New",
    line: "Before the open on weekdays: the overnight gaps, the names closest to fair, and today's balance changes.",
  },
  {
    icon: <BellRing className="size-5" aria-hidden />,
    title: "Open bell",
    line: "One message as Nasdaq opens, with whatever is Fair and a Buy button for each.",
  },
  {
    icon: <Briefcase className="size-5" aria-hidden />,
    title: "Bag watch",
    line: "A note when a stock in your wallet changes verdict, or when $1,000 becomes a large slice of its pool.",
  },
];

/** What holding the coin unlocks in the bot, and a read-only check of any wallet. */
export function WhyHold({
  wallet,
  onWallet,
  busy,
  error,
  status,
  onCheck,
}: {
  wallet: string;
  onWallet: (wallet: string) => void;
  busy: boolean;
  error: string | null;
  status: HolderStatus | null;
  onCheck: () => void;
}) {
  return (
    <section className="why-hold mt-16 overflow-hidden rounded-[1.75rem] p-6 ring-1 ring-white/10 sm:p-10" aria-labelledby="why-hold-title">
      <p className="text-sm font-medium tracking-wide text-gold">Why hold $PAR</p>
      <h2 id="why-hold-title" className="mt-2 max-w-2xl font-display text-4xl leading-none text-foam sm:text-6xl">
        The desk is free. The texts are for holders.
      </h2>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-mist">
        Everything on this page stays free. @ONPAR_BOT sends these to any wallet that holds the coin, and stops when it no longer does.
      </p>
      <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PERKS.map((perk) => (
          <li key={perk.title} className="rounded-2xl bg-white/[0.06] p-5 ring-1 ring-white/10">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gold/15 text-gold">{perk.icon}</span>
              {perk.tag ? <span className="rounded-full bg-gold px-2.5 py-0.5 text-xs font-semibold text-ink">{perk.tag}</span> : null}
            </div>
            <h3 className="mt-4 font-display text-2xl text-foam">{perk.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-mist">{perk.line}</p>
          </li>
        ))}
      </ul>
      <div className="mt-8 grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-end">
        <a
          href="https://t.me/ONPAR_BOT?start=brief"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-gold px-6 text-sm font-medium text-ink"
        >
          <Send className="size-4" aria-hidden />
          Get the morning brief
        </a>
        <form
          className="max-w-xl"
          onSubmit={(event) => {
            event.preventDefault();
            onCheck();
          }}
        >
          <label htmlFor="coin-wallet" className="text-sm font-medium text-foam">
            Would this wallet get the texts?
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="coin-wallet"
              value={wallet}
              onChange={(event) => onWallet(event.target.value)}
              placeholder="Solana address"
              autoComplete="off"
              spellCheck={false}
              className="h-12 w-full rounded-full bg-foam px-4 text-sm text-ink ring-1 ring-line placeholder:text-muted"
            />
            <button
              type="submit"
              disabled={busy}
              className="h-12 shrink-0 rounded-full bg-pine px-6 text-sm font-medium text-foam disabled:opacity-60"
            >
              {busy ? "Checking…" : "Check"}
            </button>
          </div>
          {error ? <p className="mt-3 text-sm text-clay-bright">{error}</p> : null}
          {status ? (
            <p className="mt-3 text-base text-foam" role="status">
              {statusLine(status)}
            </p>
          ) : null}
        </form>
      </div>
    </section>
  );
}
