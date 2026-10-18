import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowUpRight,
  BookOpen,
  CalendarOff,
  ChartNoAxesCombined,
  FileText,
  Handshake,
  OctagonPause,
  Repeat2,
  Send,
  ShieldCheck,
  Star,
  Sunset,
  TriangleAlert,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Backdrop } from "../components/Backdrop";
import { TickerBadge } from "../components/desk/parts";
import { SiteFooter } from "../components/SiteFooter";
import { SiteNav } from "../components/SiteNav";
import { CALENDAR_SOURCES, nyDate } from "../lib/calendar";
import {
  FILING_DAYS,
  SEC_CIK,
  dayTitle,
  etTime,
  eventUnderlyings,
  groupByDay,
  relativeDay,
  splitByTime,
  type EventKind,
  type ParEvent,
  type Topic,
} from "../lib/events";
import { EVENTS_PAGE_CACHE, SITE_URL } from "../lib/site";
import { TOKEN_BY_SYMBOL, TOKENS } from "../lib/tokens";
import { useFavourites } from "../lib/useFavourites";
import { getEvents, getFlags } from "../server/functions";

const TITLE = "Events for tokenized stocks · Par";
const DESCRIPTION =
  "Company filings, balance changes, transfer pauses and market days off for the tokenized stocks Par tracks on Solana. Each one links to its official source.";
const BOT_EVENTS = "https://t.me/ONPAR_BOT?start=events";
const SEC_TICKERS = Object.keys(SEC_CIK).length;
/** A page copy older than this (served from the cache after a quiet spell) asks for the newest list when it opens. */
const EVENTS_FRESH_MS = 3 * 60_000;

