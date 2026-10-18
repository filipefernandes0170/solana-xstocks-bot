import { createFileRoute } from "@tanstack/react-router";
import { VENUES_CACHE } from "../lib/site";
import { venuesResult } from "../server/venues";

/** Where else one name can be bought (?symbol=NVDAx), for @ONPAR_BOT's cards. Shared by the CDN for 30 s. */
export const Route = createFileRoute("/api/venues")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const symbol = new URL(request.url).searchParams.get("symbol") ?? "";
        return Response.json(await venuesResult(symbol.slice(0, 12)), {
          headers: { "Netlify-CDN-Cache-Control": VENUES_CACHE, "Cache-Control": "public, max-age=0, must-revalidate" },
        });
      },
    },
  },
});
