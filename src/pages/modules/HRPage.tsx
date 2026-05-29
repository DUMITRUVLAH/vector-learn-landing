import { Users, ShieldCheck, Star, Megaphone, Wallet } from "lucide-react";
import { ModulePageShell } from "@/components/modules/ModulePageShell";
import { ModuleHero } from "@/components/modules/ModuleHero";
import { ModuleFAQ } from "@/components/modules/ModuleFAQ";
import { PermissionMatrix } from "@/components/modules/hr/PermissionMatrix";
import { CommissionCalculator } from "@/components/modules/hr/CommissionCalculator";
import { PASTEL_CYCLE } from "@/lib/utils";

const sections = [
  {
    icon: ShieldCheck,
    title: "Roluri custom",
    description: "Definește propriile roluri dincolo de standard (ex: Director academic, Office manager).",
    bullets: ["Permisiuni granulare pe 40+ acțiuni", "Scope pe filială: vede DOAR locația lui", "SSO Google Workspace pe Pro+", "Audit log: cine a făcut ce, când"],
  },
  {
    icon: Star,
    title: "Rating profesori",
    description: "Elevii (sau părinții) evaluează lecția cu 1 click după fiecare oră.",
    bullets: ["Stars 1-5 + comentariu opțional", "Anonimizat agregat per profesor", "Trigger automat la 3 evaluări <3*: alert manager", "Export pentru evaluări anuale"],
  },
  {
    icon: Megaphone,
    title: "Anunțuri interne",
    description: "Comunicare în echipă fără să folosești WhatsApp personal.",
    bullets: ["Post-uri cu targeting (filială, rol, departament)", "Reactions + comentarii", "Acknowledgment obligatoriu pe anunțuri importante", "Arhivă căutabilă"],
  },
  {
    icon: Wallet,
    title: "Comisioane flexibile",
    description: "Combinație de formule pentru fiecare profesor, cu fluturaș transparent.",
    bullets: ["Salariu fix + comision % per lecție prezentă", "Bonus pe target (rată retenție, NPS)", "Deducere pentru lecții anulate", "Fluturaș PDF generat lunar, semnabil digital"],
  },
];

const faqs = [
  {
    q: "Pot crea roluri complet noi sau sunt limitat la cele predefinite?",
    a: 'Roluri custom nelimitate pe planurile Growth și mai sus. Pornești de la un template (Admin/Manager/Profesor/Recepționer) și ajustezi pe fiecare din 40+ acțiuni granulare. Poți chiar să creezi roluri pe departament (ex: „Coordonator engleză" cu acces doar la grupele de engleză).',
  },
  {
    q: "Cum funcționează rating-ul profesorilor — e public?",
    a: "Strict intern. Elevul/părintele dă stars 1-5 după fiecare lecție (opțional). Profesorul vede AGREGATUL lui (media + numărul de evaluări), nu identitatea evaluatorilor. Managerul vede agregatul + comentarii. Niciun rating nu apare pe profilul public sau în comunicarea externă.",
  },
  {
    q: "Cum salarizez profesorii care lucrează cu copii < 3 elevi în grupă vs. > 8?",
    a: "Calculator de salarizare suportă reguli condiționale: dacă elevi_in_grupa < 3 atunci comision X%, altfel Y%. Plus poți combina salariu fix + comision + bonus per disciplină + bonus pe target. Până la 8 reguli per profesor. Fluturașul PDF arată exact descomponerea.",
  },
  {
    q: "Cum gestionez înlocuiri când un profesor e bolnav?",
    a: 'Profesorul marchează „indisponibil" în aplicație. Sistemul caută înlocuitori cu calificarea necesară și disponibilitate, trimite cerere către top 3, primul care confirmă o ia. Salariul se ajustează automat (lecția trece la înlocuitor, nu la titular). Manager vede tot fluxul în dashboard.',
  },
];

export function HRPage() {
  return (
    <ModulePageShell>
      <ModuleHero
        badge="Modulul HR & Echipă"
        title={<>Echipa ta: <span className="text-gradient">vizibilă, motivată, plătită corect</span></>}
        description="Roluri custom cu permisiuni granulare, rating intern al profesorilor, anunțuri în echipă fără WhatsApp personal și calculator de comisioane cu formule complexe. Tot ce-ți trebuie ca să scalezi o academie cu 80+ profesori fără haos."
        ctaPrimary={{ label: "Cere demo HR", href: "#/?demo=hr" }}
        ctaSecondary={{ label: "Vezi prețuri", href: "#/?section=pricing" }}
      />

      <section className="container mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <h2 className="text-xl sm:text-2xl font-display font-bold tracking-tight flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Cine vede ce — configurabil
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Click pe orice celulă pentru a comuta permisiunea.
            </p>
          </div>
          <PermissionMatrix />
        </div>
      </section>

      <section className="container mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div className="max-w-6xl mx-auto">
          <CommissionCalculator />
        </div>
      </section>

      <section className="bg-muted/30 border-y border-border/60 py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-14">
            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-4">4 capabilități</span>
            <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">Echipă bine condusă, fără overhead</h2>
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
