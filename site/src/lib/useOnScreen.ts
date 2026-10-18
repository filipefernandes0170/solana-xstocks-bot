import { useEffect, useRef } from "react";

/**
 * The names whose card or row is at least a third on screen (elements marked data-want-symbol), kept in a ref so that
 * scrolling never re-renders the page. `key` changes whenever the list is drawn again (sort, filter, view, tab), so the
 * new elements are watched.
 */
export function useOnScreenSymbols(key: string) {
  const onScreen = useRef<Set<string>>(new Set());
  useEffect(() => {
    const seen = onScreen.current;
    seen.clear();
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const symbol = (entry.target as HTMLElement).dataset.wantSymbol;
          if (!symbol) continue;
          if (entry.isIntersecting) seen.add(symbol);
          else seen.delete(symbol);
        }
      },
      { threshold: 0.3 },
    );
    document.querySelectorAll<HTMLElement>("[data-want-symbol]").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [key]);
  return onScreen;
}
