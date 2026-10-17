import { Context } from "telegraf";
import { lookupToken } from "../../config/tokens.js";
import { addSizeAlert, clearSizeAlerts, listSizeAlerts, upsertUser } from "../../db/index.js";
import { SIZE_MAX_USD, SIZE_MIN_USD } from "../../services/desk.js";
import { MAX_SIZE_ALERTS, sizeAlertListText, sizeAlertSetText, sizeAlertUsage } from "../../services/messages.js";
import { holderNote } from "../holderNote.js";
import { proveKeyboardFor } from "../proof.js";
import { parseAmount } from "./size.js";

/**
 * /sizealert NVDAx 5000: a one-off text when a buy of that size costs at most 0.4% over the Nasdaq print while
 * Nasdaq is open (checked in the minute loop, holders only). /sizealert lists, /sizealert off [name] clears.
 */
export async function sizeAlertCommand(ctx: Context) {
  const telegramId = ctx.from!.id;
  upsertUser(telegramId, ctx.from?.username, ctx.from?.first_name);
  const parts = ((ctx.message as { text?: string })?.text ?? "").trim().split(/\s+/).slice(1);
  const first = parts[0]?.toLowerCase();

  if (!first) {
    await ctx.reply(`${sizeAlertListText(listSizeAlerts(telegramId))}\n\n${sizeAlertUsage()}\n\n${await holderNote(telegramId)}`, {
      parse_mode: "HTML",
      reply_markup: proveKeyboardFor(telegramId),
    });
    return;
  }

  if (first === "off") {
    if (parts[1]) {
      const token = lookupToken(parts[1]);
      if (!token) {
        await ctx.reply("🎯 I don't know that name. Try /sizealert off NVDAx, or /sizealert off for all.");
        return;
      }
      clearSizeAlerts(telegramId, token.symbol);
      await ctx.reply(`🎯 Size alerts for ${token.symbol} are off.`);
      return;
    }
    clearSizeAlerts(telegramId);
    await ctx.reply("🎯 All your size alerts are off.");
    return;
  }

  const token = parts.map((part) => lookupToken(part)).find(Boolean) ?? null;
  const usd = parts.map((part) => parseAmount(part)).find((value) => value != null) ?? null;
  if (!token || usd == null) {
    await ctx.reply(sizeAlertUsage(), { parse_mode: "HTML" });
    return;
  }
  const amount = Math.round(usd);
  if (amount < SIZE_MIN_USD || amount > SIZE_MAX_USD) {
    await ctx.reply("🎯 Pick an amount from $10 to $250,000.");
    return;
  }
  if (listSizeAlerts(telegramId).length >= MAX_SIZE_ALERTS) {
    await ctx.reply(`🎯 You already have ${MAX_SIZE_ALERTS} size alerts. /sizealert off clears them.`);
    return;
  }
  addSizeAlert(telegramId, token.symbol, amount);
  await ctx.reply(`${sizeAlertSetText(token.symbol, amount)}\n\n${await holderNote(telegramId)}`, {
    parse_mode: "HTML",
    reply_markup: proveKeyboardFor(telegramId),
  });
}
