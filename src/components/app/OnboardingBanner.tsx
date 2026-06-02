/**
 * ONBOARD-001 — Onboarding Banner
 *
 * Shown on the Dashboard when a new tenant hasn't completed the 4-step
 * onboarding checklist. Dismissible via localStorage.
 *
 * Steps:
 *   1. Adaugă un profesor
 *   2. Adaugă primul elev
 *   3. Programează prima lecție
 *   4. Invită colegii
 */
import { useState, useEffect } from "react";
import { CheckCircle, Circle, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "@/hooks/useSession";

interface OnboardingStep {
  id: string;
  label: string;
  href: string;
  done: boolean;
}

interface OnboardingStatus {
  completed: boolean;
  steps: OnboardingStep[];
}

function useDismissed(tenantId: string | undefined): [boolean, () => void] {
  const key = tenantId ? `onboarding_dismissed_${tenantId}` : null;
  const [dismissed, setDismissed] = useState(() => {
    if (!key) return false;
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  });

  const dismiss = () => {
    setDismissed(true);
    if (key) {
      try {
        localStorage.setItem(key, "1");
      } catch {
        /* ignore */
      }
    }
  };

  return [dismissed, dismiss];
}

export function OnboardingBanner() {
  const { data: session } = useSession();
  const tenantId = session?.tenant?.id;

  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, dismiss] = useDismissed(tenantId);

  useEffect(() => {
    if (!session) return;
    fetch("/api/onboarding/status", { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error("not ok");
        return r.json() as Promise<OnboardingStatus>;
      })
      .then((data) => {
        setStatus(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [session]);

  // Don't show if loading, dismissed, completed, or no data
  if (loading || dismissed || !status || status.completed) return null;

  const doneCount = status.steps.filter((s) => s.done).length;
  const total = status.steps.length;
  const pct = Math.round((doneCount / total) * 100);

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-6 rounded-lg border border-primary/20 bg-primary/5 p-4"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-foreground">
            Configurare inițială
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {doneCount} / {total} pași completați
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Ignoră ghidul de configurare"
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors touch-target"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Progress bar */}
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${doneCount} din ${total} pași completați`}
        className="h-1.5 rounded-full bg-muted mb-4 overflow-hidden"
      >
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Steps */}
      <ol className="grid gap-2 sm:grid-cols-2">
        {status.steps.map((step, idx) => (
          <li key={step.id} className="flex items-center gap-2">
            {step.done ? (
              <CheckCircle
                className="h-4 w-4 shrink-0 text-primary"
                aria-hidden="true"
              />
            ) : (
              <Circle
                className="h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            )}
            <a
              href={step.href}
              className={cn(
                "text-sm transition-colors",
                step.done
                  ? "text-muted-foreground line-through"
                  : "text-foreground hover:text-primary"
              )}
              aria-label={step.done ? `${step.label} (completat)` : step.label}
            >
              <span className="mr-1 text-xs text-muted-foreground font-mono">
                {idx + 1}.
              </span>
              {step.label}
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}
