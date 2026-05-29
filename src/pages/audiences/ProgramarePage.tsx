import { Code2, GitBranch, Layers, Award } from "lucide-react";
import { AudiencePageShell } from "@/components/audiences/AudiencePageShell";
import { AudienceHero } from "@/components/audiences/AudienceHero";
import { PainSolutionGrid } from "@/components/audiences/PainSolutionGrid";
import { CaseStudyCard } from "@/components/audiences/CaseStudyCard";
import { ModuleFAQ } from "@/components/modules/ModuleFAQ";

const SKILL_TREE = [
  { level: 1, name: "HTML/CSS", pct: 100 },
  { level: 2, name: "JavaScript fundamentals", pct: 100 },
  { level: 3, name: "DOM & APIs", pct: 85 },
  { level: 4, name: "React/Vue", pct: 60 },
  { level: 5, name: "Backend (Node/Python)", pct: 25 },
  { level: 6, name: "Cloud & DevOps", pct: 0 },
];

const pains = [
  {
    pain: "Drop-off masiv în săptămânile 4-8 — elevii se pierd la primele bug-uri imposibil de debug-uit singuri.",
    solution: "Predicție churn cu motive (commits scăzute, build failures repetate, sub 30% rezolvare exerciții). Notificare instant mentorului pentru sesiune 1:1 personalizată.",
    moduleLabel: "Rapoarte + AI",
    moduleHref: "#/modules/rapoarte",
  },
  {
    pain: "Mentorat 1:1 nu scalează — un mentor bun cu 10 elevi se epuizează rapid.",
    solution: "Auto-routing întrebări: AI răspunde la 70% (debugging clasic, sintaxă, errors comune), mentorul rezolvă restul. Plus matching cohort-tovarași pentru peer support.",
    moduleLabel: "AI Assistant",
    moduleHref: "#/modules/ai",
  },
  {
    pain: "Code review pentru proiectele elevilor consumă ore — și nu există standardizare între mentori.",
    solution: "Integrare nativă GitHub: link la PR în card-ul elevului, AI preview review cu best practices (DRY, naming, security basics), mentorul aprobă/contestă.",
    moduleLabel: "Integrări",
    moduleHref: "#/modules/integrari",
  },
  {
    pain: "Mixează cohort fix (12 săptămâni structurat) cu flexibil (proprio ritm) — Excel nu acoperă ambele.",
    solution: "Două moduri de program: cohort sincronizat cu deadlines fixe + flexibil cu skill-tree personal. Elevul poate trece între ele cu un click. Pricing separat.",
    moduleLabel: "Orar",
    moduleHref: "#/modules/orar",
  },
  {
    pain: "Plasare absolvenți — vrei să-ți dovedești ROI-ul, dar tracking-ul după program e un nightmare.",
    solution: 'Modul „Career" în aplicația mobilă: alumni opt-in pentru update job, sistem trimite poll lunar (still relevant), dashboard cu rate plasare per cohort + per stack.',
    moduleLabel: "Aplicație + Rapoarte",
    moduleHref: "#/modules/mobile",
  },
];

const faqs = [
  {
    q: "Cum funcționează integrarea cu GitHub pentru code review?",
    a: "Conectezi organizația GitHub o singură dată (OAuth). Fiecare elev își leagă contul personal. Când deschide PR pe un repo de la clasă, sistemul preia automat link-ul, generează un preview review cu best practices (folosind un model fine-tuned pe practici clean code), mentorul vede totul în lead-card-ul elevului. Aprobi sau contești cu un click. Audit log per review.",
  },
  {
    q: "Pot rula cohort fix și flexibil în paralel sub același brand?",
    a: 'Da, sunt două „programe" separate cu pricing, calendar și fluxuri diferite. Cohort fix are deadlines hard (week 1 → HTML, week 2 → CSS...). Flexibil are skill-tree personal cu deblocare automată la 80% obiective. Elevii pot trece de la unul la altul cu un click — istoric și progres se păstrează. Multe școli au descoperit că flexibil aduce 30% revenue suplimentar la same headcount mentor.',
  },
  {
    q: "Cum funcționează emiterea certificatelor de finalizare?",
    a: "Certificat digital semnat (eIDAS conform) generat automat când elevul atinge 100% skill-tree sau finalizează cohort cu peste 75% obiective. Include hash on-chain (opțional, Polygon mainnet) pentru verificare publică imutabilă. Recruiter-ii pot scana QR și confirma autenticitatea fără să ne contacteze.",
  },
  {
    q: "Suportă proiecte reale de la clienți (capstone)?",
    a: 'Da. Modul „Capstone" cu workflow: brief client → assignment elev/echipă → milestone-uri cu deadlines → review mentor + client → handoff cu documentație. Plata clientului se împarte automat (% școală, % elev/echipă) conform contractului. Mulți clienți de-ai noștri folosesc asta pentru a transforma proiecte școală în portofoliu plătit.',
  },
];

