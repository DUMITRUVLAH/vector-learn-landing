import { Languages, Award, TrendingUp, Clock } from "lucide-react";
import { AudiencePageShell } from "@/components/audiences/AudiencePageShell";
import { AudienceHero } from "@/components/audiences/AudienceHero";
import { PainSolutionGrid } from "@/components/audiences/PainSolutionGrid";
import { CaseStudyCard } from "@/components/audiences/CaseStudyCard";
import { ModuleFAQ } from "@/components/modules/ModuleFAQ";

const pains = [
  {
    pain: "Elevii încep A1 cu entuziasm, dar 35% renunță înainte de A2 — fără semnal vizibil pentru profesor.",
    solution: "Predicție churn cu motive identificate (prezență, engagement, dificultate). Acțiuni preventive sugerate cu 30 zile înainte de cancellation.",
    moduleLabel: "Rapoarte & AI",
    moduleHref: "#/modules/rapoarte",
  },
  {
    pain: "Grupele mixte (A1 + A2) dezbină atenția profesorului și frustrare la nivelul superior.",
    solution: "Orar pe niveluri CEFR cu detectare automată a tranzițiilor: când un elev A1 ajunge la 80% obiective → notificare creare grupă A2 nouă.",
    moduleLabel: "Orar",
    moduleHref: "#/modules/orar",
  },
  {
    pain: "Pregătirea Cambridge/IELTS necesită materiale separate + simulări + scoring complex. Excel-ul cedează.",
    solution: "Aplicație cu materiale per nivel, vocabulary trainer cu spaced repetition, simulări automate cu scoring CEFR-aligned + raport părinte.",
    moduleLabel: "Aplicație mobilă",
    moduleHref: "#/modules/mobile",
  },
  {
    pain: "Sezonalitatea (înscriere septembrie + ianuarie) ucide bugetul de marketing dacă nu măsori cost per elev plătitor pe sursă.",
    solution: "CRM cu atribuire UTM până la abonament, ROAS per campanie Facebook/Google, sugestii de buget pe sursele cu CAC < LTV/3.",
    moduleLabel: "CRM & vânzări",
    moduleHref: "#/modules/crm",
  },
  {
    pain: "Părinții vor să vadă progresul copilului, dar profesorul nu are timp să scrie rapoarte săptămânale.",
    solution: "AI sumarizează lecția automat în 5 rânduri (progres, dificultăți, recomandări), profesorul aprobă cu un click, părintele primește pe WhatsApp.",
    moduleLabel: "Comunicare + AI",
    moduleHref: "#/modules/comunicare",
  },
  {
    pain: "Profesori native speakers din diaspora — fluxul cu USD/EUR + multi-timezone + onboarding complex.",
    solution: "HR cu salarii multi-currency, fluturaș cu cursul BNR de la data plății, calendare cu timezone awareness, contracte digitale semnabile online.",
    moduleLabel: "HR & echipă",
    moduleHref: "#/modules/hr",
  },
];

const caseStudyMetrics = [
  { label: "Elevi activi", value: "1.400", delta: "+22% în 12 luni" },
  { label: "Rată retenție", value: "84%", delta: "+11 pp" },
  { label: "Reducere admin", value: "6h/săpt", delta: "per recepționer" },
  { label: "Conversie trial→plătit", value: "63%", delta: "+18 pp" },
];

