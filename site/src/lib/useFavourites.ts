import { useCallback, useEffect, useState } from "react";
import { TOKENS } from "./tokens";

const FAVOURITES_KEY = "par-favourites";

function read(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(FAVOURITES_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter((s): s is string => typeof s === "string" && TOKENS.some((t) => t.symbol === s)) : [];
  } catch {
    return [];
  }
}

/**
 * Favourite names, kept on this device only (localStorage). Empty until mounted, so the server-rendered page
 * and the first client render agree; private windows that refuse storage keep the list for the visit.
 */
export function useFavourites() {
  const [favourites, setFavourites] = useState<string[]>([]);
  useEffect(() => setFavourites(read()), []);
  const toggle = useCallback((symbol: string) => {
    setFavourites((list) => {
      const next = list.includes(symbol) ? list.filter((s) => s !== symbol) : [...list, symbol];
      try {
        localStorage.setItem(FAVOURITES_KEY, JSON.stringify(next));
      } catch {
        // Storage refused: the list lasts for this visit.
      }
      return next;
    });
  }, []);
  return [favourites, toggle] as const;
}

/** The bot can watch up to 8 names from one link: Telegram start parameters stop at 64 characters. */
export function watchLink(symbols: string[]) {
  return `https://t.me/ONPAR_BOT?start=w-${symbols.slice(0, 8).join("-")}`;
}
