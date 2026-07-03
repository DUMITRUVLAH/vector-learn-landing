/**
 * CORE-005: FinDesk onboarding 3-step wizard — /app/fin/onboarding
 * Guides a new tenant from zero to first invoice in <10 minutes.
 *
 * Steps:
 *   1. Configurează compania (org profile + invoice series — CORE-003)
 *   2. Adaugă primul partener (PARTY module, coming soon — graceful fallback)
 *   3. Emite prima factură (BILL module, coming soon — graceful fallback)
 *
 * Pattern: read `fin_onboarding` step via GET /api/fin/onboarding.
 * PATCH /api/fin/onboarding advances or skips steps.
 * When step=done, redirect to /app/fin and never show the wizard again.
 *
 * Design system: Vector 365 tokens only — no hardcoded hex.
 * WCAG AA: touch targets ≥44px, aria-labels, keyboard nav.
 * CORE: backlog/fin/FIN-CORE.md §4 (onboarding)
 */
import { useEffect, useState, useCallback } from "react";
import {
  Building2,
  Users,
  FileText,
  CheckCircle2,
  ArrowRight,
  ChevronRight,
  Loader2,
  AlertCircle,
  SkipForward,
} from "lucide-react";
import { FinLayout } from "./FinLayout";
import { useRouter } from "@/router/HashRouter";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type OnboardingStep = "company" | "parties" | "first_invoice" | "done";

interface OnboardingState {
  id: string;
  tenantId: string;
  step: OnboardingStep;
  completedSteps: string[];
  createdAt: string;
  updatedAt: string;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function fetchOnboarding(): Promise<OnboardingState> {
  const res = await fetch("/api/fin/onboarding", { credentials: "include" });
  if (!res.ok) throw new Error(`fetchOnboarding: ${res.status}`);
  const data = (await res.json()) as { onboarding: OnboardingState };
  return data.onboarding;
}

async function patchOnboarding(step: OnboardingStep): Promise<OnboardingState> {
  const res = await fetch("/api/fin/onboarding", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ step }),
  });
  if (!res.ok) throw new Error(`patchOnboarding: ${res.status}`);
  const data = (await res.json()) as { onboarding: OnboardingState };
  return data.onboarding;
}

// ─── Step definitions ─────────────────────────────────────────────────────────

const STEPS: {
  id: OnboardingStep;
  label: string;
  description: string;
  icon: React.ElementType;
  ctaLabel: string;
  ctaHref?: string;
  nextStep: OnboardingStep;
  available: boolean;
}[] = [
  {
    id: "company",
    label: "Configurează compania",
    description:
      "Completează datele fiscale (IDNO, regim TVA, adresă) și creează prima serie de facturare.",
    icon: Building2,
    ctaLabel: "Deschide profilul firmei",
    ctaHref: "/business/fin/company",
    nextStep: "parties",
    available: true,
  },
  {
    id: "parties",
    label: "Adaugă primul partener",
    description: "Creează un client sau furnizor. Partenerii sunt reutilizați în toate facturile.",
    icon: Users,
    ctaLabel: "Administrare parteneri",
    ctaHref: undefined, // PARTY module not yet built
    nextStep: "first_invoice",
    available: false, // Will become true when PARTY module ships
  },
  {
    id: "first_invoice",
    label: "Emite prima factură",
    description: "Completează și trimite prima factură unui client — fiscalizată și numerotată automat.",
    icon: FileText,
    ctaLabel: "Creare factură",
    ctaHref: undefined, // BILL module not yet built
    nextStep: "done",
    available: false, // Will become true when BILL module ships
  },
];

const STEP_ORDER: OnboardingStep[] = ["company", "parties", "first_invoice", "done"];

