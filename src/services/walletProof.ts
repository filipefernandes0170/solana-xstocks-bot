// Proof that a wallet is yours: the holder features count a wallet only after its owner signed a plain-text message
// on the Par site (Wallet Standard "solana:signMessage"). A message is not a transaction: it cannot move funds.
//
// The flow: /hold makes a one-time code for this Telegram user → the site page /verify?n=<code> asks the wallet to
// sign proofMessage(code) and keeps { address, signature } for a few minutes → "Back to Telegram" opens
// ?start=v-<code> → the bot reads the proof from the site and checks the signature itself before trusting it.
// The code belongs to one Telegram user, expires after PROOF_TTL_MS and works once, so an old or copied signature
// is useless to anyone else.

import { createPublicKey, randomBytes, verify } from "node:crypto";
import { PublicKey } from "@solana/web3.js";

export const SITE_HOST = "onpar.site";
/**
 * The site's address before onpar.site. A wallet that signed there (the site was published after the bot moved)
 * is still accepted: it is the same message from the same site, under its earlier name.
 */
const EARLIER_HOSTS = ["xstocks-tracker.netlify.app"];
export const PROOF_TTL_MS = 15 * 60_000;
const NONCE = /^[0-9a-f]{32}$/;
// DER header for an Ed25519 public key (SubjectPublicKeyInfo, OID 1.3.101.112), followed by the 32 raw key bytes.
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/** A fresh one-time code: 128 random bits as 32 hex characters ("v-" + code fits Telegram's start parameter). */
export function newNonce() {
  return randomBytes(16).toString("hex");
}

export function isNonce(value: string) {
  return NONCE.test(value);
}

/** The exact text the wallet signs. The site builds the same text (a test keeps both equal). */
export function proofMessage(nonce: string, host = SITE_HOST) {
  return [
    `${host} wants you to link this wallet to @ONPAR_BOT on Telegram.`,
    "",
    "This is a message, not a transaction. It cannot move funds.",
    "",
    `Code: ${nonce}`,
  ].join("\n");
}

/** True when `signatureBase64` is the Ed25519 signature of `message` by the wallet at `address`. */
export function verifyProof(address: string, signatureBase64: string, message: string) {
  try {
    const key = new PublicKey(address).toBytes();
    if (key.length !== 32) return false;
    const signature = Buffer.from(signatureBase64, "base64");
    if (signature.length !== 64) return false;
    const publicKey = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(key)]), format: "der", type: "spki" });
    return verify(null, Buffer.from(message, "utf8"), publicKey, signature);
  } catch {
    return false;
  }
}

/** True when the wallet at `address` signed this code's message, as the site writes it now or under its earlier address. */
export function verifyCodeProof(address: string, signatureBase64: string, nonce: string) {
  return [SITE_HOST, ...EARLIER_HOSTS].some((host) => verifyProof(address, signatureBase64, proofMessage(nonce, host)));
}

/** Whether a code made at `createdAt` (ms) can still be used at `now`. */
export function proofFresh(createdAt: number, now = Date.now()) {
  return now - createdAt >= 0 && now - createdAt <= PROOF_TTL_MS;
}

export type SiteProof = { address: string; signature: string };

/** Reads what the site kept for this code. Null when there is nothing (not signed yet) or the site cannot be reached. */
export async function fetchSiteProof(nonce: string, timeoutMs = 8000): Promise<SiteProof | null> {
  if (!isNonce(nonce)) return null;
  try {
    const response = await fetch(`https://${SITE_HOST}/api/proof?n=${nonce}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as Partial<SiteProof> | null;
    return typeof body?.address === "string" && typeof body?.signature === "string" ? { address: body.address, signature: body.signature } : null;
  } catch {
    return null;
  }
}
