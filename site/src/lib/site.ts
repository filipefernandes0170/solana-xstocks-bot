// Site-wide settings: the public address, CDN cache rules and security headers.

/**
 * Public address of the site (canonical links, link previews, share links). onpar.site since 17 Oct 2026; the old
 * xstocks-tracker.netlify.app forwards to it (Netlify's primary domain).
 */
export const SITE_URL = "https://onpar.site";

export const SITE_TITLE = "Par — Is the price real?";
export const SITE_DESCRIPTION = "Par says whether a tokenized stock on Solana is actually at the share price.";

/**
 * Netlify CDN cache for public market data and the desk page: shared by every visitor for 10 s, then
 * served stale for up to 20 s more while one background call refreshes it. `durable` lets all of
 * Netlify's edge locations reuse one copy. Browsers keep revalidating, so they never hold old data.
 * Netlify clears this cache on every new deploy.
 */
export const PUBLIC_DATA_CACHE = "public, durable, s-maxage=10, stale-while-revalidate=20";

/**
 * Events and supply data (/api/events, /api/supply and their server functions): shared for a minute, then served stale
 * for up to two more while one call refreshes it. @ONPAR_BOT reads /api/events every few minutes for new filings, so
 * this keeps its texts within minutes of the SEC.
 */
export const EVENTS_CACHE = "public, durable, s-maxage=60, stale-while-revalidate=120";

/**
 * The /events page: shared for a minute, then the last copy is served for up to a day while one call refreshes it, so a
 * visitor never waits for the SEC and the chain to be read (about 5 s after a quiet spell, measured 18 Oct 2026). A copy
 * older than a few minutes asks for the newest list as soon as it opens (routes/events.tsx).
 */
export const EVENTS_PAGE_CACHE = "public, durable, s-maxage=60, stale-while-revalidate=86400";

/** "Where to buy": the exchanges' order books, shared for 30 s (each name's book is read at most twice a minute). */
export const VENUES_CACHE = "public, durable, s-maxage=30, stale-while-revalidate=30";

/** Slow-moving data (ranking, gap history, issuer powers): shared for 5 minutes, then stale for up to 10 more. */
export const STATIC_PAGE_CACHE = "public, durable, s-maxage=300, stale-while-revalidate=600";

/**
 * The desk and the name pages. Shared for 10 s like the data; after that Netlify keeps serving the last copy, for up to
 * a day, while one background call refreshes it, so a visitor never waits for the function to start, even after a quiet
 * night. A copy older than STALE_PAGE_MS is marked as soon as it arrives (StaleMark): its verdicts stay hidden and it
 * says it is refreshing until the page's own first poll brings live prices, a second or a few later.
 */
export const LIVE_PAGE_CACHE = "public, durable, s-maxage=10, stale-while-revalidate=86400";

/** /portfolio's HTML holds no server data (the wallet is read in the browser): refreshed every 5 minutes, served from cache meanwhile. */
export const SHELL_PAGE_CACHE = "public, durable, s-maxage=300, stale-while-revalidate=86400";

/** wantBuys: the same list of names, asked by many visitors, reaches the function at most once every 15 s. */
export const WANT_CACHE = "public, durable, s-maxage=15";

/** A page whose prices are older than this shows them as refreshing, with the verdicts hidden. */
export const STALE_PAGE_MS = 60_000;

/**
 * Security headers for every page. The site may not be shown inside another site's frame (clickjacking),
 * sends only the origin to other sites, and turns off browser features it never uses.
 * A full script Content-Security-Policy is not set: the server-rendered pages use inline hydration scripts.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
};
