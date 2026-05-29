import { useId } from "react";

export interface SourceSlice {
  label: string;
  value: number;
  color: string;
}

interface SourcePieChartProps {
  data?: SourceSlice[];
}

const DEFAULT_DATA: SourceSlice[] = [
  { label: "Facebook & Instagram", value: 38, color: "hsl(220, 80%, 55%)" },
  { label: "Google Ads", value: 27, color: "hsl(150, 60%, 45%)" },
  { label: "Site & SEO", value: 18, color: "hsl(280, 60%, 55%)" },
  { label: "Recomandări", value: 12, color: "hsl(38, 92%, 55%)" },
  { label: "Telefon direct", value: 5, color: "hsl(0, 70%, 60%)" },
];

interface ArcGeometry {
  slice: SourceSlice;
  pct: number;
  pathData: string;
  midAngle: number;
  midX: number;
  midY: number;
}

function buildArcs(data: SourceSlice[], cx: number, cy: number, r: number, innerR: number): ArcGeometry[] {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let startAngle = -Math.PI / 2;
  return data.map((slice) => {
    const pct = slice.value / total;
    const sweep = pct * Math.PI * 2;
    const endAngle = startAngle + sweep;
    const largeArc = sweep > Math.PI ? 1 : 0;

    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);

    const ix1 = cx + innerR * Math.cos(endAngle);
    const iy1 = cy + innerR * Math.sin(endAngle);
    const ix2 = cx + innerR * Math.cos(startAngle);
    const iy2 = cy + innerR * Math.sin(startAngle);

    const pathData = [
      `M ${x1} ${y1}`,
      `A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${ix1} ${iy1}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2}`,
      "Z",
    ].join(" ");

    const midAngle = startAngle + sweep / 2;
    const midR = (r + innerR) / 2;
    const midX = cx + midR * Math.cos(midAngle);
    const midY = cy + midR * Math.sin(midAngle);

    startAngle = endAngle;
    return { slice, pct, pathData, midAngle, midX, midY };
  });
}

export function SourcePieChart({ data = DEFAULT_DATA }: SourcePieChartProps) {
  const titleId = useId();
  const total = data.reduce((s, d) => s + d.value, 0);
  const W = 280;
  const H = 280;
  const cx = W / 2;
  const cy = H / 2;
  const r = 110;
  const innerR = 60;
  const arcs = buildArcs(data, cx, cy, r, innerR);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-md">
      <div className="mb-4">
        <h3 className="text-sm font-bold">Atribuire surse leaduri</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Distribuția pe canal — ultima lună</p>
      </div>

      <div className="grid sm:grid-cols-[auto_1fr] gap-6 items-center">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full max-w-[240px] mx-auto"
          role="img"
          aria-labelledby={titleId}
          data-testid="pie-chart"
        >
          <title id={titleId}>Distribuție leaduri pe surse</title>
          {arcs.map((arc) => (
            <path
              key={arc.slice.label}
              d={arc.pathData}
              fill={arc.slice.color}
              data-testid="pie-slice"
              className="transition-opacity hover:opacity-90"
            >
              <title>{`${arc.slice.label}: ${arc.slice.value} leaduri (${Math.round(arc.pct * 100)}%)`}</title>
            </path>
          ))}
          <text x={cx} y={cy - 6} textAnchor="middle" className="fill-foreground" fontSize="20" fontWeight="700">
            {total}
          </text>
          <text x={cx} y={cy + 12} textAnchor="middle" className="fill-muted-foreground" fontSize="10">
            leaduri
          </text>
        </svg>

        <ul className="space-y-2">
          {arcs.map((arc) => (
            <li key={arc.slice.label} className="flex items-center gap-2.5 text-xs">
              <span
                className="h-3 w-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: arc.slice.color }}
                aria-hidden
              />
              <span className="flex-1 truncate font-medium text-foreground">{arc.slice.label}</span>
              <span className="tabular-nums font-semibold">{Math.round(arc.pct * 100)}%</span>
              <span className="tabular-nums text-muted-foreground w-8 text-right">{arc.slice.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
