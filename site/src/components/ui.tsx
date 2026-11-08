import type { ReactNode } from "react";

/*
 * Shared pieces of the dark desk look (8 Nov 2026), so every page uses the same title, panels, tiles and buttons.
 * Colours come from the theme in styles.css: card = dark panel, field = raised surface, gold = actions.
 */

/** Gold action button or link: dark text on gold. */
export const GOLD_BUTTON =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-gold px-4 text-sm font-semibold text-night hover:brightness-105 disabled:opacity-60";

/** Secondary button or link: gold outline on the dark page. */
export const OUTLINE_BUTTON =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium text-gold ring-1 ring-gold/50 hover:bg-gold/10 disabled:opacity-60";

/** Quiet button: a raised dark field. */
export const FIELD_BUTTON =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-field px-4 text-sm font-medium text-foam ring-1 ring-line hover:bg-white/10 disabled:opacity-60";

/** A page's title row: the heading and its line on the left, anything else (status, actions) on the right. */
export function PageTitle({ title, line, aside }: { title: ReactNode; line?: ReactNode; aside?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-3xl leading-tight text-foam sm:text-4xl">{title}</h1>
        {line ? <p className="mt-2 max-w-2xl text-base leading-relaxed text-mist">{line}</p> : null}
      </div>
      {aside ? <div className="flex shrink-0 flex-wrap items-center gap-3">{aside}</div> : null}
    </header>
  );
}

/** A dark panel with an optional title row. */
export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel p-4 sm:p-5 ${className}`}>
      {title || action ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title ? <h2 className="text-base font-semibold text-ink">{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** A number tile: an icon in a small square, a label, the value and a hint. */
export function StatTile({
  icon,
  label,
  value,
  hint,
  tone = "text-ink",
  onClick,
  verdict = false,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: string;
  onClick?: () => void;
  /** The value comes from the verdicts, so a stale page hides it (see StaleMark). */
  verdict?: boolean;
}) {
  const body = (
    <>
      <span className="hidden size-11 shrink-0 items-center justify-center rounded-lg bg-field text-gold ring-1 ring-line sm:flex">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm text-muted">{label}</span>
        <span className={`mt-0.5 block truncate font-display text-xl leading-tight sm:text-2xl ${tone}`} data-verdict={verdict || undefined}>
          {value}
        </span>
        {hint ? (
          <span className="mt-0.5 block text-xs text-muted sm:text-sm" data-verdict={verdict || undefined}>
            {hint}
          </span>
        ) : null}
      </span>
    </>
  );
  const tile = "panel flex min-w-0 items-start gap-3 p-3 text-left sm:p-4";
  return onClick ? (
    <button type="button" onClick={onClick} className={`${tile} hover:bg-field`}>
      {body}
    </button>
  ) : (
    <div className={tile}>{body}</div>
  );
}

/** Text tabs with a gold underline under the chosen one. */
export function UnderlineTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { id: T; label: ReactNode }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <nav aria-label={label} className="flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          aria-pressed={value === tab.id}
          className={`-mb-px h-11 shrink-0 border-b-2 px-3 text-sm font-medium sm:px-4 ${
            value === tab.id ? "border-gold text-gold" : "border-transparent text-mist hover:text-foam"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

/** A small filter chip: gold when chosen. */
export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium ${
        on ? "bg-gold text-night" : "bg-field text-foam ring-1 ring-line hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}
