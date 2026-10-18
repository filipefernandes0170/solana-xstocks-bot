import { createFileRoute } from "@tanstack/react-router";
import { PUBLIC_DATA_CACHE } from "../lib/site";
import { quotesResult } from "../server/quotes";

/**
 * The desk's prices as plain JSON (no buy rotation), shared by the CDN like the data functions. An old cached copy of the
 * desk or a name page asks for it from its one-line script before its own code has loaded (lib/earlyQuotes.ts).
 */
export const Route = createFileRoute("/api/quotes")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(await quotesResult(), {
          headers: { "Netlify-CDN-Cache-Control": PUBLIC_DATA_CACHE, "Cache-Control": "public, max-age=0, must-revalidate" },
        }),
    },
  },
});
