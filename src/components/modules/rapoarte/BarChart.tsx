export interface BarItem {
  label: string;
  value: number;
}

interface BarChartProps {
  data: BarItem[];
  title: string;
  format?: (v: number) => string;
}

export function BarChart({ data, title, format = (v) => v.toLocaleString("ro-RO") }: BarChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const max = Math.max(...data.map((d) => d.value)) || 1;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-md">
      <h3 className="text-sm font-bold mb-4">{title}</h3>
      <ul className="space-y-3" data-testid="bar-chart">
        {data.map((d) => {
          const pct = (d.value / max) * 100;
          const totalPct = (d.value / total) * 100;
          return (
            <li key={d.label}>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-xs font-medium text-foreground">{d.label}</span>
                <span className="text-xs tabular-nums">
                  <span className="font-semibold text-foreground">{format(d.value)}</span>
                  <span className="text-muted-foreground ml-1.5">({totalPct.toFixed(0)}%)</span>
                </span>
              </div>
              <div
                className="h-2 rounded-full bg-muted overflow-hidden"
                role="progressbar"
                aria-valuenow={d.value}
                aria-valuemin={0}
                aria-valuemax={max}
                aria-label={`${d.label}: ${format(d.value)}`}
              >
                <div
                  data-testid="bar-fill"
                  className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-700"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
