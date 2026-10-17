import { createFileRoute } from "@tanstack/react-router";
import { Check, ShieldCheck, Smartphone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Backdrop } from "../components/Backdrop";
import { SiteFooter } from "../components/SiteFooter";
import { SiteNav } from "../components/SiteNav";
import { SITE_URL } from "../lib/site";
import { isNonce, proofMessage, telegramReturnLink, toBase64, walletBrowseLinks } from "../lib/walletProof";
import {
  canSignMessage,
  cleanName,
  connectAccounts,
  connectError,
  onWalletsChange,
  safeIcon,
  signError,
  signMessage,
  solanaWallets,
  type StandardAccount,
  type StandardWallet,
} from "../lib/wallet-standard";
import { submitWalletProof } from "../server/functions";

export const Route = createFileRoute("/verify")({
  validateSearch: (search: Record<string, unknown>) => ({ n: isNonce(search.n) ? search.n : "" }),
  // Each page carries its own one-time code, so no copy is ever cached or indexed.
  headers: () => ({ "Cache-Control": "no-store", "Netlify-CDN-Cache-Control": "no-store" }),
  head: () => ({
    meta: [{ title: "Prove your wallet · Par" }, { name: "robots", content: "noindex" }],
  }),
  component: VerifyPage,
});

function shortAddress(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

type Step = "pick" | "accounts" | "sign" | "done";

function VerifyPage() {
  const { n: nonce } = Route.useSearch();
  const [wallets, setWallets] = useState<StandardWallet[]>([]);
  const [wallet, setWallet] = useState<StandardWallet | null>(null);
  const [accounts, setAccounts] = useState<StandardAccount[]>([]);
  const [account, setAccount] = useState<StandardAccount | null>(null);
  const [step, setStep] = useState<Step>("pick");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageUrl, setPageUrl] = useState(`${SITE_URL}/verify`);
  const message = useMemo(() => (nonce ? proofMessage(nonce) : ""), [nonce]);

  useEffect(() => onWalletsChange(() => setWallets(solanaWallets())), []);
  useEffect(() => setPageUrl(window.location.href), []);

  async function pickWallet(next: StandardWallet) {
    setBusy(true);
    setError(null);
    try {
      if (!canSignMessage(next)) {
        setError("This wallet cannot sign messages. Try Phantom, Solflare or Backpack.");
        return;
      }
      const found = await connectAccounts(next);
      if (found.length === 0) {
        setError("That wallet returned no mainnet address.");
        return;
      }
      setWallet(next);
      setAccounts(found);
      if (found.length === 1) {
        setAccount(found[0]);
        setStep("sign");
      } else {
        setStep("accounts");
      }
    } catch (err) {
      setError(connectError(err));
    } finally {
      setBusy(false);
    }
  }

  async function sign() {
    if (!wallet || !account || !nonce) return;
    setBusy(true);
    setError(null);
    try {
      const signature = await signMessage(wallet, account, new TextEncoder().encode(message));
      const result = await submitWalletProof({ data: { nonce, address: account.address, signature: toBase64(signature) } });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setStep("done");
    } catch (err) {
      setError(signError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen text-foam">
      <Backdrop />
      <SiteNav current={null} />
      <main className="relative z-10 mx-auto max-w-2xl px-4 pb-20 sm:px-6">
        <header className="rise pt-4">
          <p className="flex items-center gap-2 text-sm font-medium text-gold">
            <ShieldCheck className="size-4" aria-hidden />
            For @ONPAR_BOT
          </p>
          <h1 className="hero-title mt-2 font-display text-4xl leading-[1.05] sm:text-5xl">Prove your wallet</h1>
          <p className="mt-4 text-base leading-relaxed text-mist">
            Holder texts go only to a wallet its owner proved. Connect the wallet that holds $PAR and sign the message below. A message is not a
            transaction: it cannot move funds. Par never asks for a seed phrase. If your wallet shows a transaction or a spending approval, refuse it.
          </p>
        </header>

        {!nonce ? (
          <p className="panel mt-8 p-6 text-base leading-relaxed text-ink ring-1 ring-line">
            This link is missing its code. Send /hold to @ONPAR_BOT on Telegram and tap the button it sends.
          </p>
        ) : (
          <section className="panel mt-8 p-5 text-ink ring-1 ring-line sm:p-7" aria-live="polite">
            <p className="text-sm font-medium text-amber">The message you will sign</p>
            <pre className="mt-2 whitespace-pre-wrap break-words rounded-2xl bg-foam p-4 font-sans text-sm leading-relaxed">{message}</pre>

            {step === "pick" ? (
              <div className="mt-6">
                <p className="font-medium">1. Choose the wallet that holds $PAR</p>
                {wallets.length === 0 ? (
                  <div className="mt-3 rounded-2xl bg-foam p-4 text-sm leading-relaxed">
                    <p className="flex items-center gap-2 font-medium">
                      <Smartphone className="size-4" aria-hidden />
                      No wallet found in this browser
                    </p>
                    <p className="mt-1 text-muted">On a phone, open this page inside your wallet app. On a computer, install a wallet extension and reload.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {walletBrowseLinks(pageUrl).map((link) => (
                        <a key={link.name} href={link.href} className="inline-flex h-11 items-center rounded-full bg-ink px-4 text-sm font-medium text-foam">
                          Open in {link.name}
                        </a>
                      ))}
                    </div>
                  </div>
                ) : (
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {wallets.map((item, index) => {
                      const icon = safeIcon(item.icon);
                      const name = cleanName(item.name) ?? "Wallet";
                      return (
                        <li key={`${name}-${index}`}>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void pickWallet(item)}
                            className="flex h-12 w-full items-center gap-3 rounded-xl bg-foam px-3 text-left text-sm font-medium ring-1 ring-line disabled:opacity-60"
                          >
                            {icon ? <img src={icon} alt="" width={24} height={24} className="h-6 w-6 rounded-md" /> : <span className="h-6 w-6 rounded-md bg-line" />}
                            {name}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : null}

            {step === "accounts" ? (
              <div className="mt-6">
                <p className="font-medium">1. Which address holds $PAR?</p>
                <ul className="mt-3 grid gap-2">
                  {accounts.map((item) => (
                    <li key={item.address}>
                      <button
                        type="button"
                        onClick={() => {
                          setAccount(item);
                          setStep("sign");
                        }}
                        className="h-11 w-full rounded-xl bg-foam px-3 text-left text-sm font-medium ring-1 ring-line"
                      >
                        {shortAddress(item.address)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {step === "sign" && account ? (
              <div className="mt-6">
                <p className="font-medium">
                  {"2. Sign with "}
                  <span className="font-mono">{shortAddress(account.address)}</span>
                </p>
                <p className="mt-1 text-sm text-muted">Your wallet shows the message above. Check it says it is not a transaction, then sign.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void sign()}
                    className="h-12 rounded-full bg-ink px-6 text-sm font-medium text-foam disabled:opacity-60"
                  >
                    {busy ? "Waiting for the wallet…" : "Sign the message"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setStep("pick");
                      setAccount(null);
                      setWallet(null);
                    }}
                    className="h-12 rounded-full px-5 text-sm ring-1 ring-line disabled:opacity-60"
                  >
                    Use another wallet
                  </button>
                </div>
              </div>
            ) : null}

            {step === "done" && account ? (
              <div className="mt-6 rounded-2xl bg-pine-soft p-4">
                <p className="flex items-center gap-2 font-medium text-pine">
                  <Check className="size-5" aria-hidden />
                  {"Signed with "}
                  <span className="font-mono">{shortAddress(account.address)}</span>
                </p>
                <p className="mt-1 text-sm leading-relaxed">Go back to Telegram to finish. The bot checks the signature itself before it saves the wallet.</p>
                <a
                  href={telegramReturnLink(nonce)}
                  className="mt-3 inline-flex h-12 items-center rounded-full bg-gold px-6 text-sm font-medium text-ink shadow-[0_8px_24px_#e0a04a33]"
                >
                  Back to Telegram
                </a>
                <p className="mt-3 text-xs text-muted">If the button does not open Telegram, send /hold check to the bot. The code works for 15 minutes.</p>
              </div>
            ) : null}

            {error ? (
              <p className="mt-4 text-sm text-clay" role="alert">
                {error}
              </p>
            ) : null}
          </section>
        )}
        <SiteFooter />
      </main>
    </div>
  );
}
