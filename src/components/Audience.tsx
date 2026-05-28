import { Languages, Code2, Music, Sparkles, Dumbbell, GraduationCap, Baby, Mic } from "lucide-react";
import { PASTEL_CYCLE } from "@/lib/utils";

const audiences = [
  {
    icon: Languages,
    title: "Centre de limbi străine",
    description: "Gestionează nivele CEFR, certificări Cambridge/IELTS, grupe pe abilități și examene interne.",
  },
  {
    icon: Code2,
    title: "Școli de programare & IT",
    description: "Cursuri modulare, proiecte cu deadline, integrare GitHub și platforme de coding.",
  },
  {
    icon: Music,
    title: "Școli de muzică",
    description: "Lecții individuale, instrument-management, recitaluri și progresie pe ani de studiu.",
  },
  {
    icon: Sparkles,
    title: "Școli de dans",
    description: "Coregrafii, costume, concursuri, fotografii și progres pe stiluri și niveluri.",
  },
  {
    icon: Dumbbell,
    title: "Centre sportive",
    description: "Antrenamente, abonamente lunare, prezență în timp real și evaluări fizice.",
  },
  {
    icon: GraduationCap,
    title: "Pregătire examene",
    description: "BAC, EN, SAT, IELTS — testări periodice, simulări și rapoarte de progres pentru părinți.",
  },
  {
    icon: Baby,
    title: "Centre pentru copii",
    description: "Programe after-school, tabere, activități creative și comunicare zilnică cu părinții.",
  },
  {
    icon: Mic,
    title: "Training & masterclass",
    description: "Workshop-uri, certificări corporate, plăți B2B și emiterea automată a diplomelor.",
  },
];

export function Audience() {
  return (
    <section id="audience" className="py-24 sm:py-32">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center mb-16">
          <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-4">
            Pentru cine
          </span>
          <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">
            Construit pentru{" "}
            <span className="text-gradient">orice tip de centru educațional</span>
          </h2>
          <p className="mt-4 text-base text-muted-foreground">
            Configurabil pentru orice specializare. Lansare în 24h cu template-uri gata pentru industria ta.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {audiences.map((aud, i) => {
            const Icon = aud.icon;
            const pastel = PASTEL_CYCLE[i % PASTEL_CYCLE.length];
            return (
              <article
                key={aud.title}
                className="rounded-2xl border border-border bg-card p-5 card-hover"
              >
                <div className={`${pastel} rounded-xl p-2.5 w-fit mb-3`}>
                  <Icon className="h-5 w-5 text-foreground/80" />
                </div>
                <h3 className="text-sm font-bold mb-1.5">{aud.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{aud.description}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
