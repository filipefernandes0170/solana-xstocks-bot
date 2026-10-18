// The Portfolio page's bag insights: who can freeze the bag (issuer powers added up by value), and "since you last
// looked" (the change since this device's earlier view, split into price moves and balance changes).
import assert from "node:assert/strict";
import { test } from "node:test";
import { bagPowers, issuerLabel, lineMint, mintsToRead, type MintPowers } from "../src/lib/bagPowers";
import {
  LAST_LOOK_KEY,
  LAST_LOOK_MIN_AGE_MS,
  LAST_LOOK_SAVE_EVERY_MS,
  agoWords,
  forgetLastLook,
  lookChange,
  readLastLook,
  saveLastLook,
  shouldSave,
  snapshotOf,
} from "../src/lib/lastLook";
import { ISSUER_LABEL, TOKENS, USDC_MINT, USDT_MINT } from "../src/lib/tokens";
import type { PortfolioLine } from "../src/lib/types";
import { MAX_MINTS, cleanMints, mintPowers } from "../src/server/powers";

const JUP = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
const UNKNOWN = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const X = TOKENS.find((token) => token.issuer === "xStocks")!;
const X2 = TOKENS.find((token) => token.issuer === "xStocks" && token.symbol !== X.symbol)!;

const line = (over: Partial<PortfolioLine>): PortfolioLine => ({
  symbol: "TKN",
  name: "Token",
  kind: "Crypto",
  sector: "Crypto",
  country: "Not a country",
  currency: "Other",
  underlying: "",
  amount: 1,
  usdValue: 1,
  change24h: null,
  ...over,
});
const stock = (token: (typeof TOKENS)[number], usdValue: number, amount = 1) =>
  line({ symbol: token.symbol, kind: "Stock", underlying: token.underlying, sector: token.sector, amount, usdValue });
const sol = (usdValue: number, amount = 1) => line({ symbol: "SOL", underlying: "SOL", currency: "SOL", amount, usdValue });
const cash = (symbol: "USDC" | "USDT", usdValue: number) => line({ symbol, kind: "Cash", underlying: symbol, amount: usdValue, usdValue });
const other = (mint: string, usdValue: number, amount = 1) => line({ symbol: mint.slice(0, 4), underlying: mint, amount, usdValue });
const powers = (mint: string, on: MintPowers["on"], pausedNow = false, read = true): MintPowers => ({ mint, read, on, pausedNow });

test("each wallet line maps to its mint, and native SOL to none", () => {
  assert.equal(lineMint(stock(X, 100)), X.mint);
  assert.equal(lineMint(cash("USDC", 5)), USDC_MINT);
  assert.equal(lineMint(cash("USDT", 5)), USDT_MINT);
  assert.equal(lineMint(sol(10)), null);
  assert.equal(lineMint(other(JUP, 3)), JUP);
  assert.equal(lineMint(line({ underlying: "not a mint" })), null);
  // Wrapped SOL is a token with a mint, not native SOL.
  assert.equal(lineMint(other("So11111111111111111111111111111111111111112", 1)), "So11111111111111111111111111111111111111112");
});

test("each wallet line is put under its issuer", () => {
  assert.equal(issuerLabel(stock(X, 1)), ISSUER_LABEL.xStocks);
  const backpack = TOKENS.find((token) => token.issuer === "Backpack");
  if (backpack) assert.equal(issuerLabel(stock(backpack, 1)), ISSUER_LABEL.Backpack);
  assert.equal(issuerLabel(cash("USDC", 1)), "Circle (USDC)");
  assert.equal(issuerLabel(cash("USDT", 1)), "Tether (USDT)");
  assert.equal(issuerLabel(sol(1)), "No issuer (SOL)");
  assert.equal(issuerLabel(other(JUP, 1)), "Other tokens");
});

