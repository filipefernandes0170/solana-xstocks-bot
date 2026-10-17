import { Link } from "@tanstack/react-router";
import { Send } from "lucide-react";
import { Logo } from "./Logo";

const LINKS = [
  { to: "/", label: "Desk" },
  { to: "/bot", label: "Bot" },
  { to: "/portfolio", label: "Portfolio" },
] as const;

/** The bar at the top of every page: the mark, the three pages, and the bot. */
export function SiteNav({ current }: { current: "/" | "/bot" | "/portfolio" | null }) {
  return (
    <header className="relative z-20">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5 text-foam" aria-label="Par, the desk">
          <Logo size={36} />
          <span className="font-display text-2xl leading-none">Par</span>
        </Link>
        <nav aria-label="Pages" className="flex items-center gap-1 text-sm sm:gap-2">
          {LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              aria-current={current === link.to ? "page" : undefined}
              className={`rounded-full px-3 py-2 ${current === link.to ? "bg-white/10 text-foam" : "text-mist hover:text-foam"}`}
            >
              {link.label}
            </Link>
          ))}
          <a
            href="https://t.me/ONPAR_BOT"
            className="ml-1 hidden h-10 items-center gap-2 rounded-full bg-gold px-4 text-sm font-medium text-ink sm:inline-flex"
          >
            <Send className="size-4" aria-hidden />
            Open the bot
          </a>
        </nav>
      </div>
    </header>
  );
}
