import { useState, useMemo } from "react";
import { Palette, BarChart3, Lock, FileText } from "lucide-react";
import { ModulePageShell } from "@/components/modules/ModulePageShell";
import { ModuleHero } from "@/components/modules/ModuleHero";
import { ModuleFAQ } from "@/components/modules/ModuleFAQ";
import { RomaniaMap, type Branch } from "@/components/modules/multifilale/RomaniaMap";
import { BranchSwitcher, BranchKPIBar, aggregateKPIs } from "@/components/modules/multifilale/BranchSwitcher";
import { PASTEL_CYCLE } from "@/lib/utils";

const BRANCHES: Branch[] = [
  { id: "buc", city: "București", x: 230, y: 200, students: 540, teachers: 32, monthlyRevenue: 38400, satisfaction: 4.7 },
  { id: "cluj", city: "Cluj-Napoca", x: 130, y: 110, students: 320, teachers: 22, monthlyRevenue: 24800, satisfaction: 4.8 },
  { id: "iasi", city: "Iași", x: 290, y: 100, students: 285, teachers: 18, monthlyRevenue: 19600, satisfaction: 4.6 },
  { id: "tim", city: "Timișoara", x: 90, y: 165, students: 255, teachers: 17, monthlyRevenue: 18200, satisfaction: 4.5 },
];

const sections = [
  {
    icon: Palette,
    title: "Branding per filială",
    description: "Fiecare locație poate avea propriul logo, culori, slogan, dar rămâne în același sistem.",
    bullets: ["Domeniu personalizat (cluj.lingua.ro)", "Culori și fonturi independente", "Wishlist features pe locație", "Tracking analytics separat per filială"],
  },
  {
    icon: BarChart3,
    title: "Rapoarte consolidate",
    description: "Vezi performanța rețelei într-un dashboard, sau drill-down până la o lecție individuală.",
    bullets: ["KPI agregat sau per filială cu un click", "Comparație performanță inter-filială", "Top 5 filiale după LTV", "Heatmap profitabilitate"],
  },
  {
    icon: Lock,
    title: "Roluri pe filială",
    description: "Directorul filialei nu vede datele altor locații. Directorul rețelei vede tot.",
    bullets: ["Row-level security în DB", "SSO cu provider central", "Audit log cross-tenant", "Permisiuni custom per rol per filială"],
  },
  {
    icon: FileText,
    title: "Contracte franciză",
    description: "Royalty automat, raportare pentru francizori, încasări consolidate.",
    bullets: ["Royalty fix sau % din venit, calculat lunar", "P&L consolidat + per franciză", "Contracte digitale cu semnătură", "Transfer automat sume între conturi"],
  },
];

const faqs = [
  {
    q: "Cât de complicat e să adaug o filială nouă?",
    a: '5 minute. Click pe „+ Filială nouă", introduci nume, oraș, adresă, manager. Sistemul creează automat structurile (roluri, planuri tarifare implicite, calendare). Datele istorice de testare se pot importa cu un click pentru ca tu să vezi cum ar arăta operațional.',
  },
  {
    q: "Pot avea prețuri diferite per filială?",
    a: 'Da. Fiecare filială are pricing books separate. Poți avea „Engleză B2 — 280€/lună în București, 220€/lună în Cluj". Reduceri lokale, pachete locale, totul independent. Centralizezi DOAR ce vrei tu (catalog disciplines, brand standards).',
  },
  {
    q: "Cum se gestionează transferul unui elev între filiale?",
    a: 'Click „Transferă elev" → alegi filiala destinație → sistemul mută istoricul, plățile rămase, accesul la app — toate atomic. Pe rapoarte, elevul apare în ambele cu marcaj (left X / joined Y). Royalty-urile (dacă filialele sunt francize separate) se ajustează automat.',
  },
  {
    q: "Suport pentru rețele internaționale (multi-țară)?",
    a: "Da pe planul Enterprise. Multi-currency (RON, EUR, USD, MDL, BGN, HUF), multi-tax (TVA + GST + local taxes), multi-language interfața, multi-timezone calendare. Plus compliance per țară: GDPR (UE), CCPA (US California), LGPD (Brazilia).",
  },
];

export function MultifilalePage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const kpis = useMemo(() => aggregateKPIs(BRANCHES, selectedId), [selectedId]);

  return (
    <ModulePageShell>
      <ModuleHero
        badge="Modulul Multi-filiale"
        title={<>Administrează o rețea, <span className="text-gradient">nu un haos</span></>}
        description="Rețele de centre dintr-un singur cont, cu branding și prețuri independente per filială, rapoarte consolidate, royalty automate pentru franciză și transfer atomic al elevilor între locații. De la 2 filiale la 50, același flux."
        ctaPrimary={{ label: "Cere demo franciză", href: "#/?demo=multifilale" }}
        ctaSecondary={{ label: "Vezi prețuri", href: "#/?section=pricing" }}
      />

      <section className="container mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-display font-bold tracking-tight">
                Vezi rețeaua ta — sau o singură filială
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Click pe un pin pe hartă sau folosește switcher-ul.
              </p>
            </div>
            <BranchSwitcher branches={BRANCHES} selectedId={selectedId} onChange={setSelectedId} />
          </div>

          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            <RomaniaMap branches={BRANCHES} selectedId={selectedId} onSelect={setSelectedId} />
            <div className="space-y-4">
              <BranchKPIBar kpis={kpis} />
              <div className="rounded-2xl border border-border bg-card p-5">
                <h3 className="text-sm font-bold mb-2">
                  {selectedId
                    ? `Detalii filială ${BRANCHES.find((b) => b.id === selectedId)?.city}`
                    : "Rețea consolidată"}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {selectedId
                    ? "Manager filială: acces limitat la datele locației. Pricing local, profesori locali, dar conectat la catalogul central de discipline. Royalty calculat automat dacă e franciză."
                    : "4 filiale active, 1.400 elevi, 89 profesori, satisfacție medie 4.65/5. Drill-down per filială cu un click. Comparație performanță inter-filială în rapoarte."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-muted/30 border-y border-border/60 py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-14">
            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-4">4 capabilități</span>
            <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">Rețea sub control, nu rețea în haos</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-5xl mx-auto">
            {sections.map((section, i) => {
              const Icon = section.icon;
              return (
                <article key={section.title} className="rounded-2xl border border-border bg-card p-6 card-hover">
                  <div className="flex items-start gap-4 mb-3">
                    <div className={`${PASTEL_CYCLE[i % PASTEL_CYCLE.length]} rounded-xl p-2.5 flex-shrink-0`}>
                      <Icon className="h-5 w-5 text-foreground/80" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold mb-1.5">{section.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{section.description}</p>
                    </div>
                  </div>
                  <ul className="space-y-1.5 pl-12">
                    {section.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-2 text-xs text-foreground/80">
                        <span className="h-1 w-1 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                        {bullet}
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <ModuleFAQ items={faqs} />
    </ModulePageShell>
  );
}