test("the bag's value is added up by what its issuers can do", () => {
  const ALL: MintPowers["on"] = ["seize", "freeze", "pause", "hook", "multiplier", "mint"];
  const lines = [
    stock(X, 600),
    stock(X2, 400),
    cash("USDC", 300),
    sol(200),
    other(JUP, 50),
    other(BONK, 30),
    other(UNKNOWN, 20),
    other(JUP.replace("J", "K"), 0),
  ];
  const summary = bagPowers(lines, [
    powers(X.mint, ALL),
    powers(X2.mint, ALL, true),
    powers(USDC_MINT, ["freeze", "mint"]),
    powers(JUP, []),
    powers(BONK, ["mint"]),
    powers(UNKNOWN, [], false, false),
  ]);
  assert.equal(summary.total, 1600);
  assert.equal(summary.stoppable, 1300);
  assert.equal(summary.seizable, 1000);
  // SOL, and the two tokens whose issuers can neither stop nor move them (creating new tokens does neither).
  assert.equal(summary.untouchable, 280);
  assert.equal(summary.unread, 20);
  assert.deepEqual(summary.pausedNow, [X2.symbol]);
  assert.deepEqual(
    summary.groups.map((group) => [group.label, group.usd, group.powers, group.mixed]),
    [
      [ISSUER_LABEL.xStocks, 1000, ALL, false],
      ["Circle (USDC)", 300, ["freeze", "mint"], false],
      ["No issuer (SOL)", 200, [], false],
      ["Other tokens", 80, ["mint"], true],
    ],
  );
  assert.deepEqual(summary.groups[0].symbols, [X.symbol, X2.symbol]);
});

test("a token whose mint was not read is never counted as safe", () => {
  const summary = bagPowers([other(JUP, 10), stock(X, 5)], []);
  assert.equal(summary.unread, 15);
  assert.equal(summary.untouchable, 0);
  assert.equal(summary.stoppable, 0);
  assert.deepEqual(summary.groups, []);
});

test("an empty or worthless bag adds up to nothing", () => {
  const summary = bagPowers([other(JUP, 0), other(BONK, Number.NaN)], [powers(JUP, ["freeze"])]);
  assert.equal(summary.total, 0);
  assert.deepEqual(summary.groups, []);
});

test("the mints to read come once each, largest line first, without native SOL, capped", () => {
  const lines = [other(JUP, 5), stock(X, 50), sol(500), cash("USDC", 20), other(JUP, 1), line({ underlying: "nope", usdValue: 99 })];
  assert.deepEqual(mintsToRead(lines), [X.mint, USDC_MINT, JUP]);
  assert.deepEqual(mintsToRead(lines, 2), [X.mint, USDC_MINT]);
});

test("the server reads only well-formed mints, once each, at most forty", () => {
  assert.deepEqual(cleanMints(undefined), []);
  assert.deepEqual(cleanMints("JUP"), []);
  assert.deepEqual(cleanMints([JUP, 42, null, "0OIl", JUP, BONK, `${JUP} `]), [JUP, BONK]);
  const many = TOKENS.map((token) => token.mint).concat([USDC_MINT, USDT_MINT, JUP, BONK, UNKNOWN]);
  const fifty = [...many, ...many].slice(0, 50);
  const cleaned = cleanMints(fifty.concat(Array.from({ length: 30 }, (_, i) => `${"1".repeat(31)}${"ABCDEFGHJKLMNPQRSTUVWXYZabcdef"[i]}`)));
  assert.equal(cleaned.length, MAX_MINTS);
  assert.equal(new Set(cleaned).size, cleaned.length);
});

