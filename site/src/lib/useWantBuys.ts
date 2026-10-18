import { useEffect, useRef } from "react";
import { wantBuys } from "../server/functions";
import { dueSymbols } from "./shared";
import type { Quote } from "./types";

const CHECK_MS = 2_000;
const REPEAT_MS = 20_000;
const MIN_GAP_MS = 8_000;

/**
 * Asks the server to quote the $1,000 buys of the names this visitor cares about first: their favourites, the cards on
 * screen, the names in their bag. `names` is read each time (pass a function, so scrolling does not re-render the page).
 * Only names without a buy younger than 45 s are sent, sorted, at most every 8 s and every 20 s for the same list, and
 * only while the tab is visible. The request is cached by Netlify's CDN for 15 s, so many visitors asking for the same
 * names cost one function call, and it never calls Jupiter itself: the shared rotation does (see server/quotes.ts).
 */
export function useWantBuys(names: () => string[], quotes: Quote[]) {
  const latest = useRef({ names, quotes });
  latest.current = { names, quotes };

  useEffect(() => {
    let lastSent = 0;
    let lastKey = "";
    const timer = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      const now = Date.now();
      if (now - lastSent < MIN_GAP_MS) return;
      const due = dueSymbols(latest.current.names(), latest.current.quotes, now);
      if (due.length === 0) return;
      const sorted = [...due].sort();
      const key = sorted.join(",");
      if (key === lastKey && now - lastSent < REPEAT_MS) return;
      lastSent = now;
      lastKey = key;
      wantBuys({ data: { symbols: sorted } }).catch(() => undefined);
    }, CHECK_MS);
    return () => window.clearInterval(timer);
  }, []);
}
