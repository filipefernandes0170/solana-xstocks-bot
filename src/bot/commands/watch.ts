import { Context } from "telegraf";
import { SYMBOL_TO_TOKEN, lookupToken } from "../../config/tokens.js";
import { addWatch, listWatches, removeWatch, upsertUser } from "../../db/index.js";
import { holderNote } from "../holderNote.js";

const WHAT = "A ping arrives when a watched name turns 🟢 Fair, and when it trades rich while Nasdaq is closed.";

/** Adds watches and answers in the same words for /watch, the Watch buttons and the site's favourites link. */
export async function watchReply(ctx: Context, symbols: string | string[]) {
  upsertUser(ctx.from!.id, ctx.from?.username, ctx.from?.first_name);
  const list = Array.isArray(symbols) ? symbols : [symbols];
  for (const symbol of list) addWatch(ctx.from!.id, symbol);
  const label = list.includes("ALL") ? "every name" : list.map((symbol) => `<b>${symbol}</b>`).join(", ");
  await ctx.reply(`🔔 Watching ${label}.\n${WHAT}\n\n${await holderNote(ctx.from!.id)}`, { parse_mode: "HTML" });
}

/** The names in a site link payload such as "w-NVDAx-TSLAx": known names only, at most 8. */
export function payloadSymbols(payload: string) {
  if (!payload.startsWith("w-")) return [];
  const symbols = payload
    .slice(2)
    .split("-")
    // The site sends exact symbols (AMD is Backpack's token, AMDx the xStock), so an exact match comes first.
    .map((part) => (SYMBOL_TO_TOKEN.get(part.toUpperCase()) ?? lookupToken(part))?.symbol)
    .filter((symbol): symbol is string => Boolean(symbol));
  return [...new Set(symbols)].slice(0, 8);
}

export async function watchCommand(ctx: Context) {
  upsertUser(ctx.from!.id, ctx.from?.username, ctx.from?.first_name);
  const parts = ((ctx.message as { text?: string })?.text ?? "").trim().split(/\s+/);
  const arg = parts[1]?.toLowerCase();
  const extra = parts[2]?.toLowerCase();

  if (!arg || arg === "list") {
    const rows = listWatches(ctx.from!.id);
    const names = rows.length === 0 ? "nothing yet" : rows.map((row) => (row.symbol === "ALL" ? "every name" : `<b>${row.symbol}</b>`)).join(", ");
    await ctx.reply(
      [
        `🔔 Watching ${names}.`,
        WHAT,
        "",
        "/watch NVDAx · /watch all · /watch off · /watch off NVDAx",
        "",
        await holderNote(ctx.from!.id),
      ].join("\n"),
      { parse_mode: "HTML" },
    );
    return;
  }

  if (arg === "off") {
    if (extra) {
      const token = lookupToken(extra);
      removeWatch(ctx.from!.id, token?.symbol ?? extra.toUpperCase());
      await ctx.reply(`🔕 Stopped watching ${token?.symbol ?? extra.toUpperCase()}.`);
    } else {
      removeWatch(ctx.from!.id);
      await ctx.reply("🔕 Stopped all watches.");
    }
    return;
  }

  if (arg === "all") {
    await watchReply(ctx, "ALL");
    return;
  }

  const token = lookupToken(arg);
  if (!token) {
    await ctx.reply("🔔 I don't know that name. Try /watch NVDAx or /watch all.");
    return;
  }
  await watchReply(ctx, token.symbol);
}
