import { History } from "lucide-react";
import { agoWords, type LookChange } from "../../lib/lastLook";
import { usd } from "./charts";

function signed(value: number) {
  return `${value >= 0 ? "+" : "−"}${usd(Math.abs(value))}`;
}

/**
 * "Since you last looked": the change since this device last showed this wallet, split into price moves and balance
 * changes so a deposit never reads as a gain. Kept on this device only.
 */
export function LastLook({ change }: { change: LookChange }) {
  const balance = Math.abs(change.balanceMove) >= 0.01;
  return (
    <section aria-label="Since you last looked" className="rise mt-3 flex gap-3 rounded-2xl bg-dusk/80 px-4 py-3 text-sm text-mist ring-1 ring-white/10 sm:px-5">
      <History className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
      <p className="leading-relaxed">
        <span className="font-medium text-foam">{`Since you last looked, ${agoWords(change.ageMs)}: `}</span>
        <span className={change.priceMove >= 0 ? "text-[#3dbe8b]" : "text-clay-bright"}>
          {signed(change.priceMove)}
          {change.pricePct != null ? ` (${change.pricePct >= 0 ? "+" : "−"}${Math.abs(change.pricePct).toFixed(2)}%)` : ""}
        </span>
        {" from price moves"}
        {change.leaders.length > 0 ? `, mostly ${change.leaders.map((leader) => `${leader.symbol} ${signed(leader.move)}`).join(" and ")}` : ""}
        {balance ? `, and ${signed(change.balanceMove)} from balance changes (tokens added or removed, or a rebase)` : ""}
        {". "}
        <span className="text-xs">Saved on this device only.</span>
      </p>
    </section>
  );
}