test("a mint account is read into the powers it carries", () => {
  const parsed = (info: object, type = "mint") => ({ data: { parsed: { type, info } } });
  assert.deepEqual(mintPowers(JUP, null), { mint: JUP, read: false, on: [], pausedNow: false });
  assert.deepEqual(mintPowers(JUP, parsed({}, "account")), { mint: JUP, read: false, on: [], pausedNow: false });
  assert.deepEqual(mintPowers(JUP, parsed({ mintAuthority: null, freezeAuthority: null })), { mint: JUP, read: true, on: [], pausedNow: false });
  const full = mintPowers(
    X.mint,
    parsed({
      mintAuthority: UNKNOWN,
      freezeAuthority: UNKNOWN,
      extensions: [
        { extension: "permanentDelegate", state: { delegate: UNKNOWN } },
        { extension: "pausableConfig", state: { authority: UNKNOWN, paused: true } },
        { extension: "transferHook", state: { authority: UNKNOWN, programId: null } },
        { extension: "scaledUiAmountConfig", state: { authority: UNKNOWN } },
        { extension: "defaultAccountState", state: { accountState: "frozen" } },
      ],
    }),
  );
  assert.deepEqual(full, { mint: X.mint, read: true, on: ["seize", "freeze", "pause", "hook", "multiplier", "mint", "frozenStart"], pausedNow: true });
  const unpaused = mintPowers(X.mint, parsed({ extensions: [{ extension: "pausableConfig", state: { authority: UNKNOWN, paused: false } }] }));
  assert.deepEqual(unpaused.on, ["pause"]);
  assert.equal(unpaused.pausedNow, false);
});

const T0 = 1_792_300_000_000;

test("a snapshot keeps each priced position once, and its total", () => {
  const snap = snapshotOf([stock(X, 300, 2), sol(100, 0.5), other(JUP, 0, 0), other(BONK, Number.NaN, 3)], T0);
  assert.equal(snap.at, T0);
  assert.equal(snap.total, 400);
  assert.deepEqual(Object.values(snap.lines), [
    { symbol: X.symbol, amount: 2, price: 150 },
    { symbol: "SOL", amount: 0.5, price: 200 },
  ]);
});

test("price moves and balance changes are told apart", () => {
  const then = snapshotOf([stock(X, 300, 2), sol(100, 0.5), other(JUP, 10, 10)], T0);
  // X up $10 a share, 1 more share bought; SOL unchanged; JUP sold; BONK added.
  const now = snapshotOf([stock(X, 480, 3), sol(100, 0.5), other(BONK, 25, 1000)], T0 + 3 * 3_600_000);
  const change = lookChange(then, now);
  assert.equal(change.ageMs, 3 * 3_600_000);
  assert.equal(change.priceMove, 20);
  assert.equal(change.balanceMove, 160 - 10 + 25);
  assert.equal(change.priceMove + change.balanceMove, change.totalNow - change.totalThen);
  assert.equal(change.pricePct, (20 / 410) * 100);
  assert.deepEqual(change.leaders, [{ symbol: X.symbol, move: 20 }]);
});

test("a deposit alone shows no price move, and a rebase shows as a balance change", () => {
  const then = snapshotOf([stock(X, 100, 1)], T0);
  const deposit = lookChange(then, snapshotOf([stock(X, 100, 1), cash("USDC", 500)], T0 + 60 * 60_000));
  assert.equal(deposit.priceMove, 0);
  assert.equal(deposit.balanceMove, 500);
  const rebase = lookChange(then, snapshotOf([stock(X, 101, 1.01)], T0 + 60 * 60_000));
  assert.ok(Math.abs(rebase.priceMove) < 1e-9);
  assert.ok(Math.abs(rebase.balanceMove - 1) < 1e-9);
});

test("price moves plus balance changes always add up to the change in value", () => {
  let seed = 7;
  const random = () => {
    seed = (seed * 16_807) % 2_147_483_647;
    return seed / 2_147_483_647;
  };
  const mints = [JUP, BONK, UNKNOWN, X.mint, X2.mint];
  const bag = () =>
    mints.flatMap((mint) => {
      if (random() < 0.3) return [];
      const amount = random() * 1000;
      return [other(mint, amount * random() * 50, amount)];
    });
  for (let i = 0; i < 500; i++) {
    const change = lookChange(snapshotOf(bag(), T0), snapshotOf(bag(), T0 + 3_600_000));
    assert.ok(Math.abs(change.priceMove + change.balanceMove - (change.totalNow - change.totalThen)) < 1e-6, `case ${i}`);
    assert.ok(change.leaders.length <= 2);
  }
});

