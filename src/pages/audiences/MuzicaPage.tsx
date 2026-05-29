import { Music, Calendar, Wallet, Award } from "lucide-react";
import { AudiencePageShell } from "@/components/audiences/AudiencePageShell";
import { AudienceHero } from "@/components/audiences/AudienceHero";
import { PainSolutionGrid } from "@/components/audiences/PainSolutionGrid";
import { CaseStudyCard } from "@/components/audiences/CaseStudyCard";
import { ModuleFAQ } from "@/components/modules/ModuleFAQ";

const pains = [
  {
    pain: "90% din lecții sunt 1:1 — un no-show te costă întreaga oră, nu ai cum să umpli slot-ul în 30 min.",
    solution: 'Reminder WhatsApp cu 24h și 2h înainte, plus politică flexibilă „anulare gratuită până la 12h, plată integrală după" — vizibilă elevului la rezervare.',
    moduleLabel: "Comunicare",
    moduleHref: "#/modules/comunicare",
  },
  {
    pain: "Profesor diferit pentru pian vs vioară vs canto vs teorie — pricing diferit, materiale diferite, calcule complicate.",
    solution: "Pricing books per instrument + per profesor. Salariu calculat automat pe formula fiecăruia. Materiale taggate per instrument cu sharing inter-profesori.",
    moduleLabel: "Finanțe & HR",
    moduleHref: "#/modules/finante",
  },
  {
    pain: "Recital anual: 80 elevi × 4 piese × părinți × sală × ordine performance = ore de spreadsheet.",
    solution: "Modul Recital: drag-drop pentru ordine, generare program PDF automat, tichete pentru părinți cu QR, reminder-uri timeline.",
    moduleLabel: "Orar + Comunicare",
    moduleHref: "#/modules/orar",
  },
  {
    pain: 'Părinții vor să vadă progresul — dar „progresul muzical" e subiectiv. Cum îl arăți obiectiv?',
    solution: "Sistem cu pase muzicale (Grade 1-8 ABRSM/Trinity sau scala internă), badge-uri pe milestone-uri, recording sample lunar arhivat — părintele aude progresul.",
    moduleLabel: "Aplicație mobilă",
    moduleHref: "#/modules/mobile",
  },
  {
    pain: "Închirierea instrumentelor (pian, vioară pentru copii) e un haos cu Excel — cine ce are, când a returnat.",
    solution: "Inventar instrumente cu QR code per fiecare. Scanezi la împrumut/returnare, sistemul tracking-uiește responsabil + scadență + cost daune.",
    moduleLabel: "Multi-filiale + HR",
    moduleHref: "#/modules/multifilale",
  },
];

const caseStudyMetrics = [
  { label: "Lecții pe lună", value: "1.840", delta: "+12% YoY" },
  { label: "Rată no-show", value: "4.2%", delta: "−6.3 pp" },
  { label: "NPS părinți", value: "9.1/10", delta: "+1.4" },
  { label: "Profesori activi", value: "32", delta: "stabilizat" },
];

const faqs = [
  {
    q: "Cum gestionez pricing diferit pentru pian vs vioară vs teorie?",
    a: "Pricing books separate per instrument + per nivel (debutant, intermediar, avansat, conservator). Poți avea Pian Inițiere 140€/lună, Pian Avansat 240€, Vioară Inițiere 160€ etc. Pachete familiale combinând instrumente. Reduceri loiale automat după 6/12 luni. Plata se face per pachet, sistemul împarte automat venitul pe instrumentele componente pentru rapoarte.",
  },
  {
    q: "Suportă pase muzicale (Grade ABRSM, Trinity) cu raportare progres?",
    a: 'Da. Definești scala (Grade 1-8 ABRSM, Trinity, sau scală internă), criterii per nivel (tehnică, repertoriu, teorie, sight-reading). Profesorul marchează achievement-uri la fiecare lecție. La 80% un nivel → notificare „pregătit pentru pas". Părintele vede progresul vizual + audio sample lunar arhivat. Pentru centre Trinity-affiliated, generăm și submission-ul pentru exam.',
  },
  {
    q: "Cum funcționează modulul de recital pentru concertul anual?",
    a: "Înscrii elevii care performează (multi-select). Drag-drop pentru ordine. Sistemul generează: program PDF (cu fotografii opționale), QR tickets pentru părinți (gratuit sau cu plată), reminder timeline (cu o lună înainte → confirmare repertoriu, o săptămână → rehearsal, ziua → arrival time per copil). Inclusiv backup ordine pentru recitaluri inversate de no-show last-minute.",
  },
  {
    q: "Pot închiria instrumente cu tracking?",
    a: "Da. Inventar cu QR per instrument. Scanezi la împrumut → atribuit elevului cu data prevăzută de returnare. Reminder automat cu o săpt înainte de returnare. La returnare scanezi din nou — opțional cu poze condition. Deteriorare → cost adăugat la factura părintelui automat, cu poză anexă pentru transparență. Asigurare opțională per instrument scump (peste 2.000€).",
  },
];