const faqs = [
  {
    q: "Suportă niveluri CEFR (A1, A2, B1, B2, C1, C2) și certificări Cambridge/IELTS?",
    a: 'Da, nativ. Definești obiective per nivel CEFR, sistemul măsoară progresul în timp real. Pentru certificări, ai template-uri pre-configurate cu simulări periodice și scoring aliniat la baremul oficial Cambridge/IELTS. Părintele și elevul văd un dashboard cu „cât mai ai până la B2".',
  },
  {
    q: "Cum gestionez profesorii native speakers care lucrează remote?",
    a: "Profil dedicat cu timezone, currency preferată (RON/EUR/USD/GBP), contracte digitale cu semnătură electronică conformă eIDAS. Salariul se calculează în currency-ul ales, conversie zilnică la cursul BNR, fluturaș transparent. Tax forms pentru diaspora (W-8BEN US, formular pentru UE) sunt generate automat.",
  },
  {
    q: "Pot organiza examene interne periodice cu raport detaliat pentru părinți?",
    a: 'Da. Definești examenele cu structură (listening, reading, writing, speaking), elevul îl susține în aplicație sau în sala fizică (input ulterior de profesor), sistemul calculează scoring CEFR-aligned și trimite raport părinte cu „progres față de exam anterior + zone de îmbunătățit".',
  },
  {
    q: "Funcționează pentru cursuri pentru adulți (corporate, individual) + cursuri pentru copii (after-school)?",
    a: 'Da, ambele paralel. Definești „segmente" cu pricing, comunicare și fluxuri diferite (părinte ca destinatar implicit la copii, elev direct la adulți). Rapoarte separate pe segment + view consolidat. Mulți clienți de-ai noștri operează ambele segmente sub același brand.',
  },
];

export function LimbiPage() {
  return (
    <AudiencePageShell>
      <AudienceHero
        badge="Pentru centre de limbi străine"
        title={
          <>
            CRM-ul construit pentru <span className="text-gradient">profesori de limbi</span>, nu pentru general
          </>
        }
        description="De la cursuri generale A1 până la pregătire IELTS C1, Vector Learn înțelege nivelele CEFR, certificările Cambridge, sezonalitatea ascuțită septembrie/ianuarie și fluxul cu profesori native speakers din diaspora."
        ctaPrimary={{ label: "Cere demo pentru centre de limbi", href: "#/?demo=limbi" }}
        ctaSecondary={{ label: "Vezi prețuri", href: "#/?section=pricing" }}
        visual={
          <div className="rounded-2xl border border-border bg-card p-6 shadow-lg space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Nivele CEFR · progres elev mediu
            </p>
            {[
              { level: "A1", pct: 100, color: "bg-success", time: "Atins luna 3" },
              { level: "A2", pct: 100, color: "bg-success", time: "Atins luna 8" },
              { level: "B1", pct: 78, color: "bg-primary", time: "În progres" },
              { level: "B2", pct: 24, color: "bg-primary/60", time: "Început" },
              { level: "C1", pct: 0, color: "bg-muted", time: "Următor" },
              { level: "C2", pct: 0, color: "bg-muted", time: "—" },
            ].map((row) => (
              <div key={row.level} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold w-8">{row.level}</span>
                  <span className="text-muted-foreground flex-1 ml-2">{row.time}</span>
                  <span className="tabular-nums font-semibold">{row.pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full ${row.color} transition-all`}
                    style={{ width: `${row.pct}%` }}
                    aria-label={`Nivel ${row.level}: ${row.pct}%`}
                  />
                </div>
              </div>
            ))}
            <div className="pt-3 border-t border-border flex items-center gap-2 text-[10px] text-muted-foreground">
              <Award className="h-3 w-3" />
              Target Cambridge B2 First: 8 luni rămase (probabilitate 84%)
            </div>
          </div>
        }
      />

      <PainSolutionGrid items={pains} />

      <CaseStudyCard
        centerName='Centru de limbi „Forum"'
        centerType="Limbi străine (EN, ES, FR, DE)"
        scale="1.400 elevi · 4 filiale · 80 profesori"
        quote="După 6 luni cu Vector Learn, am redus dropout-ul după A2 cu 11 puncte procentuale. Cifrele vorbesc — și recepționera mea recuperează 6 ore pe săptămână care erau pierdute pe WhatsApp și Excel."
        author="Andreea M."
        authorRole="Directoare academică"
        metrics={caseStudyMetrics}
      />

      <section className="container mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="max-w-3xl mx-auto text-center">
          <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-4">
            Module relevante pentru tine
          </span>
          <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-tight mb-8">
            Cele mai folosite module la centre de limbi
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: Languages, label: "Orar pe niveluri", href: "#/modules/orar" },
              { icon: Award, label: "Rapoarte CEFR", href: "#/modules/rapoarte" },
              { icon: TrendingUp, label: "CRM & vânzări", href: "#/modules/crm" },
              { icon: Clock, label: "Aplicație elev", href: "#/modules/mobile" },
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
