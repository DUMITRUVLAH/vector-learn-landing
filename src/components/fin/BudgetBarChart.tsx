/**
 * BUDGET-003: Grafic bară "Plan vs Realizat" per categorie bugetară.
 *
 * Design:
 * - CSS-only (fără librărie grafice externe).
 * - Tokeni semantici Vector 365; zero hex hardcodat.
 * - Responsiv, funcționează pe mobile.
 * - Dark mode prin Tailwind.
 */

import { cn } from "@/lib/utils";
import type { BudgetReportLine } from "@/lib/api/finBudget";

function formatMDL(cents: number): string {
  return new Intl.NumberFormat("ro-MD", {
    style: "currency",
    currency: "MDL",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/** Returnează clasa Tailwind semantic pentru bara "realizat" pe baza procentului. */
function realizatBarClass(pct: number | null): string {
  if (pct === null || pct < 80) return "bg-success";
  if (pct < 100) return "bg-warning";
  return "bg-destructive";
}

interface BudgetBarChartProps {
  lines: BudgetReportLine[];
  className?: string;
}

export function BudgetBarChart({ lines, className }: BudgetBarChartProps): JSX.Element {
  if (lines.length === 0) {
    return (
      <div className={cn("py-6 text-center text-sm text-muted-foreground", className)}>
        Nicio linie de buget pentru grafic.
      </div>
    );
  }

  const maxCents = Math.max(...lines.map((l) => Math.max(l.budgetedCents, l.actualCents)), 1);

  return (
    <div className={cn("space-y-4", className)} aria-label="Grafic plan vs realizat per categorie">
      {lines.map((line) => {
        const budgetPct = Math.round((line.budgetedCents / maxCents) * 100);
        const actualPct = Math.round((line.actualCents / maxCents) * 100);

        return (
          <div key={line.id} className="space-y-1.5">
            {/* Etichetă categorie */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-medium text-foreground truncate max-w-[50%]">{line.label}</span>
              <span className="text-xs tabular-nums">{line.pct !== null ? `${line.pct}%` : "—"}</span>
            </div>

            {/* Bara: bugetat */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-14 text-right shrink-0">Bugetat</span>
                <div className="flex-1 h-5 bg-muted rounded-sm overflow-hidden relative">
                  <div
                    className="h-full bg-primary/20 border border-primary/30 rounded-sm transition-all duration-300"
                    style={{ width: `${budgetPct}%` }}
                    role="presentation"
                    aria-hidden="true"
                  />
                  <span className="absolute right-2 top-0 bottom-0 flex items-center text-[10px] tabular-nums text-foreground font-medium">
                    {formatMDL(line.budgetedCents)}
                  </span>
                </div>
              </div>

              {/* Bara: realizat */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-14 text-right shrink-0">Realizat</span>
                <div className="flex-1 h-5 bg-muted rounded-sm overflow-hidden relative">
                  <div
                    className={cn(
                      "h-full rounded-sm transition-all duration-300 opacity-80",
                      realizatBarClass(line.pct)
                    )}
                    style={{ width: `${actualPct}%` }}
                    role="progressbar"
                    aria-valuenow={line.actualCents}
                    aria-valuemin={0}
                    aria-valuemax={line.budgetedCents || line.actualCents}
                    aria-label={`${line.label}: ${formatMDL(line.actualCents)} realizat din ${formatMDL(line.budgetedCents)} bugetat`}
                  />
                  <span className="absolute right-2 top-0 bottom-0 flex items-center text-[10px] tabular-nums text-foreground font-medium">
                    {formatMDL(line.actualCents)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Legendă */}
      <div className="flex items-center gap-4 pt-2 border-t border-border">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-sm bg-primary/20 border border-primary/30" aria-hidden="true" />
          <span className="text-[10px] text-muted-foreground">Bugetat</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-sm bg-success opacity-80" aria-hidden="true" />
          <span className="text-[10px] text-muted-foreground">Realizat (&lt; 80%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-sm bg-warning opacity-80" aria-hidden="true" />
          <span className="text-[10px] text-muted-foreground">Atenție (80–99%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-sm bg-destructive opacity-80" aria-hidden="true" />
          <span className="text-[10px] text-muted-foreground">Depășit (≥ 100%)</span>
        </div>
      </div>
    </div>
  );
}
