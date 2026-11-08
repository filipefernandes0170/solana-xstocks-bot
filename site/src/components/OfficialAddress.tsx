import { Check, Copy, ExternalLink, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { PAR_MINT, solscanToken } from "../lib/holder";

/**
 * The official $PAR address, with a copy button and its Solscan page. Fake copies of a coin appear within minutes of a
 * launch, so this sits in the footer of every page and in the desk's holder section. Before launch it says so, which
 * also warns against any "$PAR" posted early.
 */
export function OfficialAddress({ className = "" }: { className?: string }) {
  const [copied, setCopied] = useState(false);
  if (!PAR_MINT) {
    return (
      <p className={`flex items-start gap-2 rounded-xl bg-card px-4 py-3 text-sm leading-relaxed text-mist ring-1 ring-line ${className}`}>
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
        <span>
          <span className="font-medium text-foam">$PAR is not live yet.</span> Its official address will appear here on launch day. Until then, any
          &quot;$PAR&quot; address you see is not Par&apos;s.
        </span>
      </p>
    );
  }
  return (
    <div className={`rounded-xl bg-card px-4 py-3 ring-1 ring-gold/40 ${className}`}>
      <p className="flex items-center gap-2 text-sm font-medium text-gold">
        <ShieldCheck className="size-4 shrink-0" aria-hidden />
        Official $PAR address
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="min-w-0 break-all rounded-lg bg-field px-2.5 py-1.5 font-mono text-sm text-foam ring-1 ring-line">{PAR_MINT}</code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(PAR_MINT).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            });
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-gold px-3 text-sm font-semibold text-night"
        >
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </button>
        <a
          href={solscanToken(PAR_MINT)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-field px-3 text-sm font-medium text-foam ring-1 ring-line hover:bg-white/10"
        >
          Solscan
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        Any other address is not $PAR. Par never asks you to send funds or sign a transaction. The bot answers /ca with the same address.
      </p>
    </div>
  );
}
