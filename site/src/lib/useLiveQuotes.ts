import { useEffect, useRef, useState } from "react";
import { getQuotes } from "../server/functions";
import { takeEarlyQuotes } from "./earlyQuotes";
import { STALE_PAGE_MS } from "./site";
import type { Quote } from "./types";
import { mergeBuys } from "./verdict";

/**
 * Live quotes for a page other than the desk: the same 10 s polling that moves the buy rotation on, paused while
 * the tab is hidden, keeping the newest buy per name, plus a clock for the "seconds ago" counter.
 * `enabled: false` waits (the portfolio polls only once a wallet is read); `paused: true` skips polls for a while
 * (the portfolio's exit checks need Jupiter's whole rate limit).
 * With no prices yet, or prices over a minute old (a cached copy of the page), it first asks for prices alone, which
 * answers fastest; a stale page's script has usually started that request already (earlyQuotes.ts). Answers older than
 * the prices already shown are ignored. `stale` says the prices shown are over a
 * minute old; `ready` turns true once the browser runs the page (its own clock is in use).
 */
export function useLiveQuotes(initial: Quote[], initialAsOf: number, options: { enabled?: boolean; paused?: boolean } = {}) {
  const enabled = options.enabled ?? true;
  const [quotes, setQuotes] = useState(initial);
  const [asOf, setAsOf] = useState(initialAsOf);
  const [now, setNow] = useState(initialAsOf);
  const [ready, setReady] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const paused = useRef(options.paused === true);
  const newestAsOf = useRef(initialAsOf);
  const shown = useRef(initial.length);

  useEffect(() => {
    paused.current = options.paused === true;
  }, [options.paused]);

  useEffect(() => {
    setNow(Date.now());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    async function refresh(rotate = true) {
      try {
        const early = rotate ? null : await takeEarlyQuotes();
        const result = early?.ok ? early : await (rotate ? getQuotes({ data: { refreshBuys: true } }) : getQuotes());
        if (!alive) return;
        if (!result.ok) {
          setFeedError(result.message ?? "Price feed paused.");
          return;
        }
        setFeedError(null);
        if (result.asOf < newestAsOf.current) return;
        newestAsOf.current = result.asOf;
        shown.current = result.quotes.length;
        setQuotes((previous) => mergeBuys(previous, result.quotes, Date.now()));
        setAsOf(result.asOf);
      } catch {
        if (alive) setFeedError("Price feed paused.");
      }
    }
    setNow(Date.now());
    if (shown.current === 0 || Date.now() - newestAsOf.current > STALE_PAGE_MS) void refresh(false);
    void refresh();
    const poll = window.setInterval(() => {
      if (document.visibilityState !== "hidden" && !paused.current) void refresh();
    }, 10_000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    const onVisibility = () => {
      if (document.visibilityState !== "hidden" && !paused.current) void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      window.clearInterval(poll);
      window.clearInterval(clock);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);

  const stale = ready && quotes.length > 0 && now - asOf > STALE_PAGE_MS;
  return { quotes, asOf, now, feedError, ready, stale, age: Math.max(0, Math.round((now - asOf) / 1000)) };
}
