import { Logo } from "./Logo";

/** Shown for any address that is not a Par page (the response keeps its 404 status). */
export function NotFound() {
  return (
    <div className="min-h-screen bg-night text-foam">
      <main className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
        <Logo size={56} />
        <p className="mt-6 text-sm font-medium tracking-wide text-gold">Par · stocks on Solana</p>
        <h1 className="mt-3 font-display text-5xl text-foam">Page not found</h1>
        <p className="mt-4 text-base leading-relaxed text-mist">There is no Par page at this address.</p>
        <a href="/" className="mt-8 inline-flex h-12 items-center rounded-full bg-gold px-5 text-sm font-medium text-night">
          Back to the desk
        </a>
      </main>
    </div>
  );
}
