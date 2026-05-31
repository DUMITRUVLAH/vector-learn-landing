/**
 * CRM-126 — Cadence sidebar panel for LeadCardPage
 * Shows active cadence enrollment, current step, next fire date.
 * Allows pausing the cadence.
 */
import { useEffect, useState } from "react";
import { Loader2, Pause, CheckCircle2, Clock, ListChecks } from "lucide-react";
import { getLeadEnrollments, pauseEnrollment, type CadenceEnrollment } from "@/lib/api/cadences";
import { cn } from "@/lib/utils";

interface CadencePanelProps {
  leadId: string;
}

const STATUS_LABEL: Record<string, string> = {
  active: "Activ",
  paused: "Pauză",
  completed: "Terminat",
  cancelled: "Anulat",
};

const STATUS_COLOR: Record<string, string> = {
  active: "text-emerald-600 dark:text-emerald-400",
  paused: "text-amber-600 dark:text-amber-400",
  completed: "text-muted-foreground",
  cancelled: "text-destructive",
};

export function CadencePanel({ leadId }: CadencePanelProps) {
  const [enrollments, setEnrollments] = useState<CadenceEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [pausingId, setPausingId] = useState<string | null>(null);

  const load = async () => {
    try {
      const data = await getLeadEnrollments(leadId);
      setEnrollments(data);
    } catch {
      // silently ignore — cadences are optional
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  const handlePause = async (enrollmentId: string) => {
    setPausingId(enrollmentId);
    try {
      await pauseEnrollment(enrollmentId);
      await load();
    } catch {
      // ignore
    } finally {
      setPausingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Se încarcă cadențele…</span>
      </div>
    );
  }

  if (enrollments.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">Nicio cadență activă pentru acest lead.</p>
    );
  }

  return (
    <div className="space-y-3" role="status" aria-label="Cadențe follow-up">
      {enrollments.map(({ enrollment, cadence }) => {
        const stepCount = cadence.steps.length;
        const currentStep = enrollment.currentStep;
        const progress = stepCount > 0 ? Math.min((currentStep / stepCount) * 100, 100) : 0;

        return (
          <div
            key={enrollment.id}
            className="rounded-md border border-border bg-muted/30 p-3 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <ListChecks className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="text-sm font-semibold truncate">{cadence.name}</span>
              </div>
              <span
                className={cn("text-xs font-medium shrink-0", STATUS_COLOR[enrollment.status] ?? "text-muted-foreground")}
              >
                {STATUS_LABEL[enrollment.status] ?? enrollment.status}
              </span>
            </div>

            {/* Progress bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Pas {Math.min(currentStep + 1, stepCount)} din {stepCount}</span>
                {enrollment.status === "completed" && (
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Terminat
                  </span>
                )}
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${progress}%` }}
                  role="progressbar"
                  aria-valuenow={currentStep}
                  aria-valuemin={0}
                  aria-valuemax={stepCount}
                />
              </div>
            </div>

            {/* Next fire date */}
            {enrollment.status === "active" && enrollment.nextFireAt && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" aria-hidden="true" />
                <span>
                  Următor:{" "}
                  {new Date(enrollment.nextFireAt).toLocaleDateString("ro-RO", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
            )}

            {/* Pause button */}
            {enrollment.status === "active" && (
              <button
                type="button"
                onClick={() => void handlePause(enrollment.id)}
                disabled={pausingId === enrollment.id}
                aria-label={`Pauză cadenței ${cadence.name}`}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                {pausingId === enrollment.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Pause className="h-3 w-3" />
                )}
                Pauză
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
