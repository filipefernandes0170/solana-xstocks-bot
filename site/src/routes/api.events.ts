import { createFileRoute } from "@tanstack/react-router";
import { EVENTS_CACHE } from "../lib/site";
import { eventsResult } from "../server/events";

/** The events list as JSON, for @ONPAR_BOT's /events and its filing texts. Shared by the CDN for a minute. */
export const Route = createFileRoute("/api/events")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(await eventsResult(), {
          headers: { "Netlify-CDN-Cache-Control": EVENTS_CACHE, "Cache-Control": "public, max-age=0, must-revalidate" },
        }),
    },
  },
});
