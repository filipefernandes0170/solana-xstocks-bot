import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  BellRing,
  Briefcase,
  CalendarDays,
  Check,
  FingerprintPattern,
  Gauge,
  KeyRound,
  LineChart,
  MessageSquare,
  Percent,
  QrCode,
  Radar,
  Ruler,
  Scale,
  Send,
  ShieldCheck,
  Siren,
  Sunrise,
  Target,
  Trophy,
  Wallet,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";
import { Backdrop } from "../components/Backdrop";
import { PhoneDemo } from "../components/bot/PhoneDemo";
import { SiteFooter } from "../components/SiteFooter";
import { SiteNav } from "../components/SiteNav";
import { PUBLIC_DATA_CACHE, SITE_URL } from "../lib/site";
import { TOKENS } from "../lib/tokens";
import { verdictPillClass } from "../lib/verdict";
import { getFlags, getQuotes } from "../server/functions";

const BOT_URL = "https://t.me/ONPAR_BOT";
const TITLE = "Par on Telegram";
const DESCRIPTION = "@ONPAR_BOT texts you the moment a tokenized stock on Solana is back at the share price. Every feature, explained.";

export const Route = createFileRoute("/bot")({
  headers: () => ({ "Netlify-CDN-Cache-Control": PUBLIC_DATA_CACHE }),
  head: () => ({
    meta: [
      { title: `${TITLE} · Par` },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: `${SITE_URL}/bot` },
      { property: "og:image", content: `${SITE_URL}/og/bot.png` },
      { property: "og:image:alt", content: "Par on Telegram: a text the moment a tokenized stock is back at the share price." },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: `${SITE_URL}/og/bot.png` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/bot` }],
  }),
  loader: async () => {
    const [quotes, flags] = await Promise.all([getQuotes(), getFlags()]);
    return { quotes: quotes.quotes, asOf: quotes.asOf, coinLive: flags.coinLive };
  },
  component: BotPage,
});

const HOW: { icon: ReactNode; title: string; line: string }[] = [
  {
    icon: <Radar className="size-5" aria-hidden />,
    title: "It reads the prices",
    line: "Every minute: each token's last trade and a live $1,000 buy from Jupiter, the issuer's own mark where there is one, and the share's Nasdaq print. Splits and dividends are folded in, so every price is per share.",
  },
  {
    icon: <Gauge className="size-5" aria-hidden />,
    title: "It measures the gap",
    line: "The gap is what a $1,000 buy costs per share against the Nasdaq print. Green is cheaper than the stock, red is a premium.",
  },
  {
    icon: <Scale className="size-5" aria-hidden />,
    title: "It gives a verdict",
    line: "Fair only while Nasdaq is open and the buy, the issuer mark and the print sit within 0.4% of each other. When a number is missing it says Checking, never a guess.",
  },
  {
    icon: <Zap className="size-5" aria-hidden />,
    title: "It texts on a change",
    line: "A ping when a verdict changes, your order size fits, a key filing lands or a token is paused. Never the same thing twice, and every text has an off switch.",
  },
];

const NEVER = ["Never asks for a seed phrase or a private key", "Never asks you to sign a transaction", "Never holds funds", "No fee: Buy opens Jupiter, where you trade yourself"];

const STEPS = [
  { title: "Open @ONPAR_BOT", line: "Tap the button, then Start in Telegram. No sign-up. Everything free works straight away." },
  { title: "Send a name", line: "nvda, tesla or spy. You get the live card: the buy, Nasdaq, the gap and the verdict." },
  {
    title: "Prove your $PAR wallet",
    line: "The first button under /start. Sign one message (not a transaction) on the Par site, then turn on /watch, /brief, /bell and the rest.",
  },
];

const FREE: { icon: ReactNode; title: string; line: string }[] = [
  { icon: <MessageSquare className="size-5" aria-hidden />, title: "A card per name", line: "Last trade, a live $1,000 buy, the Nasdaq print, the gap and a verdict." },
  { icon: <LineChart className="size-5" aria-hidden />, title: "/prices", line: "Every name at a glance, with its verdict and gap." },
  { icon: <Ruler className="size-5" aria-hidden />, title: "/size NVDAx 5000", line: "What your order really costs per share, from a live quote at that size." },
  { icon: <Wallet className="size-5" aria-hidden />, title: "/portfolio", line: "Paste a wallet to see its stock tokens, valued per share. Par only reads." },
  { icon: <CalendarDays className="size-5" aria-hidden />, title: "/events", line: "The next 7 days: market days off, balance changes, pauses and key SEC filings." },
  { icon: <ArrowLeftRight className="size-5" aria-hidden />, title: "/pairs and /week", line: "Which of two tokens is cheaper, and who stayed at the real price this week." },
];

const HOLDERS: { icon: ReactNode; title: string; line: string }[] = [
  { icon: <Zap className="size-5" aria-hidden />, title: "Fair pings", line: "A text the moment a name you watch turns Fair, and when one trades rich while Nasdaq is closed." },
  { icon: <Target className="size-5" aria-hidden />, title: "Size alerts", line: "A text when your own order size, not just $1,000, is within 0.4% of the Nasdaq print." },
  { icon: <CalendarDays className="size-5" aria-hidden />, title: "Event texts", line: "Key filings for the names you hold or watch, at most 5 a day, and a pause alert at once." },
  { icon: <Sunrise className="size-5" aria-hidden />, title: "Morning brief", line: "Before the open on trading days: what is dearest and cheapest to buy, and today's balance changes." },
  { icon: <BellRing className="size-5" aria-hidden />, title: "Open bell", line: "One message as Nasdaq opens, with whatever is Fair and a Buy button for each." },
  { icon: <Briefcase className="size-5" aria-hidden />, title: "Bag watch and two-token pings", line: "A note when a stock in your wallet changes verdict, and when one token of a company gets cheaper." },
];

type Doc = { icon: ReactNode; title: string; commands: string[]; what: string; when: string };

const FREE_DOCS: Doc[] = [
  {
    icon: <MessageSquare className="size-5" aria-hidden />,
    title: "Name cards",
    commands: ["nvda", "nvidia", "amd.us"],
    what: "Send a name or a ticker. The card shows the last trade and its 24h move, a live $1,000 buy per share, the Nasdaq print and session, the gap with a meter, and the verdict. It adds how many dollars move the pool 1%, what $1,000 buys on Kraken or Backpack Exchange when they list it (before their fee), any rebase coming, and the same company's other token.",
    when: "Buttons under it: Buy (opens Jupiter), size checks at $1,000, $5,000 and $25,000, and Watch. Backpack tokens end in .us: amd.us is Backpack's AMD, amd is the xStock.",
  },
  {
    icon: <LineChart className="size-5" aria-hidden />,
    title: "The whole desk",
    commands: ["/prices"],
    what: `All ${TOKENS.length} names in one message: each verdict, price, gap and 24h move, how many are Fair, and the widest gap.`,
    when: "Send a name from the list for its full card.",
  },
  {
    icon: <Ruler className="size-5" aria-hidden />,
    title: "Size check",
    commands: ["/size NVDAx 5000"],
    what: "A live Jupiter quote at your amount, from $10 to $250,000: how many shares you get, the price per share, the gap to Nasdaq and what it costs you in dollars, with a green, yellow or red call.",
    when: "Bigger orders move thin pools more, so a name can be Fair at $1,000 and not at $25,000.",
  },
  {
    icon: <Wallet className="size-5" aria-hidden />,
    title: "Your bag",
    commands: ["/portfolio", "/p", "paste a wallet"],
    what: "Any Solana wallet's stock tokens, each valued per share against Nasdaq. The bot reads public balances only; it never connects to or moves anything.",
    when: "The site's Portfolio page adds the exit price, possible yield and a map of the bag.",
  },
  {
    icon: <CalendarDays className="size-5" aria-hidden />,
    title: "Events",
    commands: ["/events"],
    what: "The next 7 days: Nasdaq days off and early closes, balance changes set on chain, any token whose transfers are paused, and the latest key filings at the SEC, each with its source.",
    when: "The full list, with 14 days of filings and filters, is on the Events page.",
  },
  {
    icon: <ArrowLeftRight className="size-5" aria-hidden />,
    title: "Two tokens, one company",
    commands: ["/pairs"],
    what: "AMD and SpaceX each have an xStock and a Backpack token. This says which $1,000 buy is cheaper right now, or which pool is deep enough to buy at all.",
    when: "Holders can get a text when the gap between them opens: /pairs on.",
  },
  {
    icon: <Trophy className="size-5" aria-hidden />,
    title: "The weekly ranking",
    commands: ["/week"],
    what: "Which names sat within 0.4% of Nasdaq most often while it was open over the last 7 days, and which drifted furthest. Then the supply on Solana: the biggest batches of tokens created or burned, in dollars.",
    when: "The same ranking, with a picture to share and every name's supply, is on the Ranking page.",
  },
  {
    icon: <Percent className="size-5" aria-hidden />,
    title: "Lending rates",
    commands: ["/yield NVDAx"],
    what: "Live supply and borrow rates on Kamino for that name, and how much you can borrow against it.",
    when: "Rates move with demand. Lending has its own risks; read the venue's terms.",
  },
  {
    icon: <Siren className="size-5" aria-hidden />,
    title: "Move alerts",
    commands: ["/alert NVDAx up 5", "/alert list", "/alert clear"],
    what: "A one-off text when a name moves that much (up, down or both) within the bot's time window, which it states when you set the alert.",
    when: "It turns itself off after it fires, so a long move does not text you again and again.",
  },
];

const HOLDER_DOCS: Doc[] = [
  {
    icon: <FingerprintPattern className="size-5" aria-hidden />,
    title: "Prove your $PAR wallet",
    commands: ["/hold", "/hold check", "/hold off"],
    what: "Holder texts go only to a wallet you prove is yours. Tap 🔐 Prove my $PAR wallet, connect that wallet on the Par site (Phantom, Solflare and other Solana wallets) and sign one message. The code works once, for 15 minutes.",
    when: "A message is not a transaction and cannot move funds. The bot then reads that wallet's $PAR on chain, and the texts stop if it no longer holds any.",
  },
  {
    icon: <Zap className="size-5" aria-hidden />,
    title: "Fair pings",
    commands: ["/watch NVDAx", "/watch all", "/watch list", "/watch off"],
    what: "A text the moment a watched name turns 🟢 Fair, with a Buy button, and a 🌙 note when one trades over the print while Nasdaq is closed.",
    when: "Watch a few names or all of them. The Watch button on a card and the site's favourites do the same.",
  },
  {
    icon: <Briefcase className="size-5" aria-hidden />,
    title: "Bag watch",
    commands: ["Watch this bag"],
    what: "Follow a wallet from /portfolio or the site's Portfolio page. A text when a name in it changes verdict or its pool gets thin, and the evening before a rebase changes its balance.",
    when: "Send another address to follow a different wallet.",
  },
  {
    icon: <CalendarDays className="size-5" aria-hidden />,
    title: "Event texts",
    commands: ["/events on", "/events off"],
    what: "Key SEC filings (results, deals, board or executive changes, warnings) for the names in your bag or watch list, within minutes of the SEC posting them, at most 5 a day. On unless you turn it off.",
    when: "If a token you hold or watch has its transfers paused on chain, you hear at once, and again when they resume. That safety alert has no off switch.",
  },
  {
    icon: <Target className="size-5" aria-hidden />,
    title: "Size alerts",
    commands: ["/sizealert NVDAx 5000", "/sizealert", "/sizealert off"],
    what: "A one-off text when a buy of your size, not just $1,000, is within 0.4% of the Nasdaq print while Nasdaq is open. Up to 3 at once.",
    when: "Checked every few minutes, then it turns itself off.",
  },
  {
    icon: <Sunrise className="size-5" aria-hidden />,
    title: "Morning brief",
    commands: ["/brief"],
    what: "Trading days, in the half hour before the open: what costs most and least to buy against the print, the names closest to it, the biggest 24h moves, balance changes in the next 24 hours, and a note when Nasdaq closes early or is shut next.",
    when: "Once a trading day. /brief again turns it off.",
  },
  {
    icon: <BellRing className="size-5" aria-hidden />,
    title: "Open bell",
    commands: ["/bell"],
    what: "One message as Nasdaq opens with whatever is Fair, and a Buy button for each.",
    when: "Once a trading day. /bell again turns it off.",
  },
  {
    icon: <ArrowLeftRight className="size-5" aria-hidden />,
    title: "Two-token pings",
    commands: ["/pairs on", "/pairs off"],
    what: "A text when one token of a company is 0.5 points cheaper to buy than the other.",
    when: "At most once a day per company.",
  },
];

const COMMANDS: [string, string][] = [
  ["/prices", "The whole desk"],
  ["/size NVDAx 5000", "Your order, per share"],
  ["/portfolio", "Your stock-token bag"],
  ["/events", "Days off, rebases, filings"],
  ["/week", "Ranking and supply"],
  ["/pairs", "Same company, two tokens"],
  ["/yield NVDAx", "Lending rates"],
  ["/alert NVDAx up 5", "A one-off move alert"],
  ["/watch NVDAx", "Ping when it turns Fair"],
  ["/sizealert NVDAx 5000", "A text when your size is fair"],
  ["/brief", "Morning brief on or off"],
  ["/bell", "Open bell on or off"],
  ["/events off", "Filing texts off"],
  ["/hold", "Prove the wallet that holds $PAR"],
  ["/help", "How Par works"],
];

const VERDICTS: { id: "fair" | "near" | "overnight" | "wait" | "split"; emoji: string; title: string; line: string }[] = [
  { id: "fair", emoji: "🟢", title: "Fair", line: "Nasdaq is open and a $1,000 buy is within 0.4% of the print." },
  { id: "near", emoji: "🟡", title: "Near", line: "Close to the stock. Check the gap before a larger order." },
  { id: "overnight", emoji: "🌙", title: "Overnight", line: "Kraken quotes it around the clock. Still not the print." },
  { id: "wait", emoji: "🔴", title: "Wait", line: "Away from the print, or the pool is too thin." },
  { id: "split", emoji: "⚖️", title: "Split", line: "The pool and the issuer mark disagree." },
];

const questions = (coinLive: boolean): [string, string][] => [
  [
    "Is it safe?",
    "Par never asks for a private key or a seed phrase, never asks you to sign a transaction, and never holds funds. To prove a wallet holds $PAR you sign one plain message, which cannot move funds. Buy opens Jupiter, where you trade yourself.",
  ],
  [
    "Does it cost anything?",
    "No. Par takes no fee. Cards, /prices, /size, /portfolio, /events, /pairs, /week, /yield and /alert are free for everyone. The texts need $PAR in a wallet you prove: you hold it, you do not pay it.",
  ],
  coinLive
    ? [
        "How does the bot know I hold $PAR?",
        "Tap 🔐 Prove my $PAR wallet under /start (or send /hold). Your wallet signs one plain message on the Par site to show it is yours. A typed address proves nothing, so the bot does not take one. Then it reads the balance on chain; it never moves anything.",
      ]
    : [
        "Is $PAR live?",
        "Not yet. Until it is, the holder texts stay off and the bot says so. You can already prove your wallet; the bot keeps it. Everything else works today.",
      ],
  [
    "How often will it text me?",
    "Only when something changes, and never the same thing twice. The brief and the bell come once a trading day, two-token pings once a day per company, filing texts at most 5 a day, and size and move alerts switch off after they fire. Every text has an off switch: /watch off, /brief, /bell, /pairs off, /events off, /sizealert off, /alert clear.",
  ],
  [
    "Where do the numbers come from?",
    "Token prices and buy quotes from Jupiter, stock prints from Nasdaq, lending rates from Kamino, filings from SEC EDGAR, balance changes and pauses from each token's mint on Solana, and market days off from the exchanges' own calendars. None is made up.",
  ],
  [
    "Does the bot know earnings dates in advance?",
    "No. A dependable earnings calendar needs a licensed data feed. The bot tells you when results reach the SEC, within minutes, with the link to the filing.",
  ],
  ["Is this financial advice?", "No. Par shows whether a price matches the stock and what official sources publish. Prices can be late or wrong, so check before you trade."],
];

function Feature({ icon, title, line }: { icon: ReactNode; title: string; line: string }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold">{icon}</span>
      <span>
        <span className="block font-medium text-foam">{title}</span>
        <span className="block text-sm leading-relaxed text-mist">{line}</span>
      </span>
    </li>
  );
}

function DocCard({ doc, holders }: { doc: Doc; holders: boolean }) {
  return (
    <li className="panel flex flex-col p-5 text-ink ring-1 ring-line sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${holders ? "bg-gold/25 text-amber" : "bg-pine-soft text-pine"}`}>{doc.icon}</span>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${holders ? "bg-ink text-gold" : "bg-pine-soft text-pine"}`}>
          {holders ? "$PAR holders" : "Free"}
        </span>
      </div>
      <h4 className="mt-4 text-lg font-medium">{doc.title}</h4>
      <p className="mt-2 flex flex-wrap gap-1.5">
        {doc.commands.map((command) => (
          <code key={command} className="rounded-lg bg-ink/5 px-2 py-1 font-mono text-xs text-ink ring-1 ring-line">
            {command}
          </code>
        ))}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-ink/85">{doc.what}</p>
      <p className="mt-2 text-sm leading-relaxed text-muted">{doc.when}</p>
    </li>
  );
}

function BotPage() {
  const { quotes, asOf, coinLive } = Route.useLoaderData();
  const featured = quotes.find((q) => q.symbol === "NVDAx") ?? quotes[0];
  return (
    <div className="relative min-h-screen text-foam">
      <Backdrop />
      <SiteNav current="/bot" />
      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <section className="rise grid items-center gap-12 pt-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:pt-12">
          <div className="max-w-2xl">
            <p className="text-sm font-medium tracking-wide text-gold">Par on Telegram</p>
            <h1 className="hero-title mt-4 font-display text-5xl leading-[0.98] sm:text-7xl">
              A text the moment the price is <span className="text-gold">real.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-mist">
              @ONPAR_BOT checks {TOKENS.length} tokenized stocks on Solana against Nasdaq every minute. Ask about any name, size your order, follow
              the filings, and get a text when a buy is back at the share price.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href={BOT_URL} className="inline-flex h-12 items-center gap-2 rounded-full bg-gold px-6 text-sm font-medium text-ink shadow-[0_8px_24px_#e0a04a33]">
                <Send className="size-4" aria-hidden />
                Open @ONPAR_BOT
              </a>
              <a href="#features" className="inline-flex h-12 items-center rounded-full px-5 text-sm font-medium text-foam ring-1 ring-white/20">
                Every feature, explained
              </a>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-mist">
              {["No fee", "Never asks for keys", "Never holds funds"].map((item) => (
                <li key={item} className="inline-flex items-center gap-1.5">
                  <Check className="size-4 text-[#3dbe8b]" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <PhoneDemo quote={featured} asOf={asOf} />
        </section>

        <section aria-labelledby="how-title" className="mt-24">
          <h2 id="how-title" className="font-display text-4xl sm:text-5xl">
            How the bot works
          </h2>
          <p className="mt-3 max-w-2xl text-mist">
            A tokenized stock is meant to track its share. The bot checks whether the price you would pay on Solana actually does.
          </p>
          <ol className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {HOW.map((step, index) => (
              <li key={step.title} className="relative rounded-2xl bg-dusk/80 p-6 ring-1 ring-white/10 backdrop-blur">
                <span className="flex items-center justify-between">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gold/15 text-gold">{step.icon}</span>
                  <span className="font-display text-3xl text-white/15">{index + 1}</span>
                </span>
                <h3 className="mt-4 text-lg font-medium">{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-mist">{step.line}</p>
              </li>
            ))}
          </ol>
          <ul className="mt-4 grid gap-2 rounded-2xl bg-dusk/60 p-4 text-sm text-mist ring-1 ring-white/10 sm:grid-cols-2 lg:grid-cols-4">
            {NEVER.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <KeyRound className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="steps-title" className="mt-24">
          <h2 id="steps-title" className="font-display text-4xl sm:text-5xl">
            Start in three steps
          </h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="rounded-2xl bg-dusk/80 p-6 ring-1 ring-white/10 backdrop-blur">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gold font-display text-lg text-ink">{index + 1}</span>
                <h3 className="mt-4 text-lg font-medium">{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-mist">{step.line}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="plans-title" className="mt-24">
          <h2 id="plans-title" className="font-display text-4xl sm:text-5xl">
            Free to ask. Texts for holders.
          </h2>
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <div className="rounded-[1.75rem] bg-dusk/80 p-6 ring-1 ring-white/10 backdrop-blur sm:p-8">
              <p className="text-sm font-medium tracking-wide text-mist">Everyone, free</p>
              <ul className="mt-6 space-y-5">
                {FREE.map((item) => (
                  <Feature key={item.title} {...item} />
                ))}
              </ul>
            </div>
            <div className="why-hold rounded-[1.75rem] p-6 ring-1 ring-gold/30 sm:p-8">
              <p className="text-sm font-medium tracking-wide text-gold">With $PAR in a proven wallet</p>
              <ul className="mt-6 space-y-5">
                {HOLDERS.map((item) => (
                  <Feature key={item.title} {...item} />
                ))}
              </ul>
              <p className="mt-6 text-sm leading-relaxed text-mist">
                The bot checks the wallet you proved. Texts stop when it no longer holds the coin.
                {coinLive ? "" : " $PAR is not live yet, so these are off for now; a proven wallet is kept for when it is."}
              </p>
            </div>
          </div>
        </section>

        <section id="features" aria-labelledby="features-title" className="mt-24 scroll-mt-8">
          <h2 id="features-title" className="font-display text-4xl sm:text-5xl">
            Every feature, explained
          </h2>
          <p className="mt-3 max-w-2xl text-mist">What each one does, the command to use, and when it texts you. Send /help in the bot for the short version.</p>

          <h3 className="mt-10 flex items-center gap-2 text-sm font-medium tracking-wide text-[#3dbe8b] uppercase">
            <ShieldCheck className="size-4" aria-hidden />
            Free for everyone
          </h3>
          <ul className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {FREE_DOCS.map((doc) => (
              <DocCard key={doc.title} doc={doc} holders={false} />
            ))}
          </ul>

          <h3 className="mt-12 flex items-center gap-2 text-sm font-medium tracking-wide text-gold uppercase">
            <FingerprintPattern className="size-4" aria-hidden />
            For $PAR holders
          </h3>
          <ul className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {HOLDER_DOCS.map((doc) => (
              <DocCard key={doc.title} doc={doc} holders />
            ))}
          </ul>
          <p className="mt-4 text-sm text-mist">
            {"Prefer reading on the web? The "}
            <Link to="/" className="text-foam underline decoration-gold/70 underline-offset-4">
              desk
            </Link>
            {", "}
            <Link to="/events" className="text-foam underline decoration-gold/70 underline-offset-4">
              Events
            </Link>
            {" and "}
            <Link to="/portfolio" className="text-foam underline decoration-gold/70 underline-offset-4">
              Portfolio
            </Link>
            {" pages show the same numbers."}
          </p>
        </section>

        <section id="commands" aria-labelledby="commands-title" className="mt-24 scroll-mt-8">
          <h2 id="commands-title" className="font-display text-4xl sm:text-5xl">
            Commands
          </h2>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {COMMANDS.map(([command, line]) => (
              <li key={command} className="flex items-center justify-between gap-3 rounded-2xl bg-dusk/80 px-4 py-3 ring-1 ring-white/10">
                <code className="font-mono text-sm text-gold">{command}</code>
                <span className="text-right text-sm text-mist">{line}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-mist">Or skip the commands: send a name, or paste a Solana wallet.</p>
        </section>

        <section aria-labelledby="verdicts-title" className="mt-24">
          <h2 id="verdicts-title" className="font-display text-4xl sm:text-5xl">
            What the colours mean
          </h2>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {VERDICTS.map((v) => (
              <li key={v.id} className="panel p-5 text-ink ring-1 ring-line">
                <span className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${verdictPillClass(v.id)}`}>
                  <span aria-hidden className="mr-1.5">
                    {v.emoji}
                  </span>
                  {v.title}
                </span>
                <p className="mt-3 text-sm leading-relaxed text-muted">{v.line}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="faq-title" className="mt-24 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div>
            <h2 id="faq-title" className="font-display text-4xl sm:text-5xl">
              Questions
            </h2>
            <div className="mt-8 divide-y divide-white/10 rounded-[1.75rem] bg-dusk/80 ring-1 ring-white/10">
              {questions(coinLive).map(([question, answer]) => (
                <details key={question} className="group px-6 py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-medium">
                    {question}
                    <span aria-hidden className="text-gold transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-mist">{answer}</p>
                </details>
              ))}
            </div>
          </div>
          <aside className="self-start rounded-[1.75rem] bg-dusk/80 p-6 text-center ring-1 ring-white/10 lg:mt-[4.5rem]">
            <ShieldCheck className="mx-auto size-6 text-gold" aria-hidden />
            <p className="mt-3 font-display text-2xl">On a computer?</p>
            <p className="mt-1 text-sm text-mist">Scan to open the bot on your phone.</p>
            <img src="/qr-bot.svg" alt="QR code that opens t.me/ONPAR_BOT" width={200} height={200} className="mx-auto mt-5 w-44 rounded-2xl" />
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-mist">
              <QrCode className="size-3.5" aria-hidden />
              t.me/ONPAR_BOT
            </p>
          </aside>
        </section>

        <section className="why-hold mt-24 overflow-hidden rounded-[1.75rem] p-8 text-center ring-1 ring-white/10 sm:p-12">
          <h2 className="font-display text-4xl sm:text-5xl">Ask your first name.</h2>
          <p className="mx-auto mt-3 max-w-xl text-mist">Open the bot, send nvda, and see whether the price is real.</p>
          <a href={BOT_URL} className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-gold px-6 text-sm font-medium text-ink">
            <Send className="size-4" aria-hidden />
            Open @ONPAR_BOT
          </a>
        </section>

        <SiteFooter />
      </main>
    </div>
  );
}
