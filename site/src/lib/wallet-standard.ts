// Minimal Wallet Standard discovery for Solana wallets (Phantom, Solflare, Backpack, …).
// Par reads the public address. The one signature it ever asks for is the plain-text message on /verify, which
// proves a wallet is yours to @ONPAR_BOT. It never asks a wallet to sign or send a transaction.

export const SOLANA_MAINNET = "solana:mainnet";
const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const ICON = /^data:image\/(?:png|webp|gif|jpeg|jpg|svg\+xml);base64,[a-z0-9+/=\s]+$/i;
const MAX_WALLETS = 12;
const MAX_ACCOUNTS = 8;
const PREFERRED = ["Phantom", "Solflare", "Backpack", "MetaMask", "Glow", "Coinbase", "Trust", "OKX"];

export type StandardAccount = { address: string; publicKey?: Uint8Array; chains?: readonly string[] };
export type StandardWallet = {
  name: string;
  icon?: string;
  chains: readonly string[];
  features: Record<string, unknown> & {
    "standard:connect"?: { connect: () => Promise<{ accounts?: readonly StandardAccount[] }> };
    "standard:disconnect"?: { disconnect: () => Promise<void> };
    "solana:signMessage"?: {
      signMessage: (...inputs: { account: StandardAccount; message: Uint8Array }[]) => Promise<readonly { signedMessage: Uint8Array; signature: Uint8Array }[]>;
    };
  };
};

const registered = new Set<StandardWallet>();
const listeners = new Set<() => void>();
let started = false;

class AppReadyEvent extends Event {
  #detail: { register: (...wallets: StandardWallet[]) => () => void };
  get detail() {
    return this.#detail;
  }
  constructor(api: { register: (...wallets: StandardWallet[]) => () => void }) {
    super("wallet-standard:app-ready");
    this.#detail = api;
  }
}

function notify() {
  for (const listener of listeners) listener();
}

function register(...wallets: StandardWallet[]) {
  const added = wallets.filter((wallet) => wallet && !registered.has(wallet));
  if (added.length === 0 || registered.size >= MAX_WALLETS) return () => undefined;
  for (const wallet of added) {
    if (registered.size >= MAX_WALLETS) break;
    registered.add(wallet);
  }
  notify();
  return () => {
    for (const wallet of added) registered.delete(wallet);
    notify();
  };
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  const api = Object.freeze({ register });
  window.addEventListener("wallet-standard:register-wallet", (event) => {
    const callback = (event as CustomEvent).detail;
    if (typeof callback === "function") {
      try {
        callback(api);
      } catch {
        // A broken wallet extension must not break the page.
      }
    }
  });
  window.dispatchEvent(new AppReadyEvent(api));
}

export function onWalletsChange(listener: () => void) {
  listeners.add(listener);
  start();
  listener();
  return () => {
    listeners.delete(listener);
  };
}

/** Wallet name with control and invisible characters removed; null if empty or longer than 40. */
export function cleanName(name: string) {
  const cleaned = name.replace(/[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩]/g, "").trim();
  return !cleaned || cleaned.length > 40 ? null : cleaned;
}

function validAccount(account: StandardAccount) {
  if (!account?.chains?.includes(SOLANA_MAINNET)) return false;
  if (account.publicKey && account.publicKey.length !== 32) return false;
  return ADDRESS.test(account.address);
}

function validWallet(wallet: StandardWallet) {
  return (
    !!wallet &&
    Array.isArray(wallet.chains) &&
    wallet.chains.includes(SOLANA_MAINNET) &&
    typeof wallet.features?.["standard:connect"]?.connect === "function" &&
    typeof wallet.name === "string" &&
    cleanName(wallet.name) !== null
  );
}

/** Solana wallets, best-known first, then by name. */
export function solanaWallets() {
  return [...registered].filter(validWallet).sort((a, b) => {
    const nameA = cleanName(a.name) ?? a.name;
    const nameB = cleanName(b.name) ?? b.name;
    const rankA = PREFERRED.indexOf(nameA);
    const rankB = PREFERRED.indexOf(nameB);
    return rankA !== -1 || rankB !== -1 ? (rankA === -1 ? 99 : rankA) - (rankB === -1 ? 99 : rankB) : nameA.localeCompare(nameB);
  });
}

/** Only small inline images are shown as wallet icons. */
export function safeIcon(icon: string | undefined) {
  return !icon || icon.length > 100_000 ? null : ICON.test(icon) ? icon : null;
}

export function connectError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /reject|cancel|denied|closed/i.test(message) ? "Connection cancelled." : "The wallet did not connect.";
}

function withTimeout<T>(ms: number, promise: Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Asks the wallet for its mainnet accounts (up to 8). No signing. */
export async function connectAccounts(wallet: StandardWallet) {
  const feature = wallet.features["standard:connect"];
  if (typeof feature?.connect !== "function") throw new Error("unavailable");
  const result = await withTimeout(15_000, feature.connect());
  const seen = new Set<string>();
  const accounts: StandardAccount[] = [];
  for (const account of result?.accounts ?? []) {
    if (accounts.length >= MAX_ACCOUNTS) break;
    if (validAccount(account) && !seen.has(account.address)) {
      seen.add(account.address);
      accounts.push(account);
    }
  }
  return accounts;
}

/** Asks the wallet for its mainnet addresses (up to 8). No signing. */
export async function connectWallet(wallet: StandardWallet) {
  return (await connectAccounts(wallet)).map((account) => account.address);
}

/** Whether the wallet can sign a plain message (Ledger, for one, cannot). */
export function canSignMessage(wallet: StandardWallet) {
  return typeof wallet.features["solana:signMessage"]?.signMessage === "function";
}

function sameBytes(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

/**
 * Asks the wallet to sign `message` with `account` and returns the 64-byte signature. Refuses an answer for
 * other bytes than the ones asked for, so a wallet cannot slip in a different text.
 */
export async function signMessage(wallet: StandardWallet, account: StandardAccount, message: Uint8Array) {
  const feature = wallet.features["solana:signMessage"];
  if (typeof feature?.signMessage !== "function") throw new Error("unsupported");
  const [output] = await withTimeout(120_000, feature.signMessage({ account, message }));
  if (!output || !(output.signature instanceof Uint8Array) || output.signature.length !== 64) throw new Error("no signature");
  if (output.signedMessage instanceof Uint8Array && !sameBytes(output.signedMessage, message)) throw new Error("altered");
  return output.signature;
}

/** Plain words for a failed signature request. */
export function signError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/reject|cancel|denied|closed|declin/i.test(message)) return "Signing cancelled. Nothing was signed.";
  if (message === "unsupported") return "This wallet cannot sign messages. Try Phantom, Solflare or Backpack.";
  if (message === "timeout") return "The wallet did not answer. Try again.";
  return "The wallet did not sign. Try again, or use another wallet.";
}

export async function disconnectWallet(wallet: StandardWallet | null) {
  const feature = wallet?.features["standard:disconnect"];
  if (typeof feature?.disconnect === "function") await withTimeout(5_000, feature.disconnect());
}
