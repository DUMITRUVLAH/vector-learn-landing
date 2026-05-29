import { useState } from "react";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type Plan = "starter" | "growth" | "pro" | "enterprise";

export interface WizardAnswers {
  studentBucket: "small" | "medium" | "large" | "xlarge";
  branches: "one" | "few" | "many";
  integrations: "basic" | "advanced" | "custom";
  whiteLabel: boolean;
  aiUsage: "none" | "light" | "heavy";
}

export function recommendPlan(answers: WizardAnswers): Plan {
  if (
    answers.studentBucket === "xlarge" ||
    answers.branches === "many" ||
    answers.integrations === "custom" ||
    answers.aiUsage === "heavy"
  ) {
    return "enterprise";
  }
  if (
    answers.whiteLabel ||
    answers.studentBucket === "large" ||
    answers.branches === "few" ||
    answers.integrations === "advanced"
  ) {
    return "pro";
  }
  if (answers.studentBucket === "medium" || answers.aiUsage === "light") {
    return "growth";
  }
  return "starter";
}

interface Step {
  key: keyof WizardAnswers;
  title: string;
  hint: string;
  options: Array<{ value: string; label: string; description: string }>;
}

const STEPS: Step[] = [
  {
    key: "studentBucket",
    title: "Câți elevi activi ai?",
    hint: "Elevi cu abonament plătit lunar",
    options: [
      { value: "small", label: "Sub 50", description: "Mic / abia început" },
      { value: "medium", label: "50–250", description: "În creștere" },
      { value: "large", label: "250–1.000", description: "Centru stabilit" },
      { value: "xlarge", label: "1.000+", description: "Rețea sau franciză" },
    ],
  },
  {
    key: "branches",
    title: "Câte filiale operezi?",
    hint: "Sucursale fizice + opțional sucursale online",
    options: [
      { value: "one", label: "1 filială", description: "Un sediu" },
      { value: "few", label: "2–5 filiale", description: "Mini-rețea" },
      { value: "many", label: "6+ filiale", description: "Rețea mare / franciză" },
    ],
  },
  {
    key: "integrations",
    title: "Ce integrări ai nevoie?",
    hint: "Sisteme cu care trebuie să sincronizezi",
    options: [
      { value: "basic", label: "Doar email + WhatsApp", description: "Setup minim" },
      { value: "advanced", label: "+ telefonie + 1C + Stripe", description: "Stack complet" },
      { value: "custom", label: "API custom + SSO + on-prem", description: "Enterprise tech stack" },
    ],
  },
  {
    key: "aiUsage",
    title: "Cât AI vrei să folosești?",
    hint: "Sumarizări, predicție churn, răspuns auto",
    options: [
      { value: "none", label: "Deloc", description: "Doar features clasice" },
      { value: "light", label: "Ocazional", description: "Sub 500 acțiuni AI/lună" },
      { value: "heavy", label: "Intensiv", description: "Tot fluxul automatizat cu AI" },
    ],
  },
];

interface PricingWizardProps {
  onComplete: (plan: Plan, answers: WizardAnswers) => void;
}

export function PricingWizard({ onComplete }: PricingWizardProps) {
  const [stepIdx, setStepIdx] = useState(0);
  const [answers, setAnswers] = useState<Partial<WizardAnswers>>({
    whiteLabel: false,
  });

  const step = STEPS[stepIdx];
  const totalSteps = STEPS.length + 1;
  const isWhiteLabelStep = stepIdx === STEPS.length;

  const setAnswer = (value: string) => {
    setAnswers((prev) => ({ ...prev, [step.key]: value }));
  };

  const next = () => {
    if (stepIdx < STEPS.length) {
      setStepIdx(stepIdx + 1);
    } else {
      const final = answers as WizardAnswers;
      onComplete(recommendPlan(final), final);
    }
  };

  const back = () => {
    if (stepIdx > 0) setStepIdx(stepIdx - 1);
  };

  const canProceed = isWhiteLabelStep ? true : answers[step?.key];

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-md">
      <div className="border-b border-border bg-muted/30 px-5 py-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pas {stepIdx + 1} din {totalSteps}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {Math.round(((stepIdx + 1) / totalSteps) * 100)}%
          </p>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-300"
            style={{ width: `${((stepIdx + 1) / totalSteps) * 100}%` }}
            data-testid="wizard-progress"
          />
        </div>
      </div>

      <div className="p-6 sm:p-8 min-h-[320px]">
        {!isWhiteLabelStep ? (
          <>
            <h3 className="text-lg sm:text-xl font-display font-bold tracking-tight mb-1">
              {step.title}
            </h3>
            <p className="text-xs text-muted-foreground mb-5">{step.hint}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {step.options.map((opt) => {
                const selected = answers[step.key] === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    data-testid={`wizard-${step.key}-${opt.value}`}
                    onClick={() => setAnswer(opt.value)}
                    aria-pressed={selected}
                    className={cn(
                      "rounded-xl border p-4 text-left transition-all",
                      selected
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                        : "border-border bg-card hover:bg-muted"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-bold">{opt.label}</p>
                      {selected && <Check className="h-4 w-4 text-primary" />}
                    </div>
                    <p className="text-xs text-muted-foreground">{opt.description}</p>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <h3 className="text-lg sm:text-xl font-display font-bold tracking-tight mb-1">
              Ai nevoie de white-label complet?
            </h3>
            <p className="text-xs text-muted-foreground mb-5">
              Aplicația mobilă cu numele și logo-ul tău în App Store / Play Store
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                data-testid="wizard-whiteLabel-true"
                onClick={() => setAnswers((p) => ({ ...p, whiteLabel: true }))}
                aria-pressed={answers.whiteLabel === true}
                className={cn(
                  "rounded-xl border p-4 text-left transition-all",
                  answers.whiteLabel === true
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "border-border bg-card hover:bg-muted"
                )}
              >
                <p className="text-sm font-bold mb-1">Da, white-label</p>
                <p className="text-xs text-muted-foreground">
                  Branding-ul meu peste tot. Recomandat dacă ai brand consacrat.
                </p>
              </button>
              <button
                type="button"
                data-testid="wizard-whiteLabel-false"
                onClick={() => setAnswers((p) => ({ ...p, whiteLabel: false }))}
                aria-pressed={answers.whiteLabel === false}
                className={cn(
                  "rounded-xl border p-4 text-left transition-all",
                  answers.whiteLabel === false
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "border-border bg-card hover:bg-muted"
                )}
              >
                <p className="text-sm font-bold mb-1">Nu, e OK „powered by"</p>
                <p className="text-xs text-muted-foreground">
                  Logo-ul tău + nota „powered by Vector Learn". Mai ieftin.
                </p>
              </button>
            </div>
          </>
        )}
      </div>

      <div className="border-t border-border bg-muted/20 px-5 py-4 flex items-center justify-between">
        <button
          type="button"
          onClick={back}
          disabled={stepIdx === 0}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-4 w-4" />
          Înapoi
        </button>
        <button
          type="button"
          onClick={next}
          disabled={!canProceed}
          data-testid="wizard-next"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold transition-all",
            canProceed
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
        >
          {isWhiteLabelStep ? "Vezi planul recomandat" : "Următorul"}
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
