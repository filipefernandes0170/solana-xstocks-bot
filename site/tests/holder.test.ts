// $PAR on the site: the official address and the holder minimum (250,000 $PAR, Filipe, 8 Nov 2026), read safely and
// shown in words wherever the site explains who gets the texts. The address goes in on launch day (18 Nov 2026).
import assert from "node:assert/strict";
import { test } from "node:test";
import { PAR_HOLDER_MIN, PAR_MINT, holderCount, holderMinimum, holderRule, parMint, solscanToken } from "../src/lib/holder";
import { PAR_HOLDER_MIN as BOT_HOLDER_MIN, PAR_MINT as BOT_MINT } from "../../src/config/par";

test("the site and the bot use the same $PAR address and the same minimum", () => {
  assert.equal(PAR_MINT, BOT_MINT);
  assert.equal(PAR_HOLDER_MIN, BOT_HOLDER_MIN);
  assert.equal(PAR_HOLDER_MIN, 250_000);
  // Empty until launch; after that a Solana address (base58, 32 to 44 characters).
  assert.ok(PAR_MINT === "" || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(PAR_MINT), PAR_MINT);
});

test("TOKEN_MINT and HOLDER_MIN_TOKENS win only when set to something real", () => {
  assert.equal(parMint(""), PAR_MINT);
  assert.equal(parMint(undefined), PAR_MINT);
  assert.equal(parMint("  So11111111111111111111111111111111111111112 "), "So11111111111111111111111111111111111111112");
  assert.equal(holderMinimum("100000"), 100000);
  assert.equal(holderMinimum(" 300000 "), 300000);
  for (const raw of ["", "0", "-5", "abc", undefined, null]) assert.equal(holderMinimum(raw), PAR_HOLDER_MIN, String(raw));
});

test("the rule in words, and the Solscan link", () => {
  assert.equal(holderCount(250000), "250,000");
  assert.equal(holderRule(250000), "at least 250,000 $PAR");
  assert.equal(holderRule(0), "any amount of $PAR");
  assert.equal(solscanToken("abc"), "https://solscan.io/token/abc");
});

test("the desk's holder section states the minimum and says why a wallet does or does not qualify", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { WhyHold } = await import("../src/components/desk/WhyHold");
  const base = { wallet: "", onWallet: () => undefined, busy: false, error: null, onCheck: () => undefined };
  const held = renderToStaticMarkup(createElement(WhyHold, { ...base, status: "holds", minimum: 250000 }));
  assert.match(held, /needs at least 250,000 \$PAR, and the texts stop when it holds less/);
  assert.match(held, /This wallet holds at least 250,000 \$PAR, so it would get the texts/);
  const short = renderToStaticMarkup(createElement(WhyHold, { ...base, status: "absent", minimum: 250000 }));
  assert.match(short, /This wallet holds less than 250,000 \$PAR, so it would not get the texts/);
  const any = renderToStaticMarkup(createElement(WhyHold, { ...base, status: "absent", minimum: 0 }));
  assert.match(any, /This wallet would not get the texts/);
  assert.match(any, /The texts stop when the wallet no longer holds the coin/);
});

test("every page's footer shows the official address, or before launch that $PAR is not live yet", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { SiteFooter } = await import("../src/components/SiteFooter");
  const html = renderToStaticMarkup(createElement(SiteFooter));
  if (PAR_MINT) {
    assert.match(html, /Official \$PAR address/);
    assert.ok(html.includes(PAR_MINT));
    assert.ok(html.includes(solscanToken(PAR_MINT)));
  } else {
    assert.match(html, /\$PAR is not live yet/);
    assert.match(html, /is not Par&#x27;s/);
  }
});

test("Par installs as an app: the manifest names Par and lists both icons", async () => {
  const { readFileSync, existsSync } = await import("node:fs");
  const manifest = JSON.parse(readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
  assert.equal(manifest.short_name, "Par");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.display, "standalone");
  for (const icon of manifest.icons) assert.ok(existsSync(new URL(`../public${icon.src}`, import.meta.url)), icon.src);
  assert.deepEqual(
    manifest.icons.map((icon: { sizes: string }) => icon.sizes),
    ["192x192", "512x512"],
  );
});
