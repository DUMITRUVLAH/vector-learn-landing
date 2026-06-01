/**
 * CX-703 — CohortStats bar
 * Shows: Înscriși (N full, N ½) | Gratuit | Cont Plată | Încasat | Expected
 * Semantic tokens, dark mode, responsive wrapping.
 */
import type { CohortStats as Stats } from "@/lib/api/cohortParticipants";
import { cn } from "@/lib/utils";

interface CohortStatsProps {
  stats: Stats;
  currency?: string;
  className?: string;
}

function formatMoney(cents: number, currency: string): string {
  const val = (cents / 100).toFixed(0);
  return `${val} ${currency}`;
}

export function CohortStats({
  stats,
  currency = "MDL",
  className,
}: CohortStatsProps) {
  const {
    paidCount,
    fullCount,
    halfCount,
    pendingCount,
    freeCount,
    incasatCents,
    expectedCents,
  } = stats;

  return (
    <div
      className={cn(
        "flex flex-wrap gap-4 py-3 px-4 rounded-lg bg-muted/40 border border-border",
        className
      )}
      aria-label="Statistici cohortă"
    >
      <StatChip
        label="Înscriși"
        value={`${paidCount} (${fullCount} full, ${halfCount} ½)`}
        bold
      />
      <StatChip label="Gratuit" value={String(freeCount)} />
      <StatChip label="Cont Plată" value={String(pendingCount)} />
      <StatChip
        label="Încasat"
        value={formatMoney(incasatCents, currency)}
        variant="success"
      />
      <StatChip
        label="Expected"
        value={formatMoney(expectedCents, currency)}
        variant="muted"
      />
    </div>
  );
}

interface StatChipProps {
  label: string;
  value: string;
  bold?: boolean;
  variant?: "default" | "success" | "muted";
}

function StatChip({ label, value, bold, variant = "default" }: StatChipProps) {
  return (
    <div className="flex flex-col min-w-[80px]">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-sm mt-0.5",
          bold && "font-semibold",
          variant === "success" && "text-green-600 dark:text-green-400",
          variant === "muted" && "text-muted-foreground",
          variant === "default" && "text-foreground"
        )}
      >
        {value}
      </span>
    </div>
  );
}
