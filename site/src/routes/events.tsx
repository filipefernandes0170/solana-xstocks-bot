import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
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
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Backdrop } from "../components/Backdrop";
import { TickerBadge } from "../components/desk/parts";
import { SiteFooter } from "../components/SiteFooter";
import { SiteNav } from "../components/SiteNav";
import { Chip, GOLD_BUTTON, PageTitle, StatTile } from "../components/ui";
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
// Looks: an icon and a tinted tile for each kind of event, readable on the dark panels.

type Look = { icon: ReactNode; tile: string; label: string };

const TOPIC_LOOK: Record<Topic, Look> = {
  results: { icon: <ChartNoAxesCombined className="size-4" aria-hidden />, tile: "bg-pine-soft text-pine", label: "Results" },
  deals: { icon: <Handshake className="size-4" aria-hidden />, tile: "bg-gold/15 text-gold", label: "Deal" },
  people: { icon: <Users className="size-4" aria-hidden />, tile: "bg-[#16233a] text-[#8fb6f2]", label: "People" },
  warnings: { icon: <TriangleAlert className="size-4" aria-hidden />, tile: "bg-clay-soft text-clay", label: "Warning" },
  reports: { icon: <BookOpen className="size-4" aria-hidden />, tile: "bg-[#211b36] text-[#b7a9ee]", label: "Report" },
  other: { icon: <FileText className="size-4" aria-hidden />, tile: "bg-field text-muted", label: "Filing" },
};

const REBASE_LOOK: Look = { icon: <Repeat2 className="size-4" aria-hidden />, tile: "bg-gold/15 text-gold", label: "Balance" };
const PAUSE_LOOK: Look = { icon: <OctagonPause className="size-4" aria-hidden />, tile: "bg-clay text-night", label: "Paused" };
const DAY_OFF_LOOK: Look = { icon: <CalendarOff className="size-4" aria-hidden />, tile: "bg-field text-gold", label: "Day off" };
const EARLY_CLOSE_LOOK: Look = { icon: <Sunset className="size-4" aria-hidden />, tile: "bg-[#2e1d12] text-[#f0a46b]", label: "Early close" };

function lookFor(event: ParEvent): Look {
  if (event.kind === "filing") return TOPIC_LOOK[event.topic ?? "other"];
  if (event.kind === "rebase") return REBASE_LOOK;
  if (event.kind === "pause") return PAUSE_LOOK;
  return event.allDay ? DAY_OFF_LOOK : EARLY_CLOSE_LOOK;
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

function timeText(event: ParEvent) {
  return event.allDay ? (event.kind === "filing" ? "Time not read yet" : "All day") : etTime(event.at);
}

// Spelled out, not by Intl, like dayTitle: the server's and the browser's engines must write the same thing.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The days the listed events cover, such as "26 Oct 2026 – 18 Jan 2027". */
function periodLabel(events: ParEvent[]) {
  if (events.length === 0) return null;
  const days = events.map((event) => event.day).sort();
  const parts = (date: string) => {
    const [year, month, day] = date.split("-").map(Number);
    return { text: `${day} ${MONTHS[month - 1]}`, year };
  };
  const first = parts(days[0]);
  const last = parts(days[days.length - 1]);
  return first.year === last.year ? `${first.text} – ${last.text} ${last.year}` : `${first.text} ${first.year} – ${last.text} ${last.year}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Pieces

/** The name's badge when the event concerns one company, else the event's own icon tile. */
function EventTile({ event, size = "sm" }: { event: ParEvent; size?: "sm" | "md" }) {
  const look = lookFor(event);
  const token = event.symbols.length > 0 ? TOKEN_BY_SYMBOL.get(event.symbols[0]) : undefined;
  if (token) return <TickerBadge underlying={token.underlying} sector={token.sector} size={size} />;
  const box = size === "sm" ? "h-9 w-9 rounded-lg" : "h-12 w-12 rounded-xl";
  return <span className={`inline-flex shrink-0 items-center justify-center ${box} ${look.tile}`}>{look.icon}</span>;
}

/** What kind of event it is: its icon and a word. Not a rating. */
function TypePill({ event }: { event: ParEvent }) {
  const look = lookFor(event);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium [&_svg]:size-3.5 ${look.tile}`}>
      {look.icon}
      {look.label}
    </span>
  );
}

function KeyBadge() {
  return <span className="rounded-md bg-gold/15 px-1.5 py-0.5 text-[0.65rem] font-semibold tracking-wide text-gold">Key filing</span>;
}

