import { FAIR_BAND } from "../../lib/brand";
import { formatGap } from "../../lib/format";
import { type HistoryPoint, withinBand } from "../../lib/history";
import { dateFormat } from "../../lib/intl";

const W = 680;
const H = 220;
const PAD = { left: 44, right: 12, top: 14, bottom: 30 };
const SCALE = 2;

const dayLabel = (t: number) => dateFormat("en-GB", { weekday: "short", day: "numeric", timeZone: "America/New_York" }).format(new Date(t));
const dayOf = (t: number) => dateFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(t));

/**
 * The last week of one name: the last trade versus the Nasdaq print, every 15 minutes in US hours. Readings sit
 * side by side (nights and weekends are skipped), the fair band is shaded, and gaps past ±2% are pinned to the edge.
 */
export function GapHistory({ symbol, points }: { symbol: string; points: HistoryPoint[] }) {
  if (points.length < 2) {
    return (
      <p className="text-sm leading-relaxed text-muted">
        The history is building. Par records every name every 15 minutes during US trading hours, so readings appear after the next session.
      </p>
    );
  }
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (gap: number) => PAD.top + ((SCALE - Math.max(-SCALE, Math.min(SCALE, gap))) / (2 * SCALE)) * innerH;
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.gap).toFixed(1)}`).join(" ");
  const days = points.reduce<{ i: number; label: string }[]>((list, p, i) => {
    const day = dayOf(p.t);
    if (i === 0 || day !== dayOf(points[i - 1].t)) list.push({ i, label: dayLabel(p.t) });
    return list;
  }, []);
  const band = withinBand(points, FAIR_BAND);
  const last = points[points.length - 1];

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${symbol} last trade versus Nasdaq over the last week. Latest ${formatGap(last.gap)}.`}>
        <rect x={PAD.left} y={y(FAIR_BAND)} width={innerW} height={y(-FAIR_BAND) - y(FAIR_BAND)} fill="#13291d" />
        {[2, 1, 0, -1, -2].map((g) => (
          <g key={g}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(g)} y2={y(g)} stroke={g === 0 ? "#6b727c" : "#272c34"} strokeWidth={g === 0 ? 1 : 0.75} />
            <text x={PAD.left - 8} y={y(g) + 4} textAnchor="end" fontSize="11" fill="#969da7">
              {g > 0 ? `+${g}%` : `${g}%`}
            </text>
          </g>
        ))}
        {days.map((d) => (
          <g key={d.i}>
            <line x1={x(d.i)} x2={x(d.i)} y1={PAD.top} y2={H - PAD.bottom} stroke="#272c34" strokeDasharray="3 3" />
            <text x={x(d.i) + 4} y={H - 10} fontSize="11" fill="#969da7">
              {d.label}
            </text>
          </g>
        ))}
        <path d={path} fill="none" stroke="#f2b84b" strokeWidth="2" strokeLinejoin="round" />
        <circle cx={x(points.length - 1)} cy={y(last.gap)} r="4.5" fill="#f2b84b" stroke="#14171c" strokeWidth="2" />
      </svg>
      <figcaption className="mt-3 text-sm leading-relaxed text-muted">
        {band.open > 0
          ? `While Nasdaq was open, the last trade sat within 0.4% of the print in ${band.within} of ${band.open} readings.`
          : "No reading yet while Nasdaq was open."}{" "}
        Shaded: the fair band. This tracks the last trade; Fair itself also needs a $1,000 buy, checked live above.
      </figcaption>
    </figure>
  );
}
