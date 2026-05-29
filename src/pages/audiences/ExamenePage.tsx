import { GraduationCap, Target, Clock, Award } from "lucide-react";
import { AudiencePageShell } from "@/components/audiences/AudiencePageShell";
import { AudienceHero } from "@/components/audiences/AudienceHero";
import { PainSolutionGrid } from "@/components/audiences/PainSolutionGrid";
import { CaseStudyCard } from "@/components/audiences/CaseStudyCard";
import { ModuleFAQ } from "@/components/modules/ModuleFAQ";

const pains = [
  {
    pain: "Sezonalitate ascuțită: 80% din înscrieri vin septembrie + ianuarie. Marketing-ul costă mai mult decât închirierea sediului în lunile de vârf.",
    solution: "CRM cu rezervare slot pentru toamnă încă din iunie. Liste de așteptare automate cu prioritate elev returning. Sugestii buget marketing pe sursele cu CAC < LTV/4.",
    moduleLabel: "CRM & vânzări",
    moduleHref: "#/modules/crm",
  },
  {
    pain: "Părinții vor scoring detaliat (cât a luat la matematică sub-domeniul algebră) — nu o notă globală.",
    solution: 'Simulări cu structură identică examenului real. Scoring per sub-domeniu cu raport vizual „aici stai bine, aici trebuie să muncești". Comparativ cu media grupei + ținta declarată.',
    moduleLabel: "Rapoarte & analize",
    moduleHref: "#/modules/rapoarte",
  },
  {
    pain: "Drop-out după prima simulare nereușită — copilul se demoralizează, părintele cere refund.",
    solution: 'Predicție drop-out: dacă scor simulare < 60% țintă → trigger mentor coaching. Mesaj părinte cu plan recuperare concret, nu „mai muncește". Reduce abandonul cu medie 35%.',
    moduleLabel: "AI Assistant",
    moduleHref: "#/modules/ai",
  },
  {
    pain: 'Părinții anxioși scriu zilnic „cum stă copilul meu" — recepționera nu mai pridvește.',
    solution: 'Dashboard live părinte: scor curent, distanță până la țintă, sub-domenii de muncă, ultima simulare cu detaliu. Plus mesaj săptămânal automat „weekly digest" cu progres.',
    moduleLabel: "Comunicare + Rapoarte",
    moduleHref: "#/modules/comunicare",
  },
  {
    pain: "Profesorii inundă cu materiale (PDF-uri, link-uri YouTube) — copilul se pierde, nu știe ce să facă primul.",
    solution: 'Plan de studiu personalizat per elev, generat din diagnosticarea inițială. Sistem îi spune „azi: 30 min algebră capitolul 4 + 20 min recapitulare lecție trecută". Tracking automat.',
    moduleLabel: "Aplicație mobilă",
    moduleHref: "#/modules/mobile",
  },
];

const caseStudyMetrics = [
  { label: "Rată promovare BAC", value: "94%", delta: "vs 73% media națională" },
  { label: "Medie 9+ la elevii noștri", value: "62%", delta: "+18 pp YoY" },
  { label: "Drop-out după sim. 1", value: "8%", delta: "−27 pp" },
  { label: "Părinți la 2nd kid", value: "71%", delta: "loialitate" },
];

const faqs = [
  {
    q: "Suportă diferite tipuri de examene (BAC, EN, IELTS, SAT, admitere)?",
    a: "Da. Definești structura examenului (probe, durată, scoring, bareme). Pentru cele standard (BAC RO, IELTS, SAT) avem template-uri pre-configurate cu cele mai recente cerințe. Pentru examene specifice (admitere medicină, drept), construiești custom. Updates anuale automate pentru modificările baremului.",
  },
  {
    q: "Cum funcționează predicția drop-out și ce facem la trigger?",
    a: "Modelul învață din istoricul tău: combinație între scor simulare, prezență, engagement în app, comparativ cu media grupei. La risc > 60% (configurabil), trigger automat: 1) mesaj părinte cu plan recuperare concret (nu vague), 2) sugestie mentor pentru sesiune 1:1, 3) ajustare temele pentru a relua fundamentele. Reducere medie drop-out: 35% în primele 3 luni.",
  },
  {
    q: "Pot face simulări cu condiții reale (timp limitat, fără ajutor)?",
    a: 'Da. Mod „exam mode" în aplicație: timer countdown, copy-paste blocked, screen lock detection (warning, nu interdicție), random questions per elev pentru anti-cheat. Rezultat instant cu break-down. Pentru centre fizice: tipărire foi cu QR unique per elev, scanare răspunsuri cu OCR pentru rezultat în minute.',
  },
  {
    q: "Cum gestionez vârful de sezon august-septembrie?",
    a: "1) Înscriere cu rezervare din iunie (deposit refundabil), 2) Liste de așteptare automate cu prioritate elev returning + frate, 3) Sugestii pricing dinamic pe zile rămase până la cohort start, 4) Buget marketing alocate per sursă cu prag CAC automat (oprește campania când CAC > LTV/4). Centre care folosesc tot stack-ul cresc capacity cu 40% same headcount.",
  },
];