/** The second line under an event's title: the company, or for market days the day's name. */
function subline(event: ParEvent) {
  return event.company ?? event.tags[0] ?? "";
}

function NamesText({ event }: { event: ParEvent }) {
  if (event.symbols.length === 0) return <span className="text-muted">Every name</span>;
  return <span className="text-ink">{event.symbols.join(", ")}</span>;
}

/** One line of a day's table. A button: choosing it shows the event's details. */
function EventRow({ event, selected, open, onSelect }: { event: ParEvent; selected: boolean; open: boolean; onSelect: () => void }) {
  const paused = event.kind === "pause";
  const rest = paused ? "shadow-[inset_3px_0_0_var(--color-clay)] hover:bg-white/[0.03]" : "hover:bg-white/[0.03]";
  // Wide screens mark the event shown in the side panel; a phone marks only the one opened under its row.
  const edge = open
    ? "bg-field shadow-[inset_3px_0_0_var(--color-gold)]"
    : selected
      ? `${rest} lg:bg-field lg:shadow-[inset_3px_0_0_var(--color-gold)]`
      : rest;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`grid w-full grid-cols-1 items-center gap-x-4 px-4 py-3 text-left text-sm md:grid-cols-[6.5rem_minmax(0,1fr)_8.5rem_7rem] ${edge}`}
    >
      <span className="hidden tabular-nums text-muted md:block">{timeText(event)}</span>
      <span className="flex min-w-0 items-center gap-3">
        <EventTile event={event} />
        <span className="min-w-0">
          <span className="block font-medium leading-snug text-ink">{event.title}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted">
            <span className="truncate">{subline(event)}</span>
            {event.kind === "filing" && event.major ? <KeyBadge /> : null}
          </span>
          {/* On a phone the other columns fold into this line. */}
          <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 md:hidden">
            <TypePill event={event} />
            <span className="tabular-nums text-muted">{timeText(event)}</span>
            <NamesText event={event} />
          </span>
        </span>
      </span>
      <span className="hidden md:block">
        <TypePill event={event} />
      </span>
      <span className="hidden truncate md:block">
        <NamesText event={event} />
      </span>
    </button>
  );
}

