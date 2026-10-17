/** The page background: a faint price grid that fades toward the edges, and two soft glows. Decorative. */
export function Backdrop() {
  return (
    <div className="backdrop" aria-hidden>
      <div className="backdrop-grid" />
      <div className="backdrop-glow backdrop-glow-gold" />
      <div className="backdrop-glow backdrop-glow-pine" />
    </div>
  );
}
