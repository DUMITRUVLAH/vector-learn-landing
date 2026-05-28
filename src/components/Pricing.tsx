import { Check, Sparkles } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const plans = [
  {
    name: "Starter",
    description: "Pentru centre mici, până la 50 de elevi activi",
    priceMonthly: 29,
    priceYearly: 24,
    cta: "Începe gratuit",
    features: [
      "Până la 50 elevi activi",
      "1 filială, 5 utilizatori",
      "Orar interactiv",
      "Plăți & facturi de bază",
      "Email & SMS notifications",
      "Aplicație mobilă pentru elevi",
      "Suport prin email",
    ],
    highlighted: false,
  },
  {
    name: "Growth",
    description: "Cel mai popular — pentru centre în creștere",
    priceMonthly: 69,
    priceYearly: 57,
    cta: "Începe trial 14 zile",
    features: [
      "Până la 250 elevi activi",
      "3 filiale, 15 utilizatori",
      "Toate funcțiile Starter +",
      "CRM și pipeline vânzări",
      "WhatsApp Business API",
      "Automatizări nelimitate",
      "Salarii profesori automate",
      "Branding personalizat (logo, culori)",
      "Suport prioritar 24/7",
    ],
    highlighted: true,
    badge: "Cel mai popular",
  },
  {
    name: "Pro",
    description: "Pentru rețele și centre cu volum mare",
    priceMonthly: 149,
    priceYearly: 124,
    cta: "Începe trial 14 zile",
    features: [
      "Elevi nelimitați",
      "Filiale & utilizatori nelimitați",
      "Toate funcțiile Growth +",
      "AI Assistant inclus",
      "White-label complet (app store)",
      "API access & webhooks",
      "Integrare 1C și e-Factura",
      "SSO și permisiuni granulare",
      "Account manager dedicat",
    ],
    highlighted: false,
  },
  {
    name: "Enterprise",
    description: "Pentru francize și grupuri educaționale",
    priceMonthly: null,
    priceYearly: null,
    cta: "Vorbește cu vânzările",
    features: [
      "Toate funcțiile Pro +",
      "Deployment dedicat sau on-premise",
      "SLA 99.9% garantat",
      "Migrare gratuită din alt sistem",
      "Training echipă inclus",
      "Custom features la cerere",
      "Audit de securitate dedicat",
      "Contract și facturare custom",
    ],
    highlighted: false,
    custom: true,
  },
];

export function Pricing() {
  const [yearly, setYearly] = useState(true);

  return (
    <section id="pricing" className="py-24 sm:py-32">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center mb-12">
          <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-4">
            Prețuri
          </span>
          <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">
            Prețuri{" "}
            <span className="text-gradient">corecte, fără surprize</span>
          </h2>
          <p className="mt-4 text-base text-muted-foreground">
            Începi cu trial de 14 zile, fără card. Anulezi oricând. Schimbi planul cu un click.
          </p>

          <div className="mt-8 inline-flex items-center gap-3 rounded-full border border-border bg-card p-1">
            <button
              type="button"
              onClick={() => setYearly(false)}
              className={cn(
                "px-4 py-1.5 text-sm font-semibold rounded-full transition-all",
                !yearly ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              Lunar
            </button>
            <button
              type="button"
              onClick={() => setYearly(true)}
              className={cn(
                "px-4 py-1.5 text-sm font-semibold rounded-full transition-all flex items-center gap-2",
                yearly ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              Anual
              <span className={cn(
                "text-[10px] rounded-full px-1.5 py-0.5 font-bold",
                yearly ? "bg-white/20 text-white" : "bg-success/10 text-success"
              )}>
                -17%
              </span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {plans.map((plan) => (
            <article
              key={plan.name}
              className={cn(
                "relative rounded-2xl border bg-card p-6 flex flex-col",
                plan.highlighted
                  ? "border-primary shadow-xl ring-1 ring-primary/30 lg:scale-105 lg:z-10"
                  : "border-border shadow-sm"
              )}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-primary to-[hsl(250,76%,52%)] px-3 py-1 text-[10px] font-bold text-white shadow-md uppercase tracking-wider">
                  <Sparkles className="h-3 w-3" />
                  {plan.badge}
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-lg font-display font-bold">{plan.name}</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {plan.description}
                </p>
              </div>

              <div className="mb-6">
                {plan.custom ? (
                  <p className="text-3xl font-display font-bold">Custom</p>
                ) : (
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-display font-bold">
                      €{yearly ? plan.priceYearly : plan.priceMonthly}
                    </span>
                    <span className="text-sm text-muted-foreground">/lună</span>
                  </div>
                )}
                {!plan.custom && yearly && (
                  <p className="text-[10px] text-success font-medium mt-1">
                    Facturat anual — economisești €{((plan.priceMonthly! - plan.priceYearly!) * 12).toFixed(0)}/an
                  </p>
                )}
                {!plan.custom && !yearly && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Sau €{plan.priceYearly}/lună cu plată anuală
                  </p>
                )}
              </div>

              <a
                href={plan.custom ? "#sales" : "#trial"}
                className={cn(
                  "inline-flex items-center justify-center rounded-md px-4 py-2.5 text-sm font-semibold transition-all touch-target mb-6",
                  plan.highlighted
                    ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md hover:shadow-lg"
                    : "border border-border bg-card hover:bg-muted text-foreground"
                )}
              >
                {plan.cta}
              </a>

              <ul className="space-y-2.5 flex-1">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2 text-xs text-foreground/85"
                  >
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" strokeWidth={2.5} />
                    {feature}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div className="mt-12 text-center">
          <p className="text-sm text-muted-foreground">
            Toate planurile includ <strong className="text-foreground">backup zilnic</strong>,{" "}
            <strong className="text-foreground">SSL gratuit</strong>,{" "}
            <strong className="text-foreground">GDPR compliance</strong> și{" "}
            <strong className="text-foreground">găzduire în UE</strong>.
          </p>
        </div>
      </div>
    </section>
  );
}
