import { useState, useMemo } from "react";
import {
  Users,
  TrendingUp,
  DollarSign,
  Activity,
  Download,
  Calendar,
  Award,
} from "lucide-react";
import { ModulePageShell } from "@/components/modules/ModulePageShell";
import { ModuleHero } from "@/components/modules/ModuleHero";
import { ModuleFAQ } from "@/components/modules/ModuleFAQ";
import { KPICard } from "@/components/modules/rapoarte/KPICard";
import { LineChart, type LinePoint } from "@/components/modules/rapoarte/LineChart";
import { BarChart, type BarItem } from "@/components/modules/rapoarte/BarChart";
import { cn, PASTEL_CYCLE } from "@/lib/utils";

type Period = "7d" | "30d" | "90d" | "12m";

interface PeriodData {
  kpis: { mrr: number; students: number; ltv: number; churn: number; deltaMrr: number; deltaStudents: number; deltaLtv: number; deltaChurn: number };
  mrrSeries: LinePoint[];
  revenuePerCourse: BarItem[];
}

const PERIOD_DATA: Record<Period, PeriodData> = {
  "7d": {
    kpis: { mrr: 24380, students: 342, ltv: 1280, churn: 3.2, deltaMrr: 4.2, deltaStudents: 1.5, deltaLtv: 2.8, deltaChurn: -0.4 },
    mrrSeries: [
      { label: "L", value: 21800 },
      { label: "Ma", value: 22300 },
      { label: "Mi", value: 22900 },
      { label: "J", value: 23100 },
      { label: "V", value: 23800 },
      { label: "S", value: 24100 },
      { label: "D", value: 24380 },
    ],
    revenuePerCourse: [
      { label: "Engleză", value: 9800 },
      { label: "Programare", value: 5200 },
      { label: "Pian", value: 3900 },
      { label: "Robotică", value: 2900 },
      { label: "Dans", value: 2580 },
    ],
  },
  "30d": {
    kpis: { mrr: 24380, students: 342, ltv: 1280, churn: 3.8, deltaMrr: 12.5, deltaStudents: 8.2, deltaLtv: 6.4, deltaChurn: -1.2 },
    mrrSeries: [
      { label: "S1", value: 18400 },
      { label: "S2", value: 20100 },
      { label: "S3", value: 22400 },
      { label: "S4", value: 24380 },
    ],
    revenuePerCourse: [
      { label: "Engleză", value: 9800 },
      { label: "Programare", value: 5200 },
      { label: "Pian", value: 3900 },
      { label: "Robotică", value: 2900 },
      { label: "Dans", value: 2580 },
    ],
  },
  "90d": {
    kpis: { mrr: 24380, students: 342, ltv: 1280, churn: 4.1, deltaMrr: 31.8, deltaStudents: 19.4, deltaLtv: 11.2, deltaChurn: -2.1 },
    mrrSeries: [
      { label: "Mar", value: 16200 },
      { label: "Apr", value: 19800 },
      { label: "Mai", value: 24380 },
    ],
    revenuePerCourse: [
      { label: "Engleză", value: 28400 },
      { label: "Programare", value: 14800 },
      { label: "Pian", value: 11200 },
      { label: "Robotică", value: 8400 },
      { label: "Dans", value: 7600 },
    ],
  },
  "12m": {
    kpis: { mrr: 24380, students: 342, ltv: 1280, churn: 4.5, deltaMrr: 89.2, deltaStudents: 64.1, deltaLtv: 38.5, deltaChurn: -3.6 },
    mrrSeries: [
      { label: "Iun", value: 12900 },
      { label: "Iul", value: 13400 },
      { label: "Aug", value: 11200 },
      { label: "Sep", value: 16800 },
      { label: "Oct", value: 18100 },
      { label: "Nov", value: 19400 },
      { label: "Dec", value: 20800 },
      { label: "Ian", value: 21200 },
      { label: "Feb", value: 22100 },
      { label: "Mar", value: 22800 },
      { label: "Apr", value: 23400 },
      { label: "Mai", value: 24380 },
    ],
    revenuePerCourse: [
      { label: "Engleză", value: 112400 },
      { label: "Programare", value: 58200 },
      { label: "Pian", value: 44600 },
      { label: "Robotică", value: 33400 },
      { label: "Dans", value: 28800 },
    ],
  },
};

const PERIOD_LABELS: Record<Period, string> = {
  "7d": "7 zile",
  "30d": "30 zile",
  "90d": "90 zile",
  "12m": "12 luni",
};

const TOP_STUDENTS = [
  { name: "Maria Popescu", course: "Engleză B2", ltv: 4280, monthsActive: 24 },
  { name: "Andrei Ionescu", course: "Programare Python", ltv: 3960, monthsActive: 18 },
  { name: "Elena Vasilescu", course: "Pian", ltv: 3640, monthsActive: 20 },
  { name: "Mihai Stoica", course: "Engleză C1", ltv: 3320, monthsActive: 22 },
  { name: "Ana Dumitrescu", course: "Spaniolă B1", ltv: 2980, monthsActive: 16 },
];

