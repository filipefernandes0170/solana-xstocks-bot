import { Info, ShieldAlert, ShieldCheck } from "lucide-react";
import { shortKey, type IssuerResult, type PowerId } from "../../lib/issuer";
import { dateFormat } from "../../lib/intl";

// Powers that can take a holder's tokens or stop them moving. The rest are how the token works day to day.
const SERIOUS: PowerId[] = ["seize", "freeze", "pause", "hook", "frozenStart"];

function explorer(address: string) {
  return `https://explorer.solana.com/address/${address}`;
}

function utcTime(ms: number) {
  return dateFormat("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(ms),
  );
}

/** What the issuer of one name can still do, read from its mint account. */
export function IssuerPowers({ result }: { result: IssuerResult }) {
  return (
    <section aria-labelledby="issuer-title" className="panel mt-8 p-6 text-ink ring-1 ring-line sm:p-7">
      <p className="text-sm font-medium text-amber">Read from the chain</p>
      <h2 id="issuer-title" className="mt-1 font-display text-3xl">
        What the issuer can do
      </h2>
      {result.ok ? (
        <>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
            {"These powers sit in the "}
            {result.symbol}
            {" mint account on Solana. Issuers keep them for legal reasons, such as court orders and sanctions. They are powers, not events: this does not say they will be used, only that the chain allows it."}
          </p>
          {result.powers
            .filter((power) => power.now)
            .map((power) => (
              <p key={`${power.id}-now`} role="status" className="mt-4 rounded-2xl bg-clay-soft px-4 py-3 text-sm font-medium text-clay">
                {power.now}
              </p>
            ))}
          <ul className="mt-5 grid gap-3 md:grid-cols-2">
            {result.powers.map((power) => {
              const serious = power.on && SERIOUS.includes(power.id);
              const Icon = serious ? ShieldAlert : power.on ? Info : ShieldCheck;
              return (
                <li key={power.id} className="flex gap-3 rounded-2xl bg-field p-4">
                  <Icon className={`mt-0.5 size-5 shrink-0 ${serious ? "text-clay" : power.on ? "text-amber" : "text-pine"}`} aria-hidden />
                  <div className="min-w-0">
                    <p className="font-medium">{power.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{power.line}</p>
                    {power.authority ? (
                      <a
                        href={explorer(power.authority)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-xs text-muted underline decoration-line underline-offset-4 hover:text-ink"
                      >
                        {"Held by "}
                        {shortKey(power.authority)}
                      </a>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-muted">
            {result.program}
            {" mint "}
            <a href={explorer(result.mint)} target="_blank" rel="noreferrer" className="underline decoration-line underline-offset-4 hover:text-ink">
              {shortKey(result.mint)}
            </a>
            {", read "}
            {utcTime(result.at)}
            {" UTC."}
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted">{result.message}</p>
      )}
    </section>
  );
}
