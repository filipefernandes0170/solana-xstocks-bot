import { Link, useNavigate } from "@tanstack/react-router";
import { Search, Wallet } from "lucide-react";
import { useId, useState } from "react";
import { TOKENS } from "../lib/tokens";
import { Logo } from "./Logo";

const LINKS = [
  { to: "/", label: "Desk" },
  { to: "/events", label: "Events" },
  { to: "/bot", label: "Bot" },
  { to: "/portfolio", label: "Portfolio" },
] as const;

/** The name a search means: an exact symbol or ticker first, then the first name that starts with it, then one that contains it. */
export function findToken(term: string) {
  const q = term.trim().toLowerCase();
  if (!q) return null;
  return (
    TOKENS.find((t) => t.symbol.toLowerCase() === q || t.underlying.toLowerCase() === q) ??
    TOKENS.find((t) => t.name.toLowerCase().startsWith(q) || t.symbol.toLowerCase().startsWith(q)) ??
    TOKENS.find((t) => t.name.toLowerCase().includes(q)) ??
    null
  );
}

/** The search in the bar: suggests the names Par follows and opens the chosen one's page. */
function NameSearch() {
  const navigate = useNavigate();
  const listId = useId();
  const [term, setTerm] = useState("");
  const [missed, setMissed] = useState(false);
  return (
    <form
      role="search"
      className="relative hidden min-w-0 flex-1 md:block md:max-w-xs lg:max-w-sm"
      onSubmit={(event) => {
        event.preventDefault();
        const token = findToken(term);
        if (!token) {
          setMissed(true);
          return;
        }
        setTerm("");
        setMissed(false);
        void navigate({ to: "/s/$symbol", params: { symbol: token.symbol } });
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mist" aria-hidden />
      <input
        value={term}
        onChange={(event) => {
          setTerm(event.target.value);
          setMissed(false);
        }}
        list={listId}
        placeholder="Search stocks (NVDA, TSLA, AAPL…)"
        aria-label="Search a stock Par follows"
        aria-invalid={missed || undefined}
        className={`h-10 w-full rounded-lg bg-field pl-9 pr-3 text-sm text-foam ring-1 placeholder:text-mist ${missed ? "ring-clay" : "ring-line"}`}
      />
      <datalist id={listId}>
        {TOKENS.map((t) => (
          <option key={t.mint} value={t.symbol}>{`${t.name} · ${t.underlying}`}</option>
        ))}
      </datalist>
      {missed ? (
        <span role="status" className="absolute left-0 top-full mt-1 rounded-md bg-field px-2 py-1 text-xs text-foam ring-1 ring-line">
          Par does not follow that name.
        </span>
      ) : null}
    </form>
  );
}

/** The bar at the top of every page: the mark, the four pages, a name search and the wallet. */
export function SiteNav({ current }: { current: "/" | "/events" | "/bot" | "/portfolio" | null }) {
  return (
    <header className="relative z-20 border-b border-line bg-night/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
        <Link to="/" className="flex shrink-0 items-center gap-2.5 text-foam" aria-label="Par, the desk">
          <Logo size={32} />
          <span className="text-xl font-semibold leading-none tracking-tight max-[359px]:hidden">Par</span>
          <span className="hidden text-xs text-mist xl:inline">· stocks on Solana</span>
        </Link>
        <nav aria-label="Pages" className="flex h-full items-stretch text-sm">
          {LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              aria-current={current === link.to ? "page" : undefined}
              className={`flex items-center border-b-2 px-2.5 font-medium sm:px-3 ${
                current === link.to ? "border-gold text-gold" : "border-transparent text-mist hover:text-foam"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-3">
          <NameSearch />
          <Link
            to="/portfolio"
            className="hidden h-10 shrink-0 items-center gap-2 rounded-lg bg-gold px-4 text-sm font-semibold text-night sm:inline-flex"
          >
            <Wallet className="size-4" aria-hidden />
            Connect wallet
          </Link>
        </div>
      </div>
    </header>
  );
}
