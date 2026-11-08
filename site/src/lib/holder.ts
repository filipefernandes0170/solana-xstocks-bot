import { numberFormat } from "./intl";

/*
 * $PAR on the site. The official address goes here on launch day (18 Nov 2026), in the same commit as the bot's copy
 * (src/config/par.ts); tests/holder.test.ts checks the two are equal. TOKEN_MINT and HOLDER_MIN_TOKENS in Netlify still
 * win on the server when they are set, for an emergency only.
 */

/** The official $PAR mint on Solana. Empty until launch: the site then says the coin is not live yet. */
export const PAR_MINT = "";

/** How much $PAR a proven wallet needs for the holder texts (Filipe, 8 Nov 2026). */
export const PAR_HOLDER_MIN = 250_000;

/** The mint the server uses: TOKEN_MINT when it is set, else the official address above. */
export function parMint(raw: string | undefined | null) {
  return (raw ?? "").trim() || PAR_MINT;
}

/** HOLDER_MIN_TOKENS when it is a positive number, else the launch minimum above. */
export function holderMinimum(raw: string | undefined | null) {
  const value = Number(raw || "0");
  return Number.isFinite(value) && value > 0 ? value : PAR_HOLDER_MIN;
}

/** "250,000", written the same way on the server and in the browser. */
export function holderCount(minimum: number) {
  return numberFormat("en-US", { maximumFractionDigits: 6 }).format(minimum);
}

/** The holder rule in words: "at least 250,000 $PAR", or "any amount of $PAR" when no minimum is set. */
export function holderRule(minimum: number) {
  return minimum > 0 ? `at least ${holderCount(minimum)} $PAR` : "any amount of $PAR";
}

/** The token's page on Solscan. */
export function solscanToken(mint: string) {
  return `https://solscan.io/token/${mint}`;
}
