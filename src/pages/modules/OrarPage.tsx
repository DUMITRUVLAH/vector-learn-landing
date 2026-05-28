import { Calendar, Repeat, Bell, AlertTriangle, Video, Users, Clock, MapPin } from "lucide-react";
import { ModulePageShell } from "@/components/modules/ModulePageShell";
import { ModuleHero } from "@/components/modules/ModuleHero";
import { ModuleFAQ } from "@/components/modules/ModuleFAQ";
import { ScheduleDemo } from "@/components/modules/orar/ScheduleDemo";
import { PASTEL_CYCLE } from "@/lib/utils";

const capabilities = [
  {
    icon: Calendar,
    title: "5 vizualizări simultane",
    description: "Zi, săptămână, lună, profesor, sală. Comuți cu un click.",
  },
  {
    icon: Repeat,
    title: "Recuperări automate",
    description: "Un elev a lipsit? Sistemul propune sloturi compatibile cu disponibilitatea sa.",
  },
  {
    icon: Bell,
    title: "Confirmări cu 24h înainte",
    description: "Părinții primesc reminder automat pe WhatsApp. Tu vezi cine a confirmat.",
  },
  {
    icon: AlertTriangle,
    title: "Conflict detection",
    description: "Profesor dublu-rezervat sau sală suprapusă? Sistemul te oprește înainte să salvezi.",
  },
  {
    icon: Video,
    title: "Lecții online integrate",
    description: "Link Zoom/Meet/Teams generat automat și trimis cu invitația. Zero copy-paste.",
  },
  {
    icon: Users,
    title: "Înlocuiri ușoare",
    description: "Profesor bolnav? Filtrezi colegi disponibili în sloturi compatibile, atribui cu un click.",
  },
];

const howItWorks = [
  {
    step: "1",
    title: "Definești resursele",
    description: "Profesori, săli, programe, durata standard a unei lecții. Setup în 15 minute.",
  },
  {
    step: "2",
    title: "Sistemul construiește orarul",
    description: "Pornind de la disponibilitatea profesorilor și preferințele grupelor, primești o propunere automată.",
  },
  {
    step: "3",
    title: "Ajustezi cu drag & drop",
    description: "Muți o lecție în calendar și sistemul reverifică conflictele și notifică toți cei afectați.",
  },
  {
    step: "4",
    title: "Părinții și elevii sunt la curent",
    description: "Notificare WhatsApp, email și push în aplicația mobilă — toate trimise automat.",
  },
];

const targetUsers = [
  {
    icon: Clock,
    title: "Manager academie",
    description: "Vezi ocuparea reală a sălilor și a profesorilor. Decizi rapid pe ce să investești.",
  },
  {
    icon: Users,
    title: "Profesor",
    description: "Orar personal pe mobil. Cere înlocuire cu un swipe. Vezi-ți comisionul în timp real.",
  },
  {
    icon: MapPin,
    title: "Director rețea",
    description: "Administrezi mai multe filiale dintr-un singur ecran. Rapoarte consolidate pe locație.",
  },
];

const faqs = [
  {
    q: "Cât durează să configurez orarul inițial?",
    a: "Echipa noastră îți face setup-ul de la zero în aproximativ 2 ore: introducem profesorii, sălile, programele și disciplinele tale. După aceea, orarul rulează singur cu drag & drop. Migrarea dintr-un alt sistem este inclusă pe planurile Pro și Enterprise.",
  },
  {
    q: "Ce se întâmplă când mut o lecție? Cine este notificat?",
    a: "Automat: părintele primește WhatsApp/SMS cu noua oră, profesorul primește notificare push, sala veche se eliberează, sala nouă se rezervă, și linkul Zoom se regenerează dacă lecția e online. Tu nu mai faci nimic manual.",
  },
  {
    q: "Pot face recuperări pentru elevii care au lipsit?",
    a: "Da. Pentru fiecare absență, sistemul îți propune automat 3 sloturi compatibile cu disponibilitatea elevului și a profesorului. Părintele primește un link de confirmare și își rezervă singur slot-ul preferat. Plata se ajustează automat.",
  },
  {
    q: "Cum gestionez orarul pentru mai multe filiale?",
    a: "Fiecare filială are propriul orar, profesori și săli, dar le vezi pe toate dintr-un dashboard centralizat. Poți defini permisiuni granulare: directorul filialei vede doar locația sa, directorul rețelei vede tot.",
  },
];

export function OrarPage() {
  return (
    <ModulePageShell>
      <ModuleHero
        badge="Modulul Orar"
        title={
          <>
            Programarea care se ocupă <span className="text-gradient">singură de logistică</span>
          </>
        }
        description="Mută o lecție cu drag & drop și sistemul recalculează automat plățile, notifică părinții pe WhatsApp, actualizează salariul profesorului și regenerează linkul Zoom. Tu te concentrezi pe educație, nu pe Excel."
        ctaPrimary={{ label: "Cere demo gratuit", href: "#/?demo=orar" }}
        ctaSecondary={{ label: "Vezi prețuri", href: "#/?section=pricing" }}
      />

      <section className="container mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div className="max-w-5xl mx-auto">
          <ScheduleDemo />
        </div>
      </section>

      <section className="bg-muted/30 border-y border-border/60 py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-14">
            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-4">
              Cum funcționează
            </span>
            <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">
              4 pași până la un orar care se gestionează singur
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {howItWorks.map((step, i) => (
              <article
                key={step.step}
                className={`rounded-2xl border border-border ${PASTEL_CYCLE[i % PASTEL_CYCLE.length]} p-6`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-card text-sm font-bold text-primary border border-border">
                    {step.step}
                  </span>
                </div>
                <h3 className="text-base font-bold mb-2">{step.title}</h3>
                <p className="text-sm text-foreground/80 leading-relaxed">
                  {step.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-14">
            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-4">
              Capabilități cheie
            </span>
            <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">
              Tot ce-ți trebuie ca să nu mai pierzi 6 ore/săptămână pe orar
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-6xl mx-auto">
            {capabilities.map((cap, i) => {
              const Icon = cap.icon;
              return (
                <article
                  key={cap.title}
                  className="rounded-2xl border border-border bg-card p-6 card-hover"
                >
                  <div className={`${PASTEL_CYCLE[i % PASTEL_CYCLE.length]} rounded-xl p-2.5 w-fit mb-4`}>
                    <Icon className="h-5 w-5 text-foreground/80" />
                  </div>
                  <h3 className="text-base font-bold mb-2">{cap.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {cap.description}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-muted/30 border-y border-border/60 py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-14">
            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-4">
              Pentru cine
            </span>
            <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">
              Trei perspective, un singur sistem
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
            {targetUsers.map((user) => {
              const Icon = user.icon;
              return (
                <article
                  key={user.title}
                  className="rounded-2xl border border-border bg-card p-6 card-hover"
                >
                  <Icon className="h-6 w-6 text-primary mb-3" />
                  <h3 className="text-base font-bold mb-2">{user.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {user.description}
                  </p>
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
