/**
 * INSIGHT-004 (FIN) — Cashflow Forecast Chart.
 * 3 lines: Bun (good), Bază (base), Slab (pessimistic) — 30 or 60 days.
 * Reuses recharts (already in deps via REP-302).
 * Design system tokens — no hardcoded hex.
 */

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { CashflowForecastResponse, ForecastDay } from "@/lib/api/finInsight";

interface CashflowChartProps {
  scenarios: CashflowForecastResponse["scenarios"] | null;
  loading?: boolean;
}

function formatMDL(cents: number): string {
  const mdl = cents / 100;
  if (Math.abs(mdl) >= 1000) {
    return `${(mdl / 1000).toFixed(1)}k MDL`;
  }
  return `${mdl.toFixed(0)} MDL`;
}

function buildChartData(
  good: ForecastDay[],
  base: ForecastDay[],
  pessimistic: ForecastDay[],
  limit: number
): { date: string; good: number; base: number; pessimistic: number }[] {
  return base.slice(0, limit).map((b, i) => ({
    date: b.date.slice(5), // MM-DD
    good: good[i]?.cumulativeCents ?? 0,
    base: b.cumulativeCents,
    pessimistic: pessimistic[i]?.cumulativeCents ?? 0,
  }));
}

export function CashflowChart({ scenarios, loading = false }: CashflowChartProps) {
  const [days, setDays] = useState<30 | 60>(60);

  if (loading) {
    return (
      <div
        className="rounded-lg border bg-card p-5 shadow-sm"
        aria-busy="true"
        aria-label="Cashflow forecast — loading"
      >
        <div className="h-4 w-48 rounded bg-muted animate-pulse mb-4" />
        <div className="h-56 rounded bg-muted animate-pulse" />
      </div>
    );
  }

  if (!scenarios) {
    return (
      <div className="rounded-lg border bg-card p-5 shadow-sm text-center text-muted-foreground py-10">
        Datele de forecast nu sunt disponibile.
      </div>
    );
  }

  const data = buildChartData(
    scenarios.good,
    scenarios.base,
    scenarios.pessimistic,
    days
  );

  return (
    <section
      className="rounded-lg border bg-card p-5 shadow-sm"
      aria-label="Cashflow forecast 60 de zile"
    >
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-base font-semibold text-foreground">
          Forecast cashflow cumulativ
        </h3>
        <div
          className="inline-flex rounded-md border overflow-hidden"
          role="group"
          aria-label="Interval forecast"
        >
          <button
            type="button"
            onClick={() => setDays(30)}
            className={`px-3 py-1 text-sm font-medium transition-colors ${
              days === 30
                ? "bg-primary text-primary-foreground"
                : "bg-card text-foreground hover:bg-muted"
            }`}
            aria-pressed={days === 30}
          >
            30 zile
          </button>
          <button
            type="button"
            onClick={() => setDays(60)}
            className={`px-3 py-1 text-sm font-medium transition-colors ${
              days === 60
                ? "bg-primary text-primary-foreground"
                : "bg-card text-foreground hover:bg-muted"
            }`}
            aria-pressed={days === 60}
          >
            60 zile
          </button>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            interval={days === 60 ? 9 : 4}
            className="fill-muted-foreground"
          />
          <YAxis
            tickFormatter={formatMDL}
            tick={{ fontSize: 11 }}
            width={70}
            className="fill-muted-foreground"
          />
          <Tooltip
            formatter={(value: unknown) => [formatMDL(Number(value)), ""]}
            contentStyle={{
              borderRadius: "var(--radius)",
              fontSize: "12px",
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="good"
            name="Bun (+20%)"
            strokeWidth={2}
            dot={false}
            stroke="var(--color-emerald-500, #10b981)"
          />
          <Line
            type="monotone"
            dataKey="base"
            name="Bază"
            strokeWidth={2}
            dot={false}
            stroke="var(--color-blue-500, #3b82f6)"
          />
          <Line
            type="monotone"
            dataKey="pessimistic"
            name="Slab (-20%)"
            strokeWidth={2}
            dot={false}
            stroke="var(--color-red-500, #ef4444)"
            strokeDasharray="4 2"
          />
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
}
