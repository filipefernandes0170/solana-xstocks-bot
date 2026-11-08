/**
 * The holder minimum in words, for the bot's messages: "at least 250,000 $PAR", or plain "$PAR" when any amount
 * counts (HOLDER_MIN_TOKENS 0). Pure on purpose (no config import), so messages and tests can use it directly.
 */
export function holderAmount(minimum: number) {
  if (!Number.isFinite(minimum) || minimum <= 0) return "$PAR";
  return `at least ${minimum.toLocaleString("en-US", { maximumFractionDigits: 6 })} $PAR`;
}
