/**
 * CX-702 — CohortProgress widget
 * Shows progress bar + days remaining / days until start / completed status.
 * Fully semantic tokens; dark mode; touch targets ≥ 44px.
 */
import type { CohortProgress as CohortProgressData } from "@/lib/cohortDates";
import { cn } from "@/lib/utils";

interface CohortProgressProps {
  progress: CohortProgressData;
  className?: string;
}

export function CohortProgress({ progress, className }: CohortProgressProps) {
  const { progressPercent, daysRemaining, daysUntilStart, isCompleted, isUpcoming } = progress;

  const statusLabel = isCompleted
    ? "Finalizat"
    : isUpcoming
    ? `Începe în ${daysUntilStart}z`
    : `${daysRemaining}z rămase`;

  return (
    <div className={cn("flex items-center gap-3 min-h-[44px]", className)}>
      {/* Progress bar */}
      <div
        role="progressbar"
        aria-valuenow={progressPercent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progres cohortă"
        className="flex-1 h-2 bg-muted rounded-full overflow-hidden"
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300",
            isCompleted
              ? "bg-muted-foreground"
              : isUpcoming
              ? "bg-border"
              : "bg-primary"
          )}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      {/* Percent */}
      <span className="text-xs font-medium text-muted-foreground w-8 text-right">
        {progressPercent}%
      </span>
      {/* Status text */}
      <span
        className={cn(
          "text-xs font-medium whitespace-nowrap",
          isCompleted
            ? "text-muted-foreground"
            : isUpcoming
            ? "text-muted-foreground"
            : "text-primary"
        )}
      >
        {statusLabel}
      </span>
    </div>
  );
}
