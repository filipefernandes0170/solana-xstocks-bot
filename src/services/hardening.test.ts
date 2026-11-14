// Launch hardening (14 Nov 2026): each test is one way the bot could have been fooled or taken down, found in review
// four days before $PAR, and the rule that now stops it.
import assert from "node:assert/strict";
import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

process.env.TELEGRAM_BOT_TOKEN ??= "test-token-not-real";
// The database module opens DATABASE_PATH when it loads: a throwaway file, never the bot's own.
process.env.DATABASE_PATH = path.join(mkdtempSync(path.join(tmpdir(), "par-hardening-")), "bot.db");

const { PublicKey } = await import("@solana/web3.js");
const proof = await import("./walletProof.js");
const siteProof = await import("../../site/src/lib/walletProof.js");
const solana = await import("./solana.js");
const parMint = await import("./parMint.js");
const desk = await import("./desk.js");
const messages = await import("./messages.js");
const db = await import("../db/index.js");
const { freshProofCode } = await import("../bot/proof.js");
const { TOKENIZED_STOCKS } = await import("../config/tokens.js");

// The 14 ways to write the 8 Ed25519 points of small order: nobody owns these addresses.
const SMALL_ORDER = [
  "0000000000000000000000000000000000000000000000000000000000000000",
  "0000000000000000000000000000000000000000000000000000000000000080",
  "0100000000000000000000000000000000000000000000000000000000000000",
  "0100000000000000000000000000000000000000000000000000000000000080",
  "26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05",
  "26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc85",
  "c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a",
  "c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac03fa",
  "ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",
  "ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  "edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",
  "edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  "eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",
  "eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
];
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
// The "signature" anyone can write down: 01 followed by 63 zero bytes.
const FORGED = Buffer.concat([Buffer.from([1]), Buffer.alloc(63)]).toString("base64");

test("an address nobody owns can never be proven, though a fixed signature checks out against it", () => {
  let holeIsReal = 0;
  for (const hex of SMALL_ORDER) {
    const key = Buffer.from(hex, "hex");
    const address = new PublicKey(key).toBase58();
    assert.ok(proof.isSmallOrderKey(key), `${hex} is refused by the bot`);
    assert.ok(siteProof.isSmallOrderKey(key), `${hex} is refused by the site`);
    // Without the rule, Node itself accepts the forged signature for these keys (for some or all messages).
    const publicKey = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, key]), format: "der", type: "spki" });
    for (let i = 0; i < 40; i++) {
      const nonce = proof.newNonce();
      if (verify(null, Buffer.from(proof.proofMessage(nonce), "utf8"), publicKey, Buffer.from(FORGED, "base64"))) holeIsReal += 1;
      assert.equal(proof.verifyProof(address, FORGED, proof.proofMessage(nonce)), false);
      assert.equal(proof.verifyCodeProof(address, FORGED, nonce), false);
    }
  }
  assert.ok(holeIsReal > 100, "the forged signature really does pass a plain check, so the rule is needed");

  // A real wallet is not touched by the rule.
  const pair = generateKeyPairSync("ed25519");
  const raw = pair.publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  assert.equal(proof.isSmallOrderKey(raw), false);
  assert.equal(siteProof.isSmallOrderKey(raw), false);
  assert.equal(proof.isSmallOrderKey(Buffer.alloc(31)), false, "not a key at all");
});

test("a wallet counts for one Telegram account: the one that proved it last", () => {
  db.upsertUser(1, "ana", "Ana");
  db.upsertUser(2, "rui", "Rui");
  db.upsertUser(3, "eva", "Eva");
  db.setVerifiedWallet(1, "WalletA");
  db.setVerifiedWallet(3, "WalletB");
  assert.deepEqual(db.releaseVerifiedWallet("WalletA", 2), [1]);
  db.setVerifiedWallet(2, "WalletA");
  assert.equal(db.getUser(1)?.verified_wallet ?? null, null);
  assert.equal(db.getUser(2)?.verified_wallet, "WalletA");
  assert.equal(db.getUser(3)?.verified_wallet, "WalletB", "another wallet is left alone");
  assert.deepEqual(db.releaseVerifiedWallet("WalletA", 2), [], "proving it again on the same account removes nobody");
});

