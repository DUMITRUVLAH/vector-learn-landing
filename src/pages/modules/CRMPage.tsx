import { Eye, Zap, Target, Phone, MessageSquare, Mail, Webhook, Database } from "lucide-react";
import { ModulePageShell } from "@/components/modules/ModulePageShell";
import { ModuleHero } from "@/components/modules/ModuleHero";
import { ModuleFAQ } from "@/components/modules/ModuleFAQ";
import { KanbanBoard } from "@/components/modules/crm/KanbanBoard";
import { ConversionCalculator } from "@/components/modules/crm/ConversionCalculator";
import { SourcePieChart } from "@/components/modules/crm/SourcePieChart";
import { PASTEL_CYCLE } from "@/lib/utils";

const sections = [
  {
    icon: Eye,
    title: "Pipeline vizual kanban",
    bullets: [
      'Patru stadii standard + custom (poți adăuga „Așteaptă răspuns părinte" etc.)',
      "Drag & drop între coloane sau scurtături 1/2/3/4 pe tastatură",
      "Contor live per stadiu și sumă MRR în pipeline",
      "Filtrare pe sursă, oraș, disciplină, asistent vânzări",
    ],
    description: "Vezi exact unde se blochează banii. Niciun lead nu mai cade printre crăpături.",
  },
  {
    icon: Zap,
    title: "Automatizări fără cod",
    bullets: [
      'Trigger „lead nou Facebook" → SMS instant cu link de rezervare',
      'Condiție „nu a răspuns 3 zile" → reminder WhatsApp template-uit',
      'Condiție „a venit la trial dar nu a plătit" → secvență 7 zile email + apel sugerat',
      "Blocare anti-spam (max 3 mesaje/lead/săptămână)",
    ],
    description: "Construiești fluxuri vizual: dacă X → atunci Y. 23 template-uri gata pentru școli de limbi, muzică, programare.",
  },
  {
    icon: Target,
    title: "Atribuire UTM & ROAS",
    bullets: [
      "Captarea automată utm_source, utm_medium, utm_campaign din formulare",
      "Cost real per lead pe canal (FB Ads, Google Ads, TikTok, manual)",
      "ROAS și CAC per campanie cu interval ales liber",
      "Sincronizare automată cu Meta Conversions API & Google Offline Conversions",
    ],
    description: "Vezi exact ce reclamă aduce elevi plătitori, nu doar leaduri. Reduci bugetul pe sursele slabe.",
  },
  {
    icon: Phone,
    title: "Telefonie & comunicare",
    bullets: [
      "Asterisk, Mango Office, Sipnet, Twilio integrate nativ",
      "Înregistrare automată apeluri + transcriere în lead card",
      "Click-to-call direct din interfață, cu rezultat marcat (interes, off-topic, no-answer)",
      "Trial lessons cu rezervare online self-service (Calendly-style)",
    ],
    description: "Recepționera apasă un buton, vorbește, închide — sistemul salvează apelul, transcriptul și statusul.",
  },
];

const integrations = [
  { icon: MessageSquare, label: "WhatsApp Business API" },
  { icon: Mail, label: "Mailchimp / UniSender" },
  { icon: Phone, label: "Asterisk / Mango / Twilio" },
  { icon: Webhook, label: "Meta CAPI / Google Ads" },
  { icon: Database, label: "AmoCRM / HubSpot (import)" },
];

