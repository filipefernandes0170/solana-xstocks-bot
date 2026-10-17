// Proof that a wallet is yours, for @ONPAR_BOT's holder features: the wallet signs a plain-text message on /verify.
// The bot builds the same text (src/services/walletProof.ts in the repo root; a bot test keeps both equal) and
// checks the signature itself before it trusts a wallet.

export const PROOF_HOST = "xstocks-tracker.netlify.app";
export const PROOF_TTL_MS = 15 * 60_000;
const NONCE = /^[0-9a-f]{32}$/;

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