test("proof codes: one per person while it is young, and each button checks its own code", () => {
  const first = freshProofCode(10);
  assert.equal(freshProofCode(10), first, "asked again within five minutes: the same code");
  assert.notEqual(freshProofCode(11), first, "another person gets their own");
  db.markProofUsed(first);
  const second = freshProofCode(10);
  assert.notEqual(second, first, "a used code is never handed out again");
  assert.deepEqual(
    db.recentProofs(10, 0).map((row) => row.nonce),
    [second],
  );

  const keyboard = messages.proofKeyboard(second);
  const data = (keyboard.inline_keyboard[1][0] as { callback_data: string }).callback_data;
  assert.equal(data, `proof:check:${second}`);
  assert.ok(Buffer.byteLength(data) <= 64, "inside Telegram's limit for button data");
  // The pattern the bot listens for: with a code, and the older plain form.
  const pattern = /^proof:check(?::([0-9a-f]{32}))?$/;
  assert.equal(pattern.exec(data)?.[1], second);
  assert.equal(pattern.exec("proof:check")?.[1], undefined);
  assert.equal(pattern.exec("proof:check:xyz"), null);
});

test("a wallet read asks only for the tracked names' own accounts, however much the address owns", () => {
  const wallet = "2NVzrXBBLYeSYdSqvDR71KkMBAtkArp1cMbVBj7FjJ85";
  const slots = solana.walletSlots(wallet);
  assert.equal(slots.length, solana.ADDRESSES_PER_WALLET);
  assert.equal(slots.length, TOKENIZED_STOCKS.length * 2, "one address per name and token program");
  assert.equal(new Set(slots.map((slot) => slot.address)).size, slots.length);
  assert.ok(solana.WALLETS_PER_CALL >= 1 && solana.WALLETS_PER_CALL * solana.ADDRESSES_PER_WALLET <= 100, "inside getMultipleAccounts' limit of 100");
  // Checked on chain on 14 Nov 2026: this wallet's NVDAx sits in this account.
  const nvda = slots.find((slot) => slot.token.symbol === "NVDAx");
  assert.equal(nvda?.address, "Bjkc1Y8smS499GTQ6b5ADb4V7pijfvNToJ5YTQUxcdeJ");
  // A program's address (a pool, a vault) is accepted: it just holds nothing in these accounts.
  assert.equal(solana.walletSlots("6R4r93V5fcMzc13CL2enEepDSYcr4Qx3ptZBDwudTXCo").length, slots.length);
  assert.throws(() => solana.walletSlots("not-an-address"));
});

test("an account counts only when it is this wallet's token account of the expected name, with something in it", () => {
  const wallet = "2NVzrXBBLYeSYdSqvDR71KkMBAtkArp1cMbVBj7FjJ85";
  const slots = solana.walletSlots(wallet);
  const accounts: solana.ParsedTokenAccount[] = slots.map(() => null);
  const account = (mint: string, owner: string, ui: string, raw: string, type = "account"): solana.ParsedTokenAccount => ({
    data: { parsed: { type, info: { mint, owner, tokenAmount: { amount: raw, uiAmountString: ui } } } },
  });
  const index = (symbol: string, nth = 0) => slots.map((slot, i) => (slot.token.symbol === symbol ? i : -1)).filter((i) => i >= 0)[nth];
  const mint = (symbol: string) => TOKENIZED_STOCKS.find((token) => token.symbol === symbol)!.mint;

  accounts[index("NVDAx")] = account(mint("NVDAx"), wallet, "1.5", "150000000");
  accounts[index("NVDAx", 1)] = account(mint("NVDAx"), wallet, "0.5", "50000000");
  accounts[index("TSLAx")] = account(mint("TSLAx"), "SomeoneElse1111111111111111111111111111111", "9", "900000000");
  accounts[index("AAPLx")] = account(mint("TSLAx"), wallet, "9", "900000000");
  accounts[index("SPYx")] = account(mint("SPYx"), wallet, "0", "0");
  accounts[index("QQQx")] = account(mint("QQQx"), wallet, "3", "300000000", "mint");
  accounts[index("MU")] = account(mint("MU"), wallet, "2", "2000000");

  const holdings = solana.holdingsFromAccounts(wallet, slots, accounts);
  assert.deepEqual(
    holdings.map((holding) => [holding.symbol, holding.amount, holding.rawAmount]),
    [
      ["MU", 2, 2000000n],
      ["NVDAx", 2, 200000000n],
    ],
    "both NVDAx accounts add up; another owner's, another mint's, an empty one and a non-account are left out",
  );
  assert.deepEqual(solana.holdingsFromAccounts(wallet, slots, slots.map(() => null)), []);
});