export function ExamenePage() {
  const daysToBac = 28;
  return (
    <AudiencePageShell>
      <AudienceHero
        badge="Pentru centre de pregătire examene"
        title={
          <>
            BAC, IELTS, SAT — <span className="text-gradient">scoring care contează</span>, nu note vagi
          </>
        }
        description="Pregătirea pentru examene cere transparență: ce să mai înveți, cât mai ai, cum stai față de țintă. Vector Learn dă părintelui dashboard live, copilului plan de studiu personalizat, profesorului scoring detaliat — și directorului predicție drop-out cu plan recuperare automat."
        ctaPrimary={{ label: "Cere demo pentru centre examene", href: "#/?demo=examene" }}
        ctaSecondary={{ label: "Vezi prețuri", href: "#/?section=pricing" }}
        visual={
          <div className="rounded-2xl border border-border bg-card p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Maria P. · BAC 2026
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 text-warning px-2 py-0.5 text-[10px] font-bold">
                <Clock className="h-2.5 w-2.5" />
                {daysToBac} zile
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { subj: "Matematică", target: 9.0, current: 8.4, color: "text-success" },
                { subj: "Română", target: 8.5, current: 8.7, color: "text-success" },
                { subj: "Engleză", target: 9.0, current: 7.2, color: "text-warning" },
              ].map((s) => (
                <div key={s.subj} className="rounded-lg border border-border p-2">
                  <p className="text-[9px] font-semibold uppercase text-muted-foreground">{s.subj}</p>
                  <p className={`text-base font-display font-bold tabular-nums ${s.color}`}>
                    {s.current.toFixed(1)}
                  </p>
                  <p className="text-[9px] text-muted-foreground">țintă {s.target.toFixed(1)}</p>
                </div>
              ))}
            </div>
            <div className="rounded-lg pastel-sky p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/70 mb-1">
                Plan azi (45 min)
              </p>
              <ul className="space-y-1 text-[11px]">
                <li>📐 Engleză: Reading C1 — texte argumentative (25 min)</li>
                <li>📚 Vocabulary: 30 cuvinte advanced (10 min)</li>
                <li>🎧 Listening: Cambridge sample 12 (10 min)</li>
              </ul>
            </div>
          </div>
        }
      />

      <PainSolutionGrid items={pains} />

      <CaseStudyCard
        centerName='Centru "Excelența"'
        centerType="Pregătire BAC + admitere medicină"
        scale="640 elevi/an · 22 profesori · 3 cohorte"
        quote="Înainte aflam că un elev abandonează săptămâna 3 de cohort. Acum primesc alert după prima simulare slabă cu scor sub țintă și plan recuperare gata. 27 puncte procentuale mai puțin abandon — și părinții ne recomandă fraților."
        author="Cristian S."
        authorRole="Director academic"
        metrics={caseStudyMetrics}
      />

      <section className="container mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="max-w-3xl mx-auto text-center">
          <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-4">
            Module relevante
          </span>
          <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-tight mb-8">
            Stack-ul pentru centre examene
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: GraduationCap, label: "Rapoarte detaliate", href: "#/modules/rapoarte" },
              { icon: Target, label: "AI predicție", href: "#/modules/ai" },
              { icon: Clock, label: "CRM sezonalitate", href: "#/modules/crm" },
              { icon: Award, label: "App plan studiu", href: "#/modules/mobile" },
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
