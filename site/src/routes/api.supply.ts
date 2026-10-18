import { createFileRoute } from "@tanstack/react-router";
import { EVENTS_CACHE } from "../lib/site";
import { supplyResult } from "../server/supply";

/** Supply on Solana as JSON, for @ONPAR_BOT's /week. Shared by the CDN for a minute. */
export const Route = createFileRoute("/api/supply")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(await supplyResult(), {
          headers: { "Netlify-CDN-Cache-Control": EVENTS_CACHE, "Cache-Control": "public, max-age=0, must-revalidate" },
        }),
    },
  },
});
