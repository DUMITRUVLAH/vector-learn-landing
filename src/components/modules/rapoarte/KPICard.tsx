import { useEffect, useState } from "react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface KPICardProps {
  label: string;
  value: number;
  format?: "number" | "currency" | "percent";
  delta?: number;
  pastel?: string;
  icon?: React.ComponentType<{ className?: string }>;
  animate?: boolean;
}

function formatValue(value: number, format: "number" | "currency" | "percent"): string {
  if (format === "currency") {
    return new Intl.NumberFormat("ro-RO", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(value);
  }
  if (format === "percent") return `${value.toFixed(0)}%`;
  return new Intl.NumberFormat("ro-RO").format(Math.round(value));
}

export function useCountUp(target: number, durationMs = 900, enabled = true): number {
  const [v, setV] = useState(enabled ? 0 : target);
  useEffect(() => {
    if (!enabled) {
      setV(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setV(target * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs, enabled]);
  return v;
}

export function KPICard({
  label,
  value,
  format = "number",
  delta,
  pastel = "pastel-mint",
  icon: Icon,
  animate = true,
}: KPICardProps) {
  const animated = useCountUp(value, 900, animate);
  const positive = (delta ?? 0) >= 0;

  return (
    <article className={cn("rounded-2xl border border-border p-5", pastel)}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/60">
          {label}
        </p>
        {Icon && <Icon className="h-4 w-4 text-foreground/70" />}
      </div>
      <p data-testid={`kpi-${label}`} className="text-2xl sm:text-3xl font-display font-bold tabular-nums">
        {formatValue(animated, format)}
      </p>
      {delta !== undefined && (
        <div className="flex items-center gap-1 mt-2">
          {positive ? (
            <ArrowUpRight className="h-3 w-3 text-success" />
          ) : (
            <ArrowDownRight className="h-3 w-3 text-destructive" />
          )}
          <span
            className={cn(
              "text-[11px] font-semibold",
              positive ? "text-success" : "text-destructive"
            )}
          >
            {positive ? "+" : ""}
            {delta.toFixed(1)}%
          </span>
          <span className="text-[10px] text-foreground/60">vs. perioada anterioară</span>
        </div>
      )}
    </article>
  );
}
