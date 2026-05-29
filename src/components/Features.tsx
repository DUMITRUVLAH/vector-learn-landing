import {
  Calendar,
  CreditCard,
  TrendingUp,
  MessageSquare,
  Smartphone,
  BarChart3,
  UserCog,
  Building2,
  Plug,
  Brain,
  ArrowRight,
} from "lucide-react";
import { PASTEL_CYCLE } from "@/lib/utils";

const features = [
  {
    icon: Calendar,
    title: "Orar interactiv",
    description: "5 moduri de vizualizare, gestiune săli și profesori, recuperări, înlocuiri și absențe — totul cu drag & drop.",
    points: ["Drag & drop intuitiv", "Recuperări automate", "Confirmări instant"],
    href: "#/modules/orar",
  },
  {
    icon: CreditCard,
    title: "Finanțe complete",
    description: "Abonamente, reduceri, facturi, plăți cu cardul/QR, salarii profesori și rapoarte financiare în timp real.",
    points: ["Plăți online & QR", "Salarii automate", "Integrare 1C și case marcat"],
    href: "#/modules/finante",
  },
  {
    icon: TrendingUp,
    title: "CRM și vânzări",
    description: "Funnel de leaduri, ore de probă, automatizări, atribuire surse UTM și istoric complet al comunicării.",
    points: ["Pipeline kanban", "Triggere automate", "Atribuire UTM"],
    href: "#/modules/crm",
  },
  {
    icon: MessageSquare,
    title: "Comunicare multi-canal",
    description: "Campanii WhatsApp, Telegram, SMS și Email cu automatizări pe evenimente sau date specifice.",
    points: ["WhatsApp Business API", "Broadcast cascadat", "Notificări push"],
    href: "#/modules/comunicare",
  },
  {
    icon: Smartphone,
    title: "Aplicație mobilă",
    description: "Portal student și părinte cu orar, teme, plăți, chat cu profesorul și elemente de gamification.",
    points: ["iOS și Android", "Gamification XP", "Notificări instant"],
    href: "#/modules/mobile",
  },
  {
    icon: BarChart3,
    title: "Rapoarte și analize",
    description: "LTV, ARPU, churn, ocupare săli, profitabilitate per disciplină. Export Excel cu un click.",
    points: ["20+ rapoarte gata", "Export Excel/PDF", "Dashboard real-time"],
    href: "#/modules/rapoarte",
  },
  {
    icon: UserCog,
    title: "HR și echipă",
    description: "Gestionează profesori, ratinguri, comisioane, anunțuri interne și permisiuni granulare pe roluri.",
    points: ["Roluri custom", "Rating profesori", "Comisioane flexibile"],
    href: "#/modules/hr",
  },
  {
    icon: Building2,
    title: "Multi-filiale și franciză",
    description: "Administrează rețele de centre dintr-un singur cont, cu rapoarte consolidate și sucursale izolate.",
    points: ["Sucursale nelimitate", "Roluri pe filială", "Branding per locație"],
    href: "#/modules/multifilale",
  },
  {
    icon: Plug,
    title: "Integrări 350+",
    description: "Asterisk, Mango Office, 1C, UniSender, Stripe, Facebook, Albato, APIX-Drive sau API custom.",
    points: ["Telefonie IP", "Webhooks & API", "Zapier compatibile"],
    href: "#/modules/integrari",
  },
  {
    icon: Brain,
    title: "AI Assistant",
    description: "Generare comunicare automată cu părinții, sugestii de orar și răspunsuri inteligente la leaduri.",
    points: ["Chat AI 24/7", "Sumarizare lecții", "Predicție churn"],
    href: "#/modules/ai",
  },
];

export function Features() {
  return (
    <section id="features" className="py-24 sm:py-32 relative">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center mb-16">
          <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-4">
            Funcționalități
          </span>
          <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">
            Tot ce-i trebuie unui{" "}
            <span className="text-gradient">centru educațional</span>
            , într-un singur loc
          </h2>
          <p className="mt-4 text-base text-muted-foreground">
            10 module integrate care înlocuiesc Excel, WhatsApp Web, calendar separat, soft de contabilitate și instrumente de marketing.
          </p>
          <p className="mt-2 text-xs text-primary font-semibold">
            👉 Click pe orice modul pentru pagina lui cu demo interactiv
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {features.map((feature, i) => {
            const Icon = feature.icon;
            const pastel = PASTEL_CYCLE[i % PASTEL_CYCLE.length];
            return (
              <a
                key={feature.title}
                href={feature.href}
                className="group rounded-2xl border border-border bg-card p-6 card-hover relative overflow-hidden block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <div className={`${pastel} rounded-xl p-2.5 w-fit mb-4`}>
                  <Icon className="h-5 w-5 text-foreground/80" />
                </div>
                <h3 className="text-base font-bold mb-2 flex items-center gap-1 group-hover:text-primary transition-colors">
                  {feature.title}
                  <ArrowRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  {feature.description}
                </p>
                <ul className="space-y-1.5">
                  {feature.points.map((point) => (
                    <li key={point} className="flex items-start gap-2 text-xs text-foreground/80">
                      <svg className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                      </svg>
                      {point}
                    </li>
                  ))}
                </ul>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
