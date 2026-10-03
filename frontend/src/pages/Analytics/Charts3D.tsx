import { useState } from "react";

/**
 * Pseudo-3D marks for the statistics page: extruded bars (a Recharts bar
 * `shape`) and a tilted pie with depth. Pure SVG — no extra libraries.
 */

/** Fixed categorical order — a color always means the same thing on this page. */
export const PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];

/** Monday-first weekday colors (indexes into PALETTE, red is kept for losses). */
export const WEEKDAY_COLORS = PALETTE.slice(0, 7);
export const LOSS_COLOR = "#b42318";

/** Weekday of a "YYYY-MM-DD" key, Monday = 0. */
export const weekdayIndex = (date: string) => (new Date(`${date}T00:00:00`).getDay() + 6) % 7;

/** Mixes a hex color with white (amount > 0) or black (amount < 0). */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const target = amount > 0 ? 255 : 0;
  const k = Math.abs(amount);
  const mix = (c: number) => Math.round(c + (target - c) * k);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Shared gloss gradient — render once inside the chart's <defs>. */
export function Bar3DDefs() {
  return (
    <defs>
      <linearGradient id="bar3d-gloss" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#ffffff" stopOpacity={0.28} />
        <stop offset="45%" stopColor="#ffffff" stopOpacity={0.06} />
        <stop offset="100%" stopColor="#000000" stopOpacity={0.08} />
      </linearGradient>
    </defs>
  );
}

interface BarShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
}

/** Recharts `shape` for a bar drawn as a box: front face, lit top, shaded side. */
export function Bar3D({ x = 0, y = 0, width = 0, height = 0, fill = PALETTE[0] }: BarShapeProps) {
  if (!width || !height) return null;
  if (height < 0) {
    y += height;
    height = -height;
  }
  const depth = Math.max(3, Math.min(9, width * 0.35));
  const w = Math.max(2, width - depth);
  const top = shade(fill, 0.35);
  const side = shade(fill, -0.28);
  return (
    <g>
      <path d={`M${x + w},${y} L${x + w + depth},${y - depth} L${x + w + depth},${y + height - depth} L${x + w},${y + height} Z`} fill={side} />
      <path d={`M${x},${y} L${x + depth},${y - depth} L${x + w + depth},${y - depth} L${x + w},${y} Z`} fill={top} />
      <rect x={x} y={y} width={w} height={height} fill={fill} />
      <rect x={x} y={y} width={w} height={height} fill="url(#bar3d-gloss)" />
    </g>
  );
}

export interface PieSlice {
  key: string;
  label: string;
  value: number;
  color: string;
  /** Pre-formatted value for the caption. */
  display: string;
}

const CX = 160;
const CY = 92;
const RX = 140;
const RY = 74;
const DEPTH = 24;

const point = (angle: number) => [CX + RX * Math.cos(angle), CY + RY * Math.sin(angle)] as const;

function slicePath(a1: number, a2: number) {
  if (a2 - a1 >= Math.PI * 2 - 1e-6) {
    return `M${CX - RX},${CY} A${RX},${RY} 0 1 1 ${CX + RX},${CY} A${RX},${RY} 0 1 1 ${CX - RX},${CY} Z`;
  }
  const [x1, y1] = point(a1);
  const [x2, y2] = point(a2);
  return `M${CX},${CY} L${x1},${y1} A${RX},${RY} 0 ${a2 - a1 > Math.PI ? 1 : 0} 1 ${x2},${y2} Z`;
}

/** Tilted pie with an extruded rim. Hovering (or focusing) a slice lifts it. */
export function Pie3D({ slices, ariaLabel }: { slices: PieSlice[]; ariaLabel: string }) {
  const [active, setActive] = useState<string | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return null;

  let angle = -Math.PI / 2;
  const arcs = slices.map((s) => {
    const a1 = angle;
    angle += (s.value / total) * Math.PI * 2;
    return { ...s, a1, a2: angle, percent: Math.round((s.value / total) * 1000) / 10 };
  });
  const activeArc = arcs.find((a) => a.key === active);

  return (
    <div className="pie3d">
      <svg viewBox={`0 0 320 ${CY + RY + DEPTH + 12}`} role="img" aria-label={ariaLabel}>
        {/* Rim: the top drawn repeatedly downwards in a darker tone. */}
        {Array.from({ length: DEPTH }, (_, i) => DEPTH - i).map((offset) => (
          <g key={offset} transform={`translate(0 ${offset})`}>
            {arcs.map((a) => (
              <path
                key={a.key}
                d={slicePath(a.a1, a.a2)}
                fill={shade(a.color, offset === DEPTH ? -0.45 : -0.3)}
                transform={a.key === active ? "translate(0 -8)" : undefined}
              />
            ))}
          </g>
        ))}
        {arcs.map((a) => (
          <path
            key={a.key}
            d={slicePath(a.a1, a.a2)}
            fill={a.color}
            stroke="#ffffff"
            strokeWidth={1.5}
            strokeLinejoin="round"
            className="pie3d-slice"
            transform={a.key === active ? "translate(0 -8)" : undefined}
            tabIndex={0}
            onMouseEnter={() => setActive(a.key)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(a.key)}
            onBlur={() => setActive(null)}
          >
            <title>{`${a.label}: ${a.display} (${a.percent}%)`}</title>
          </path>
        ))}
        <ellipse cx={CX} cy={CY - RY * 0.35} rx={RX * 0.55} ry={RY * 0.28} fill="#ffffff" opacity={0.12} pointerEvents="none" />
      </svg>
      <ul className="pie3d-legend">
        {arcs.map((a) => (
          <li
            key={a.key}
            className={a.key === active ? "active" : undefined}
            onMouseEnter={() => setActive(a.key)}
            onMouseLeave={() => setActive(null)}
          >
            <i style={{ background: a.color }} />
            <span className="pie3d-legend-label">{a.label}</span>
            <span className="pie3d-legend-value">{a.display}</span>
            <span className="pie3d-legend-pct">{a.percent}%</span>
          </li>
        ))}
      </ul>
      <span className="sr-only" aria-live="polite">
        {activeArc ? `${activeArc.label}: ${activeArc.display} (${activeArc.percent}%)` : ""}
      </span>
    </div>
  );
}
