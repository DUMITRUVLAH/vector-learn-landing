/**
 * BUDGET-003: Panou alerte active pentru bugete FinDesk.
 *
 * Afișat în topul BudgetPage dacă există cel puțin o linie ≥ 80%.
 * Ascuns complet dacă nu sunt alerte.
 *
 * Design:
 * - Tokeni semantici Vector 365; zero hex hardcodat.
 * - Dark mode prin Tailwind.
 * - WCAG AA: rol alert, contrast ≥ 4.5:1.
 */

import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BudgetAlertItem {
  budgetId: string;
  budgetName: string;
  lineId: string;
  lineLabel: string;
  category: string;
  pct: number;
  /** "warning" = 80–99%; "overrun" = ≥ 100% */
  kind: "warning" | "overrun";
}

interface BudgetAlertsPanelProps {
  alerts: BudgetAlertItem[];
  onDismiss?: () => void;
  onCheckAlerts?: (budgetId: string) => void;
  className?: string;
}

export function BudgetAlertsPanel({
  alerts,
  onDismiss,
  onCheckAlerts,
  className,
}: BudgetAlertsPanelProps): JSX.Element | null {
  if (alerts.length === 0) return null;

  const overruns = alerts.filter((a) => a.kind === "overrun");
  const warnings = alerts.filter((a) => a.kind === "warning");

  const panelClass =
    overruns.length > 0
      ? "border-destructive/50 bg-destructive/5"
      : "border-warning/50 bg-warning/5";

  const iconClass = overruns.length > 0 ? "text-destructive" : "text-warning";

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        "rounded-lg border px-4 py-3 space-y-2",
        panelClass,
        className
      )}
    >
      {/* Header panou */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className={cn("h-4 w-4 shrink-0", iconClass)} aria-hidden="true" />
          <span className="text-sm font-semibold text-foreground">
            {overruns.length > 0
              ? `${overruns.length} linie(i) au depășit bugetul`
              : `${warnings.length} linie(i) aproape de limita de buget (≥ 80%)`}
          </span>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
            aria-label="Închide panoul de alerte"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Lista alerte */}
      <ul className="space-y-1.5" aria-label="Lista alerte buget">
        {alerts.slice(0, 8).map((alert) => (
          <li
            key={`${alert.budgetId}-${alert.lineId}`}
            className={cn(
              "flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm",
              alert.kind === "overrun"
                ? "bg-destructive/10"
                : "bg-warning/10"
            )}
          >
            <div className="flex-1 min-w-0">
              <span className="font-medium text-foreground truncate block">{alert.lineLabel}</span>
              <span className="text-xs text-muted-foreground">
                {alert.budgetName} · {alert.category}
              </span>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {/* Badge % */}
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                  alert.kind === "overrun"
                    ? "bg-destructive/20 text-destructive"
                    : "bg-warning/20 text-warning"
                )}
              >
                {alert.pct}%
              </span>

              {/* Buton verifică alerte pe buget */}
              {onCheckAlerts && (
                <button
                  onClick={() => onCheckAlerts(alert.budgetId)}
                  className="text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1 min-h-[44px] flex items-center"
                  aria-label={`Verifică alerte pentru bugetul ${alert.budgetName}`}
                >
                  Notifică
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {alerts.length > 8 && (
        <p className="text-xs text-muted-foreground">
          + {alerts.length - 8} alerte suplimentare — deschide bugetul pentru detalii.
        </p>
      )}
    </div>
  );
}
