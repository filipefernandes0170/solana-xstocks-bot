// Proof that a wallet is yours, for @ONPAR_BOT's holder features: the wallet signs a plain-text message on /verify.
// The bot builds the same text (src/services/walletProof.ts in the repo root; a bot test keeps both equal) and
// checks the signature itself before it trusts a wallet.

export const PROOF_HOST = "onpar.site";
export const PROOF_TTL_MS = 15 * 60_000;
const NONCE = /^[0-9a-f]{32}$/;

/**
 * The Ed25519 keys of small order, as hex with the sign bit cleared (the same seven libsodium refuses). They are valid
 * Solana addresses that nobody owns, and a fixed "signature" checks out against them for any message, so a proof for
 * one is never accepted. The bot keeps the same list (src/services/walletProof.ts; a bot test compares them).
 */
const SMALL_ORDER_KEYS = new Set([
  "0000000000000000000000000000000000000000000000000000000000000000",
  "0100000000000000000000000000000000000000000000000000000000000000",
  "26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05",
  "c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a",
  "ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",
  "edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",
  "eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",
]);

/** True for a 32-byte key that no one can own (see SMALL_ORDER_KEYS). */
export function isSmallOrderKey(key: Uint8Array) {
  if (key.length !== 32) return false;
  let hex = "";
  key.forEach((byte, index) => {
    hex += (index === 31 ? byte & 0x7f : byte).toString(16).padStart(2, "0");
  });
  return SMALL_ORDER_KEYS.has(hex);
}

export function isNonce(value: unknown): value is string {
  return typeof value === "string" && NONCE.test(value);
}

/** The exact text the wallet signs. */
export function proofMessage(nonce: string) {
  return [
    `${PROOF_HOST} wants you to link this wallet to @ONPAR_BOT on Telegram.`,
    "",
    "This is a message, not a transaction. It cannot move funds.",
    "",
    `Code: ${nonce}`,
  ].join("\n");
}

/** Back to the bot, which then checks the signature: ?start=v-<code> (34 characters, inside Telegram's 64). */
export function telegramReturnLink(nonce: string) {
  return `https://t.me/ONPAR_BOT?start=v-${nonce}`;
}

/** Opens this page inside Phantom's or Solflare's own browser on a phone, where the wallet can sign. */
export function walletBrowseLinks(pageUrl: string) {
  const url = encodeURIComponent(pageUrl);
  const ref = encodeURIComponent(`https://${PROOF_HOST}`);
  return [
    { name: "Phantom", href: `https://phantom.app/ul/browse/${url}?ref=${ref}` },
    { name: "Solflare", href: `https://solflare.com/ul/v1/browse/${url}?ref=${ref}` },
  ];
}

/** Base64 of bytes, in the browser and on the server. */
export function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