export function MuzicaPage() {
  return (
    <AudiencePageShell>
      <AudienceHero
        badge="Pentru școli de muzică"
        title={
          <>
            Pasiunea pentru muzică, <span className="text-gradient">fără batalia cu Excel</span>
          </>
        }
        description="Pian, vioară, chitară, canto, teorie — toate într-un singur sistem. De la lecție individuală la recitalul anual de 80 de elevi, Vector Learn știe ce înseamnă să conduci o școală de muzică."
        ctaPrimary={{ label: "Cere demo pentru școli de muzică", href: "#/?demo=muzica" }}
        ctaSecondary={{ label: "Vezi prețuri", href: "#/?section=pricing" }}
        visual={
          <div className="rounded-2xl border border-border bg-card p-6 shadow-lg space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Music className="h-4 w-4 text-primary" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Recital anual · 4 iunie 2026
              </p>
            </div>
            {[
              { time: "18:00", name: "Maria Popescu", piece: "Mozart — Sonata C major", status: "confirmed" },
              { time: "18:08", name: "Andrei Ionescu", piece: "Bach — Invenția 1", status: "confirmed" },
              { time: "18:16", name: "Elena Vasilescu", piece: "Chopin — Nocturne Op. 9 No. 2", status: "rehearsal_pending" },
              { time: "18:25", name: "Vlad Anghel", piece: "Beethoven — Für Elise", status: "confirmed" },
              { time: "18:32", name: "Ana Dumitrescu", piece: "Schubert — Lied", status: "confirmed" },
            ].map((p) => (
              <div key={p.name} className="flex items-center gap-2 text-xs">
                <span className="font-mono tabular-nums text-muted-foreground w-12">{p.time}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{p.piece}</p>
                </div>
                <span
                  className={
                    p.status === "confirmed"
                      ? "text-[9px] text-success font-semibold"
                      : "text-[9px] text-warning font-semibold"
                  }
                >
                  {p.status === "confirmed" ? "✓ Conf." : "Rep."}
                </span>
              </div>
            ))}
            <div className="pt-2 mt-2 border-t border-border flex items-center gap-2 text-[10px] text-muted-foreground">
              <Calendar className="h-3 w-3" />
              78 elevi total · 124 părinți confirmați · 2 săli rezervate
            </div>
          </div>
        }
      />

      <PainSolutionGrid items={pains} />

      <CaseStudyCard
        centerName='Academia de muzică "Cantabile"'
        centerType="Pian, vioară, chitară, canto, teorie"
        scale="285 elevi · 32 profesori · 1 sediu + 2 partener"
        quote="Recitalul anual era teroarea anului — 3 săptămâni de muncă pentru ordine, programe, anunțuri. Acum durează 2 ore: drag-drop, generate PDF, send WhatsApp. Profesorii au timp să predea, eu am timp să cresc școala."
        author="Elena V."
        authorRole="Directoare artistică"
        metrics={caseStudyMetrics}
      />

      <section className="container mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="max-w-3xl mx-auto text-center">
          <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-4">
            Module relevante
          </span>
          <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-tight mb-8">
            Cele mai folosite la școli de muzică
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: Calendar, label: "Orar 1:1", href: "#/modules/orar" },
              { icon: Wallet, label: "Pricing per instrument", href: "#/modules/finante" },
              { icon: Award, label: "Pase muzicale", href: "#/modules/rapoarte" },
              { icon: Music, label: "App cu recording", href: "#/modules/mobile" },
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
