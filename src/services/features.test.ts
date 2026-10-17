import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { TOKENIZED_STOCKS } from "../config/tokens.js";
import type { DeskQuote } from "./desk.js";
import { briefTeaser, briefText, cardText, portfolioText, pricesText, sizeText } from "./messages.js";
import { currentMultiplier, gapBar, inBriefWindow, isPreMarket, perShareFill, sizeCall, tradeVerdict } from "./verdict.js";

// The size command module loads the config, which needs a bot token; it is never used here.
process.env.TELEGRAM_BOT_TOKEN ??= "test-token-not-real";
const { parseAmount } = await import("../bot/commands/size.js");

test("every bot mint matches the Par site's verified list", () => {
  const site = readFileSync(new URL("../../site/src/lib/tokens.ts", import.meta.url), "utf8");
  const siteMints = new Map([...site.matchAll(/symbol: "(\w+)", name: "[^"]+", mint: "(\w+)"/g)].map((m) => [m[1], m[2]]));
  assert.equal(siteMints.size, TOKENIZED_STOCKS.length);
  for (const token of TOKENIZED_STOCKS) assert.equal(token.mint, siteMints.get(token.symbol), token.symbol);
  // NFLXx once pointed at Chevron's token (CVXx); this is the Netflix mint.
  assert.equal(TOKENIZED_STOCKS.find((t) => t.symbol === "NFLXx")?.mint, "XsEH7wWfJJu2ZT3UCFeVfALnVA6CP5ur7Ee11KmzVpL");
});

test("the bag leaves out dust worth under a cent and says so", () => {
  const position = (symbol: string, amount: number, price: number) => ({
    symbol,
    name: symbol,
    mint: `${symbol}-mint`,
    amount,
    decimals: 8,
    rawAmount: 0n,
    price,
    usdValue: amount * price,
    change24h: null,
  });
  const text = portfolioText(
    "5B52aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaavyxG",
    {
      wallet: "5B52aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaavyxG",
      totalUsd: 2.0001,
      positions: [position("CRCLx", 0.0243, 82.3), position("SPCXx", 0.00001, 9.5), position("NVDAx", 0.00002, 0)],
      change24hUsd: null,
      change24hPct: null,
    },
    new Map(),
  );
  assert.ok(text.includes("2 positions"), text);
  assert.ok(text.includes("CRCLx"));
  assert.ok(!text.includes("SPCXx"));
  assert.ok(text.includes("NVDAx</b> under 0.0001 shares"), text);
  assert.ok(text.includes("1 position worth under $0.01 not shown"));
});

test("the multiplier in force switches at the effective time", () => {
  const state = { multiplier: "1.0009", newMultiplier: "1.0017", newMultiplierEffectiveTimestamp: 2_000 };
  assert.equal(currentMultiplier(state, 1_999), 1.0009);
  assert.equal(currentMultiplier(state, 2_000), 1.0017);
  assert.equal(currentMultiplier(null, 2_000), 1);
  assert.equal(currentMultiplier({ multiplier: "10", newMultiplier: "10", newMultiplierEffectiveTimestamp: 0 }, 5), 10);
});

test("a buy is priced per share: on-chain units times the multiplier", () => {
  // Live NVDAx numbers from 17 Oct 2026: $1,000 bought 4.64544038 on-chain units at a 1.0017 multiplier.
  const nvda = perShareFill(1000, 464_544_038, 8, 1.001701196801074);
  assert.ok(nvda && Math.abs(nvda.price - 214.90) < 0.01, String(nvda?.price));
  // NFLXx after its 10-for-1 split: without the multiplier the price per share would be ten times too high.
  const nflx = perShareFill(500, 70_283_000, 8, 10);
  assert.ok(nflx && Math.abs(nflx.shares - 7.0283) < 1e-6 && Math.abs(nflx.price - 71.14) < 0.01, String(nflx?.price));
  assert.equal(perShareFill(1000, 0, 8, 1), null);
  assert.equal(perShareFill(1000, Number.NaN, 8, 1), null);
});

test("the size call uses the desk's thresholds", () => {
  assert.equal(sizeCall({ gap: 0.2, impactPct: 0.1, open: true }).tone, "fair");
  assert.equal(sizeCall({ gap: 0.2, impactPct: 0.1, open: false }).tone, "close");
  assert.equal(sizeCall({ gap: 0.6, impactPct: 0.1, open: true }).tone, "close");
  assert.equal(sizeCall({ gap: 1.2, impactPct: 0.1, open: true }).tone, "far");
  assert.equal(sizeCall({ gap: 0.1, impactPct: 2.5, open: true }).tone, "far");
  assert.equal(sizeCall({ gap: null, impactPct: 0.1, open: true }).tone, "none");
});

test("the brief window is 9:00 to 9:29 New York time on weekdays", () => {
  // 20 Oct 2026 is a Monday; New York is on daylight time (UTC-4).
  assert.equal(inBriefWindow(Date.parse("2026-10-20T12:59:00Z")), false);
  assert.equal(inBriefWindow(Date.parse("2026-10-20T13:00:00Z")), true);
  assert.equal(inBriefWindow(Date.parse("2026-10-20T13:29:00Z")), true);
  assert.equal(inBriefWindow(Date.parse("2026-10-20T13:30:00Z")), false);
  assert.equal(inBriefWindow(Date.parse("2026-10-18T13:10:00Z")), false);
  assert.equal(isPreMarket("Pre-Market"), true);
  assert.equal(isPreMarket("Closed"), false);
  assert.equal(isPreMarket(null), false);
});

test("the text gap meter marks the center and both ends", () => {
  assert.equal(gapBar(0), "cheap ─────●───── rich");
  assert.equal(gapBar(2), "cheap ─────┼────● rich");
  assert.equal(gapBar(-5), "cheap ●────┼───── rich");
  assert.equal(gapBar(null), null);
});

test("size amounts parse from plain, dollar and k forms", () => {
  assert.equal(parseAmount("5000"), 5000);
  assert.equal(parseAmount("$5,000"), 5000);
  assert.equal(parseAmount("5k"), 5000);
  assert.equal(parseAmount("2.5k"), 2500);
  assert.equal(parseAmount("NVDAx"), null);
  assert.equal(parseAmount("-5"), null);
});

const now = Date.parse("2026-10-20T13:10:00Z");
const quote = (over: Partial<DeskQuote>): DeskQuote => ({
  symbol: "SPYx",
  name: "S&P 500",
  mint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
  underlying: "SPY",
  usdPrice: 762.75,
  stockPrice: 760,
  marketState: "Pre-Market",
  buyPrice: null,
  buyImpactPct: null,
  buyAt: null,
  issuerPrice: null,
  issuerAt: null,
  rebase: null,
  change24h: -1.3,
  sharesPerToken: 1.0057,
  issuer: "xStocks",
  poolUsd: 3_923_023,
  ...over,
});

test("messages escape names and keep Telegram HTML balanced", () => {
  const spy = quote({});
  const tsla = quote({ symbol: "TSLAx", name: "Tesla", underlying: "TSLA", usdPrice: 350, stockPrice: 352, change24h: -6 });
  const texts = [
    cardText(spy, tradeVerdict(spy)),
    pricesText([spy, tsla]),
    briefText([spy, tsla], now, 20),
    briefTeaser([spy, tsla], now),
    sizeText({ ok: true, quote: spy, usd: 5000, shares: 6.55, price: 763.36, impactPct: 0.4, at: now }).text,
  ];
  for (const text of texts) {
    assert.ok(text.includes("S&amp;P") || !text.includes("S&P"), "names are escaped");
    assert.ok(!/&(?!amp;|lt;|gt;)/.test(text), "no bare ampersand");
    for (const tag of ["b", "i", "code"]) {
      assert.equal(text.split(`<${tag}>`).length, text.split(`</${tag}>`).length, `<${tag}> balanced`);
    }
    assert.ok(text.length < 4096, "fits one Telegram message");
    assert.ok(!text.includes("\n\n\n"), "no double blank lines");
  }
});

test("a Nasdaq print survives one failed round, but not past 30 minutes", async () => {
  const { freshPrints } = await import("./desk.js");
  const now = 1_800_000_000_000;
  const rows = new Map([
    ["NFLX", { price: 70.53, state: "Closed", at: now - 4 * 60_000 }],
    ["AMD", { price: 528.75, state: "Closed", at: now - 31 * 60_000 }],
  ]);
  assert.deepEqual(freshPrints(rows, now), { NFLX: { price: 70.53, state: "Closed" } });
});

test("the site's favourites link watches known names only, at most 8", async () => {
  const { payloadSymbols } = await import("../bot/commands/watch.js");
  assert.deepEqual(payloadSymbols("w-NVDAx-TSLAx"), ["NVDAx", "TSLAx"]);
  assert.deepEqual(payloadSymbols("w-nvdax-NOPE-nvdax"), ["NVDAx"]);
  assert.deepEqual(payloadSymbols("brief"), []);
  assert.equal(payloadSymbols("w-NVDAx-TSLAx-AAPLx-SPYx-QQQx-MSFTx-GOOGLx-AMZNx-METAx").length, 8);
});

test("the portfolio's bag link carries one valid public address", async () => {
  const { payloadWallet } = await import("../bot/commands/portfolio.js");
  const wallet = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
  assert.equal(payloadWallet(`p-${wallet}`), wallet);
  assert.ok(`p-${wallet}`.length <= 64);
  assert.equal(payloadWallet("p-0OIl"), null);
  assert.equal(payloadWallet("p-1"), null);
  assert.equal(payloadWallet(wallet), null);
  assert.equal(payloadWallet("w-NVDAx"), null);
  const { bagWatchText } = await import("./messages.js");
  assert.ok(bagWatchText("note").endsWith("\n\nnote"));
});

test("/week reads the site's ranking and lists the closest and furthest names", async () => {
  const { parseRanking } = await import("./ranking.js");
  const { weekText } = await import("./messages.js");
  const { inWeekWindow } = await import("./verdict.js");
  const row = (symbol: string, near: number, typicalGap: number) => ({ symbol, readings: 10, near, typicalGap, lastGap: 0.1 });

  const parsed = parseRanking({ rows: [row("AAPLx", 1, 0.08), { ...row("<b>", 1, 0), symbol: "<b>" }, { symbol: "NVDAx" }], readings: 10 });
  assert.deepEqual(
    parsed?.rows.map((r) => r.symbol),
    ["AAPLx"],
  );
  assert.equal(parseRanking({ nope: true }), null);

  assert.match(weekText(null), /could not be read/);
  assert.match(weekText({ rows: [], readings: 0 }), /starts after about two hours/);
  const seven = ["AAPLx", "NVDAx", "SPYx", "QQQx", "MSFTx", "TSLAx", "AMDx"].map((symbol, i) => row(symbol, 1 - i * 0.1, 0.05 + i * 0.2));
  const text = weekText({ rows: seven, readings: 10 });
  assert.ok(text.includes("1. <b>AAPLx</b> · 100% near · typical gap 0.05%"), text);
  assert.ok(text.includes("🔴 <b>Furthest</b>\n1. <b>AMDx</b> · 40% near · typical gap 1.25%\n2. <b>TSLAx</b>"), text);
  assert.ok(!text.includes("3. <b>MSFTx</b> · 60%"), "a name is never in both lists");

  assert.equal(inWeekWindow(Date.parse("2026-10-16T20:20:00Z")), true); // Friday 16:20 ET
  assert.equal(inWeekWindow(Date.parse("2026-10-16T20:00:00Z")), false); // Friday 16:00 ET, still the close
  assert.equal(inWeekWindow(Date.parse("2026-10-15T20:20:00Z")), false); // Thursday
});

test("two tokens of one company: a plain ticker keeps meaning the xStock, Backpack's naming picks Backpack's", async () => {
  const { lookupToken, siblingTokens } = await import("../config/tokens.js");
  const { payloadSymbols } = await import("../bot/commands/watch.js");
  const { otherTokensLine } = await import("./messages.js");
  assert.equal(lookupToken("amd")?.symbol, "AMDx");
  assert.equal(lookupToken("amdx")?.symbol, "AMDx");
  assert.equal(lookupToken("amd.us")?.symbol, "AMD");
  assert.equal(lookupToken("spcx")?.symbol, "SPCXx");
  assert.equal(lookupToken("spacex")?.symbol, "SPCXx");
  assert.equal(lookupToken("spcx.us")?.symbol, "SPCX");
  assert.equal(lookupToken("mu")?.symbol, "MU");
  assert.equal(lookupToken("micron")?.symbol, "MU");
  assert.equal(lookupToken("nvda.us"), null);
  assert.deepEqual(payloadSymbols("w-AMD-AMDx-MU"), ["AMD", "AMDx", "MU"]);
  const amdx = lookupToken("amdx");
  assert.deepEqual(
    amdx ? siblingTokens(amdx).map((t) => t.symbol) : [],
    ["AMD"],
  );
  assert.equal(otherTokensLine("AMDx"), "🔁 Also on Solana: <b>AMD</b> (Backpack). Send <code>amd.us</code> to compare.");
  assert.equal(otherTokensLine("AMD"), "🔁 Also on Solana: <b>AMDx</b> (xStocks). Send <code>amdx</code> to compare.");
  assert.equal(otherTokensLine("MU"), null);
});

test("a pool too thin for a $1,000 buy says so instead of loading forever", () => {
  const nflx = quote({ symbol: "NFLXx", name: "Netflix", underlying: "NFLX", usdPrice: 69.7, stockPrice: 70, poolUsd: 4_432 });
  assert.ok(cardText(nflx, tradeVerdict(nflx)).includes("🛒 The pool holds about $4,432, too thin to quote a $1,000 buy"));
  const spy = quote({});
  assert.ok(cardText(spy, tradeVerdict(spy)).includes("🛒 The $1,000 buy is still loading"));
});

test("wallet proof: the bot checks the signature itself, for its own code only", async () => {
  const { generateKeyPairSync, sign } = await import("node:crypto");
  const { PublicKey } = await import("@solana/web3.js");
  const proof = await import("./walletProof.js");
  const site = await import("../../site/src/lib/walletProof.js");

  const nonce = proof.newNonce();
  assert.ok(proof.isNonce(nonce));
  assert.notEqual(proof.newNonce(), nonce);
  // The bot and the site must build the very same text, or no signature would ever match.
  assert.equal(proof.proofMessage(nonce), site.proofMessage(nonce));

  const keys = () => {
    const pair = generateKeyPairSync("ed25519");
    const address = new PublicKey(pair.publicKey.export({ format: "der", type: "spki" }).subarray(-32)).toBase58();
    return { address, sign: (text: string) => sign(null, Buffer.from(text, "utf8"), pair.privateKey).toString("base64") };
  };
  const owner = keys();
  const message = proof.proofMessage(nonce);
  const signature = owner.sign(message);
  assert.ok(proof.verifyProof(owner.address, signature, message));
  assert.ok(!proof.verifyProof(keys().address, signature, message), "someone else's wallet");
  assert.ok(!proof.verifyProof(owner.address, signature, proof.proofMessage(proof.newNonce())), "another code");
  assert.ok(!proof.verifyProof(owner.address, signature.slice(0, 20), message), "cut short");
  assert.ok(!proof.verifyProof("nope", signature, message));
  // The bot checks a code against the site's message now (onpar.site) and under its earlier address, nothing else.
  assert.ok(message.startsWith("onpar.site wants you to link this wallet"));
  assert.ok(proof.verifyCodeProof(owner.address, signature, nonce));
  assert.ok(proof.verifyCodeProof(owner.address, owner.sign(proof.proofMessage(nonce, "xstocks-tracker.netlify.app")), nonce), "signed before the move");
  assert.ok(!proof.verifyCodeProof(owner.address, owner.sign(proof.proofMessage(nonce, "evil.example")), nonce), "another site's message");
  assert.ok(!proof.verifyCodeProof(owner.address, signature, proof.newNonce()), "another code");

  const now = 1_000_000_000;
  assert.ok(proof.proofFresh(now - 14 * 60_000, now));
  assert.ok(!proof.proofFresh(now - 16 * 60_000, now), "expired after 15 minutes");
  assert.ok(!proof.proofFresh(now + 60_000, now), "never from the future");

  const { holderWallet } = await import("./holder.js");
  assert.equal(holderWallet({ verified_wallet: null }), "", "a typed address is not a holder wallet");
  assert.equal(holderWallet({ verified_wallet: owner.address }), owner.address);
});

test("two tokens of one company: the cheaper $1,000 buy, thin pools named, a ping only past 0.5 points", async () => {
  const { companyPairs, pairsToPing, PAIR_POINTS } = await import("./pairs.js");
  const { pairsText, pairAlertText } = await import("./messages.js");
  const at = 1_800_000_000_000;
  const leg = (symbol: string, name: string, underlying: string, issuer: "xStocks" | "Backpack", buyPrice: number | null, poolUsd: number) =>
    quote({ symbol, name, underlying, issuer, mint: `${symbol}-mint`, stockPrice: 146, buyPrice, buyAt: buyPrice == null ? null : at - 10_000, poolUsd });
  const quotes = [
    leg("SPCXx", "SpaceX", "SPCX", "xStocks", 146.1, 2_600_000),
    leg("SPCX", "SpaceX", "SPCX", "Backpack", 145.2, 2_300_000),
    leg("AMDx", "AMD", "AMD", "xStocks", null, 14_170),
    leg("AMD", "AMD", "AMD", "Backpack", 529, 186_000),
    leg("MU", "Micron", "MU", "Backpack", 875, 1_257_000),
  ];
  const pairs = companyPairs(quotes, at);
  assert.deepEqual(
    pairs.map((p) => p.underlying),
    ["SPCX", "AMD"],
  );
  const spacex = pairs[0];
  assert.equal(spacex.cheaper?.quote.symbol, "SPCX");
  assert.ok(Math.abs((spacex.points ?? 0) - ((146.1 - 145.2) / 146) * 100) < 1e-9);
  assert.equal(pairs[1].cheaper, null);
  assert.equal(pairs[1].onlyDeep?.quote.symbol, "AMD");
  assert.deepEqual(
    pairsToPing(pairs).map((p) => p.underlying),
    ["SPCX"],
  );
  assert.equal(PAIR_POINTS, 0.5);
  // A buy older than 90 s does not count, so nothing is called cheaper on stale numbers.
  assert.equal(companyPairs(quotes, at + 120_000)[0].cheaper, null);

  const text = pairsText(pairs);
  assert.ok(text.includes("• SPCX (Backpack): $1,000 buy <b>$145.20</b> · -0.55% cheap"), text);
  assert.ok(text.includes("→ <b>SPCX</b> is 0.62 points cheaper right now."), text);
  assert.ok(text.includes("• AMDx (xStocks): the pool holds about $14,170, too thin to quote $1,000"), text);
  assert.ok(text.includes("→ Only <b>AMD</b> has a pool deep enough for a $1,000 buy."), text);
  assert.equal(
    pairAlertText(spacex),
    "🔁 <b>SpaceX: SPCX is 0.62 points cheaper</b>\n$1,000 buy SPCX $145.20 (-0.55% cheap) · SPCXx $146.10 (+0.07% rich)\nSame company, two tokens, two pools. Prices move: check before you buy.",
  );
});

test("a size alert fires only while Nasdaq is open and the order is at most 0.4% over the print", async () => {
  const { sizeAlertHit, sizeWorthQuoting } = await import("./verdict.js");
  const { sizeAlertText, sizeAlertSetText } = await import("./messages.js");
  assert.equal(sizeAlertHit(0.4, true), true);
  assert.equal(sizeAlertHit(0.41, true), false);
  assert.equal(sizeAlertHit(-0.6, true), true);
  assert.equal(sizeAlertHit(-1.2, true), false, "far under the print is not trusted");
  assert.equal(sizeAlertHit(0.1, false), false, "never while Nasdaq is closed");
  assert.equal(sizeAlertHit(null, true), false);
  assert.equal(sizeWorthQuoting(0.5), false, "a bigger order costs more than an already rich $1,000 buy");
  assert.equal(sizeWorthQuoting(0.2), true);
  assert.equal(sizeWorthQuoting(null), true);

  const result = { ok: true as const, quote: quote({ symbol: "NVDAx", stockPrice: 214.13 }), usd: 5000, shares: 23.3612, price: 214.03, impactPct: 0.035, at: 1 };
  assert.equal(
    sizeAlertText(result),
    "🎯 <b>Your $5,000 NVDAx buy is at the real price</b>\n23.3612 shares at <b>$214.03</b> · Nasdaq $214.13 · gap <b>-0.05% cheap</b>\n🌊 The order moves the pool 0.04%.\n\n<i>A live Jupiter quote, not a fill: prices move. This alert is now off. <code>/sizealert NVDAx 5000</code> sets it again.</i>",
  );
  assert.ok(sizeAlertSetText("MU", 2500).startsWith("🎯 Set: a text when a $2,500 buy of <b>MU</b>"));
});

test("the welcome puts the wallet proof first for someone who has not proven one", async () => {
  const { startKeyboard, startText } = await import("./messages.js");
  const nonce = "0123456789abcdef0123456789abcdef";
  const withProof = startKeyboard(nonce).inline_keyboard;
  const first = withProof[0][0] as { text: string; url?: string };
  assert.equal(first.text, "🔐 Prove my $PAR wallet");
  assert.equal(first.url, `https://onpar.site/verify?n=${nonce}`);
  const without = startKeyboard().inline_keyboard;
  assert.equal(without.length, withProof.length - 1);
  assert.ok(!JSON.stringify(without).includes("/verify"));
  assert.ok(startText("Ana").includes("Prove your $PAR wallet first"));
  assert.ok(startText("Ana").includes("never asks you to sign a transaction"));
});

test("/yield shows the stablecoin's borrow rate and links each name's own Kamino page", async () => {
  const { KAMINO_MARKETS, offersFromRows } = await import("./yield.js");
  const site = await import("../../site/src/server/offers.js");
  assert.deepEqual(KAMINO_MARKETS, site.KAMINO_MARKETS, "the bot and the site read the same markets and stablecoins");
  const { yieldText } = await import("./messages.js");
  const rows = [
    {
      reserve: "7B66Az3tJhAo4bLkX8PzTixQ9ZGyHkkjxfVLhF26sP5q",
      liquidityToken: "NVDAx",
      liquidityTokenMint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
      maxLtv: 0.55,
      borrowApy: 0.0717,
      supplyApy: 0.00022,
      totalSupplyUsd: 2287173,
    },
    { reserve: "97zoywd8mPZsGTg8q1wdD2Wgkdrs2tqusp1Qqcxbyj7E", liquidityToken: "USDC", liquidityTokenMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", borrowApy: 0.066861418243086 },
  ];
  const offers = offersFromRows(rows, KAMINO_MARKETS[0]);
  assert.equal(offers.length, 1);
  assert.equal(offers[0].borrowAsset, "USDC");
  const text = yieldText(offers, "NVDAx");
  assert.ok(text.includes("Lend it: 0.02% a year"), text);
  assert.ok(text.includes("Borrow USDC against it: up to 55% of its value, at 6.69% a year"), text);
  assert.ok(!text.includes("7.17%"), "never the token's own borrow rate");
  assert.ok(
    text.includes('<a href="https://kamino.com/borrow/reserve/5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua/7B66Az3tJhAo4bLkX8PzTixQ9ZGyHkkjxfVLhF26sP5q">open on Kamino</a>'),
  );
});