export const Route = createFileRoute("/events")({
  validateSearch: (search: Record<string, unknown>): { name?: string } =>
    typeof search.name === "string" && TOKEN_BY_SYMBOL.has(search.name) ? { name: search.name } : {},
  headers: () => ({ "Netlify-CDN-Cache-Control": EVENTS_PAGE_CACHE }),
  head: () => ({
    meta: [
      { title: "Events · Par" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: `${SITE_URL}/events` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/events` }],
  }),
  loader: async () => {
    const [events, flags] = await Promise.all([getEvents(), getFlags()]);
    return { ...events, coinLive: flags.coinLive };
  },
  component: EventsPage,
});

// ---------------------------------------------------------------------------------------------------------------
// Looks

type Look = { icon: ReactNode; tile: string; dot: string; label: string };

const TOPIC_LOOK: Record<Topic, Look> = {
  results: { icon: <ChartNoAxesCombined className="size-4" aria-hidden />, tile: "bg-pine-soft text-pine", dot: "bg-pine", label: "Results" },
  deals: { icon: <Handshake className="size-4" aria-hidden />, tile: "bg-[#fbecd3] text-amber", dot: "bg-gold", label: "Deal" },
  people: { icon: <Users className="size-4" aria-hidden />, tile: "bg-[#e4ecf6] text-[#2f5f8f]", dot: "bg-[#6b9bd1]", label: "People" },
  warnings: { icon: <TriangleAlert className="size-4" aria-hidden />, tile: "bg-clay-soft text-clay", dot: "bg-clay-bright", label: "Warning" },
  reports: { icon: <BookOpen className="size-4" aria-hidden />, tile: "bg-[#ece8f6] text-[#5a4a8f]", dot: "bg-[#9a88d6]", label: "Report" },
  other: { icon: <FileText className="size-4" aria-hidden />, tile: "bg-foam text-muted", dot: "bg-mist", label: "Filing" },
};

function lookFor(event: ParEvent): Look {
  if (event.kind === "filing") return TOPIC_LOOK[event.topic ?? "other"];
  if (event.kind === "rebase") return { icon: <Repeat2 className="size-4" aria-hidden />, tile: "bg-gold/25 text-amber", dot: "bg-gold", label: "Balance" };
  if (event.kind === "pause") return { icon: <OctagonPause className="size-4" aria-hidden />, tile: "bg-clay text-white", dot: "bg-clay-bright", label: "Paused" };
  return event.allDay
    ? { icon: <CalendarOff className="size-4" aria-hidden />, tile: "bg-dusk text-gold", dot: "bg-foam", label: "Market" }
    : { icon: <Sunset className="size-4" aria-hidden />, tile: "bg-[#fbe9dc] text-[#9a4f1c]", dot: "bg-[#f0a46b]", label: "Market" };
}

const KIND_LABEL: Record<EventKind, string> = { filing: "SEC filing", rebase: "On chain", pause: "On chain", market: "Market calendar" };

function ago(ms: number | null, now: number) {
  if (ms == null) return "not yet";
  const minutes = Math.max(0, Math.round((now - ms) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} h ago`;
}

// ---------------------------------------------------------------------------------------------------------------
// Pieces

function EventCard({ event }: { event: ParEvent }) {
  const look = lookFor(event);
  const token = event.symbols.length > 0 ? TOKEN_BY_SYMBOL.get(event.symbols[0]) : undefined;
  return (
    <article
      className={`panel stock-card p-4 text-ink ring-1 sm:p-5 ${event.kind === "pause" ? "ring-2 ring-clay" : "ring-line"}`}
      aria-label={`${event.company ? `${event.company}: ` : ""}${event.title}`}
    >
      <div className="flex gap-4">
        <span className="relative h-12 w-12 shrink-0">
          {token ? (
            <TickerBadge underlying={token.underlying} sector={token.sector} />
          ) : (
            <span className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ${look.tile}`}>{look.icon}</span>
          )}
          {token ? (
            <span className={`absolute -right-1.5 -bottom-1.5 inline-flex size-6 items-center justify-center rounded-full ring-2 ring-card ${look.tile}`}>
              {look.icon}
            </span>
          ) : null}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium tracking-wide text-muted uppercase">
            <span>{KIND_LABEL[event.kind]}</span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">{event.allDay ? (event.kind === "filing" ? "Time not read yet" : "All day") : etTime(event.at)}</span>
            {event.kind === "filing" && event.major ? (
              <span className="rounded-full bg-ink px-2 py-0.5 text-[0.65rem] tracking-wide text-foam normal-case">Key filing</span>
            ) : null}
          </p>
          <h4 className="mt-1 text-lg leading-snug font-medium">
            {event.company ? <span className="text-muted">{event.company} · </span> : null}
            {event.title}
          </h4>
          <p className="mt-1 text-sm leading-relaxed text-muted">{event.line}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {event.symbols.map((symbol) => (
              <Link
                key={symbol}
                to="/s/$symbol"
                params={{ symbol }}
                className="rounded-full bg-ink/5 px-2.5 py-1 text-xs font-medium text-ink ring-1 ring-line hover:bg-ink/10"
              >
                {symbol}
              </Link>
            ))}
            {event.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-foam px-2.5 py-1 text-xs text-muted">
                {tag}
              </span>
            ))}
            <a
              href={event.source.url}
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-full px-1 text-sm font-medium text-ink underline decoration-gold underline-offset-4"
            >
              {event.source.label}
              <ArrowUpRight className="size-4" aria-hidden />
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}

function Timeline({ events, today, empty }: { events: ParEvent[]; today: string; empty: string }) {
  const groups = groupByDay(events);
  if (groups.length === 0) return <p className="mt-4 rounded-2xl bg-dusk/80 px-5 py-4 text-sm leading-relaxed text-mist ring-1 ring-white/10">{empty}</p>;
  return (
    <div className="mt-4 space-y-8">
      {groups.map((group) => (
        <section key={group.day} aria-label={dayTitle(group.day, today)}>
          <div className="flex items-baseline gap-3">
            <h3 className="font-display text-2xl">{dayTitle(group.day, today)}</h3>
            <span className={`text-sm ${group.day === today ? "font-medium text-gold" : "text-mist"}`}>{relativeDay(group.day, today)}</span>
          </div>
          <ol className="relative mt-3 ml-2 space-y-3 border-l border-white/15 pl-6">
            {group.events.map((event) => (
              <li key={event.id} className="relative">
                <span
                  aria-hidden
                  className={`absolute top-6 -left-[31px] size-3 rounded-full ring-4 ring-night ${lookFor(event).dot} ${event.kind === "pause" ? "live-dot" : ""}`}
                />
                <EventCard event={event} />
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function NextCard({ icon, label, value, line, tone = "plain" }: { icon: ReactNode; label: string; value: string; line: string; tone?: "plain" | "good" | "bad" }) {
  const ring = tone === "bad" ? "ring-2 ring-clay-bright" : tone === "good" ? "ring-1 ring-[#3dbe8b]/40" : "ring-1 ring-white/10";
  return (
    <div className={`rise rounded-2xl bg-dusk/80 p-5 backdrop-blur ${ring}`}>
      <p className="flex items-center gap-2 text-sm font-medium text-gold">
        {icon}
        {label}
      </p>
      <p className="mt-3 font-display text-2xl leading-tight text-foam">{value}</p>
      <p className="mt-1 text-sm leading-relaxed text-mist">{line}</p>
    </div>
  );
}

function Chip({ active, onClick, children, count }: { active: boolean; onClick: () => void; children: ReactNode; count?: number }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium ${active ? "bg-gold text-ink" : "bg-dusk/80 text-foam ring-1 ring-white/15 hover:ring-white/30"}`}
    >
      {children}
      {count != null ? <span className={`tabular-nums ${active ? "text-ink/70" : "text-mist"}`}>{count}</span> : null}
    </button>
  );
}

const LEGEND: { look: Look; title: string; line: string }[] = [
  {
    look: TOPIC_LOOK.results,
    title: "Results",
    line: "The company published results (8-K, Item 2.02). Nasdaq prices them at its next session, while token pools trade around the clock, so the gap can widen before the open.",
  },
  { look: TOPIC_LOOK.deals, title: "Deals", line: "Major agreements signed or ended, acquisitions, sales and changes in control, as the company reported them." },
  { look: TOPIC_LOOK.people, title: "Board or executives", line: "Directors or officers leaving or joining, or their pay (8-K, Item 5.02)." },
  {
    look: TOPIC_LOOK.warnings,
    title: "Warnings",
    line: "Restructuring, impairments, cyber incidents, listing notices, or past financials that can no longer be relied on.",
  },
  { look: TOPIC_LOOK.reports, title: "Reports", line: "The full quarterly and annual reports (10-Q, 10-K, 20-F), and 6-K news from companies based outside the US." },
  {
    look: { icon: <Repeat2 className="size-4" aria-hidden />, tile: "bg-gold/25 text-amber", dot: "", label: "" },
    title: "Balance change",
    line: "The issuer moves the multiplier for a split or a dividend added as tokens. Your token count changes and the price per token moves the other way.",
  },
  {
    look: { icon: <CalendarOff className="size-4" aria-hidden />, tile: "bg-dusk text-gold", dot: "", label: "" },
    title: "Market days",
    line: "A day off has no Nasdaq session; an early close ends at 1:00 PM ET. Nothing is called Fair while Nasdaq is closed.",
  },
  {
    look: { icon: <OctagonPause className="size-4" aria-hidden />, tile: "bg-clay text-white", dot: "", label: "" },
    title: "Transfers paused",
    line: "Each token's issuer can pause every transfer. While it lasts, nobody can send or sell the token. A name's page lists its issuer's powers.",
  },
];

// ---------------------------------------------------------------------------------------------------------------
// The page

type KindFilter = "all" | EventKind;

function EventsPage() {
  const loaded = Route.useLoaderData();
  const search = Route.useSearch();
  const [data, setData] = useState(loaded);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(loaded.asOf);
  const [kind, setKind] = useState<KindFilter>("all");
  const [keyOnly, setKeyOnly] = useState(false);
  const [mine, setMine] = useState(false);
  const [company, setCompany] = useState(search.name ? (TOKEN_BY_SYMBOL.get(search.name)?.underlying ?? "") : "");
  const [favourites] = useFavourites();

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // The page may be a cached copy: an old one swaps in the newest list as soon as it arrives.
  useEffect(() => {
    if (Date.now() - loaded.asOf < EVENTS_FRESH_MS) return;
    let alive = true;
    setRefreshing(true);
    getEvents()
      .then((result) => {
        if (alive && result.ok && result.asOf > loaded.asOf) setData({ ...result, coinLive: loaded.coinLive });
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setRefreshing(false);
      });
    return () => {
      alive = false;
    };
  }, [loaded]);

  const today = nyDate(now);
  const companies = useMemo(() => {
    const seen = new Map<string, string>();
    for (const token of TOKENS) if (!seen.has(token.underlying)) seen.set(token.underlying, token.name);
    return [...seen.entries()].map(([underlying, name]) => ({ underlying, name }));
  }, []);

  // Company and favourite filters first; market days concern every name, so they stay.
  const scoped = data.events.filter((event) => {
    if (event.symbols.length === 0) return true;
    if (company && !eventUnderlyings(event).includes(company)) return false;
    if (mine && !event.symbols.some((symbol) => favourites.includes(symbol))) return false;
    return true;
  });
  const counts = {
    all: scoped.length,
    filing: scoped.filter((event) => event.kind === "filing").length,
    rebase: scoped.filter((event) => event.kind === "rebase").length,
    market: scoped.filter((event) => event.kind === "market").length,
    pause: scoped.filter((event) => event.kind === "pause").length,
  };
  const visible = scoped.filter((event) => {
    if (kind !== "all" && event.kind !== kind) return false;
    if (keyOnly && event.kind === "filing" && !event.major) return false;
    return true;
  });
  const { ahead, past } = splitByTime(visible, now);

  // The four cards on top read the whole list, whatever the filters.
  const all = splitByTime(data.events, now);
  const nextDayOff = all.ahead.find((event) => event.kind === "market");
  const nextRebase = all.ahead.find((event) => event.kind === "rebase");
  const paused = data.events.filter((event) => event.kind === "pause");
  const latestKey = all.past.find((event) => event.kind === "filing" && event.major);
  const chainRead = data.chainAt != null;

  return (
    <div className="relative min-h-screen text-foam">
      <Backdrop />
      <SiteNav current="/events" />
      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <header className="rise pt-4">
          <p className="flex items-center gap-2 text-sm font-medium text-gold">
            <span className="live-dot" aria-hidden />
            Events · {TOKENS.length} tokens
          </p>
          <h1 className="hero-title mt-3 max-w-3xl font-display text-4xl leading-[1.05] sm:text-6xl">What happens next to your tokens.</h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-mist sm:text-lg">
            Company filings at the SEC, balance changes and transfer pauses read on chain, and the days Nasdaq is shut. Each one has its time and a link to
            where it came from.
          </p>
          <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-mist">
            <span>SEC filings read {ago(data.filingsAt, now)}</span>
            <span>Mints read {ago(data.chainAt, now)}</span>
            <span>Times in New York (ET)</span>
            {refreshing ? <span>Checking for newer events…</span> : null}
          </p>
        </header>

        {data.missing.length > 0 && data.missing.length < SEC_TICKERS ? (
          <p className="mt-4 text-sm text-mist">Filings for {data.missing.join(", ")} are still loading. They appear within a few minutes.</p>
        ) : null}

        {data.notes.length > 0 ? (
          <div className="mt-6 space-y-1 rounded-2xl bg-clay-soft px-4 py-3 text-sm text-clay">
            {data.notes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
        ) : null}

        <section aria-label="Next up" className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <NextCard
            icon={<CalendarOff className="size-4" aria-hidden />}
            label={nextDayOff && !nextDayOff.allDay ? "Next early close" : "Next market day off"}
            value={nextDayOff ? dayTitle(nextDayOff.day, today) : "None in 90 days"}
            line={nextDayOff ? `${nextDayOff.tags[0]} · ${nextDayOff.allDay ? "closed" : "early close"} · ${relativeDay(nextDayOff.day, today).toLowerCase()}` : "Nasdaq keeps its usual hours."}
          />
          <NextCard
            icon={<Repeat2 className="size-4" aria-hidden />}
            label="Next balance change"
            value={nextRebase ? `${nextRebase.symbols[0]} · ${dayTitle(nextRebase.day, today)}` : chainRead ? "None scheduled" : "Not read yet"}
            line={nextRebase ? `${nextRebase.tags[0]} · ${nextRebase.tags[1].toLowerCase()}` : "No mint has a multiplier change set on chain."}
          />
          <NextCard
            icon={paused.length > 0 ? <OctagonPause className="size-4" aria-hidden /> : <ShieldCheck className="size-4" aria-hidden />}
            label="Transfers"
            tone={paused.length > 0 ? "bad" : chainRead ? "good" : "plain"}
            value={paused.length > 0 ? `${paused.length} paused` : chainRead ? `All ${TOKENS.length} can move` : "Not read yet"}
            line={paused.length > 0 ? paused.map((event) => event.symbols[0]).join(", ") : "No issuer has paused its token. Checked on every mint."}
          />
          <NextCard
            icon={<FileText className="size-4" aria-hidden />}
            label="Latest key filing"
            value={latestKey ? `${latestKey.company} · ${latestKey.title}` : `None in ${FILING_DAYS} days`}
            line={latestKey ? `${relativeDay(latestKey.day, today)} · ${etTime(latestKey.at)}` : "Results, deals and leadership news appear here."}
          />
        </section>

        <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0">
            <div role="group" aria-label="Filter events" className="flex flex-wrap items-center gap-2">
              <Chip active={kind === "all"} onClick={() => setKind("all")} count={counts.all}>
                All
              </Chip>
              <Chip active={kind === "filing"} onClick={() => setKind("filing")} count={counts.filing}>
                Filings
              </Chip>
              <Chip active={kind === "rebase"} onClick={() => setKind("rebase")} count={counts.rebase}>
                Balance changes
              </Chip>
              <Chip active={kind === "market"} onClick={() => setKind("market")} count={counts.market}>
                Market days
              </Chip>
              {counts.pause > 0 ? (
                <Chip active={kind === "pause"} onClick={() => setKind("pause")} count={counts.pause}>
                  Paused
                </Chip>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="company">
                Company
              </label>
              <select
                id="company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="h-10 rounded-full bg-dusk/80 px-4 text-sm text-foam ring-1 ring-white/15"
              >
                <option value="">Every name</option>
                {companies.map((entry) => (
                  <option key={entry.underlying} value={entry.underlying}>
                    {entry.name} ({entry.underlying})
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-pressed={mine}
                disabled={favourites.length === 0}
                title={favourites.length === 0 ? "Star names on the desk to use this" : undefined}
                onClick={() => setMine((value) => !value)}
                className={`inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium disabled:opacity-50 ${mine ? "bg-gold text-ink" : "bg-dusk/80 text-foam ring-1 ring-white/15"}`}
              >
                <Star className={`size-4 ${mine ? "fill-ink" : ""}`} aria-hidden />
                My names{favourites.length > 0 ? ` (${favourites.length})` : ""}
              </button>
              <button
                type="button"
                aria-pressed={keyOnly}
                onClick={() => setKeyOnly((value) => !value)}
                className={`inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium ${keyOnly ? "bg-gold text-ink" : "bg-dusk/80 text-foam ring-1 ring-white/15"}`}
              >
                Key filings only
              </button>
            </div>
            {favourites.length === 0 ? (
              <p className="mt-2 text-xs text-mist">
                {"Star names on the "}
                <Link to="/" className="text-foam underline decoration-gold/70 underline-offset-4">
                  desk
                </Link>
                {" to filter to them here."}
              </p>
            ) : null}

            <h2 className="mt-10 font-display text-3xl sm:text-4xl">Coming up</h2>
            <Timeline events={ahead} today={today} empty="Nothing ahead for this view. Balance changes appear as soon as an issuer sets them on chain." />

            <h2 className="mt-14 font-display text-3xl sm:text-4xl">Last {FILING_DAYS} days</h2>
            <Timeline events={past} today={today} empty={`Nothing in the last ${FILING_DAYS} days for this view.`} />
          </div>

          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <div className="why-hold rounded-[1.75rem] p-6 ring-1 ring-gold/30">
              <p className="flex items-center gap-2 text-sm font-medium text-gold">
                <Send className="size-4" aria-hidden />
                In Telegram
              </p>
              <h2 className="mt-2 font-display text-2xl leading-tight">Get these as texts.</h2>
              <ul className="mt-4 space-y-3 text-sm leading-relaxed text-mist">
                <li>
                  <code className="font-mono text-gold">/events</code>
                  {" · the next 7 days and the latest key filings. Free for everyone."}
                </li>
                <li>
                  <span className="font-medium text-foam">Filing texts</span>
                  {" · results, deals and leadership news for the names in your bag or watch list, at most 5 a day. "}
                  <code className="font-mono text-gold">/events off</code>
                  {" stops them."}
                </li>
                <li>
                  <span className="font-medium text-foam">Pause alerts</span>
                  {" · straight away if a token you hold or watch stops transfers, and when it resumes."}
                </li>
                <li>
                  <span className="font-medium text-foam">Balance reminders</span>
                  {" · the evening before a rebase changes a bag you watch."}
                </li>
              </ul>
              <p className="mt-4 text-xs leading-relaxed text-mist">
                {"The texts are for $PAR holders who prove their wallet in the bot."}
                {data.coinLive ? "" : " $PAR is not live yet, so they are off for now."}
              </p>
              <a href={BOT_EVENTS} className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-gold px-5 text-sm font-medium text-ink">
                <Send className="size-4" aria-hidden />
                Open @ONPAR_BOT
              </a>
            </div>

            <div className="rounded-[1.75rem] bg-dusk/80 p-6 ring-1 ring-white/10">
              <h2 className="font-display text-2xl">What each one means</h2>
              <ul className="mt-4 space-y-4">
                {LEGEND.map((entry) => (
                  <li key={entry.title} className="flex gap-3">
                    <span className={`mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg ${entry.look.tile}`}>{entry.look.icon}</span>
                    <span>
                      <span className="block text-sm font-medium text-foam">{entry.title}</span>
                      <span className="block text-sm leading-relaxed text-mist">{entry.line}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-[1.75rem] bg-dusk/80 p-6 text-sm leading-relaxed text-mist ring-1 ring-white/10">
              <h2 className="font-display text-xl text-foam">Where it comes from</h2>
              <p className="mt-2">
                {"Filings: each company's feed at "}
                <a href="https://www.sec.gov/edgar/search/" target="_blank" rel="noreferrer" className="text-foam underline decoration-gold/70 underline-offset-4">
                  SEC EDGAR
                </a>
                {", timed when the SEC accepted them. Insider trades and fund ETFs are left out."}
              </p>
              <p className="mt-2">Balance changes and pauses: each token's mint account on Solana.</p>
              <p className="mt-2">
                {"Market days: "}
                <a href={CALENDAR_SOURCES.nasdaq.url} target="_blank" rel="noreferrer" className="text-foam underline decoration-gold/70 underline-offset-4">
                  Nasdaq's 2026 schedule
                </a>
                {", then "}
                <a href={CALENDAR_SOURCES.nyse.url} target="_blank" rel="noreferrer" className="text-foam underline decoration-gold/70 underline-offset-4">
                  NYSE's published calendar
                </a>
                {" for 2027 and 2028."}
              </p>
              <p className="mt-2">
                No earnings dates in advance: a dependable calendar needs a licensed feed. Results show here when the company files them.
              </p>
              <p className="mt-2">Par lists what these sources publish. It does not say how a price will move, and none of this is advice.</p>
            </div>
          </aside>
        </div>

        <SiteFooter />
      </main>
    </div>
  );
}