/** The details of one event: when, what kind, which names, what it means, and where it came from. */
function EventDetails({ event, today, coinLive }: { event: ParEvent; today: string; coinLive: boolean }) {
  const rows: [string, ReactNode][] = [
    ["Date", `${dayTitle(event.day, today)} · ${relativeDay(event.day, today)}`],
    ["Time", timeText(event)],
    [
      "Type",
      <span key="type" className="flex flex-wrap items-center gap-2">
        <TypePill event={event} />
        <span className="text-muted">{KIND_LABEL[event.kind]}</span>
      </span>,
    ],
  ];
  if (event.tags.length > 0) rows.push(["Details", event.tags.join(" · ")]);
  return (
    <div>
      <div className="flex items-center gap-3">
        <EventTile event={event} size="md" />
        <div className="min-w-0">
          <h3 className="text-lg font-semibold leading-snug text-ink">{event.company ?? event.title}</h3>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>{event.company ? event.title : event.tags[0]}</span>
            {event.kind === "filing" && event.major ? <KeyBadge /> : null}
          </p>
        </div>
      </div>
      <dl className="mt-4 divide-y divide-line border-y border-line text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 py-2.5">
            <dt className="text-muted">{label}</dt>
            <dd className="min-w-0 text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-sm leading-relaxed text-muted">{event.line}</p>
      <a
        href={event.source.url}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex min-h-9 items-center gap-1 text-sm font-medium text-ink underline decoration-gold underline-offset-4"
      >
        {event.source.label}
        <ArrowUpRight className="size-4" aria-hidden />
      </a>

      <h4 className="mt-5 text-sm font-semibold text-ink">Names</h4>
      {event.symbols.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Every name Par follows.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {event.symbols.map((symbol) => {
            const token = TOKEN_BY_SYMBOL.get(symbol);
            return (
              <li key={symbol}>
                <Link
                  to="/s/$symbol"
                  params={{ symbol }}
                  className="flex items-center gap-3 rounded-lg bg-field px-3 py-2 ring-1 ring-line hover:bg-white/10"
                >
                  {token ? <TickerBadge underlying={token.underlying} sector={token.sector} size="sm" /> : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{token?.name ?? symbol}</span>
                    <span className="block text-xs text-muted">{symbol}</span>
                  </span>
                  <ArrowUpRight className="size-4 text-muted" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <a href={BOT_EVENTS} className={`${GOLD_BUTTON} mt-5 w-full`}>
        <Send className="size-4" aria-hidden />
        Get these in Telegram
      </a>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        {"The alerts are for $PAR holders who prove their wallet in the bot."}
        {coinLive ? "" : " $PAR is not live yet, so they are off for now."}
      </p>
    </div>
  );
}

/** A list of events, a panel per day, each a table of its events. On a phone a chosen row opens its details under it. */
function DayList({
  events,
  today,
  selectedId,
  openId,
  onSelect,
  onClose,
  coinLive,
  empty,
}: {
  events: ParEvent[];
  today: string;
  selectedId: string | null;
  openId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  coinLive: boolean;
  empty: string;
}) {
  const groups = groupByDay(events);
  if (groups.length === 0) return <p className="panel mt-4 px-5 py-4 text-sm leading-relaxed text-muted">{empty}</p>;
  return (
    <div className="mt-4 space-y-4">
      {groups.map((group) => {
        const relative = relativeDay(group.day, today);
        const near = relative === "Today" || relative === "Tomorrow" || relative === "Yesterday";
        return (
          <section key={group.day} aria-label={dayTitle(group.day, today)} className="panel overflow-hidden">
            <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3">
              <h3 className="text-base font-semibold text-ink">{near ? `${relative}, ${dayTitle(group.day, today)}` : dayTitle(group.day, today)}</h3>
              {near ? null : <span className="text-sm text-muted">{relative}</span>}
            </div>
            <div
              aria-hidden
              className="hidden grid-cols-[6.5rem_minmax(0,1fr)_8.5rem_7rem] gap-x-4 border-b border-line px-4 py-2 text-xs font-medium tracking-wide text-muted uppercase md:grid"
            >
              <span>Time</span>
              <span>Event</span>
              <span>Type</span>
              <span>Names</span>
            </div>
            <ol className="divide-y divide-line">
              {group.events.map((event) => (
                <li key={event.id}>
                  <EventRow event={event} selected={selectedId === event.id} open={openId === event.id} onSelect={() => onSelect(event.id)} />
                  {openId === event.id ? (
                    <div role="region" aria-label="Event details" className="border-t border-line bg-night/40 p-4 lg:hidden">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-sm font-semibold text-ink">Event details</span>
                        <button type="button" onClick={onClose} className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm text-muted hover:text-ink">
                          <X className="size-4" aria-hidden />
                          Close
                        </button>
                      </div>
                      <EventDetails event={event} today={today} coinLive={coinLive} />
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
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
    look: REBASE_LOOK,
    title: "Balance change",
    line: "The issuer moves the multiplier for a split or a dividend added as tokens. Your token count changes and the price per token moves the other way.",
  },
  {
    look: DAY_OFF_LOOK,
    title: "Market days",
    line: "A day off has no Nasdaq session; an early close ends at 1:00 PM ET. Nothing is called Fair while Nasdaq is closed.",
  },
  {
    look: PAUSE_LOOK,
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
  // The event the visitor chose; until then the details show the default one. On a phone the chosen one opens in place.
  const [chosen, setChosen] = useState<string | null>(null);

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

  // The details show the chosen event while it is in view; else a pause if there is one, else the newest that happened.
  const selected =
    visible.find((event) => event.id === chosen) ?? visible.find((event) => event.kind === "pause") ?? past[0] ?? ahead[0] ?? null;
  const openId = chosen != null && visible.some((event) => event.id === chosen) ? chosen : null;

  // The four tiles on top read the whole list, whatever the filters.
  const all = splitByTime(data.events, now);
  const nextDayOff = all.ahead.find((event) => event.kind === "market");
  const nextRebase = all.ahead.find((event) => event.kind === "rebase");
  const paused = data.events.filter((event) => event.kind === "pause");
  const latestKey = all.past.find((event) => event.kind === "filing" && event.major);
  const chainRead = data.chainAt != null;
  const period = periodLabel(data.events);

  const listProps = {
    today,
    selectedId: selected?.id ?? null,
    openId,
    onSelect: (id: string) => setChosen(id),
    onClose: () => setChosen(null),
    coinLive: data.coinLive,
  };

  return (
    <div className="relative min-h-screen text-foam">
      <Backdrop />
      <SiteNav current="/events" />
      <main className="relative z-10 mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6">
        <div className="rise">
          <PageTitle
            title="Events"
            line="What happens next to your tokens: company filings at the SEC, balance changes and transfer pauses read on chain, and the days Nasdaq is shut. Each one has its time and a link to where it came from."
            aside={
              period ? (
                <p className="panel inline-flex h-11 items-center gap-2 px-4 text-sm text-ink" aria-label={`Events listed from ${period}`}>
                  <CalendarDays className="size-4 text-gold" aria-hidden />
                  {period}
                </p>
              ) : null
            }
          />
          <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-mist">
            <span className="inline-flex items-center gap-2 font-medium text-gold">
              <span className="live-dot" aria-hidden />
              {TOKENS.length} tokens
            </span>
            <span>SEC filings read {ago(data.filingsAt, now)}</span>
            <span>Mints read {ago(data.chainAt, now)}</span>
            <span>Times in New York (ET)</span>
            {refreshing ? <span>Checking for newer events…</span> : null}
          </p>
        </div>

        {data.missing.length > 0 && data.missing.length < SEC_TICKERS ? (
          <p className="mt-4 text-sm text-mist">Filings for {data.missing.join(", ")} are still loading. They appear within a few minutes.</p>
        ) : null}

        {data.notes.length > 0 ? (
          <div className="mt-6 space-y-1 rounded-xl bg-clay-soft px-4 py-3 text-sm text-clay ring-1 ring-clay/30">
            {data.notes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
        ) : null}

        <section aria-label="Next up" className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            icon={<CalendarOff className="size-5" aria-hidden />}
            label={nextDayOff && !nextDayOff.allDay ? "Next early close" : "Next market day off"}
            value={nextDayOff ? dayTitle(nextDayOff.day, today) : "None in 90 days"}
            hint={
              nextDayOff
                ? `${nextDayOff.tags[0]} · ${nextDayOff.allDay ? "closed" : "early close"} · ${relativeDay(nextDayOff.day, today).toLowerCase()}`
                : "Nasdaq keeps its usual hours."
            }
          />
          <StatTile
            icon={<Repeat2 className="size-5" aria-hidden />}
            label="Next balance change"
            value={nextRebase ? `${nextRebase.symbols[0]} · ${dayTitle(nextRebase.day, today)}` : chainRead ? "None scheduled" : "Not read yet"}
            hint={nextRebase ? `${nextRebase.tags[0]} · ${nextRebase.tags[1].toLowerCase()}` : "No mint has a multiplier change set on chain."}
          />
          <StatTile
            icon={paused.length > 0 ? <OctagonPause className="size-5" aria-hidden /> : <ShieldCheck className="size-5" aria-hidden />}
            label="Transfers"
            tone={paused.length > 0 ? "text-clay" : chainRead ? "text-pine" : "text-ink"}
            value={paused.length > 0 ? `${paused.length} paused` : chainRead ? `All ${TOKENS.length} can move` : "Not read yet"}
            hint={paused.length > 0 ? paused.map((event) => event.symbols[0]).join(", ") : "No issuer has paused its token. Checked on every mint."}
          />
          <StatTile
            icon={<FileText className="size-5" aria-hidden />}
            label="Latest key filing"
            value={latestKey ? (latestKey.company ?? latestKey.title) : `None in ${FILING_DAYS} days`}
            hint={
              latestKey
                ? `${latestKey.title} · ${relativeDay(latestKey.day, today)} · ${etTime(latestKey.at)}`
                : "Results, deals and leadership news appear here."
            }
          />
        </section>

        <div className="mt-8">
          <div role="group" aria-label="Filter events" className="flex flex-wrap items-center gap-2">
            {(
              [
                ["all", "All", counts.all],
                ["filing", "Filings", counts.filing],
                ["rebase", "Balance changes", counts.rebase],
                ["market", "Market days", counts.market],
                ...(counts.pause > 0 ? ([["pause", "Paused", counts.pause]] as const) : []),
              ] as const
            ).map(([id, label, count]) => (
              <Chip key={id} on={kind === id} onClick={() => setKind(id)}>
                {label}
                <span className={`tabular-nums ${kind === id ? "text-night/70" : "text-mist"}`}>{count}</span>
              </Chip>
            ))}
            <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden />
            <label className="sr-only" htmlFor="company">
              Company
            </label>
            <select id="company" value={company} onChange={(e) => setCompany(e.target.value)} className="h-9 rounded-lg bg-field px-3 text-sm text-foam ring-1 ring-line">
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
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium disabled:opacity-50 ${mine ? "bg-gold text-night" : "bg-field text-foam ring-1 ring-line hover:bg-white/10"}`}
            >
              <Star className={`size-4 ${mine ? "fill-night" : ""}`} aria-hidden />
              My names{favourites.length > 0 ? ` (${favourites.length})` : ""}
            </button>
            <Chip on={keyOnly} onClick={() => setKeyOnly((value) => !value)}>
              Key filings only
            </Chip>
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
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0">
            <h2 className="font-display text-xl text-foam sm:text-2xl">Coming up</h2>
            <DayList
              {...listProps}
              events={ahead}
              empty="Nothing ahead for this view. Balance changes appear as soon as an issuer sets them on chain."
            />

            <h2 className="mt-10 font-display text-xl text-foam sm:text-2xl">Last {FILING_DAYS} days</h2>
            <DayList {...listProps} events={past} empty={`Nothing in the last ${FILING_DAYS} days for this view.`} />
          </div>

          <aside className="hidden lg:sticky lg:top-6 lg:block lg:self-start">
            <section aria-label="Event details" className="panel p-5">
              <h2 className="mb-4 text-base font-semibold text-ink">Event details</h2>
              {selected ? (
                <EventDetails event={selected} today={today} coinLive={data.coinLive} />
              ) : (
                <p className="text-sm leading-relaxed text-muted">Nothing listed for this view.</p>
              )}
            </section>
          </aside>
        </div>

        <div className="mt-12 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="panel p-5 sm:p-6">
            <h2 className="font-display text-xl text-ink">What each one means</h2>
            <ul className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {LEGEND.map((entry) => (
                <li key={entry.title} className="flex gap-3">
                  <span className={`mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg ${entry.look.tile}`}>{entry.look.icon}</span>
                  <span>
                    <span className="block text-sm font-medium text-ink">{entry.title}</span>
                    <span className="block text-sm leading-relaxed text-muted">{entry.line}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <div className="space-y-4">
            <div className="why-hold rounded-[var(--radius-card)] p-5 sm:p-6">
              <p className="flex items-center gap-2 text-sm font-medium text-gold">
                <Send className="size-4" aria-hidden />
                In Telegram
              </p>
              <h2 className="mt-2 font-display text-xl leading-tight text-ink">Get these as alerts.</h2>
              <ul className="mt-4 space-y-3 text-sm leading-relaxed text-muted">
                <li>
                  <code className="font-mono text-gold">/events</code>
                  {" · the next 7 days and the latest key filings. Free for everyone."}
                </li>
                <li>
                  <span className="font-medium text-ink">Filing alerts</span>
                  {" · results, deals and leadership news for the names in your bag or watch list, at most 5 a day. "}
                  <code className="font-mono text-gold">/events off</code>
                  {" stops them."}
                </li>
                <li>
                  <span className="font-medium text-ink">Pause alerts</span>
                  {" · straight away if a token you hold or watch stops transfers, and when it resumes."}
                </li>
                <li>
                  <span className="font-medium text-ink">Balance reminders</span>
                  {" · the evening before a rebase changes a bag you watch."}
                </li>
              </ul>
              <p className="mt-4 text-xs leading-relaxed text-muted">
                {"The alerts are for $PAR holders who prove their wallet in the bot."}
                {data.coinLive ? "" : " $PAR is not live yet, so they are off for now."}
              </p>
              <a href={BOT_EVENTS} className={`${GOLD_BUTTON} mt-5`}>
                <Send className="size-4" aria-hidden />
                Open @ONPAR_BOT
              </a>
            </div>

            <div className="panel p-5 text-sm leading-relaxed text-muted sm:p-6">
              <h2 className="font-display text-lg text-ink">Where it comes from</h2>
              <p className="mt-2">
                {"Filings: each company's feed at "}
                <a href="https://www.sec.gov/edgar/search/" target="_blank" rel="noreferrer" className="text-ink underline decoration-gold/70 underline-offset-4">
                  SEC EDGAR
                </a>
                {", timed when the SEC accepted them. Insider trades and fund ETFs are left out."}
              </p>
              <p className="mt-2">Balance changes and pauses: each token's mint account on Solana.</p>
              <p className="mt-2">
                {"Market days: "}
                <a href={CALENDAR_SOURCES.nasdaq.url} target="_blank" rel="noreferrer" className="text-ink underline decoration-gold/70 underline-offset-4">
                  Nasdaq's 2026 schedule
                </a>
                {", then "}
                <a href={CALENDAR_SOURCES.nyse.url} target="_blank" rel="noreferrer" className="text-ink underline decoration-gold/70 underline-offset-4">
                  NYSE's published calendar
                </a>
                {" for 2027 and 2028."}
              </p>
              <p className="mt-2">No earnings dates in advance: a dependable calendar needs a licensed feed. Results show here when the company files them.</p>
              <p className="mt-2">Par lists what these sources publish. It does not say how a price will move, and none of this is advice.</p>
            </div>
          </div>
        </div>

        <SiteFooter />
      </main>
    </div>
  );
}
