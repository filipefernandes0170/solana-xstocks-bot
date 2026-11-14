// $PAR, the project coin. The official address goes here on launch day (18 Nov 2026), in one commit, and the site's
// copy (site/src/lib/holder.ts) must be the same: a site test compares them. This file is the only place the bot takes
// the address from. Before it is published: `npm run check:par` reads it on chain (tools/par/check.mts), and the bot
// does the same when it starts and texts the admin. HOLDER_MIN_TOKENS in .env still replaces the minimum when set.

/** The official $PAR mint on Solana. Empty until launch: the holder texts stay off and /ca says $PAR is not live yet. */
export const PAR_MINT = "";

/** How much $PAR a proven wallet needs for the holder texts (Filipe, 8 Nov 2026). */
export const PAR_HOLDER_MIN = 250_000;
