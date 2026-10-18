import { ScriptOnce } from "@tanstack/react-router";
import { useEffect } from "react";
import { EARLY_QUOTES_KEY } from "../lib/earlyQuotes";
import { ageLabel } from "../lib/format";
import { STALE_PAGE_MS } from "../lib/site";

const ATTR = "data-par-stale";

/**
 * Marks a cached copy of a live page as stale before it is even drawn. Netlify may serve the last copy of the desk or a
 * name page while it refreshes it (LIVE_PAGE_CACHE), so the copy can be minutes or hours old. The server-rendered page
 * carries the time of its prices, and this one-line script compares it with the visitor's clock as the page arrives;
 * styles.css then fades the numbers ([data-live]) and hides the verdicts ([data-verdict]). Once the page runs, `stale`
 * from its own state takes over: the mark lifts when fresh prices land, and comes back if they stop coming for a minute.
 * With `prefetch`, a stale copy also starts fetching fresh prices at once (lib/earlyQuotes.ts).
 */
export function StaleMark({ asOf, stale, ready, prefetch }: { asOf: number; stale: boolean; ready: boolean; prefetch?: string }) {
  useEffect(() => {
    if (ready) document.documentElement.toggleAttribute(ATTR, stale);
  }, [stale, ready]);
  useEffect(() => () => document.documentElement.removeAttribute(ATTR), []);
  const at = Number.isFinite(asOf) ? Math.floor(asOf) : 0;
  return <ScriptOnce>{staleScript(at, prefetch)}</ScriptOnce>;
}

/** The one-line script: marks a copy older than STALE_PAGE_MS and, with `prefetch`, starts the fresh prices' request. */
export function staleScript(at: number, prefetch?: string) {
  const early = prefetch
    ? `;window[${JSON.stringify(EARLY_QUOTES_KEY)}]=fetch(${JSON.stringify(prefetch)}).then(function(r){return r.ok?r.json():null}).catch(function(){return null})`
    : "";
  return `if(Date.now()-${at}>${STALE_PAGE_MS}){document.documentElement.setAttribute("${ATTR}","")${early}}`;
}

/**
 * The line shown while a page is stale (hidden by CSS otherwise). Before the page runs it cannot know the visitor's
 * clock, so the age appears once it does.
 */
export function StaleNote({ age, ready, className = "" }: { age: number; ready: boolean; className?: string }) {
  return (
    <p className={`stale-note items-center gap-2 text-sm ${className}`} role="status">
      <span className="live-dot shrink-0" aria-hidden />
      <span>
        {"Refreshing the prices"}
        {ready ? ` (the last ones are ${ageLabel(age)} old)` : ""}
        {". Verdicts come back with the live prices."}
      </span>
    </p>
  );
}
