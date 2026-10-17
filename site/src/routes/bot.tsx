import { createFileRoute } from "@tanstack/react-router";
import { BellRing, Briefcase, Check, LineChart, MessageSquare, Percent, QrCode, Ruler, Send, ShieldCheck, Sunrise, Wallet, Zap } from "lucide-react";
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
const DESCRIPTION = "@ONPAR_BOT texts you the moment a tokenized stock on Solana is back at the share price.";

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

const STEPS = [
  { title: "Open @ONPAR_BOT", line: "Tap the button, then Start in Telegram. No sign-up, no wallet connection." },
  { title: "Send a name", line: "nvda, tesla or spy. You get the live card: the buy, Nasdaq, the gap and the verdict." },
  { title: "Turn on the texts", line: "/watch a name, /brief for the morning and /bell for the open. They need $PAR in your wallet." },
];

const FREE: { icon: ReactNode; title: string; line: string }[] = [
  { icon: <MessageSquare className="size-5" aria-hidden />, title: "A card per name", line: "Last trade, a live $1,000 buy, the Nasdaq print, the gap and a verdict." },
  { icon: <LineChart className="size-5" aria-hidden />, title: "/prices", line: "Every name at a glance, with its verdict and gap." },
  { icon: <Ruler className="size-5" aria-hidden />, title: "/size NVDAx 5000", line: "What your order really costs per share, from a live quote at that size." },
  { icon: <Wallet className="size-5" aria-hidden />, title: "/portfolio", line: "Paste a wallet to see its stock tokens, valued per share. Par only reads." },
  { icon: <Percent className="size-5" aria-hidden />, title: "/yield", line: "Live lending rates on Kamino for each name." },
];

const HOLDERS: { icon: ReactNode; title: string; line: string }[] = [
  { icon: <Zap className="size-5" aria-hidden />, title: "Fair pings", line: "A text the moment a name you watch turns Fair, and when one trades rich while Nasdaq is closed." },
  { icon: <Sunrise className="size-5" aria-hidden />, title: "Morning brief", line: "Before the open on trading days: what is dearest and cheapest to buy, and today's balance changes." },
  { icon: <BellRing className="size-5" aria-hidden />, title: "Open bell", line: "One message as Nasdaq opens, with whatever is Fair and a Buy button for each." },
  { icon: <Briefcase className="size-5" aria-hidden />, title: "Bag watch", line: "A note when a stock in your wallet changes verdict, or its pool gets thin." },
];

const COMMANDS: [string, string][] = [
  ["/prices", "The whole desk"],
  ["/size NVDAx 5000", "Your order, per share"],
  ["/portfolio", "Your stock-token bag"],
  ["/week", "This week's ranking"],
  ["/watch NVDAx", "Ping when it turns Fair"],
  ["/brief", "Morning brief on or off"],
  ["/bell", "Open bell on or off"],
  ["/yield NVDAx", "Lending rates"],
  ["/alert NVDAx up 5", "A one-off move alert"],
  ["/hold <wallet>", "The wallet that holds $PAR"],
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
  ["Is it safe?", "Par never asks for a private key or a seed phrase, never asks you to sign anything, and never holds funds. It reads public balances and prices. Buy opens Jupiter, where you trade yourself."],
  ["Does it cost anything?", "No. Par takes no fee. Cards, /prices, /size, /portfolio and /yield are free for everyone. The texts need $PAR in the wallet you give the bot: you hold it, you do not pay it."],
  coinLive
    ? ["How does the bot know I hold $PAR?", "You paste the wallet that holds it, or send /hold with that address. The bot reads the balance on chain; it never moves anything."]
    : ["Is $PAR live?", "Not yet. Until it is, the holder texts stay off and the bot says so. Everything else works today."],
  ["Where do the numbers come from?", "Token prices and buy quotes from Jupiter, stock prints from Nasdaq, lending rates from Kamino. Every number is live; none is made up."],
  ["Is this financial advice?", "No. Par shows whether a price matches the stock. Prices can be late or wrong, so check before you trade."],
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
              @ONPAR_BOT checks {TOKENS.length} tokenized stocks on Solana against Nasdaq every minute. Ask about any name, size your order, and get a
              text when a buy is back at the share price.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href={BOT_URL} className="inline-flex h-12 items-center gap-2 rounded-full bg-gold px-6 text-sm font-medium text-ink shadow-[0_8px_24px_#e0a04a33]">
                <Send className="size-4" aria-hidden />
                Open @ONPAR_BOT
              </a>
              <a href="#commands" className="inline-flex h-12 items-center rounded-full px-5 text-sm font-medium text-foam ring-1 ring-white/20">
                See the commands
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
              <p className="text-sm font-medium tracking-wide text-gold">With $PAR in your wallet</p>
              <ul className="mt-6 space-y-5">
                {HOLDERS.map((item) => (
                  <Feature key={item.title} {...item} />
                ))}
              </ul>
              <p className="mt-6 text-sm leading-relaxed text-mist">
                The bot checks the wallet you give it. Texts stop when it no longer holds the coin.
                {coinLive ? "" : " $PAR is not live yet, so these are off for now."}
              </p>
            </div>
          </div>
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

        <section className="mt-24 overflow-hidden rounded-[1.75rem] p-8 text-center ring-1 ring-white/10 sm:p-12 why-hold">
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
