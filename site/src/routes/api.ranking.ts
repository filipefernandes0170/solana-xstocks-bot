import { createFileRoute } from "@tanstack/react-router";
import { STATIC_PAGE_CACHE } from "../lib/site";
import { rankingResult } from "../server/history";

/** The week's ranking as JSON, for @ONPAR_BOT's /week and its Friday channel post. Shared by the CDN for 5 minutes. */
export const Route = createFileRoute("/api/ranking")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(await rankingResult(), {
          headers: { "Netlify-CDN-Cache-Control": STATIC_PAGE_CACHE, "Cache-Control": "public, max-age=0, must-revalidate" },
        }),
    },
  },
});