const caseStudyMetrics = [
  { label: "Cohort completion", value: "78%", delta: "+24 pp" },
  { label: "Plasare la 6 luni", value: "67%", delta: "+12 pp" },
  { label: "NPS mentor", value: "8.4/10", delta: "+1.2" },
  { label: "Cost per absolvent", value: "−38%", delta: "vs anul trecut" },
];

export function ProgramarePage() {
  return (
    <AudiencePageShell>
      <AudienceHero
        badge="Pentru școli de programare & IT"
        title={
          <>
            Mentorat care scalează, <span className="text-gradient">cohort care nu drop-out</span>
          </>
        }
        description="De la HTML pentru începători până la bootcamp full-stack, Vector Learn integrează GitHub, automatizează code review-ul, prezice drop-off-ul și măsoară plasarea absolvenților. Construit cu școli care formează 1.000+ programatori pe an."
        ctaPrimary={{ label: "Cere demo pentru școli IT", href: "#/?demo=programare" }}
        ctaSecondary={{ label: "Vezi prețuri", href: "#/?section=pricing" }}
        visual={
          <div className="rounded-2xl border border-border bg-card p-6 shadow-lg">
            <div className="flex items-center gap-2 mb-4">
              <Code2 className="h-4 w-4 text-primary" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Skill tree · Andrei I.
              </p>
            </div>
            <ul className="space-y-2.5">
              {SKILL_TREE.map((s) => (
                <li key={s.name} className="flex items-center gap-3">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-bold flex-shrink-0">
                    {s.level}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between mb-0.5">
                      <p className="text-xs font-semibold truncate">{s.name}</p>
                      <span className="text-[10px] text-muted-foreground tabular-nums">{s.pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={
                          s.pct === 100
                            ? "h-full bg-success"
                            : s.pct > 0
                              ? "h-full bg-gradient-to-r from-primary to-accent"
                              : "h-full bg-muted"
                        }
                        style={{ width: `${s.pct}%` }}
                        aria-label={`${s.name}: ${s.pct}%`}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-4 pt-3 border-t border-border flex items-center gap-2 text-[10px] text-muted-foreground">
              <GitBranch className="h-3 w-3" />
              42 commits · 8 PR-uri review-uite · 3 proiecte capstone
            </div>
          </div>
        }
      />

      <PainSolutionGrid items={pains} />

      <CaseStudyCard
        centerName='Bootcamp "CodeNation"'
        centerType="Bootcamp full-stack JavaScript + Python"
        scale="320 elevi/cohort · 4 cohorte/an · 18 mentori"
        quote="Predicția churn ne-a salvat 80 de elevi în primul an. Înainte aflam că s-a pierdut un elev la săptămâna 6 — acum primim alert în săptămâna 3 și recuperăm 4 din 5 cazuri printr-un apel mentor."
        author="Mihai C."
        authorRole="Cofondator & Head of Education"
        metrics={caseStudyMetrics}
      />

      <section className="container mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="max-w-3xl mx-auto text-center">
          <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-4">
            Module relevante pentru tine
          </span>
          <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-tight mb-8">
            Stack-ul nostru pentru școli IT
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: Code2, label: "AI Assistant", href: "#/modules/ai" },
              { icon: Layers, label: "Rapoarte cohort", href: "#/modules/rapoarte" },
              { icon: GitBranch, label: "Integrări GitHub", href: "#/modules/integrari" },
              { icon: Award, label: "App cu skill-tree", href: "#/modules/mobile" },
            ].map((m) => {
              const Icon = m.icon;
              return (
                <a
                  key={m.href}
                  href={m.href}
                  className="rounded-xl border border-border bg-card p-4 card-hover flex flex-col items-center gap-2 text-center"
                >
                  <Icon className="h-5 w-5 text-primary" />
                  <span className="text-xs font-semibold">{m.label}</span>
                </a>
              );
            })}
          </div>
        </div>
      </section>

      <ModuleFAQ items={faqs} />
    </AudiencePageShell>
  );
}
