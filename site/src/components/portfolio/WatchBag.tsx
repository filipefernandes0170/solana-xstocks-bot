import { Bell, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { bagWatchLink } from "../../lib/bag";
import { watchLink } from "../../lib/useFavourites";
import { getFlags } from "../../server/functions";

/** One tap hands the bot this public address: it shows the bag and follows it for the bag texts. */
export function WatchBag({ address, symbols }: { address: string; symbols: string[] }) {
  const [coinLive, setCoinLive] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    getFlags()
      .then((flags) => {
        if (alive) setCoinLive(flags.coinLive);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const link = bagWatchLink(address);
  if (!link) return null;
  return (
    <section aria-labelledby="watch-title" className="rise mt-6 rounded-[var(--radius-card)] border border-gold/40 bg-card bg-[radial-gradient(36rem_18rem_at_100%_0%,#f2b84b14,transparent_70%)] p-5 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <p className="flex items-center gap-2 text-sm font-medium text-gold">
            <Bell className="size-4" aria-hidden />
            Watch this bag in Telegram
          </p>
          <h2 id="watch-title" className="mt-1 font-display text-2xl leading-tight text-foam">
            An alert when your bag needs a look
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-mist">
            One tap opens @ONPAR_BOT with this public address. The bot shows the bag, then alerts you when a name in it changes verdict, when its pool gets
            thin, when a large batch of it is created or burned, and the evening before a rebase.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-mist">
            {coinLive === false
              ? "Bag alerts are for $PAR holders. $PAR is not live yet, so the bot saves the bag now and the alerts start once it is. "
              : "Bag alerts are for $PAR holders. "}
            The link carries only the public address. Par never asks for a key or a signature.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-3">
          <a
            href={link}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-gold px-5 text-sm font-semibold text-night hover:brightness-105"
          >
            <Send className="size-4" aria-hidden />
            Watch this bag
          </a>
          {symbols.length > 0 ? (
            <a href={watchLink(symbols)} className="text-center text-sm text-mist underline decoration-white/30 underline-offset-4 hover:text-foam">
              {symbols.length === 1 ? "Or ping me when it turns Fair" : "Or ping me when one of these turns Fair"}
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}
