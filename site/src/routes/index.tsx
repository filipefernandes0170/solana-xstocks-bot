import { createFileRoute } from "@tanstack/react-router";
import { Desk } from "../components/desk/Desk";
import { getCryptos, getOffers, getQuotes } from "../server/functions";

export const Route = createFileRoute("/")({
  loader: async () => {
    const [quotes, offers, cryptos] = await Promise.all([getQuotes(), getOffers(), getCryptos()]);
    return { quotes, offers, cryptos };
  },
  component: Home,
});

function Home() {
  const data = Route.useLoaderData();
  return (
    <Desk
      initial={data.quotes.quotes}
      initialError={data.quotes.ok ? null : data.quotes.message}
      initialOffers={data.offers.offers}
      offersError={data.offers.ok ? null : data.offers.message}
      initialCryptos={data.cryptos.rows}
    />
  );
}
