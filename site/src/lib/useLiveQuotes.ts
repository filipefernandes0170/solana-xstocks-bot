import { useEffect, useState } from "react";
import { getQuotes } from "../server/functions";
import type { Quote } from "./types";
import { mergeBuys } from "./verdict";

/**
 * Live quotes for a page other than the desk: the same 10 s polling that moves the buy rotation on, paused while
 * the tab is hidden, keeping the newest buy per name, plus a clock for the "seconds ago" counter.
 */
export function useLiveQuotes(initial: Quote[], initialAsOf: number) {
  const [quotes, setQuotes] = useState(initial);
  const [asOf, setAsOf] = useState(initialAsOf);
  const [now, setNow] = useState(initialAsOf);
  const [feedError, setFeedError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function refresh() {
      try {
        const result = await getQuotes({ data: { refreshBuys: true } });
        if (!alive) return;
        if (!result.ok) {
          setFeedError(result.message ?? "Price feed paused.");
          return;
        }
        setFeedError(null);
        setQuotes((previous) => mergeBuys(previous, result.quotes, Date.now()));
        setAsOf(result.asOf);
      } catch {
        if (alive) setFeedError("Price feed paused.");
      }
    }
    setNow(Date.now());
    void refresh();
    const poll = window.setInterval(() => {
      if (document.visibilityState !== "hidden") void refresh();
    }, 10_000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      window.clearInterval(poll);
      window.clearInterval(clock);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return { quotes, asOf, now, feedError, age: Math.max(0, Math.round((now - asOf) / 1000)) };
}
