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
    `xstocks-tracker.netlify.app wants you to link this wallet to @ONPAR_BOT on Telegram.\n\nThis is a message, not a transaction. It cannot move funds.\n\nCode: ${NONCE}`,
  );
  assert.ok(isNonce(NONCE));
  assert.ok(!isNonce("0123456789ABCDEF0123456789ABCDEF"));
  assert.ok(!isNonce(`${NONCE}0`));
  assert.ok(!isNonce(42));
  const payload = new URL(telegramReturnLink(NONCE)).searchParams.get("start") ?? "";
  assert.equal(payload, `v-${NONCE}`);
  assert.ok(payload.length <= 64);
  const [phantom] = walletBrowseLinks("https://xstocks-tracker.netlify.app/verify?n=abc");
  assert.equal(phantom.href, "https://phantom.app/ul/browse/https%3A%2F%2Fxstocks-tracker.netlify.app%2Fverify%3Fn%3Dabc?ref=https%3A%2F%2Fxstocks-tracker.netlify.app");
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
