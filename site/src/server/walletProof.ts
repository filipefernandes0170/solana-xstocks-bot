// Wallet proofs for @ONPAR_BOT: checks a signed message and keeps it for a few minutes so the bot can read it.
// Server-only. Nothing here can move funds: a message signature is not a transaction.

// A namespace import: nothing in node:crypto is touched until a signature is checked, so the module also loads in
// the dev server's browser build (production strips it from the browser entirely).
import * as nodeCrypto from "node:crypto";
import { getStore } from "@netlify/blobs";
import { PROOF_TTL_MS, isNonce, isSmallOrderKey, proofMessage } from "../lib/walletProof";
import { base58Decode, isSolanaAddress, logMessage } from "./solana";

const STORE = "wallet-proofs";
// DER header for an Ed25519 public key (SubjectPublicKeyInfo, OID 1.3.101.112), followed by the 32 raw key bytes.
const ED25519_SPKI_PREFIX = "302a300506032b6570032100";

export type StoredProof = { address: string; signature: string; at: number };
export type ProofResult = { ok: true } | { ok: false; message: string };

/** True when `signatureBase64` is the Ed25519 signature of `message` by the wallet at `address`. */
export function signatureMatches(address: string, signatureBase64: string, message: string) {
  try {
    const key = base58Decode(address);
    // A key of small order is nobody's wallet, and a fixed signature passes for it (lib/walletProof.ts).
    if (!key || key.length !== 32 || isSmallOrderKey(key)) return false;
    const signature = Buffer.from(signatureBase64, "base64");
    if (signature.length !== 64) return false;
    const publicKey = nodeCrypto.createPublicKey({ key: Buffer.concat([Buffer.from(ED25519_SPKI_PREFIX, "hex"), Buffer.from(key)]), format: "der", type: "spki" });
    return nodeCrypto.verify(null, Buffer.from(message, "utf8"), publicKey, signature);
  } catch {
    return false;
  }
}

/** Checks what the browser sends and, if the signature is right, keeps it under the code. */
export async function submitProof(input: { nonce: string; address: string; signature: string }): Promise<ProofResult> {
  if (!isNonce(input.nonce)) return { ok: false, message: "This link is missing its code. Send /hold to @ONPAR_BOT for a new one." };
  if (!isSolanaAddress(input.address)) return { ok: false, message: "That wallet address is not valid." };
  if (!/^[A-Za-z0-9+/]{86}==$/.test(input.signature) || !signatureMatches(input.address, input.signature, proofMessage(input.nonce))) {
    return { ok: false, message: "The signature does not match this message. Try again, or use another wallet." };
  }
  try {
    const proof: StoredProof = { address: input.address, signature: input.signature, at: Date.now() };
    await getStore(STORE).setJSON(`n/${input.nonce}`, proof);
    return { ok: true };
  } catch (error) {
    console.warn(`[par] Wallet proof: ${logMessage(error)}`);
    return { ok: false, message: "The proof could not be saved. Try again in a minute." };
  }
}

/** What was signed for a code, while it is fresh. Null otherwise. */
export async function readProof(nonce: string, now = Date.now()): Promise<StoredProof | null> {
  if (!isNonce(nonce)) return null;
  try {
    const proof = (await getStore(STORE).get(`n/${nonce}`, { type: "json" })) as StoredProof | null;
    if (!proof || typeof proof.address !== "string" || typeof proof.signature !== "string" || typeof proof.at !== "number") return null;
    return now - proof.at <= PROOF_TTL_MS ? proof : null;
  } catch (error) {
    console.warn(`[par] Wallet proof read: ${logMessage(error)}`);
    return null;
  }
}