const sections = [
  {
    icon: Activity,
    title: "Dashboard live",
    description: "KPI-uri actualizate la fiecare 30 secunde. Vezi exact unde stă centrul tău acum.",
    bullets: ["MRR, ARR, ARPU, LTV, CAC, churn", "Filtre pe filială, profesor, disciplină", "Comparație cu perioada anterioară", "Export PNG/PDF al dashboard-ului"],
  },
  {
    icon: TrendingUp,
    title: "Profitabilitate granulară",
    description: "Vezi exact ce curs face bani și care îi pierde.",
    bullets: ["P&L per disciplină, profesor, grupă", "Marja contribuită pe fiecare client", "Top 10 elevi după LTV", "Cohort analysis lună-lună"],
  },
  {
    icon: Users,
    title: "Retenție și churn",
    description: "Predicție automată a elevilor cu risc de plecare, cu motive identificate.",
    bullets: ["Risk score per elev (0-100)", "Motive: prezență scăzută, plăți întârziate, lipsă engagement", "Sugestii acțiuni preventive", "Alert manager pentru top-risk weekly"],
  },
  {
    icon: Download,
    title: "Export & integrări",
    description: "Toate rapoartele se exportă în formatul cerut de contabilul tău.",
    bullets: ["Excel cu pivot tables pre-configurate", "PDF cu branding-ul tău", "CSV pentru import în alte tool-uri", "Webhook real-time la generare raport"],
  },
];

const faqs = [
  {
    q: "De unde vin datele? Pot avea încredere în calcule?",
    a: "Toate KPI-urile sunt calculate din evenimente atomice salvate în baza de date (plată primită, lecție prezentată, abonament anulat). Nu există conturi intermediare manuale. Poți face drill-down de la orice cifră până la tranzacția individuală care a contribuit. Audit log complet, retenție 7 ani.",
  },
  {
    q: "Cât de des se actualizează rapoartele?",
    a: 'KPI-urile principale (MRR, elevi activi, churn) se actualizează la fiecare 30 secunde. Rapoartele profunde (cohort, retention curves) se recalculează zilnic la 03:00 GMT+3. Dacă vrei un raport recalculat instant, există buton „Refresh".',
  },
  {
    q: "Pot crea rapoarte custom dincolo de cele predefinite?",
    a: "Da, pe planurile Pro și Enterprise. Editor vizual de query care îți permite să combini orice metrică × orice dimensiune (timp, filială, profesor, sursă, plan). Salvezi raportul, îl programezi să-ți vină pe email săptămânal/lunar. Pe Enterprise: SQL direct read-only pentru analiști.",
  },
  {
    q: "Există export către Google Looker, Tableau, Power BI?",
    a: "Da. API REST cu paginare pentru pull-uri mari + conector nativ Looker Studio (gratuit). Pentru Power BI și Tableau folosim ODBC connector. Webhooks pentru push real-time în warehouse (Snowflake, BigQuery) — Enterprise.",
  },
];

export function RapoartePage() {
  const [period, setPeriod] = useState<Period>("30d");
  const data = PERIOD_DATA[period];

  const periodLabel = useMemo(() => PERIOD_LABELS[period], [period]);

  const formatEur = (v: number) =>
    new Intl.NumberFormat("ro-RO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);

  return (
    <ModulePageShell>
      <ModuleHero
        badge="Modulul Rapoarte"
        title={
          <>
            Datele tale, <span className="text-gradient">vizuale și acționabile</span>
          </>
        }
        description="Dashboard live cu KPI-uri în timp real, profitabilitate granulară per curs/profesor, predicție churn cu motive identificate și export către Excel/PDF/Looker. Iei decizii pe cifre, nu pe intuiție."
        ctaPrimary={{ label: "Cere demo rapoarte", href: "#/?demo=rapoarte" }}
        ctaSecondary={{ label: "Vezi prețuri", href: "#/?section=pricing" }}
      />

      <section className="container mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-display font-bold tracking-tight flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Dashboard live · {periodLabel}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Schimbă perioada și vezi cum se modifică toate KPI-urile.
              </p>
            </div>
            <div role="tablist" aria-label="Selectare perioadă" className="inline-flex items-center gap-1 rounded-md border border-border bg-card p-1 self-start">
              {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                <button
                  key={p}
                  role="tab"
                  aria-selected={period === p}
                  onClick={() => setPeriod(p)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-semibold rounded transition-colors",
                    period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8" key={period}>
            <KPICard label="MRR" value={data.kpis.mrr} format="currency" delta={data.kpis.deltaMrr} pastel="pastel-mint" icon={DollarSign} />
            <KPICard label="Elevi activi" value={data.kpis.students} format="number" delta={data.kpis.deltaStudents} pastel="pastel-sky" icon={Users} />
            <KPICard label="LTV mediu" value={data.kpis.ltv} format="currency" delta={data.kpis.deltaLtv} pastel="pastel-lavender" icon={Award} />
            <KPICard label="Churn rate" value={data.kpis.churn} format="percent" delta={data.kpis.deltaChurn} pastel="pastel-peach" icon={Activity} />
          </div>

          <div className="grid lg:grid-cols-2 gap-6 mb-8">
            <LineChart key={`mrr-${period}`} data={data.mrrSeries} title={`MRR în timp (${periodLabel})`} yFormat={(v) => `${(v / 1000).toFixed(0)}k`} />
            <BarChart key={`bar-${period}`} data={data.revenuePerCourse} title="Venituri per disciplină" format={formatEur} />
          </div>

          <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-md">
            <div className="border-b border-border bg-muted/30 px-5 py-4">
              <h3 className="text-base font-bold">Top 5 elevi după LTV</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Lifetime value cumulat, sortat descrescător</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th scope="col" className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5">#</th>
                  <th scope="col" className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5">Elev</th>
                  <th scope="col" className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5">Curs</th>
                  <th scope="col" className="text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5">Luni</th>
                  <th scope="col" className="text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5">LTV</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {TOP_STUDENTS.map((s, i) => (
                  <tr key={s.name} className="hover:bg-muted/30">
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{i + 1}</td>
                    <td className="px-4 py-3 font-medium">{s.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.course}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{s.monthsActive}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatEur(s.ltv)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="bg-muted/30 border-y border-border/60 py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-14">
            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-4">
              4 capabilități
            </span>
            <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">
              Rapoarte care nu mint
            </h2>
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
