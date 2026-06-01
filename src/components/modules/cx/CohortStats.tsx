/**
 * CX-703/705 — CohortStats bar
 * Shows: Înscriși (N full, N ½) | Gratuit | Cont Plată | Încasat | Expected
 *        + Break-even badge (CX-705): green profit / red loss
 * Semantic tokens, dark mode, responsive wrapping.
 */
import type { CohortStats as Stats } from "@/lib/api/cohortParticipants";
import { cn } from "@/lib/utils";

export interface BreakevenData {
  projectedProfitCents: number;
  isProfit: boolean;
}

interface CohortStatsProps {
  stats: Stats;
  currency?: string;
  className?: string;
  /** CX-705: if provided, renders the break-even badge */
  breakeven?: BreakevenData | null;
}

function formatMoney(cents: number, currency: string): string {
  const val = (cents / 100).toFixed(0);
  return `${val} ${currency}`;
}

function formatEur(cents: number): string {
  const abs = Math.abs(Math.round(cents / 100));
  return `€${abs}`;
}

export function CohortStats({
  stats,
  currency = "MDL",
  className,
  breakeven = null,
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

      {/* CX-705 — Break-even badge */}
      {breakeven !== null && breakeven !== undefined && (
        <BreakevenBadge breakeven={breakeven} />
      )}
    </div>
  );
}

// ─── Break-even badge (CX-705) ────────────────────────────────────────────────

interface BreakevenBadgeProps {
  breakeven: BreakevenData;
}

function BreakevenBadge({ breakeven }: BreakevenBadgeProps) {
  const { projectedProfitCents, isProfit } = breakeven;
  const label = isProfit ? "Profit proiectat" : "Sub break-even";
  const prefix = isProfit ? "+" : "-";
  const amount = formatEur(projectedProfitCents);

  return (
    <div className="flex flex-col min-w-[100px]">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-sm mt-0.5 font-semibold",
          isProfit
            ? "text-green-600 dark:text-green-400"
            : "text-red-600 dark:text-red-400"
        )}
        aria-label={`${label}: ${prefix}${amount}`}
      >
        {prefix}{amount}
      </span>
    </div>
  );
}

// ─── Stat chip ────────────────────────────────────────────────────────────────

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
