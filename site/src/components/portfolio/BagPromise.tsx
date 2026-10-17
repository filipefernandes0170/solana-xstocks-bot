import { Bell, CalendarClock, DoorOpen, LayoutDashboard, Scale, Sprout } from "lucide-react";

const PROMISES = [
  { icon: Scale, title: "At the real price", line: "Every stock token you hold next to the same shares at the Nasdaq print." },
  { icon: DoorOpen, title: "Exit price", line: "What selling each position would return right now, quoted at your size." },
  { icon: LayoutDashboard, title: "Your bag as a map", line: "Every position sized by its value and coloured by sector." },
  { icon: Bell, title: "Watch it in Telegram", line: "One tap, and the bot texts you when your bag needs a look." },
  { icon: Sprout, title: "Possible yield", line: "Live Kamino lending rates for the names you hold, in dollars a year." },
  { icon: CalendarClock, title: "Coming up", line: "Rebases that will change your token balance, before they happen." },
];

/** What the page shows once a wallet is read. */
export function BagPromise() {
  return (
    <section aria-label="What you will see" className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {PROMISES.map(({ icon: Icon, title, line }, index) => (
        <div key={title} className="rise rounded-2xl bg-dusk/80 p-5 ring-1 ring-white/10" style={{ animationDelay: `${index * 60}ms` }}>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gold/15 text-gold">
            <Icon className="size-5" aria-hidden />
          </span>
          <p className="mt-4 font-display text-2xl text-foam">{title}</p>
          <p className="mt-1 text-sm leading-relaxed text-mist">{line}</p>
        </div>
      ))}
    </section>
  );
}
