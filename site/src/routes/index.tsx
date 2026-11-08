import { createFileRoute } from "@tanstack/react-router";
import { Desk } from "../components/desk/Desk";
import { DESK_TITLE, LIVE_PAGE_CACHE, SITE_URL } from "../lib/site";
import { getCryptos, getFlags, getOffers, getQuotes } from "../server/functions";

export const Route = createFileRoute("/")({
  headers: () => ({ "Netlify-CDN-Cache-Control": LIVE_PAGE_CACHE }),
  head: () => ({
    meta: [{ title: DESK_TITLE }, { property: "og:url", content: `${SITE_URL}/` }],
    links: [{ rel: "canonical", href: `${SITE_URL}/` }],
  }),
  loader: async () => {
    const [quotes, offers, cryptos, flags] = await Promise.all([getQuotes(), getOffers(), getCryptos(), getFlags()]);
    return { quotes, offers, cryptos, holderMin: flags.holderMin };
  },
  component: Home,
});

function Home() {
  const data = Route.useLoaderData();
  return (
    <Desk
      initial={data.quotes.quotes}
      initialAsOf={data.quotes.asOf}
      initialError={data.quotes.ok ? null : data.quotes.message}
      initialOffers={data.offers.offers}
      offersError={data.offers.ok ? null : data.offers.message}
      initialCryptos={data.cryptos.rows}
      holderMin={data.holderMin}
    />
  );
}
