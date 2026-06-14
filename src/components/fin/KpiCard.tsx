/**
 * INSIGHT-004 (FIN) — KPI Card component for FinDesk Insights dashboard.
 * Shows a metric label, value in MDL, and delta % vs previous period.
 * Design system tokens only — no hardcoded hex colors.
 */

import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface KpiCardProps {
  label: string;
  valueCents: number;
  /** Delta percentage vs previous period. Positive = growth, negative = decline. */
  deltaPct?: number | null;
  loading?: boolean;
  /** Optional subtitle / helper text */
  subtitle?: string;
}

/** Format cents to MDL string: 150000 → "1.500,00 MDL" */
function formatMDL(cents: number): string {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: "MDL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function DeltaBadge({ pct }: { pct: number }) {
  const isPositive = pct > 0;
  const isNeutral = pct === 0;
  const formatted = `${isPositive ? "+" : ""}${pct.toFixed(1)}%`;

  if (isNeutral) {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <Minus className="h-4 w-4" aria-hidden="true" />
        {formatted}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 text-sm font-medium ${
        isPositive
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-destructive"
      }`}
    >
      {isPositive ? (
        <TrendingUp className="h-4 w-4" aria-hidden="true" />
      ) : (
        <TrendingDown className="h-4 w-4" aria-hidden="true" />
      )}
      {formatted}
    </span>
  );
}

export function KpiCard({
  label,
  valueCents,
  deltaPct,
  loading = false,
  subtitle,
}: KpiCardProps) {
  if (loading) {
    return (
      <div
        className="rounded-lg border bg-card p-5 shadow-sm"
        aria-busy="true"
        aria-label={`${label} — loading`}
      >
        <div className="h-4 w-24 rounded bg-muted animate-pulse mb-3" />
        <div className="h-8 w-36 rounded bg-muted animate-pulse mb-2" />
        <div className="h-4 w-16 rounded bg-muted animate-pulse" />
      </div>
    );
  }

  return (
    <article
      className="rounded-lg border bg-card p-5 shadow-sm"
      aria-label={`${label}: ${formatMDL(valueCents)}`}
    >
      <p className="text-sm font-medium text-muted-foreground mb-1">{label}</p>
      <p className="text-2xl font-bold text-foreground tabular-nums">
        {formatMDL(valueCents)}
      </p>
      <div className="mt-2 flex items-center gap-2">
        {deltaPct != null && <DeltaBadge pct={deltaPct} />}
        {subtitle && (
          <span className="text-xs text-muted-foreground">{subtitle}</span>
        )}
      </div>
    </article>
  );
}
