// What a share says. Built from the numbers on screen at the moment of sharing, so it is never stale when sent;
// the link preview image carries no numbers on purpose (chat apps cache previews for days).

import { SITE_URL } from "./site";

export function stockUrl(symbol: string) {
  return `${SITE_URL}/s/${symbol}`;
}

function side(gap: number) {
  return gap > 0.02 ? "over" : gap < -0.02 ? "under" : "at";
}

/** "A $1,000 buy of NVDAx is 0.36% over the Nasdaq print right now (Split). Is the price real?" */
export function cardShareText(symbol: string, gap: number | null, verdictTitle: string) {
  if (gap == null) return `Is ${symbol} at the share price? A live check on Par.`;
  const where = side(gap);
  const amount = where === "at" ? "at" : `${Math.abs(gap).toFixed(2)}% ${where}`;
  return `A $1,000 buy of ${symbol} is ${amount} the Nasdaq print right now (${verdictTitle}). Is the price real?`;
}

/** "A $5,000 buy of NFLXx costs 0.87% over the Nasdaq print right now. Checked on Par." */
export function sizeShareText(symbol: string, usd: number, gap: number | null) {
  const dollars = `$${Math.round(usd).toLocaleString("en-US")}`;
  if (gap == null) return `What does a ${dollars} buy of ${symbol} really cost? Checked on Par.`;
  const where = side(gap);
  const amount = where === "at" ? "at" : `${Math.abs(gap).toFixed(2)}% ${where}`;
  return `A ${dollars} buy of ${symbol} costs ${amount} the Nasdaq print right now. Checked on Par.`;
}

export function xShareUrl(text: string, url: string) {
  return `https://x.com/intent/post?${new URLSearchParams({ text, url })}`;
}

export function telegramShareUrl(text: string, url: string) {
  return `https://t.me/share/url?${new URLSearchParams({ url, text })}`;
}
