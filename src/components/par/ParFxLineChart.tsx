/**
 * FX-001 / PERF: the actual recharts rendering for ParExchange's history chart, split out of
 * ParExchange.tsx so `recharts` (a sizeable chunk) is only fetched when someone opens the FX
 * history chart — not on every /business/par/exchange visit. Loaded via `React.lazy()` from
 * ParExchange.tsx; keep this file free of anything the surrounding page needs synchronously
 * (period buttons, date pickers, loading/empty states stay in ParExchange.tsx).
 */
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface FxChartPoint {
  date: string;
  iso: string;
  EUR: number | null;
  USD: number | null;
}

interface ParFxLineChartProps {
  data: FxChartPoint[];
  seriesCodes: string[];
  seriesColor: Record<string, string>;
  formatRate: (v: number) => string;
  formatDateRo: (iso: string) => string;
}

export default function ParFxLineChart({
  data,
  seriesCodes,
  seriesColor,
  formatRate,
  formatDateRo,
}: ParFxLineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          domain={["auto", "auto"]}
          width={48}
          tickFormatter={(v) => Number(v).toFixed(2)}
        />
        <Tooltip
          formatter={(v, name) => [`${formatRate(Number(v))} MDL`, String(name)]}
          labelFormatter={(_l, payload) => {
            const iso = (payload?.[0]?.payload as { iso?: string } | undefined)?.iso;
            return iso ? formatDateRo(iso) : "";
          }}
          contentStyle={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "var(--radius)",
            fontSize: 12,
            color: "hsl(var(--foreground))",
          }}
        />
        {seriesCodes.map((code) => (
          <Line
            key={code}
            type="monotone"
            dataKey={code}
            stroke={seriesColor[code]}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
