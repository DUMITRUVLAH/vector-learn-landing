import { useState } from "react";
import { cn } from "@/lib/utils";
import { CalculatorShell } from "@/components/tools/CalculatorShell";
import { PricingWizard, type Plan, type WizardAnswers } from "@/components/tools/PricingWizard";
import { PlanRecommendation } from "@/components/tools/PlanRecommendation";

export function PricingConfiguratorPage() {
  const [result, setResult] = useState<{ plan: Plan; answers: WizardAnswers } | null>(null);
  const [currency, setCurrency] = useState<"EUR" | "RON">("EUR");
  const [yearly, setYearly] = useState(true);

  const reset = () => setResult(null);

  return (
    <CalculatorShell
      badge="Configurator prețuri"
      title={
        <>
          Care plan ți se <span className="text-gradient">potrivește</span>?
        </>
      }
      description="4 întrebări scurte. Recomandare instant, fără email. Toggle RON/EUR și lunar/anual pentru comparația ta locală."
    >
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-wrap items-center justify-end gap-2 mb-6">
          <div role="tablist" aria-label="Monedă" className="inline-flex rounded-full border border-border bg-card p-1">
            {(["EUR", "RON"] as const).map((c) => (
              <button
                key={c}
                role="tab"
                aria-selected={currency === c}
                onClick={() => setCurrency(c)}
                className={cn(
                  "px-3 py-1 text-xs font-semibold rounded-full transition-colors",
                  currency === c ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                )}
              >
                {c}
              </button>
            ))}
          </div>
          <div role="tablist" aria-label="Ciclu plată" className="inline-flex rounded-full border border-border bg-card p-1">
            <button
              role="tab"
              aria-selected={!yearly}
              onClick={() => setYearly(false)}
              className={cn(
                "px-3 py-1 text-xs font-semibold rounded-full transition-colors",
                !yearly ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              )}
            >
              Lunar
            </button>
            <button
              role="tab"
              aria-selected={yearly}
              onClick={() => setYearly(true)}
              className={cn(
                "px-3 py-1 text-xs font-semibold rounded-full transition-colors flex items-center gap-1.5",
                yearly ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              )}
            >
              Anual
              <span
                className={cn(
                  "text-[9px] rounded-full px-1.5 py-0.5 font-bold",
                  yearly ? "bg-primary-foreground/20 text-primary-foreground" : "bg-success/10 text-success"
                )}
              >
                -17%
              </span>
            </button>
          </div>
        </div>

        {!result ? (
          <PricingWizard onComplete={(plan, answers) => setResult({ plan, answers })} />
        ) : (
          <PlanRecommendation
            recommended={result.plan}
            currency={currency}
            yearly={yearly}
            onReset={reset}
          />
        )}
      </div>
    </CalculatorShell>
  );
}
