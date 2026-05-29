import { CreditCard, Receipt, FileText, Wallet, ShieldCheck, RefreshCw, Building2, Banknote } from "lucide-react";
import { ModulePageShell } from "@/components/modules/ModulePageShell";
import { ModuleHero } from "@/components/modules/ModuleHero";
import { ModuleFAQ } from "@/components/modules/ModuleFAQ";
import { PLCalculator } from "@/components/modules/finante/PLCalculator";
import { PaymentsTable } from "@/components/modules/finante/PaymentsTable";
import { RevenueChart } from "@/components/modules/finante/RevenueChart";
import { PASTEL_CYCLE } from "@/lib/utils";

const sections = [
  {
    icon: CreditCard,
    title: "Plăți online integrate",
    bullets: [
      "Stripe, PayU, Netopia, MobilPay, EuPlătesc",
      "Plăți recurente cu salvarea cardului (PCI-DSS)",
      "QR code unic per factură (BT, BCR, ING Pay)",
      "SEPA & transferuri instant pentru companii",
    ],
    description: "Elevii plătesc cu cardul direct din aplicație. Părinții primesc link plată pe WhatsApp. Tu vezi banii în cont în max 30 secunde.",
  },
  {
    icon: Wallet,
    title: "Salarii profesori automate",
    bullets: [
      "Calcul per lecție prezentă × tarif × comision",
      "Bonusuri pe target (rată retenție, NPS)",
      "Fluturaș lunar PDF cu un click",
      "Export pentru REVISAL & calculul taxelor",
    ],
    description: "Sistemul numără orele lucrate, aplică formula ta de salarizare și generează fluturașul lunar. Tu doar aprobi plățile.",
  },
  {
    icon: FileText,
    title: "Rapoarte financiare",
    bullets: [
      "P&L lunar, trimestrial, anual",
      "Cashflow projection 90 zile",
      "Top 10 elevi după LTV și risc de churn",
      "Restanțe cu vechime și reminder-uri automate",
    ],
    description: "Toate KPI-urile financiare într-un dashboard live. Filtrezi pe filială, pe profesor, pe disciplină — vezi exact unde câștigi și unde pierzi.",
  },
  {
    icon: Receipt,
    title: "Integrări fiscale RO",
    bullets: [
      "e-Factura ANAF — generare și transmitere automată",
      "1C, SAGA, WMS — export automat zilnic",
      "Case marcat fiscale: Tremol, Datecs, Daisy",
      "Documente conforme cu OUG 120/2021",
    ],
    description: "Toate cerințele ANAF acoperite nativ. Contabilul tău primește exportul în formatul pe care îl folosește deja. Zero dublu input.",
  },
];

const security = [
  {
    icon: ShieldCheck,
    title: "PCI-DSS Level 1",
    description: "Cardurile sunt tokenizate de procesatori certificați. Vector Learn nu vede niciodată numărul complet al cardului.",
  },
  {
    icon: Building2,
    title: "Găzduit în UE",
    description: "Servere în Frankfurt și Amsterdam (AWS Frankfurt). Conform GDPR și cu DPA semnabil instant din panou.",
  },
  {
    icon: RefreshCw,
    title: "Backup zilnic",
    description: "Snapshot zilnic cu retenție 30 zile. Disaster recovery garantat în max 4 ore (RTO).",
  },
  {
    icon: Banknote,
    title: "Reconciliere automată",
    description: "Sistemul potrivește automat plățile din extrasul bancar cu facturile emise. Reconciliere manuală: zero.",
  },
];

const faqs = [
  {
    q: "Cum se face exportul către 1C și e-Factura ANAF?",
    a: "Export către 1C: zilnic la 23:00 sistemul generează un fișier XML cu toate tranzacțiile zilei și îl trimite în folderul tău 1C. Pentru e-Factura: integrare nativă cu SPV-ANAF. Generăm factura în format UBL 2.1 conform OUG 120/2021, o semnăm digital și o trimitem automat în SPV. Primești XML-ul răspuns ANAF în Vector Learn.",
  },
  {
    q: "Cât costă procesarea plăților cu cardul?",
    a: "Comisioanele sunt direct ale procesatorului (Stripe ~1.4% + 0.25€, PayU ~2%, Netopia ~1.8%). Vector Learn nu adaugă markup peste comisioanele de procesare. Toate comisioanele sunt afișate transparent pe fiecare tranzacție și incluse în rapoartele P&L.",
  },
  {
    q: "Pot configura formule complexe pentru salarii profesori?",
    a: "Da. Suportăm: salariu fix + comision per lecție, comision diferit per disciplină, bonus pe rată de prezență, bonus pe NPS, plus deduceri pentru lecții anulate. Poți combina până la 5 reguli per profesor. Fluturașul PDF arată descomponerea completă pentru transparență totală.",
  },
  {
    q: "Cum gestionez plățile întârziate și restanțele?",
    a: "Sistemul trimite automat reminder pe WhatsApp/Email la 3, 7 și 14 zile după scadență. La 21 zile blochează accesul la lecții online (configurabil). Vezi raportul „Vechime restanțe” care arată cine datorează cât și de când — sortabil pe risc. Reducem restanțele cu ~38% în primele 3 luni la centrele care activează reminder-urile.",
  },
];

export function FinantePage() {
  return (
    <ModulePageShell>
      <ModuleHero
        badge="Modulul Finanțe"
        title={
          <>
            De la încasare la rapoarte, <span className="text-gradient">fără export-import</span>
          </>
        }
        description="Abonamente recurente, plăți cu cardul direct din aplicația elevului, generare facturi conform e-Factura ANAF, salarii profesori calculate automat și rapoarte financiare live. Tot ce-i trebuie unui director ca să închidă luna în 30 de minute, nu în 3 zile."
        ctaPrimary={{ label: "Cere demo financiar", href: "#/?demo=finante" }}
        ctaSecondary={{ label: "Vezi prețuri", href: "#/?section=pricing" }}
      />

      <section className="container mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="max-w-5xl mx-auto">
          <div className="mb-6">
            <h2 className="text-xl sm:text-2xl font-display font-bold tracking-tight">
              Calculator P&L — vezi profitul tău lunar
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Configurează scenariul tău. Cifrele se actualizează în timp real.
            </p>
          </div>
          <PLCalculator />
        </div>
      </section>

      <section className="container mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div className="max-w-5xl mx-auto grid lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3">
            <PaymentsTable />
          </div>
          <div className="lg:col-span-2">
            <RevenueChart />
          </div>
        </div>
      </section>

      <section className="bg-muted/30 border-y border-border/60 py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-14">
            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-4">
              4 secțiuni acoperite
            </span>
            <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">
              Toată financiarea, într-un singur modul
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
          <div className="max-w-2xl mx-auto text-center mb-14">
            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-4">
              Securitate & conformitate
            </span>
            <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">
              Banii și datele tale sunt în siguranță
            </h2>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
            {security.map((item) => {
              const Icon = item.icon;
              return (
                <article
                  key={item.title}
                  className="rounded-2xl border border-border bg-card p-5 card-hover"
                >
                  <Icon className="h-5 w-5 text-primary mb-3" />
                  <h3 className="text-sm font-bold mb-1.5">{item.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {item.description}
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
