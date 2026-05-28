import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const faqs = [
  {
    q: "Cât durează implementarea Vector Learn?",
    a: "Setup-ul de bază durează 24 de ore. Importăm datele tale (elevi, profesori, plăți istorice) din orice format — Excel, Google Sheets sau alt CRM. Echipa noastră îți face onboarding de 2 ore în care îți configurăm contul exact pe nevoia ta.",
  },
  {
    q: "Pot migra de pe HOLLIHOP, Sycret, AnyClass sau alt CRM?",
    a: "Da. Echipa noastră de migrare a transferat date din 18 sisteme diferite. Pe planurile Pro și Enterprise migrarea este gratuită și include verificare manuală a fiecărui set de date pentru a evita pierderi.",
  },
  {
    q: "Datele mele sunt în siguranță și conforme GDPR?",
    a: "Toate datele sunt găzduite în centre de date UE (Frankfurt și Amsterdam) cu certificare ISO 27001. Facem backup zilnic cu retenție 30 de zile. Suntem 100% conformi GDPR cu DPA semnabil instant din panou. Audit de securitate anual de către o firmă terță.",
  },
  {
    q: "Funcționează cu casa de marcat fiscală din România?",
    a: "Da. Avem integrare nativă cu case Tremol, Datecs, Daisy și toate modelele certificate ANAF. De asemenea, generăm e-Factura conform cerințelor SPV-ANAF începând cu 2024. Casierul tău nu mai face dublu input.",
  },
  {
    q: "Cum funcționează aplicația mobilă? E inclusă?",
    a: "Aplicația mobilă (iOS + Android) este inclusă în toate planurile. Elevii descarcă o singură aplicație branduită cu logo-ul tău. Pe planurile Pro și Enterprise poți publica chiar și în App Store și Play Store cu numele centrului tău (white-label).",
  },
  {
    q: "Pot anula oricând? Există contracte de loialitate?",
    a: "Nu sunt contracte de loialitate. Pe planul lunar anulezi cu un click și ai acces până la sfârșitul ciclului plătit. Pe planul anual rambursăm pro-rata pentru lunile neutilizate. Datele tale sunt exportabile în Excel/CSV oricând.",
  },
  {
    q: "Cum funcționează WhatsApp-ul? E prin numărul meu?",
    a: "Da, prin numărul tău de WhatsApp Business. Folosim WhatsApp Business API oficial (nu boți gri) ceea ce înseamnă că ești 100% conform Meta. Mesajele template-uri sunt aprobate de Meta și costă cca €0.05/mesaj. Conversațiile inițiate de elevi sunt gratuite 24h.",
  },
  {
    q: "Câți utilizatori (profesori, manageri) pot folosi sistemul?",
    a: "Depinde de plan: Starter — 5 utilizatori, Growth — 15, Pro — nelimitați. Fiecare utilizator are roluri și permisiuni configurabile (ex: profesorul vede doar grupele lui, recepționera vede plățile dar nu salariile etc.).",
  },
  {
    q: "Pot personaliza email-urile, facturile și aplicația cu brand-ul meu?",
    a: "Da. Pe toate planurile poți pune logo-ul tău pe email-uri și aplicația mobilă. Pe Growth și Pro adaugi culorile brandului. Pe Pro ai white-label complet: domeniu propriu, app store cu numele tău, fără mențiune Vector Learn nicăieri.",
  },
  {
    q: "Există API pentru integrare cu site-ul meu sau alte sisteme?",
    a: "Da, API REST complet documentat (OpenAPI 3) cu webhooks pentru orice eveniment (înscriere, plată, absență etc.). De asemenea integrări native cu Zapier, Make.com și Albato pentru cei care nu sunt developeri.",
  },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="py-24 sm:py-32">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-[1fr_2fr] gap-12 lg:gap-16">
          <div>
            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-4">
              FAQ
            </span>
            <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">
              Întrebări{" "}
              <span className="text-gradient">frecvente</span>
            </h2>
            <p className="mt-4 text-base text-muted-foreground">
              Nu găsești răspunsul aici? Echipa noastră răspunde personal în mai puțin de 15 minute.
            </p>
            <a
              href="#contact"
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
            >
              Contactează-ne →
            </a>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, i) => {
              const isOpen = open === i;
              return (
                <div
                  key={i}
                  className={cn(
                    "rounded-xl border bg-card overflow-hidden transition-all",
                    isOpen ? "border-primary/40 shadow-md" : "border-border"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : i)}
                    className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
                  >
                    <span className="text-sm font-semibold text-foreground">{faq.q}</span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 text-muted-foreground transition-transform flex-shrink-0",
                        isOpen && "rotate-180 text-primary"
                      )}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 -mt-1 text-sm text-muted-foreground leading-relaxed animate-fade-in">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
