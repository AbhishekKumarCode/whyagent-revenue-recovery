// Small, dependency-free SVG charts for Insights — see dataviz skill guidance:
// fixed categorical hue order (validated for CVD via scripts/validate_palette.js),
// legend always present for 2+ series, text never wears the data color, table view
// stays available alongside every chart here (the existing tables on the page).

// Validated 4-slot categorical order (adjacent-pair CVD Delta E >= 8 in both modes) —
// assigned once, in a fixed order, never cycled or re-ordered by frequency.
export const REASON_COLOR = {
  insufficient_balance: { light: "#2a78d6", dark: "#3987e5" }, // blue
  mandate_expiry: { light: "#eb6834", dark: "#d95926" }, // orange
  bank_downtime: { light: "#1baf7a", dark: "#199e70" }, // aqua
  app_uninstall: { light: "#eda100", dark: "#c98500" }, // yellow
};

export function DonutChart({ segments, size = 168, thickness = 24 }) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  const gap = 3; // px surface gap between segments, per mark spec

  let offset = 0;
  const arcs = segments.map((seg) => {
    const frac = seg.value / total;
    const len = Math.max(0, frac * circumference - gap);
    const arc = { ...seg, len, offset };
    offset += frac * circumference;
    return arc;
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Distribution across ${segments.length} failure reasons`}
    >
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {arcs.map((arc) => (
          <circle
            key={arc.key}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={arc.color}
            strokeWidth={thickness}
            strokeDasharray={`${arc.len} ${circumference - arc.len}`}
            strokeDashoffset={-arc.offset}
            strokeLinecap="butt"
          />
        ))}
      </g>
      <text x="50%" y="47%" textAnchor="middle" fill="#191c1e" style={{ fontSize: 20, fontWeight: 600 }}>
        {total}
      </text>
      <text x="50%" y="61%" textAnchor="middle" fill="#404753" style={{ fontSize: 10.5, letterSpacing: "0.02em" }}>
        TOTAL
      </text>
    </svg>
  );
}

export function GroupedBarRow({ label, agentPct, naivePct, agentColor, naiveColor }) {
  return (
    <div className="mb-md last:mb-0">
      <div className="font-label-md text-label-md text-on-surface mb-1">{label}</div>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-sm">
          <div className="flex-1 h-3 bg-surface-container rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, agentPct)}%`, backgroundColor: agentColor }} />
          </div>
          <span className="mono-num text-[12px] text-on-surface w-12 text-right">{agentPct.toFixed(0)}%</span>
        </div>
        <div className="flex items-center gap-sm">
          <div className="flex-1 h-3 bg-surface-container rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, naivePct)}%`, backgroundColor: naiveColor }} />
          </div>
          <span className="mono-num text-[12px] text-on-surface-variant w-12 text-right">{naivePct.toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
}
