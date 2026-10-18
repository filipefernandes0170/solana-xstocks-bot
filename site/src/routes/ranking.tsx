import { Link, createFileRoute } from "@tanstack/react-router";
import { ImageDown, Send } from "lucide-react";
import { useState } from "react";
import { Backdrop } from "../components/Backdrop";
import { TickerBadge } from "../components/desk/parts";
import { saveRankingImage } from "../components/ranking/saveImage";
import { ShareButton } from "../components/ShareButton";
import { SiteFooter } from "../components/SiteFooter";
import { SiteNav } from "../components/SiteNav";
import { formatGap } from "../lib/format";
import { MIN_OPEN_READINGS, nearLabel, rankingShareText, type RankRow } from "../lib/ranking";
import { SITE_URL, STATIC_PAGE_CACHE } from "../lib/site";
import { TOKEN_BY_SYMBOL } from "../lib/tokens";
import { getQuotes, getRanking, getSupply } from "../server/functions";
import { SupplyTable } from "../components/ranking/SupplyTable";

const TITLE = "Which tokenized stocks stayed at the real price? · Par";
const DESCRIPTION =
  "The last 7 days, ranked: how often each tokenized stock on Solana sat within 0.4% of its Nasdaq print while the market was open.";

export const Route = createFileRoute("/ranking")({
  headers: () => ({ "Netlify-CDN-Cache-Control": STATIC_PAGE_CACHE }),
  head: () => ({
    meta: [
      { title: "This week's ranking · Par" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: `${SITE_URL}/ranking` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/ranking` }],
  }),
  loader: async () => {
    const [ranking, supply, quotes] = await Promise.all([getRanking(), getSupply(), getQuotes()]);
    return { ranking, supply, quotes: quotes.quotes };
  },
  component: RankingPage,
});

function utcDay(ms: number) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(ms),
  );
}

function NameCell({ row }: { row: RankRow }) {
  const token = TOKEN_BY_SYMBOL.get(row.symbol);
  return (
    <span className="flex min-w-0 items-center gap-3">
      {token ? <TickerBadge underlying={token.underlying} sector={token.sector} size="sm" /> : null}
      <span className="min-w-0">
        <Link to="/s/$symbol" params={{ symbol: row.symbol }} className="block font-medium text-ink hover:underline hover:underline-offset-4">
          {row.symbol}
        </Link>
        <span className="block truncate text-xs text-muted">{token?.name ?? ""}</span>
      </span>
    </span>
  );
}

function Podium({ title, rows, tone }: { title: string; rows: RankRow[]; tone: "near" | "far" }) {
  return (
    <div className="panel p-5 text-ink ring-1 ring-line sm:p-6">
      <h2 className="font-display text-2xl">{title}</h2>
      <ol className="mt-4 space-y-3">
        {rows.map((row, index) => (
          <li key={row.symbol} className="flex items-center gap-3">
            <span className="w-5 shrink-0 text-sm font-medium text-muted">{index + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <NameCell row={row} />
                <span className="shrink-0 text-sm font-medium tabular-nums">{nearLabel(row.near)}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-foam" aria-hidden>
                <div className={`h-full rounded-full ${tone === "near" ? "bg-pine" : "bg-clay"}`} style={{ width: `${Math.max(2, row.near * 100)}%` }} />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function RankingPage() {
  const { ranking, supply, quotes } = Route.useLoaderData();
  const [saving, setSaving] = useState(false);
  const rows = ranking.rows;
  const closest = rows.slice(0, 5);
  const furthest = rows
    .slice(-5)
    .reverse()
    .filter((row) => !closest.includes(row));

  return (
    <div className="relative min-h-screen text-foam">
      <Backdrop />
      <SiteNav current={null} />
      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <header className="rise pt-4">
          <p className="text-sm font-medium text-gold">Ranking · last 7 days</p>
          <h1 className="hero-title mt-2 max-w-3xl font-display text-4xl leading-[1.05] sm:text-6xl">Which tokens stayed at the real price?</h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-mist">
            Every 15 minutes while Nasdaq is open, Par records each name's last trade on Solana and its Nasdaq print. This ranks the names by how
            often they sat within 0.4% of the print. The more often, the more you could trust the price you saw.
          </p>
        </header>

        {!ranking.ok ? <p className="mt-6 rounded-2xl bg-clay-soft px-4 py-3 text-sm text-clay">{ranking.message}</p> : null}

        {rows.length === 0 ? (
          <p className="panel mt-8 p-6 text-base leading-relaxed text-ink ring-1 ring-line">
            {"The first ranking appears after about two hours of a US session ("}
            {MIN_OPEN_READINGS}
            {" readings per name). Par records Monday to Friday while Nasdaq is open, 9:30 to 16:00 ET. Come back after the next open."}
          </p>
        ) : (
          <>
            <div className="mt-8 flex flex-wrap items-center gap-2">
              <ShareButton title="This week's ranking on Par" text={rankingShareText(ranking)} url={`${SITE_URL}/ranking`} tone="dark" />
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await saveRankingImage(ranking, `${SITE_URL}/ranking`);
                  } finally {
                    setSaving(false);
                  }
                }}
                className="inline-flex h-11 items-center gap-1.5 rounded-full bg-dusk px-4 text-sm font-medium text-foam ring-1 ring-white/15 disabled:opacity-60"
              >
                <ImageDown className="size-4" aria-hidden />
                {saving ? "Drawing…" : "Save image"}
              </button>
              <a
                href="https://t.me/ONPAR_BOT"
                className="inline-flex h-11 items-center gap-1.5 rounded-full bg-gold px-4 text-sm font-medium text-ink"
              >
                <Send className="size-4" aria-hidden />
                /week in the bot
              </a>
            </div>

            <section className="mt-6 grid gap-4 lg:grid-cols-2">
              <Podium title="Closest to Nasdaq" rows={closest} tone="near" />
              {furthest.length > 0 ? <Podium title="Furthest from Nasdaq" rows={furthest} tone="far" /> : null}
            </section>

            <section aria-labelledby="all-title" className="panel mt-6 overflow-hidden text-ink ring-1 ring-line">
              <h2 id="all-title" className="px-5 pt-5 font-display text-2xl sm:px-6">
                Every name
              </h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="text-xs tracking-wide text-muted uppercase">
                    <tr className="border-y border-line">
                      <th className="px-5 py-3 font-medium sm:px-6">#</th>
                      <th className="px-3 py-3 font-medium">Name</th>
                      <th className="px-3 py-3 font-medium">Near the print</th>
                      <th className="px-3 py-3 font-medium">Typical gap</th>
                      <th className="px-5 py-3 font-medium sm:px-6">Last reading</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={row.symbol} className="border-b border-line/70">
                        <td className="px-5 py-3 text-muted sm:px-6">{index + 1}</td>
                        <td className="px-3 py-3">
                          <NameCell row={row} />
                        </td>
                        <td className="px-3 py-3 font-medium tabular-nums">{nearLabel(row.near)}</td>
                        <td className="px-3 py-3 tabular-nums">{row.typicalGap.toFixed(2)}%</td>
                        <td className="px-5 py-3 tabular-nums sm:px-6">{formatGap(row.lastGap)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-mist">
              {ranking.readings}
              {" open-market readings"}
              {ranking.from != null && ranking.to != null ? `, from ${utcDay(ranking.from)} to ${utcDay(ranking.to)} UTC` : ""}
              {". This uses the last trade, not the $1,000 buy the desk's verdict uses, and names need two hours of readings to be ranked. A good week is no promise for the next one."}
            </p>
          </>
        )}
        <SupplyTable supply={supply} quotes={quotes} />
        <SiteFooter />
      </main>
    </div>
  );
}
