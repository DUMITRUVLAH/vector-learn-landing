/**
 * CRM-145 — ScoreExplain
 * Displays the lead score badge with a "De ce?" popover listing the scoring factors.
 */
import { useState, useRef, useEffect } from "react";
import { HelpCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { getScoreBadge, SCORE_BADGE_STYLES, SCORE_BADGE_LABELS } from "@/components/crm/ConvertModal";
import type { ScoreFactor } from "@/lib/api/leads";

interface ScoreExplainProps {
  score: number;
  factors: ScoreFactor[];
  recalculating?: boolean;
  onRecalculate: () => void;
}

export function ScoreExplain({ score, factors, recalculating = false, onRecalculate }: ScoreExplainProps) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const badge = getScoreBadge(score);

  return (
    <div className="flex items-center gap-2" ref={popoverRef}>
      <span
        className={cn(
          "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold",
          SCORE_BADGE_STYLES[badge]
        )}
        aria-label={`Scor lead: ${score} — ${SCORE_BADGE_LABELS[badge]}`}
      >
        {SCORE_BADGE_LABELS[badge]} {score}
      </span>

      {/* "De ce?" trigger */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Explică scorul"
          aria-expanded={open}
          aria-haspopup="dialog"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <HelpCircle className="h-4 w-4" aria-hidden="true" />
        </button>

        {open && (
          <div
            role="dialog"
            aria-label="Factori scor lead"
            className="absolute left-0 top-6 z-50 w-56 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg p-3"
          >
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
              De ce {score} puncte?
            </p>
            <ul className="space-y-1" aria-label="Lista factori scor">
              {factors.length === 0 ? (
                <li className="text-xs text-muted-foreground">Fără factori disponibili</li>
              ) : (
                factors.map((f, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-foreground">{f.label}</span>
                    <span
                      className={cn(
                        "font-semibold tabular-nums shrink-0",
                        f.points >= 0 ? "text-success" : "text-destructive"
                      )}
                    >
                      {f.points >= 0 ? `+${f.points}` : f.points}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </div>

      {/* Recalculate button */}
      <button
        type="button"
        onClick={onRecalculate}
        disabled={recalculating}
        aria-label="Recalculează scorul"
        title="Recalculează scorul"
        className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
      >
        <RefreshCw className={cn("h-3.5 w-3.5", recalculating && "animate-spin")} aria-hidden="true" />
      </button>
    </div>
  );
}
