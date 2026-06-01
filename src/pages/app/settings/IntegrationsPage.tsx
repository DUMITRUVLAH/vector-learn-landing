/**
 * INT-903 — /app/settings/integrations
 *
 * Instructions page for connecting Zapier, Make, n8n, or any HTTP client
 * to Vector Learn's REST triggers and webhook endpoints.
 */
import { Zap, BookOpen, Link2, Copy, CheckCircle2, ArrowRight } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { Link } from "@/router/HashRouter";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface CopyBlockProps {
  value: string;
  label?: string;
}

function CopyBlock({ value, label }: CopyBlockProps) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className="relative group">
      {label && <p className="text-xs text-muted-foreground mb-1">{label}</p>}
      <div className="flex items-center gap-2 bg-muted rounded-md border border-border p-2 pr-10">
        <code className="text-xs font-mono text-foreground break-all flex-1">{value}</code>
        <button
          onClick={copy}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-background text-muted-foreground hover:text-foreground touch-target"
          aria-label={`Copiaza: ${label ?? value}`}
        >
          {copied ? (
            <CheckCircle2 className="h-4 w-4 text-primary" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}

interface StepProps {
  n: number;
  title: string;
  children: React.ReactNode;
}

function Step({ n, title, children }: StepProps) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center mt-0.5">
        {n}
      </div>
      <div className="flex-1 space-y-2">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <div className="text-sm text-muted-foreground space-y-1.5">{children}</div>
      </div>
    </div>
  );
}

const BASE_URL = typeof window !== "undefined"
  ? `${window.location.protocol}//${window.location.host}`
  : "https://vector-learn.vercel.app";

export function IntegrationsPage() {
  return (
    <AppShell pageTitle="Integrari" pageDescription="Conecteaza Zapier, Make sau orice sistem extern">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link2 className="h-5 w-5 text-primary" aria-hidden />
            <h1 className="text-xl font-semibold text-foreground">Integrari externe</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Conecteaza Vector Learn la Zapier, Make, n8n sau orice sistem HTTP.
            Doua metode: <strong>polling triggers</strong> (Zapier trage date) sau
            <strong> outbound webhooks</strong> (Vector Learn trimite in timp real).
          </p>
        </div>

        {/* Method 1: Polling Triggers */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" aria-hidden />
            <h2 className="text-base font-semibold text-foreground">Metoda 1: Zapier Polling Triggers</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Zapier trage automat datele noi la fiecare 15 minute. Nicio configurare server necesara.
          </p>

          <div className="rounded-lg border border-border bg-card p-5 space-y-5">
            <p className="text-sm font-semibold text-foreground">Cum conectezi Zapier (polling)</p>

            <div className="space-y-4">
              <Step n={1} title="Genereaza un API Key">
                <p>
                  Du-te la{" "}
                  <Link to="/app/settings/api-keys" className="text-primary hover:underline inline-flex items-center gap-1">
                    Setari <ArrowRight className="h-3 w-3" />
                  </Link>{" "}
                  si genereaza o cheie noua cu numele &ldquo;Zapier&rdquo;.
                  Copiaz-o — o vei folosi in pasul urmator.
                </p>
              </Step>

              <Step n={2} title="Creeaza un Zap nou in Zapier">
                <p>
                  In Zapier: <strong>Create Zap</strong> → <strong>Trigger</strong> →
                  alege <strong>Webhooks by Zapier</strong> sau <strong>Custom Request</strong>.
                </p>
                <p>Seteaza metoda la <strong>GET</strong> si URL-ul la unul din endpoint-urile de mai jos.</p>
              </Step>

              <Step n={3} title="Endpoint-uri disponibile">
                <div className="space-y-2">
                  <CopyBlock
                    label="Leads noi (ultimele 10)"
                    value={`${BASE_URL}/api/integrations/triggers/leads`}
                  />
                  <CopyBlock
                    label="Plati noi (ultimele 10)"
                    value={`${BASE_URL}/api/integrations/triggers/payments`}
                  />
                </div>
              </Step>

              <Step n={4} title="Autentificare cu API Key">
                <p>
                  In Zapier, la <strong>Headers</strong>, adauga:
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <CopyBlock label="Header name" value="X-API-Key" />
                  <CopyBlock label="Header value" value="vl_xxxxx..." />
                </div>
                <p className="text-xs text-muted-foreground">
                  Inlocuieste <code className="font-mono bg-muted px-1 rounded">vl_xxxxx...</code> cu cheia ta reala.
                </p>
              </Step>

              <Step n={5} title="Testeaza si activeaza">
                <p>
                  Click <strong>Test trigger</strong> in Zapier. Daca returneaza date → succes.
                  Acum poti adauga orice actiune (Google Sheets, Slack, email, CRM extern etc).
                </p>
              </Step>
            </div>
          </div>
        </section>

        {/* Method 2: Webhooks */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" aria-hidden />
            <h2 className="text-base font-semibold text-foreground">Metoda 2: Outbound Webhooks (push)</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Vector Learn trimite un POST instant catre URL-ul tau la fiecare eveniment.
            Mai rapid decat polling — ideal pentru automatizari critice.
          </p>

          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Configureaza un endpoint in{" "}
              <Link to="/app/settings/webhooks" className="text-primary hover:underline inline-flex items-center gap-1">
                Webhooks <ArrowRight className="h-3 w-3" />
              </Link>.
              Evenimentele disponibile:
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {["lead.created", "lead.updated", "student.enrolled", "payment.received"].map((ev) => (
                <code key={ev} className="text-xs font-mono bg-muted border border-border rounded px-2 py-1 text-foreground">
                  {ev}
                </code>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Fiecare POST include signatura HMAC-SHA256 in header-ul{" "}
              <code className="font-mono bg-muted px-1 rounded">X-VL-Signature</code> —
              verifica-o pentru securitate.
            </p>
          </div>
        </section>

        {/* API Reference */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" aria-hidden />
            <h2 className="text-base font-semibold text-foreground">Referinta API</h2>
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm" aria-label="Endpoint-uri disponibile">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Endpoint</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Auth</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Descriere</th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    method: "GET",
                    path: "/api/integrations/triggers/leads",
                    auth: "X-API-Key",
                    desc: "Ultimele 10 leads (Zapier polling)",
                  },
                  {
                    method: "GET",
                    path: "/api/integrations/triggers/payments",
                    auth: "X-API-Key",
                    desc: "Ultimele 10 plati (Zapier polling)",
                  },
                  {
                    method: "POST",
                    path: "/api/settings/api-keys",
                    auth: "Session",
                    desc: "Genereaza API key",
                  },
                  {
                    method: "POST",
                    path: "/api/settings/webhooks",
                    auth: "Session",
                    desc: "Inregistreaza webhook endpoint",
                  },
                ].map((row) => (
                  <tr key={row.path} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <code className={cn(
                          "text-xs font-mono px-1.5 py-0.5 rounded",
                          row.method === "GET" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        )}>
                          {row.method}
                        </code>
                        <code className="text-xs font-mono text-foreground">{row.path}</code>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <code className="font-mono bg-muted px-1 rounded">{row.auth}</code>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{row.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

      </div>
    </AppShell>
  );
}