function stepIndex(step: OnboardingStep): number {
  return STEP_ORDER.indexOf(step);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface StepCardProps {
  step: (typeof STEPS)[number];
  index: number;
  isActive: boolean;
  isCompleted: boolean;
  onAdvance: () => void;
  onSkip: () => void;
  advancing: boolean;
}

function StepCard({ step, index, isActive, isCompleted, onAdvance, onSkip, advancing }: StepCardProps) {
  const Icon = step.icon;
  const stepNumber = index + 1;

  return (
    <div
      className={cn(
        "rounded-xl border p-5 transition-all",
        isActive
          ? "border-primary/40 bg-primary/5 dark:bg-primary/10 shadow-sm"
          : isCompleted
          ? "border-border bg-card/40 opacity-70"
          : "border-border bg-card/20 opacity-50"
      )}
      aria-current={isActive ? "step" : undefined}
    >
      <div className="flex items-start gap-4">
        {/* Step icon / completion indicator */}
        <div
          className={cn(
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            isCompleted
              ? "bg-primary/15 text-primary"
              : isActive
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          )}
          aria-hidden="true"
        >
          {isCompleted ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : (
            <Icon className="h-5 w-5" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Pas {stepNumber}
            </span>
            {isCompleted && (
              <span className="text-[10px] rounded-full bg-primary/15 px-1.5 py-0.5 text-primary font-semibold">
                Finalizat
              </span>
            )}
          </div>
          <h3 className="mt-0.5 text-sm font-semibold text-foreground">{step.label}</h3>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{step.description}</p>

          {/* Actions — only shown on active step */}
          {isActive && !isCompleted && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {step.available && step.ctaHref ? (
                <a
                  href={`#${step.ctaHref}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity min-h-[44px]"
                >
                  {step.ctaLabel}
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-4 py-2.5 text-xs font-medium text-muted-foreground min-h-[44px]">
                  {step.ctaLabel}
                  <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">În curând</span>
                </span>
              )}

              {/* Mark as done button (to allow the wizard to advance even when CTA is unavailable) */}
              <button
                type="button"
                onClick={onAdvance}
                disabled={advancing}
                aria-label="Marchează pasul ca finalizat și treci la următor"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-4 py-2.5 text-xs font-medium text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors min-h-[44px] disabled:opacity-50"
              >
                {advancing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Pas următor
              </button>

              <button
                type="button"
                onClick={onSkip}
                disabled={advancing}
                aria-label="Sari peste tur și mergi la panoul principal"
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors min-h-[44px] disabled:opacity-50"
              >
                <SkipForward className="h-3.5 w-3.5" aria-hidden="true" />
                Sari peste tur
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ currentStep }: { currentStep: OnboardingStep }) {
  const realSteps = STEPS; // 3 steps (excludes "done")
  const currentIdx = Math.min(stepIndex(currentStep), realSteps.length);
  const pct = currentIdx === 0 ? 5 : (currentIdx / realSteps.length) * 100;

  return (
    <div aria-label={`Progres onboarding: ${currentIdx} din ${realSteps.length} pași`}>
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
        <span>Progres</span>
        <span className="font-semibold text-foreground">
          {currentIdx}/{realSteps.length}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={currentIdx} aria-valuemin={0} aria-valuemax={realSteps.length}>
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FinOnboarding() {
  const { navigate } = useRouter();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);

  useEffect(() => {
    fetchOnboarding()
      .then((s) => {
        setState(s);
        // If already done, redirect immediately
        if (s.step === "done") navigate("/app/fin");
      })
      .catch(() => setError("Nu am putut încărca turul de instalare."))
      .finally(() => setLoading(false));
  }, [navigate]);

  const advance = useCallback(
    async (target: OnboardingStep) => {
      if (!state || advancing) return;
      setAdvancing(true);
      try {
        const updated = await patchOnboarding(target);
        setState(updated);
        if (target === "done") navigate("/app/fin");
      } catch {
        setError("Nu am putut avansa pasul. Încearcă din nou.");
      } finally {
        setAdvancing(false);
      }
    },
    [state, advancing, navigate]
  );

  const handleAdvanceFromStep = useCallback(
    (stepDef: (typeof STEPS)[number]) => () => {
      advance(stepDef.nextStep);
    },
    [advance]
  );

  const handleSkip = useCallback(() => {
    advance("done");
  }, [advance]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <FinLayout
      pageTitle="Tur de instalare"
      pageDescription="Configurează FinDesk în 3 pași — durată estimată: 10 minute"
    >
      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {!loading && !error && state && state.step !== "done" && (
        <div className="max-w-xl space-y-6">
          <ProgressBar currentStep={state.step} />

          <ol className="space-y-3" aria-label="Pași onboarding">
            {STEPS.map((step, index) => {
              const isCompleted =
                (state.completedSteps as string[]).includes(step.id) ||
                stepIndex(state.step) > index;
              const isActive = state.step === step.id;

              return (
                <li key={step.id}>
                  <StepCard
                    step={step}
                    index={index}
                    isActive={isActive}
                    isCompleted={isCompleted}
                    onAdvance={handleAdvanceFromStep(step)}
                    onSkip={handleSkip}
                    advancing={advancing}
                  />
                </li>
              );
            })}
          </ol>

          <p className="text-xs text-muted-foreground text-center">
            Poți relua turul oricând din meniu. Progresul se salvează automat.
          </p>
        </div>
      )}
    </FinLayout>
  );
}
