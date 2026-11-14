// Wallet proof for @ONPAR_BOT: the message, the signature check, and every way a proof must be refused.
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { test } from "node:test";
import { isNonce, proofMessage, telegramReturnLink, toBase64, walletBrowseLinks } from "../src/lib/walletProof";
import { base58Decode, isSolanaAddress } from "../src/server/solana";
import { signatureMatches, submitProof } from "../src/server/walletProof";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(bytes: Uint8Array) {
  let n = BigInt(`0x${Buffer.from(bytes).toString("hex") || "0"}`);
  let out = "";
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    out = `1${out}`;
  }
  return out;
}

/** A real Ed25519 wallet: its Solana address and a signer, like a wallet's signMessage. */
function wallet() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  return { address: base58Encode(raw), sign: (text: string) => toBase64(sign(null, Buffer.from(text, "utf8"), privateKey)) };
}

const NONCE = "0123456789abcdef0123456789abcdef";

test("the message says what it is, and the code is 128 random bits in hex", () => {
  assert.equal(
    proofMessage(NONCE),
    `onpar.site wants you to link this wallet to @ONPAR_BOT on Telegram.\n\nThis is a message, not a transaction. It cannot move funds.\n\nCode: ${NONCE}`,
  );
  assert.ok(isNonce(NONCE));
  assert.ok(!isNonce("0123456789ABCDEF0123456789ABCDEF"));
  assert.ok(!isNonce(`${NONCE}0`));
  assert.ok(!isNonce(42));
  const payload = new URL(telegramReturnLink(NONCE)).searchParams.get("start") ?? "";
  assert.equal(payload, `v-${NONCE}`);
  assert.ok(payload.length <= 64);
  const [phantom] = walletBrowseLinks("https://onpar.site/verify?n=abc");
  assert.equal(phantom.href, "https://phantom.app/ul/browse/https%3A%2F%2Fonpar.site%2Fverify%3Fn%3Dabc?ref=https%3A%2F%2Fonpar.site");
});

test("base58 addresses decode to their 32 bytes", () => {
  assert.deepEqual(base58Decode("11111111111111111111111111111111"), new Uint8Array(32));
  assert.equal(base58Decode("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")?.length, 32);
  assert.equal(base58Decode("0OIl"), null);
  const w = wallet();
  assert.equal(base58Encode(base58Decode(w.address) as Uint8Array), w.address);
  assert.ok(isSolanaAddress(w.address));
  assert.ok(!isSolanaAddress("1"));
});

test("a signature counts only for its own wallet and its own message", () => {
  const owner = wallet();
  const other = wallet();
  const message = proofMessage(NONCE);
  const signature = owner.sign(message);
  assert.ok(signatureMatches(owner.address, signature, message));
  assert.ok(!signatureMatches(other.address, signature, message), "someone else's address");
  assert.ok(!signatureMatches(owner.address, signature, proofMessage("ffffffffffffffffffffffffffffffff")), "another code");
  assert.ok(!signatureMatches(owner.address, owner.sign("Send 100 SOL"), message), "another text");
  assert.ok(!signatureMatches(owner.address, signature.slice(0, 40), message), "cut short");
  assert.ok(!signatureMatches("not-an-address", signature, message));
});

test("the site refuses a proof before storing anything when any part is wrong", async () => {
  const owner = wallet();
  const good = owner.sign(proofMessage(NONCE));
  assert.deepEqual(await submitProof({ nonce: "nope", address: owner.address, signature: good }), {
    ok: false,
    message: "This link is missing its code. Send /hold to @ONPAR_BOT for a new one.",
  });
  assert.equal((await submitProof({ nonce: NONCE, address: "abc", signature: good })).ok, false);
  const forged = await submitProof({ nonce: NONCE, address: wallet().address, signature: good });
  assert.deepEqual(forged, { ok: false, message: "The signature does not match this message. Try again, or use another wallet." });
  assert.equal((await submitProof({ nonce: NONCE, address: owner.address, signature: "short" })).ok, false);
});

// Found in review on 14 Nov 2026: these 14 byte strings are valid Solana addresses that nobody owns (the Ed25519 points
// of small order), and one fixed "signature" passes a plain check against them. Anyone could have "proven" such an
// address after sending it some $PAR.
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

test("an address nobody owns is refused, whatever signature comes with it", async () => {
  const { isSmallOrderKey } = await import("../src/lib/walletProof");
  // 01 followed by 63 zero bytes: the signature anyone can write down.
  const forged = toBase64(Uint8Array.from([1, ...new Array(63).fill(0)]));
  assert.match(forged, /^[A-Za-z0-9+/]{86}==$/, "it has the shape of a real signature");
  for (const hex of SMALL_ORDER) {
    const key = Uint8Array.from(Buffer.from(hex, "hex"));
    const address = base58Encode(key);
    assert.ok(isSmallOrderKey(key), hex);
    assert.ok(isSolanaAddress(address), "a valid address, which is why the rule is needed");
    for (let i = 0; i < 20; i++) {
      const nonce = i.toString(16).padStart(32, "0");
      assert.equal(signatureMatches(address, forged, proofMessage(nonce)), false);
    }
    assert.deepEqual(await submitProof({ nonce: NONCE, address, signature: forged }), {
      ok: false,
      message: "The signature does not match this message. Try again, or use another wallet.",
    });
  }
  const real = wallet();
  assert.equal(isSmallOrderKey(base58Decode(real.address) as Uint8Array), false);
  assert.ok(signatureMatches(real.address, real.sign(proofMessage(NONCE)), proofMessage(NONCE)), "a real wallet still proves");
});

test("an RPC answer is dropped once it passes the size limit, instead of being read whole", async () => {
  const { readJsonCapped } = await import("../src/server/solana");
  const small = new Response(JSON.stringify({ result: { value: [1, 2, 3] } }));
  assert.deepEqual(await readJsonCapped(small, 1000), { result: { value: [1, 2, 3] } });
  // Declared too large: refused before a byte is read.
  const declared = new Response("{}", { headers: { "content-length": "9000000" } });
  await assert.rejects(readJsonCapped(declared, 1000), /too large/);
  // Not declared, and it keeps coming: cut off as soon as the limit is passed.
  let sent = 0;
  const endless = new Response(
    new ReadableStream({
      pull(controller) {
        sent += 1;
        controller.enqueue(new TextEncoder().encode("x".repeat(1000)));
      },
    }),
  );
  await assert.rejects(readJsonCapped(endless, 10_000), /too large/);
  assert.ok(sent <= 13, `stopped after about the limit (${sent} pieces of 1,000 bytes)`);
});