test("leaders are the two largest price moves, either way", () => {
  const then = snapshotOf([other(JUP, 100, 1), other(BONK, 100, 1), other(UNKNOWN, 100, 1)], T0);
  const now = snapshotOf([other(JUP, 105, 1), other(BONK, 70, 1), other(UNKNOWN, 100.004, 1)], T0 + 3_600_000);
  assert.deepEqual(
    lookChange(then, now).leaders.map((leader) => leader.symbol),
    [BONK.slice(0, 4), JUP.slice(0, 4)],
  );
});

test("an earlier view counts from ten minutes, and is replaced at most once an hour", () => {
  assert.equal(LAST_LOOK_MIN_AGE_MS, 10 * 60_000);
  const snap = snapshotOf([sol(1)], T0);
  assert.equal(shouldSave(null, T0), true);
  assert.equal(shouldSave(snap, T0 + LAST_LOOK_SAVE_EVERY_MS - 1), false);
  assert.equal(shouldSave(snap, T0 + LAST_LOOK_SAVE_EVERY_MS), true);
});

test("how long ago reads in minutes, hours, then days", () => {
  assert.equal(agoWords(0), "1 minute ago");
  assert.equal(agoWords(25 * 60_000), "25 minutes ago");
  assert.equal(agoWords(59.6 * 60_000), "1 hour ago");
  assert.equal(agoWords(3 * 3_600_000), "3 hours ago");
  assert.equal(agoWords(47 * 3_600_000), "47 hours ago");
  assert.equal(agoWords(48 * 3_600_000), "2 days ago");
  assert.equal(agoWords(9 * 86_400_000), "9 days ago");
});

function withStorage(run: (store: Map<string, string>) => void, broken = false) {
  const store = new Map<string, string>();
  const fake = {
    getItem: (key: string) => {
      if (broken) throw new Error("denied");
      return store.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (broken) throw new Error("denied");
      store.set(key, String(value));
    },
  };
  const before = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { value: fake, configurable: true, writable: true });
  try {
    run(store);
  } finally {
    if (before) Object.defineProperty(globalThis, "localStorage", before);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
}

test("the earlier view is kept per wallet on this device, five wallets at most", () => {
  withStorage((store) => {
    assert.equal(readLastLook("a"), null);
    for (let i = 0; i < 6; i++) saveLastLook(`w${i}`, snapshotOf([sol(10 + i)], T0 + i));
    assert.equal(readLastLook("w0"), null);
    assert.equal(readLastLook("w5")?.total, 15);
    assert.equal(Object.keys(JSON.parse(store.get(LAST_LOOK_KEY)!)).length, 5);
    forgetLastLook("w5");
    assert.equal(readLastLook("w5"), null);
    assert.equal(readLastLook("w4")?.total, 14);
  });
});

test("a damaged or refused store is ignored", () => {
  withStorage((store) => {
    store.set(LAST_LOOK_KEY, "{not json");
    assert.equal(readLastLook("a"), null);
    store.set(LAST_LOOK_KEY, JSON.stringify({ a: { at: "x", total: 1, lines: {} }, b: { at: T0, total: 2, lines: { k: { symbol: "S", amount: "1", price: 1 } } } }));
    assert.equal(readLastLook("a"), null);
    assert.equal(readLastLook("b"), null);
    saveLastLook("c", snapshotOf([sol(3)], T0));
    assert.equal(readLastLook("c")?.total, 3);
  });
  withStorage(() => {
    assert.equal(readLastLook("a"), null);
    assert.doesNotThrow(() => saveLastLook("a", snapshotOf([sol(1)], T0)));
    assert.doesNotThrow(() => forgetLastLook("a"));
  }, true);
});
