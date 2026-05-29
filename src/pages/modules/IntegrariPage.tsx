import { useState, useMemo } from "react";
import { Search, Code2, Webhook, Lock } from "lucide-react";
import { ModulePageShell } from "@/components/modules/ModulePageShell";
import { ModuleHero } from "@/components/modules/ModuleHero";
import { ModuleFAQ } from "@/components/modules/ModuleFAQ";
import { IntegrationCard } from "@/components/modules/integrari/IntegrationCard";
import { IntegrationModal } from "@/components/modules/integrari/IntegrationModal";
import {
  INTEGRATIONS,
  CATEGORY_META,
  type Integration,
  type IntegrationCategory,
} from "@/data/integrations";
import { cn } from "@/lib/utils";

export function filterIntegrations(
  list: ReadonlyArray<Integration>,
  query: string,
  category: IntegrationCategory | "all"
): Integration[] {
  const q = query.trim().toLowerCase();
  return list.filter((i) => {
    if (category !== "all" && i.category !== category) return false;
    if (q && !i.name.toLowerCase().includes(q) && !i.description.toLowerCase().includes(q)) return false;
    return true;
  });
}

const CODE_EXAMPLE = `// Webhook handler — lead nou primit din site
import express from 'express';
const app = express();

app.post('/webhook/lead', async (req, res) => {
  const { name, email, phone, course } = req.body;
  await vectorLearn.leads.create({
    full_name: name,
    email,
    phone,
    interest_course: course,
    source: 'webhook',
    consent_at: new Date().toISOString(),
  });
  res.json({ ok: true });
});`;

const faqs = [
  {
    q: "Pot conecta o aplicație care nu e în lista voastră?",
    a: "Da, prin 3 căi: (1) Zapier/Make/Albato — peste 5000 de apps disponibile fără cod. (2) API REST complet documentat (OpenAPI 3) cu webhooks pentru orice eveniment în sistem. (3) Pe Enterprise, scriem integrarea custom pentru tine în maxim 10 zile lucrătoare.",
  },
  {
    q: "Câte integrări active pot avea simultan?",
    a: 'Nelimitate pe planurile Growth și mai sus. Fiecare integrare are propriul „connection health" în panou (success rate, latență, ultimul sync). Dacă o integrare începe să eșueze, primești alert instant și opțiune de retry manual sau re-auth.',
  },
  {
    q: "Datele se sincronizează în timp real sau cu întârziere?",
    a: "Pentru integrările bazate pe webhooks (telefonie, plăți, mesagerie) — sub 2 secunde. Pentru cele bazate pe pull (contabilitate 1C/SAGA, cloud storage) — la fiecare 5 minute sau on-demand. Diferența este afișată clar la conectare. Toate integrările au audit log accesibil 90 zile.",
  },
  {
    q: "Ce se întâmplă dacă terța parte are downtime?",
    a: "Retry exponențial automat (1, 5, 15, 60 min, 6h, 24h). Mesajele/evenimentele eșuate sunt salvate într-un outbox local și retrimise când serviciul revine. Manager primește alert dacă o integrare e down > 30 min. Niciun eveniment nu se pierde — proiectat ca event-sourced cu replay.",
  },
];

export function IntegrariPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<IntegrationCategory | "all">("all");
  const [openIntegration, setOpenIntegration] = useState<Integration | null>(null);

  const filtered = useMemo(
    () => filterIntegrations(INTEGRATIONS, query, category),
    [query, category]
  );

  const categories: Array<{ value: IntegrationCategory | "all"; label: string }> = [
    { value: "all", label: "Toate" },
    ...Object.entries(CATEGORY_META).map(([k, v]) => ({
      value: k as IntegrationCategory,
      label: v.label,
    })),
  ];

  return (
    <ModulePageShell>
      <ModuleHero
        badge="Modulul Integrări"
        title={<>350+ integrări native, <span className="text-gradient">plus API pentru orice</span></>}
        description="Funcționează cu tool-urile pe care le folosești deja: telefonie (Asterisk, Mango), plăți (Stripe, PayU), contabilitate (1C, SAGA, e-Factura ANAF), mesagerie (WhatsApp Business, Telegram), analytics (GA4, Meta CAPI). Plus API REST complet și webhooks pentru orice eveniment."
        ctaPrimary={{ label: "Cere demo integrări", href: "#/?demo=integrari" }}
        ctaSecondary={{ label: "Vezi documentația API", href: "#api-docs" }}
      />

      <section className="container mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6 space-y-3">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Caută o integrare (Stripe, Asterisk, 1C…)"
                aria-label="Caută integrări"
                className="w-full rounded-md border border-input bg-card pl-9 pr-3 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              />
            </div>
            <div role="tablist" aria-label="Filtrare pe categorie" className="flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <button
                  key={c.value}
                  role="tab"
                  aria-selected={category === c.value}
                  onClick={() => setCategory(c.value)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-semibold transition-all",
                    category === c.value
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <p data-testid="int-count" className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{filtered.length}</span> integrări afișate
            </p>
          </div>

          {filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Nicio integrare găsită pentru filtrele selectate.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {filtered.map((integration) => (
                <IntegrationCard
                  key={integration.id}
                  integration={integration}
                  onClick={(i) => setOpenIntegration(i)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <section id="api-docs" className="bg-muted/30 border-y border-border/60 py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-4">
                API & Webhooks
              </span>
              <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight mb-4">
                Pentru ce nu e în listă, ai <span className="text-gradient">API REST complet</span>
              </h2>
              <ul className="space-y-3 mb-6">
                {[
                  { icon: Code2, title: "OpenAPI 3.1 specification", desc: "Documentație generată din cod, întotdeauna up-to-date. Try it în browser." },
                  { icon: Webhook, title: "Webhooks pe orice eveniment", desc: "lead.created, payment.succeeded, lesson.attended — 40+ evenimente." },
                  { icon: Lock, title: "Authentication: API key sau OAuth 2", desc: "Scope granular per key. Rotate cu un click. Rate limit configurabil." },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.title} className="flex items-start gap-3">
                      <span className="rounded-md bg-primary/10 p-1.5 mt-0.5">
                        <Icon className="h-4 w-4 text-primary" />
                      </span>
                      <div>
                        <p className="text-sm font-bold text-foreground">{item.title}</p>
                        <p className="text-xs text-muted-foreground">{item.desc}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <a href="#" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                Citește documentația completă →
              </a>
            </div>
            <pre className="rounded-2xl border border-border bg-foreground p-5 text-xs text-background overflow-x-auto leading-relaxed">
              <code>{CODE_EXAMPLE}</code>
            </pre>
          </div>
        </div>
      </section>

      <ModuleFAQ items={faqs} />

      <IntegrationModal integration={openIntegration} onClose={() => setOpenIntegration(null)} />
    </ModulePageShell>
  );
}
