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
    <section aria-label="What you will see" className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {PROMISES.map(({ icon: Icon, title, line }, index) => (
        <div key={title} className="panel rise flex items-start gap-4 p-5" style={{ animationDelay: `${index * 60}ms` }}>
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg bg-field text-gold ring-1 ring-line">
            <Icon className="size-5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-semibold text-ink">{title}</span>
            <span className="mt-1 block text-sm leading-relaxed text-muted">{line}</span>
          </span>
        </div>
      ))}
    </section>
  );
}
