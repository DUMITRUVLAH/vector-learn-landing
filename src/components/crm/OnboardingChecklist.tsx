/**
 * CRM-128 — OnboardingChecklist component
 * Floating checklist shown on Dashboard and LeadsPage for new users.
 * State persisted in localStorage. Auto-dismisses when all steps done.
 * Only shown when tenant has < 5 leads AND not dismissed.
 */
import { useEffect, useState } from "react";
import { CheckCircle2, Circle, ChevronDown, ChevronUp, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface OnboardingChecklistProps {
  tenantId: string;
  totalLeads: number;
  /** Mark step as done from outside when action occurs */
  stepsDone?: {
    leadCreated?: boolean;
    stageEdited?: boolean;
    templateCreated?: boolean;
    messageSent?: boolean;
  };
}

const STEPS = [
  {
    id: "leadCreated",
    label: "Adaugă primul lead",
    description: "Creează un lead manual sau importă din CSV",
  },
  {
    id: "stageEdited",
    label: "Personalizează stadiile pipeline",
    description: "Adaptează kanban-ul la procesul tău de vânzare",
  },
  {
    id: "templateCreated",
    label: "Setează un template de mesaj",
    description: "Email, WhatsApp sau SMS gata de trimis",
  },
  {
    id: "messageSent",
    label: "Trimite primul mesaj",
    description: "Contactează un lead din cartonaşul lui",
  },
] as const;

type StepId = (typeof STEPS)[number]["id"];

function getStorageKey(tenantId: string) {
  return `vl_onboarding_${tenantId}_v1`;
}

interface StoredState {
  steps: Record<StepId, boolean>;
  dismissed: boolean;
}

function loadState(tenantId: string): StoredState {
  try {
    const raw = localStorage.getItem(getStorageKey(tenantId));
    if (!raw) return { steps: { leadCreated: false, stageEdited: false, templateCreated: false, messageSent: false }, dismissed: false };
    return JSON.parse(raw) as StoredState;
  } catch {
    return { steps: { leadCreated: false, stageEdited: false, templateCreated: false, messageSent: false }, dismissed: false };
  }
}

function saveState(tenantId: string, state: StoredState): void {
  try {
    localStorage.setItem(getStorageKey(tenantId), JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function OnboardingChecklist({ tenantId, totalLeads, stepsDone = {} }: OnboardingChecklistProps) {
  const [state, setState] = useState<StoredState>(() => loadState(tenantId));
  const [collapsed, setCollapsed] = useState(false);

  // Merge external step completion signals
  useEffect(() => {
    if (Object.keys(stepsDone).length === 0) return;
    setState((prev) => {
      const newSteps = { ...prev.steps };
      let changed = false;
      for (const [k, v] of Object.entries(stepsDone)) {
        if (v && !newSteps[k as StepId]) {
          newSteps[k as StepId] = true;
          changed = true;
        }
      }
      if (!changed) return prev;
      const next = { ...prev, steps: newSteps };
      saveState(tenantId, next);
      return next;
    });
  }, [stepsDone, tenantId]);

  // Auto-dismiss when all done
  useEffect(() => {
    const allDone = STEPS.every((s) => state.steps[s.id]);
    if (allDone && !state.dismissed) {
      const next = { ...state, dismissed: true };
      setState(next);
      saveState(tenantId, next);
    }
  }, [state, tenantId]);

  const handleDismiss = () => {
    const next = { ...state, dismissed: true };
    setState(next);
    saveState(tenantId, next);
  };

  // Visibility: only show if tenant has < 5 leads AND not dismissed
  if (state.dismissed || totalLeads >= 5) return null;

  const doneCount = STEPS.filter((s) => state.steps[s.id]).length;
  const progress = (doneCount / STEPS.length) * 100;

  return (
    <div
      role="complementary"
      aria-label="Ghid de pornire"
      className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-40 w-72 rounded-xl border border-border bg-card shadow-lg overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-primary animate-pulse" aria-hidden="true" />
          <span className="text-sm font-semibold">Ghid de pornire</span>
          <span className="text-xs text-muted-foreground">{doneCount}/{STEPS.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Extinde ghidul" : "Colapsează ghidul"}
            aria-expanded={!collapsed}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Ascunde ghidul de pornire"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-muted overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${progress}%` }}
          role="progressbar"
          aria-valuenow={doneCount}
          aria-valuemin={0}
          aria-valuemax={STEPS.length}
          aria-label={`${doneCount} din ${STEPS.length} paşi completaţi`}
        />
      </div>

      {/* Steps list */}
      {!collapsed && (
        <div className="p-3 space-y-2">
          {STEPS.map((step) => {
            const done = state.steps[step.id];
            return (
              <div
                key={step.id}
                className={cn(
                  "flex items-start gap-2.5 rounded-lg p-2.5 transition-colors",
                  done ? "bg-emerald-50 dark:bg-emerald-900/20" : "hover:bg-muted/50"
                )}
              >
                {done ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-500 dark:text-emerald-400" aria-hidden="true" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" aria-hidden="true" />
                )}
                <div className="min-w-0">
                  <p className={cn("text-xs font-semibold leading-snug", done && "line-through text-muted-foreground")}>
                    {step.label}
                  </p>
                  {!done && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                      {step.description}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
