import type { HolderStatus } from "../../lib/types";

function statusLine(status: HolderStatus) {
  return status === "unminted"
    ? "The coin is not live yet, so no wallet gets the text."
    : status === "holds"
      ? "This wallet would get the text."
      : status === "absent"
        ? "This wallet would not get the text."
        : "The chain did not answer. Try again.";
}

export function WhyHold({
  wallet,
  onWallet,
  busy,
  error,
  status,
  onCheck,
}: {
  wallet: string;
  onWallet: (wallet: string) => void;
  busy: boolean;
  error: string | null;
  status: HolderStatus | null;
  onCheck: () => void;
}) {
  return (
    <section className="mt-10 panel p-6 ring-1 ring-line sm:p-8" aria-label="Why hold">
      <p className="text-sm font-medium text-amber">Why hold</p>
      <h2 className="mt-2 max-w-xl font-display text-4xl leading-none text-ink sm:text-5xl">Par is free. The text is not.</h2>
      <dl className="mt-8 grid gap-6 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-muted">Now</dt>
          <dd className="mt-1 text-base leading-relaxed text-ink">Par. Gap, Fair, and Buy. Free.</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Next</dt>
          <dd className="mt-1 text-base leading-relaxed text-ink">
            The bot. A text when a name turns Fair, when it is rich while Nasdaq is closed, one bell at the open, and a note when a stock you
            hold changes. Only while the wallet still holds.
          </dd>
        </div>
      </dl>
      <form
        className="mt-8 max-w-xl"
        onSubmit={(event) => {
          event.preventDefault();
          onCheck();
        }}
      >
        <label htmlFor="coin-wallet" className="text-sm font-medium text-ink">
          Would this wallet get the text?
        </label>
        <input
          id="coin-wallet"
          value={wallet}
          onChange={(event) => onWallet(event.target.value)}
          placeholder="Solana address"
          autoComplete="off"
          spellCheck={false}
          className="mt-2 h-12 w-full rounded-full bg-foam px-4 text-sm text-ink ring-1 ring-line placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={busy}
          className="mt-3 h-11 rounded-full bg-pine px-5 text-sm font-medium text-foam disabled:opacity-60"
        >
          {busy ? "Checking…" : "Check"}
        </button>
      </form>
      {error ? <p className="mt-4 text-sm text-clay">{error}</p> : null}
      {status ? (
        <p className="mt-4 text-base text-ink" role="status">
          {statusLine(status)}
        </p>
      ) : null}
    </section>
  );
}
