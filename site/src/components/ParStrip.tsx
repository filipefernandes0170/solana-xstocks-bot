import { ArrowRight, Check, Copy, ExternalLink, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { PAR_MINT, solscanToken } from "../lib/holder";

/**
 * The slim $PAR line under the nav on every page. Someone arriving from a $PAR announcement sees at once whether the
 * coin is live and, once it is, its one official address in full (never shortened: checking every character is the
 * point), with Copy and its Solscan page. Fake copies of a coin appear within minutes of a launch.
 * `mint` is the official address (lib/holder.ts) unless a test passes another.
 */
export function ParStrip({ mint = PAR_MINT }: { mint?: string }) {
  const [copied, setCopied] = useState(false);
  // The desk's holder section (WhyHold) carries id="par".
  const unlocks = (
    <a href="/#par" className="inline-flex shrink-0 items-center gap-1 font-medium text-gold underline decoration-gold/50 underline-offset-4">
      What $PAR unlocks
      <ArrowRight className="size-3.5" aria-hidden />
    </a>
  );
  return (
    <div className="border-t border-line bg-card/70 text-xs sm:text-sm" role="note" aria-label="The official $PAR address">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 sm:px-6">
        {mint ? (
          <>
            <span className="inline-flex items-center gap-2 font-medium text-foam">
              <ShieldCheck className="size-4 shrink-0 text-gold" aria-hidden />
              Official $PAR address
            </span>
            <code className="min-w-0 break-all font-mono text-[0.8125rem] leading-snug text-foam">{mint}</code>
            <span className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(mint).then(() => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1600);
                  });
                }}
                className="inline-flex h-7 items-center gap-1 rounded-md bg-gold px-2 text-xs font-semibold text-night"
              >
                {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                {copied ? "Copied" : "Copy"}
              </button>
              <a
                href={solscanToken(mint)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-7 items-center gap-1 rounded-md bg-field px-2 text-xs font-medium text-foam ring-1 ring-line hover:bg-white/10"
              >
                Solscan
                <ExternalLink className="size-3" aria-hidden />
              </a>
            </span>
            <span className="text-mist">Any other address is not $PAR.</span>
            <span className="sm:ml-auto">{unlocks}</span>
          </>
        ) : (
          <>
            <p className="flex min-w-0 flex-1 items-start gap-2 text-mist">
              <ShieldCheck className="mt-px size-4 shrink-0 text-gold" aria-hidden />
              <span>
                <span className="font-medium text-foam">$PAR is not live yet.</span> Its only official address will appear here.{" "}
                {/* On a phone the link follows the sentence; on wider screens it sits at the right edge. */}
                <span className="sm:hidden">{unlocks}</span>
              </span>
            </p>
            <span className="hidden sm:block">{unlocks}</span>
          </>
        )}
      </div>
    </div>
  );
}
