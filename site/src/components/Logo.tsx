// The Par mark: the token price (gold) and the stock price (pale) meeting at one point.
// Same geometry as tools/brand/mark.mjs, which renders the favicons and previews; a test keeps them equal.

export const MARK_GOLD = "M26 46 C62 46 66 70 100 70";
export const MARK_FOAM = "M26 94 C62 94 66 70 100 70";

export function Logo({ size = 44, className = "", title }: { size?: number; className?: string; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 140 140"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <rect width="140" height="140" rx="30" fill="#0b1c26" stroke="#143240" strokeWidth="3" />
      <path d={MARK_GOLD} fill="none" stroke="#e0a04a" strokeWidth="10" strokeLinecap="round" />
      <path d={MARK_FOAM} fill="none" stroke="#e7f3ee" strokeWidth="10" strokeLinecap="round" />
      <circle cx="110" cy="70" r="8" fill="#e0a04a" />
    </svg>
  );
}
