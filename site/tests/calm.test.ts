// Endless animations keep the browser drawing frames, and a phone pays for every one: on 19 Oct 2026 the hero's looping
// light and breathing dot kept a mid-range phone's processor about 60% busy for as long as the desk was open, and the
// page about 99% busy in all. This guards the styles against an endless animation coming back unnoticed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Every innermost rule as [selector, declarations]; rules inside @media blocks are included. */
function rules() {
  const out: [string, string][] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m = re.exec(css); m; m = re.exec(css)) out.push([m[1].trim().replace(/\s+/g, " "), m[2]]);
  return out;
}

const declarations = (selector: string) =>
  rules()
    .filter(([sel]) => sel === selector)
    .map(([, body]) => body)
    .join(";");

test("only the allowed animations loop for ever", () => {
  const endless = rules()
    .filter(([, body]) => /animation(-iteration-count)?\s*:[^;]*\binfinite\b/.test(body))
    .map(([sel]) => sel)
    .sort();
  assert.deepEqual(endless, [
    // Placeholders: they only show while a number is loading, or while a cached page waits for fresh prices.
    ".live-dot", // the small dot on /events and in the "Refreshing" note; the hero's dot pulses once per update instead
    ".shimmer",
    ".ticker-track", // the price tape: it stops while scrolled out of view (Ticker.tsx)
    "html[data-par-stale] [data-verdict-slot]::after",
  ]);
});

test("the hero's light runs three times then fades, its halo breathes twice, its dot pulses once per update", () => {
  // Nothing moves until the hero is on screen (HeroLines adds .in-view): the light is hidden, the halo still.
  assert.match(declarations(".hero-flow"), /opacity:\s*0;/);
  assert.doesNotMatch(declarations(".hero-flow"), /animation/);
  assert.doesNotMatch(declarations(".hero-halo"), /animation/);
  const flow = declarations(".hero-lines.in-view .hero-flow");
  assert.match(flow, /flow-in 0\.4s ease-out forwards/);
  assert.match(flow, /flow 2\.6s linear 3\b/);
  // The fade starts during the third run (7 s + 0.8 s = 3 x 2.6 s), so the light fades while still moving.
  assert.match(flow, /flow-out 0\.8s ease-in 7s forwards/);
  assert.ok(flow.indexOf("flow-out") > flow.indexOf("flow-in"), "flow-out comes after flow-in, so it wins over the held 0.55");
  assert.match(css, /@keyframes flow-in\s*\{\s*to\s*\{\s*opacity:\s*0\.55;/);
  assert.match(css, /@keyframes flow-out\s*\{\s*from\s*\{\s*opacity:\s*0\.55;\s*\}\s*to\s*\{\s*opacity:\s*0;/);
  assert.match(declarations(".hero-lines.in-view .hero-halo"), /breathe 3\.2s ease-in-out 2\b/);
  assert.match(declarations(".live-dot.live-once"), /pulse 1\.8s ease-out 1\b/);
});

test("visitors who ask for reduced motion get none of it", () => {
  const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  const stopped = /([^{}]+)\{\s*animation:\s*none;\s*\}/.exec(reduced);
  assert.ok(stopped, "a reduced-motion rule stops animations");
  const list = stopped[1].split(",").map((s) => s.trim());
  // The same selectors as the rules that start them, so the reduced-motion rule (later in the file) wins.
  for (const selector of [
    ".hero-lines.in-view .hero-flow",
    ".hero-lines.in-view .hero-halo",
    ".live-dot",
    ".live-dot.live-once",
    ".ticker-track",
    ".shimmer",
  ]) {
    assert.ok(list.includes(selector), `${selector} is stopped for reduced motion`);
  }
});

test("cards are always laid out: content-visibility broke the way back to the same card (review, 19 Oct 2026)", () => {
  // With an estimated card height, coming back from a name page landed one to three cards too high.
  assert.doesNotMatch(css, /content-visibility/);
});

test("the server renders the hero still: the opening plays only once it is on screen", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { HeroLines } = await import("../src/components/desk/HeroLines");
  const html = renderToStaticMarkup(createElement(HeroLines, { rows: [], age: 0, asOf: 0, feedError: null, onPick: () => undefined }));
  assert.match(html, /class="hero-lines relative w-full select-none"/);
  assert.doesNotMatch(html, /in-view/);
});

test("the price tape moves on the graphics chip and can be stopped off screen", () => {
  assert.match(declarations(".ticker-track"), /will-change:\s*transform/);
  assert.match(declarations(".ticker-track.ticker-offscreen"), /animation-play-state:\s*paused/);
});
