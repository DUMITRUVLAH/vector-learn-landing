import { Check, X, Sparkles, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Plan } from "./PricingWizard";

export interface PlanInfo {
  id: Plan;
  name: string;
  description: string;
  priceMonthlyEUR: number | null;
  priceYearlyEUR: number | null;
  features: string[];
}

export const PLANS: Record<Plan, PlanInfo> = {
  starter: {
    id: "starter",
    name: "Starter",
    description: "Mic centru, până la 50 elevi",
    priceMonthlyEUR: 29,
    priceYearlyEUR: 24,
    features: [
      "Până la 50 elevi",
      "1 filială, 5 utilizatori",
      "Orar + plăți de bază",
      "Email & SMS notifications",
      "Aplicație mobilă",
    ],
  },
  growth: {
    id: "growth",
    name: "Growth",
    description: "Centre în creștere (50–250 elevi)",
    priceMonthlyEUR: 69,
    priceYearlyEUR: 57,
    features: [
      "Până la 250 elevi · 3 filiale · 15 utilizatori",
      "Tot din Starter +",
      "CRM cu pipeline",
      "WhatsApp Business API",
      "Automatizări nelimitate",
      "AI 500 acțiuni/lună",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    description: "Rețele cu volum mare",
    priceMonthlyEUR: 149,
    priceYearlyEUR: 124,
    features: [
      "Elevi & filiale nelimitate",
      "Tot din Growth +",
      "White-label complet (App Store)",
      "AI nelimitat",
      "API access + webhooks",
      "Integrare 1C + e-Factura",
      "SSO + permisiuni granulare",
    ],
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    description: "Francize și grupuri educaționale",
    priceMonthlyEUR: null,
    priceYearlyEUR: null,
    features: [
      "Tot din Pro +",
      "Deployment dedicat sau on-premise",
      "SLA 99.9% garantat",
      "Migrare gratuită white-glove",
      "Training echipă inclus",
      "Custom features la cerere",
      "Account manager dedicat",
    ],
  },
};

interface PlanRecommendationProps {
  recommended: Plan;
  currency: "EUR" | "RON";
  yearly: boolean;
  onReset: () => void;
}

const RON_RATE = 4.97;

export function PlanRecommendation({ recommended, currency, yearly, onReset }: PlanRecommendationProps) {
  const planOrder: Plan[] = ["starter", "growth", "pro", "enterprise"];
  const rate = currency === "RON" ? RON_RATE : 1;

  const fmt = (n: number | null) => {
    if (n === null) return "Custom";
    return new Intl.NumberFormat("ro-RO", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(n * rate);
  };

  return (
    <div className="space-y-6">
      <div className="text-center" data-testid="plan-recommended">
        <span className="inline-flex items-center gap-1 rounded-full bg-success/10 text-success px-3 py-1 text-xs font-bold uppercase tracking-wide mb-3">
          <Sparkles className="h-3 w-3" />
          Planul recomandat
        </span>
        <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">
          <span className="text-gradient">{PLANS[recommended].name}</span>
        </h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
          {PLANS[recommended].description}
        </p>
        <button
          type="button"
          onClick={onReset}
          className="mt-3 text-xs text-muted-foreground hover:text-foreground underline"
        >
          Reia quiz-ul
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {planOrder.map((id) => {
          const plan = PLANS[id];
          const isRec = id === recommended;
          const price = yearly ? plan.priceYearlyEUR : plan.priceMonthlyEUR;
          return (
            <article
              key={id}
              data-testid={`plan-${id}`}
              className={cn(
                "relative rounded-2xl border bg-card p-6 flex flex-col",
                isRec
                  ? "border-primary shadow-xl ring-2 ring-primary/30 lg:scale-105 z-10"
                  : "border-border shadow-sm opacity-90"
              )}
            >
              {isRec && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-primary to-accent px-3 py-1 text-[10px] font-bold text-primary-foreground uppercase tracking-wide">
                  <Sparkles className="h-3 w-3" />
                  Pentru tine
                </span>
              )}
              <h3 className="text-base font-display font-bold mb-1">{plan.name}</h3>
              <p className="text-xs text-muted-foreground mb-4 leading-relaxed">{plan.description}</p>

              <div className="mb-4">
                {price === null ? (
                  <p className="text-2xl font-display font-bold">Custom</p>
                ) : (
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-display font-bold tabular-nums">{fmt(price)}</span>
                    <span className="text-xs text-muted-foreground">/lună</span>
                  </div>
                )}
              </div>

              <a
                href={price === null ? "#sales" : "#trial"}
                className={cn(
                  "inline-flex items-center justify-center gap-1 rounded-md px-4 py-2 text-xs font-semibold mb-4 transition-all",
                  isRec
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "border border-border bg-card hover:bg-muted text-foreground"
                )}
              >
                {price === null ? "Vorbește cu vânzările" : "Începe trial 14 zile"}
                {isRec && <ArrowRight className="h-3 w-3" />}
              </a>

              <ul className="space-y-1.5 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-1.5 text-[11px] text-foreground/85">
                    <Check className="h-3 w-3 text-primary mt-0.5 flex-shrink-0" strokeWidth={2.5} />
                    {f}
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>

      <div className="rounded-xl bg-muted/40 border border-border p-5 text-center">
        <p className="text-xs text-muted-foreground">
          Toate planurile includ: backup zilnic, SSL gratuit, GDPR + ANSPDCP compliance,
          găzduire în UE și suport în română.
        </p>
      </div>
    </div>
  );
}

export function comparePlans(plan: Plan): { included: string[]; missing: string[] } {
  const planFeatures = PLANS[plan].features;
  const allFeatures = new Set<string>();
  for (const p of Object.values(PLANS)) {
    for (const f of p.features) allFeatures.add(f);
  }
  const included = planFeatures;
  const missing = Array.from(allFeatures).filter((f) => !included.includes(f));
  return { included, missing };
}

export const PlanComparisonRow = ({ feature, included }: { feature: string; included: boolean }) =>
  included ? <Check className="h-3.5 w-3.5 text-success inline" /> : <X className="h-3.5 w-3.5 text-muted-foreground/40 inline" />;
