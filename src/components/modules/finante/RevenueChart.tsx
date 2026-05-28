import { useId } from "react";

export interface RevenueDataPoint {
  label: string;
  value: number;
}

const DEFAULT_DATA: RevenueDataPoint[] = [
  { label: "Nov", value: 14200 },
  { label: "Dec", value: 16800 },
  { label: "Ian", value: 18400 },
  { label: "Feb", value: 17200 },
  { label: "Mar", value: 20100 },
  { label: "Apr", value: 22400 },
  { label: "Mai", value: 24380 },
];

interface RevenueChartProps {
  data?: RevenueDataPoint[];
  title?: string;
  subtitle?: string;
}

export function RevenueChart({
  data = DEFAULT_DATA,
  title = "Venituri lunare",
  subtitle,
}: RevenueChartProps) {
  const gradientId = useId();

  const maxValue = Math.max(...data.map((d) => d.value)) || 1;
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const last = data[data.length - 1]?.value ?? 0;
  const first = data[0]?.value ?? 0;
  const growth = first > 0 ? ((last - first) / first) * 100 : 0;

  const PAD_X = 24;
  const PAD_TOP = 16;
  const PAD_BOTTOM = 32;
  const W = 480;
  const H = 220;
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_TOP - PAD_BOTTOM;
  const barGap = 8;
  const barW = (innerW - barGap * (data.length - 1)) / data.length;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-md">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-sm font-bold">{title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {subtitle ?? `Total ${data.length} luni: ${formatEur(total)}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xl sm:text-2xl font-display font-bold text-gradient tabular-nums">
            {formatEur(last)}
          </p>
          <p className="text-[11px] font-medium text-success">
            ↑ {growth.toFixed(1)}% vs. acum {data.length - 1} luni
          </p>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label={`Grafic venituri ${data.length} luni`}
        data-testid="revenue-chart"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.95" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.55" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = PAD_TOP + innerH * (1 - ratio);
          return (
            <line
              key={ratio}
              x1={PAD_X}
              x2={W - PAD_X}
              y1={y}
              y2={y}
              stroke="hsl(var(--border))"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          );
        })}

        {data.map((d, i) => {
          const barH = (d.value / maxValue) * innerH;
          const x = PAD_X + i * (barW + barGap);
          const y = PAD_TOP + innerH - barH;
          return (
            <g key={`${d.label}-${i}`}>
              <rect
                data-testid="chart-bar"
                x={x}
                y={y}
                width={barW}
                height={barH}
                rx={6}
                fill={`url(#${gradientId})`}
              >
                <title>{`${d.label}: ${formatEur(d.value)}`}</title>
              </rect>
              <text
                x={x + barW / 2}
                y={H - PAD_BOTTOM + 18}
                textAnchor="middle"
                className="fill-muted-foreground"
                fontSize="11"
                fontWeight="500"
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function formatEur(v: number): string {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v);
}
