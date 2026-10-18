import { ShieldAlert } from "lucide-react";
import { POWER_WORDS, type BagPowerSummary } from "../../lib/bagPowers";
import { shareLabel, usd } from "./charts";

function Row({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0">{label}</span>
        <span className="shrink-0 tabular-nums">
          <span className="font-medium">{shareLabel(value, total)}</span>
          <span className="text-muted"> · {usd(value)}</span>
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-foam" aria-hidden>
        <div className={`bar-grow h-full rounded-full ${tone}`} style={{ width: total > 0 ? `${(value / total) * 100}%` : "0%" }} />
      </div>
    </li>
  );
}

/**
 * "Who can freeze your bag": how much of the wallet's value its issuers can freeze, pause or block, and how much they
 * can move or burn out of the wallet, read from each token's mint on Solana. Native SOL has no issuer.
 */
export function BagPowers({ summary, error }: { summary: BagPowerSummary | null; error: string | null }) {
  return (
    <section aria-labelledby="powers-title" className="panel rise p-5 text-ink ring-1 ring-line sm:p-6">
      <p className="flex items-center gap-2 text-sm font-medium text-amber">
        <ShieldAlert className="size-4" aria-hidden />
        Read from the chain
      </p>
      <h2 id="powers-title" className="mt-1 font-display text-3xl leading-tight">
        Who can freeze your bag
      </h2>
      {error ? <p className="mt-2 text-sm text-clay">{error}</p> : null}
      {!summary && !error ? <p className="mt-2 text-sm text-muted">Reading each token&apos;s mint on Solana…</p> : null}
      {summary && summary.total > 0 ? (
        <>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Each token&apos;s mint on Solana says what its issuer can still do. Issuers keep these powers for legal reasons, such as court orders and
            sanctions. They are powers, not events: this does not say they will be used.
          </p>
          {summary.pausedNow.length > 0 ? (
            <p role="status" className="mt-4 rounded-2xl bg-clay-soft px-4 py-3 text-sm font-medium text-clay">
              {`Transfers are paused right now: ${summary.pausedNow.join(", ")}.`}
            </p>
          ) : null}
          <ul className="mt-4 space-y-3.5">
            <Row label="Can be frozen, paused or blocked by its issuer" value={summary.stoppable} total={summary.total} tone="bg-clay" />
            <Row label="Can be moved or burned out of your wallet by its issuer" value={summary.seizable} total={summary.total} tone="bg-gold" />
            <Row label="No issuer can stop or move it" value={summary.untouchable} total={summary.total} tone="bg-pine" />
            {summary.unread > 0 ? <Row label="Not read (mint unknown or not answering)" value={summary.unread} total={summary.total} tone="bg-muted" /> : null}
          </ul>
          <ul className="mt-5 divide-y divide-line text-sm">
            {summary.groups.map((group) => (
              <li key={group.label} className="py-2.5">
                <p className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{group.label}</span>
                  <span className="shrink-0 tabular-nums text-muted">{usd(group.usd)}</span>
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">
                  {group.symbols.slice(0, 6).join(", ")}
                  {group.symbols.length > 6 ? ` and ${group.symbols.length - 6} more` : ""}
                  {" · "}
                  {group.powers.length > 0
                    ? `${group.mixed ? "between them, their issuers can" : "issuer can"} ${group.powers.map((power) => POWER_WORDS[power]).join(", ")}`
                    : "no issuer powers"}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-muted">Each name&apos;s page lists who holds each power, with links to the chain.</p>
        </>
      ) : null}
    </section>
  );
}