test("the holder check: this wallet's own $PAR account, with at least the minimum in it", () => {
  const mint = new PublicKey("9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump").toBytes();
  const wallet = new PublicKey("A77HErqtfN1hLLpvZ9pCtu66FEtM8BveoaKbbMoZ4RiR").toBytes();
  const other = new PublicKey("2LMWFmbGBfw78ZEas2NFmAYfo4bhyBqYboYh9nk3mDFQ").toBytes();
  const threshold = parMint.holderThreshold(250_000, 6);
  assert.equal(threshold, 250_000_000_000n);
  assert.equal(parMint.holderThreshold(0, 6), 1n, "no minimum: any amount");

  const slice = (m: Uint8Array, owner: Uint8Array, amount: bigint, program = parMint.TOKEN_2022_PROGRAM): parMint.TokenAccountSlice => {
    const data = Buffer.alloc(72);
    Buffer.from(m).copy(data, 0);
    Buffer.from(owner).copy(data, 32);
    data.writeBigUInt64LE(amount, 64);
    return { owner: program, data: [data.toString("base64"), "base64"] };
  };
  assert.equal(parMint.accountHolds(slice(mint, wallet, 250_000_000_000n), mint, wallet, threshold), true, "exactly the minimum");
  assert.equal(parMint.accountHolds(slice(mint, wallet, 639_804_290_800n, parMint.TOKEN_PROGRAM), mint, wallet, threshold), true, "the older token program too");
  assert.equal(parMint.accountHolds(slice(mint, wallet, 249_999_999_999n), mint, wallet, threshold), false, "one unit short");
  assert.equal(parMint.accountHolds(slice(mint, other, 900_000_000_000n), mint, wallet, threshold), false, "someone else now owns that account");
  assert.equal(parMint.accountHolds(slice(other, wallet, 900_000_000_000n), mint, wallet, threshold), false, "another coin");
  assert.equal(parMint.accountHolds(slice(mint, wallet, 900_000_000_000n, "11111111111111111111111111111111"), mint, wallet, threshold), false, "not a token account");
  assert.equal(parMint.accountHolds({ owner: parMint.TOKEN_PROGRAM, data: ["AAAA", "base64"] }, mint, wallet, threshold), false, "too short");
  assert.equal(parMint.accountHolds(null, mint, wallet, threshold), false, "no account: holds nothing");
});

test("the $PAR address is read on chain: a token passes, anything else is named", () => {
  const good = {
    owner: parMint.TOKEN_2022_PROGRAM,
    data: {
      parsed: {
        type: "mint",
        info: {
          decimals: 6,
          supply: "1000000000000000",
          mintAuthority: null,
          freezeAuthority: null,
          extensions: [{ extension: "tokenMetadata", state: { name: "Par", symbol: "PAR" } }],
        },
      },
    },
  };
  const reading = parMint.mintReading(good);
  assert.equal(reading.status, "ok");
  if (reading.status !== "ok") return;
  assert.equal(parMint.supplyTokens(reading), 1_000_000_000);
  assert.deepEqual(parMint.mintWarnings(reading), []);
  const report = parMint.mintReport("MintAddress", reading);
  assert.ok(report.startsWith("✅") && report.includes("Par · PAR") && report.includes("Token-2022 · 6 decimals · supply 1,000,000,000"));

  const risky = parMint.mintReading({ ...good, data: { parsed: { type: "mint", info: { ...good.data.parsed.info, supply: "5000000000000000", mintAuthority: "Someone" } } } });
  assert.equal(risky.status, "ok");
  if (risky.status === "ok") {
    assert.equal(parMint.mintWarnings(risky).length, 2, "more than a billion, and new tokens can still be created");
    assert.ok(parMint.mintReport("MintAddress", risky).startsWith("⚠️"));
  }

  const cases: [Parameters<typeof parMint.mintReading>[0], RegExp][] = [
    [null, /no account/],
    [{ ...good, owner: "11111111111111111111111111111111" }, /not owned by a token program/],
    [{ owner: parMint.TOKEN_PROGRAM, data: { parsed: { type: "account", info: {} } } }, /not a mint/],
    [{ owner: parMint.TOKEN_PROGRAM, data: { parsed: { type: "mint", info: { supply: "1" } } } }, /decimals/],
    [{ owner: parMint.TOKEN_PROGRAM, data: { parsed: { type: "mint", info: { decimals: 6 } } } }, /supply/],
  ];
  for (const [value, reason] of cases) {
    const bad = parMint.mintReading(value);
    assert.equal(bad.status, "bad");
    if (bad.status === "bad") {
      assert.match(bad.reason, reason);
      assert.match(parMint.mintReport("MintAddress", bad), /NOT a token/);
    }
  }
});

