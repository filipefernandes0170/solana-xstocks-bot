import { numberFormat } from "./intl";

/** HOLDER_MIN_TOKENS as a number: 0 (any amount counts) when it is empty, zero, negative or not a number. */
export function holderMinimum(raw: string | undefined | null) {
  const value = Number(raw || "0");
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** "250,000", written the same way on the server and in the browser. */
export function holderCount(minimum: number) {
  return numberFormat("en-US", { maximumFractionDigits: 6 }).format(minimum);
}

/** The holder rule in words: "at least 250,000 $PAR", or "any amount of $PAR" when no minimum is set. */
export function holderRule(minimum: number) {
  return minimum > 0 ? `at least ${holderCount(minimum)} $PAR` : "any amount of $PAR";
}