const faqs = [
  {
    q: "Pot importa leaduri vechi dintr-un Excel sau alt CRM?",
    a: "Da. Importăm din Excel, CSV, AmoCRM, HubSpot, Pipedrive, Bitrix24. Echipa noastră face mapping-ul coloanelor și verificare manuală a deduplicării (potrivire pe nume + telefon + email). Migrarea este inclusă pe planurile Pro și Enterprise.",
  },
  {
    q: "Cum funcționează atribuirea UTM între reclamă și plata abonamentului?",
    a: "Când un vizitator vine din Facebook Ad cu utm_source=fb&utm_campaign=spring2026, salvăm parametrii în cookie + în primul formular completat. Când acel lead devine elev plătitor 14 zile mai târziu, raportul atribuie venitul corect campaniei. Suportăm și atribuire multi-touch (first-click, last-click, linear).",
  },
  {
    q: "Câte automatizări simultane pot rula?",
    a: "Nelimitate pe planurile Growth și mai sus. Recomandăm să începi cu 5 fluxuri esențiale (lead nou, no-show trial, reminder zi-1, follow-up zi-7, recuperare elev plecat). Avem 23 template-uri gata, configurabile în 5 minute fiecare.",
  },
  {
    q: "Cum se respectă GDPR pentru leaduri și apeluri înregistrate?",
    a: 'Toate leadurile au consent timestamp + sursa exactă a consimțământului. Apelurile sunt înregistrate doar cu consimțământ verbal explicit (script integrat). Retenție configurabilă: implicit 24 luni pentru apeluri, ștergere automată. „Drept la uitare" GDPR: șterge complet un lead cu un click și export PDF pentru ANSPDCP.',
  },
];

export function CRMPage() {
  return (
    <ModulePageShell>
      <ModuleHero
        badge="Modulul CRM & Vânzări"
        title={
          <>
            Transformă fiecare lead în <span className="text-gradient">client plătitor</span>
          </>
        }
        description="Pipeline vizual kanban, automatizări fără cod, atribuire UTM până la abonamentul plătit și telefonie integrată cu transcriere automată. Cu Vector Learn, centrele cresc conversia lead → elev cu o medie de +38% în primele 3 luni."
        ctaPrimary={{ label: "Cere demo vânzări", href: "#/?demo=crm" }}
        ctaSecondary={{ label: "Vezi prețuri", href: "#/?section=pricing" }}
      />

      <section className="container mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <h2 className="text-xl sm:text-2xl font-display font-bold tracking-tight">
              Pipeline-ul tău, vizual — trage leadurile între stadii
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Sub fiecare card vezi cât timp e blocat în stadiul curent. Schimbi statusul cu un drag sau cu taste.
            </p>
          </div>
          <KanbanBoard />
        </div>
      </section>

      <section className="container mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3">
            <ConversionCalculator />
          </div>
          <div className="lg:col-span-2">
            <SourcePieChart />
          </div>
        </div>
      </section>

      <section className="bg-muted/30 border-y border-border/60 py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-14">
            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-4">
              4 capabilități cheie
            </span>
            <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">
              Tot ce-ți trebuie ca să nu mai pierzi leaduri pe drum
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-5xl mx-auto">
            {sections.map((section, i) => {
              const Icon = section.icon;
              return (
                <article
                  key={section.title}
                  className="rounded-2xl border border-border bg-card p-6 card-hover"
                >
                  <div className="flex items-start gap-4 mb-3">
                    <div className={`${PASTEL_CYCLE[i % PASTEL_CYCLE.length]} rounded-xl p-2.5 flex-shrink-0`}>
                      <Icon className="h-5 w-5 text-foreground/80" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold mb-1.5">{section.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {section.description}
                      </p>
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

      <section className="py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-14">
            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-4">
              Integrări native
            </span>
            <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">
              Funcționează cu tool-urile pe care le folosești deja
            </h2>
            <p className="mt-4 text-sm text-muted-foreground">
              Plus 350+ alte integrări prin Zapier, Make, Albato și API REST documentat.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 max-w-3xl mx-auto">
            {integrations.map((item) => {
              const Icon = item.icon;
              return (
                <span
                  key={item.label}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground card-hover"
                >
                  <Icon className="h-4 w-4 text-primary" />
                  {item.label}
                </span>
              );
            })}
          </div>
        </div>
      </section>

      <ModuleFAQ items={faqs} />
    </ModulePageShell>
  );
}