test("people's quotes are rationed, so they cannot take the background round's place", () => {
  assert.equal(desk.USER_QUOTES_PER_MIN, 6);
  const limit = desk.rollingLimit(desk.USER_QUOTES_PER_MIN, 60_000);
  const start = 1_000_000;
  for (let i = 0; i < 6; i++) assert.equal(limit.take(start + i * 1000), true, `quote ${i + 1}`);
  assert.equal(limit.take(start + 7000), false, "the seventh in the same minute waits");
  assert.equal(limit.take(start + 59_999), false);
  assert.equal(limit.take(start + 60_000), true, "a minute after the first, one more");
  assert.equal(limit.take(start + 60_500), false);
  // Jupiter allows about 28 requests a minute; the round needs 23 and the price list 2. Six more is the most that fits
  // with the round still finishing inside the 90 s a quote stays usable.
  assert.ok(23 + 2 + desk.USER_QUOTES_PER_MIN <= Math.floor((90_000 / 2100) * 0.75));
});

test("a size check says how old its quote is when it is not from this moment", () => {
  const quote = {
    symbol: "NVDAx",
    name: "NVIDIA",
    issuer: "xStocks" as const,
    mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
    underlying: "NVDA",
    usdPrice: 187.5,
    stockPrice: 186.64,
    marketState: "Open",
    issuerPrice: null,
    issuerAt: null,
    buyPrice: 187.6,
    buyImpactPct: 0.02,
    buyAt: 1_000_000,
    rebase: null,
    change24h: 0,
    sharesPerToken: 1,
    poolUsd: 2_300_000,
  };
  const result = { ok: true as const, quote, usd: 1000, shares: 1000 / 187.6, price: 187.6, impactPct: 0.02, at: 1_000_000 };
  assert.match(messages.sizeText(result, 1_000_000 + 5_000).text, /Live Jupiter quote/);
  assert.match(messages.sizeText(result, 1_000_000 + 47_000).text, /Jupiter quote from 47 s ago/);
});

test("bag notes are remembered for holders only", () => {
  for (const id of [21, 22, 23]) db.upsertUser(id, `user${id}`, "Test");
  db.saveBagState(21, "NVDAx", "fair", 0, { told: "fair", toldAt: 5, toldThin: false });
  db.saveBagState(22, "NVDAx", "wait", 0, { told: "wait", toldAt: 5, toldThin: false });
  db.saveBagState(23, "TSLAx", "near", 0, { told: "near", toldAt: 5, toldThin: false });
  db.clearBagStateExcept([22]);
  assert.equal(db.getBagState(21).length, 0, "a non-holder's memory is dropped");
  assert.equal(db.getBagState(22).length, 1, "a holder's is kept");
  assert.equal(db.getBagState(23).length, 0);
  db.clearBagStateExcept([22]);
  assert.equal(db.getBagState(22).length, 1, "nothing more to drop");
  db.clearBagStateExcept([]);
  assert.equal(db.getBagState(22).length, 0);
});

test("the /portfolio reply no longer says pasted wallets get the holder texts", () => {
  const text = messages.portfolioText(
    "2NVzrXBBLYeSYdSqvDR71KkMBAtkArp1cMbVBj7FjJ85",
    { wallet: "2NVzrXBBLYeSYdSqvDR71KkMBAtkArp1cMbVBj7FjJ85", totalUsd: 0, positions: [], change24hUsd: null, change24hPct: null },
    new Map(),
  );
  assert.match(text, /prove your wallet with \/hold/);
  assert.doesNotMatch(text, /Pings use this wallet/);
});
