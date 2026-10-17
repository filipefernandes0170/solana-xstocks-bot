import { Context } from "telegraf";
import { config } from "../../config/index.js";
import { addAlert, clearAlerts, getActiveAlerts, upsertUser } from "../../db/index.js";
import { SYMBOL_TO_TOKEN, lookupToken } from "../../config/tokens.js";

const USAGE = [
  "🚨 <b>Price alerts</b>",
  `A one-off text when a name moves that much within ${config.bigMoveWindowMin} minutes. It turns itself off after it fires.`,
  "",
  "<code>/alert NVDAx up 5</code>",
  "<code>/alert TSLAx down 3</code>",
  "<code>/alert SPYx both 2</code>",
  "",
  "/alert list · your alerts",
  "/alert clear · remove them all",
].join("\n");

export async function alertCommand(ctx: Context) {
  upsertUser(ctx.from!.id, ctx.from?.username, ctx.from?.first_name);
  const parts = ((ctx.message as { text?: string })?.text ?? "").trim().split(/\s+/);
  const sub = parts[1]?.toLowerCase();

  if (sub === "list") {
    const alerts = getActiveAlerts(ctx.from!.id);
    if (alerts.length === 0) {
      await ctx.reply("🚨 No alerts on. Set one with <code>/alert NVDAx up 5</code>", { parse_mode: "HTML" });
      return;
    }
    const arrow = (direction: string) => (direction === "up" ? "▲" : direction === "down" ? "▼" : "▲▼");
    await ctx.reply(
      ["🚨 <b>Your alerts</b>", ...alerts.map((a) => `${arrow(a.direction)} <b>${SYMBOL_TO_TOKEN.get(a.symbol)?.symbol ?? a.symbol}</b> ${a.direction} ${a.threshold_pct}%`), "", "/alert clear removes them all."].join(
        "\n",
      ),
      { parse_mode: "HTML" },
    );
    return;
  }

  if (sub === "clear" || sub === "off") {
    const removed = clearAlerts(ctx.from!.id);
    await ctx.reply(removed > 0 ? `🚨 Removed ${removed} alert${removed === 1 ? "" : "s"}.` : "🚨 You had no alerts on.");
    return;
  }

  if (parts.length < 4) {
    await ctx.reply(USAGE, { parse_mode: "HTML" });
    return;
  }

  const token = lookupToken(parts[1]);
  const direction = parts[2].toLowerCase();
  const pct = Number(parts[3].replace(/%$/, ""));

  if (!token) {
    await ctx.reply("🚨 I don't know that name. Try /alert NVDAx up 5.");
    return;
  }
  if (!["up", "down", "both"].includes(direction)) {
    await ctx.reply("🚨 The direction is up, down or both. Example: /alert NVDAx up 5");
    return;
  }
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
    await ctx.reply("🚨 The move is a number from 0 to 100. Example: /alert NVDAx up 5");
    return;
  }

  addAlert(ctx.from!.id, token.symbol, direction, pct);
  await ctx.reply(
    `✅ Alert on: <b>${token.symbol}</b> ${direction} <b>${pct}%</b> within ${config.bigMoveWindowMin} minutes.\nOne text when it happens, then it turns itself off.`,
    { parse_mode: "HTML" },
  );
}
