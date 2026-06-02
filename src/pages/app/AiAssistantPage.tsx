/**
 * AI-A01 — AI Assistant page
 * Entry point for all AI features: lesson summary, churn prediction, lead qualification.
 */
import { useState } from "react";
import { AppShell } from "@/components/app/AppShell";
import { LessonSummaryPanel } from "@/components/app/LessonSummaryPanel";
import { Brain, Zap, TrendingDown } from "lucide-react";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";

export function AiAssistantPage() {
  const { status, data } = useSession();
  const { navigate } = useRouter();
  const [tab, setTab] = useState<"summary" | "churn" | "leads">("summary");

  if (status === "loading") {
    return (
      <AppShell pageTitle="AI Assistant">
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
          Se încarcă...
        </div>
      </AppShell>
    );
  }

  if (status === "unauthenticated" || !data) {
    navigate("/app/login");
    return null;
  }

  const tabs = [
    { id: "summary" as const, label: "Sumar lecție", icon: Brain },
    { id: "churn" as const, label: "Risc abandon", icon: TrendingDown },
    { id: "leads" as const, label: "Calificare leaduri", icon: Zap },
  ];

  return (
    <AppShell
      pageTitle="AI Assistant"
      pageDescription="Instrumente AI pentru academia ta — sumare lecții, predicții churn, calificare leaduri"
    >
      {/* Tab navigation */}
      <div className="flex gap-1 border-b border-border mb-6" role="tablist" aria-label="Funcții AI">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={[
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
            ].join(" ")}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      {tab === "summary" && (
        <div className="max-w-2xl space-y-4">
          <div>
            <h2 className="text-base font-semibold">Generare sumar lecție</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Introduceți notițele lecției și AI generează un sumar de 5 fraze pentru
              părintele elevului. Datele sunt pseudonimizate înainte de trimiterea la AI.
            </p>
          </div>
          <LessonSummaryPanel />
        </div>
      )}

      {tab === "churn" && (
        <div className="max-w-2xl">
          <div className="rounded-lg border border-border p-6 text-center space-y-3">
            <TrendingDown className="h-10 w-10 mx-auto text-muted-foreground" aria-hidden="true" />
            <h2 className="text-base font-semibold">Predicție risc abandon</h2>
            <p className="text-sm text-muted-foreground">
              Funcția de predicție churn analizează prezența, plățile și angajamentul
              fiecărui elev pentru a identifica riscul de abandon în următoarele 30 de zile.
            </p>
            <p className="text-xs text-muted-foreground italic">
              Disponibil în AI-A02 — accesibil din Analytics → Risc abandon.
            </p>
          </div>
        </div>
      )}

      {tab === "leads" && (
        <div className="max-w-2xl">
          <div className="rounded-lg border border-border p-6 text-center space-y-3">
            <Zap className="h-10 w-10 mx-auto text-muted-foreground" aria-hidden="true" />
            <h2 className="text-base font-semibold">Calificare automată leaduri</h2>
            <p className="text-sm text-muted-foreground">
              Leadurile noi sunt calificate automat ca hot/warm/cold pe baza sursei,
              completitudinii datelor și timpului de răspuns.
            </p>
            <p className="text-xs text-muted-foreground italic">
              Disponibil în AI-A03 — calificarea se face automat la adăugarea leadului.
            </p>
          </div>
        </div>
      )}
    </AppShell>
  );
}
