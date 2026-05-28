import { useId } from "react";

export interface LinePoint {
  label: string;
  value: number;
}

interface LineChartProps {
  data: LinePoint[];
  title: string;
  yFormat?: (v: number) => string;
}

export function LineChart({ data, title, yFormat = (v) => v.toLocaleString("ro-RO") }: LineChartProps) {
  const gradientId = useId();
  const W = 480;
  const H = 200;
  const PAD_L = 36;
  const PAD_R = 12;
  const PAD_T = 12;
  const PAD_B = 28;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const max = Math.max(...data.map((d) => d.value)) || 1;
  const min = Math.min(...data.map((d) => d.value));
  const range = max - min || 1;
  const niceMax = Math.ceil(max / 1000) * 1000;
  const niceMin = Math.max(0, Math.floor(min / 1000) * 1000);

  const xStep = data.length > 1 ? innerW / (data.length - 1) : 0;
  const points = data.map((d, i) => {
    const x = PAD_L + i * xStep;
    const y = PAD_T + innerH - ((d.value - niceMin) / (niceMax - niceMin || range)) * innerH;
    return { x, y, ...d };
  });

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  const areaPath = [
    `M ${points[0].x} ${PAD_T + innerH}`,
    ...points.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`),
    `L ${points[points.length - 1].x} ${PAD_T + innerH}`,
    "Z",
  ].join(" ");

  return (
    <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-md">
      <h3 className="text-sm font-bold mb-4">{title}</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={title} data-testid="line-chart">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.35" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = PAD_T + innerH * ratio;
          const labelVal = niceMax - (niceMax - niceMin) * ratio;
          return (
            <g key={ratio}>
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={y}
                y2={y}
                stroke="hsl(var(--border))"
                strokeDasharray="3 3"
              />
              <text
                x={PAD_L - 6}
                y={y + 3}
                textAnchor="end"
                className="fill-muted-foreground"
                fontSize="9"
              >
                {yFormat(labelVal)}
              </text>
            </g>
          );
        })}

        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path
          data-testid="line-path"
          d={linePath}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {points.map((p, i) => (
          <g key={i}>
            <circle data-testid="line-point" cx={p.x} cy={p.y} r={3} fill="hsl(var(--primary))" />
            <text
              x={p.x}
              y={H - 10}
              textAnchor="middle"
              className="fill-muted-foreground"
              fontSize="10"
            >
              {p.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
