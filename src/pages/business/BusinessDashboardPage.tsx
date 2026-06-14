/**
 * SPLIT-101: Business Suite Dashboard — /business/dashboard
 *
 * Wrapped în BusinessShell (sidebar cu Dashboard / FinDesk / PAR / ITPark).
 * SPLIT-204 va adăuga KPI-urile reale; deocamdată afișează un placeholder
 * curat în noul shell.
 */
import { Briefcase, Landmark, ClipboardList, Building2 } from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { Link } from "@/router/HashRouter";

interface QuickCard {
  title: string;
  description: string;
  href: string;
  icon: typeof Briefcase;
}

const QUICK_CARDS: QuickCard[] = [
  {
    title: "FinDesk",
    description: "Facturi, cheltuieli, plăți, conturi bancare",
    href: "/business/fin/",
    icon: Landmark,
  },
  {
    title: "PAR — Cereri de plată",
    description: "Cereri noi, inbox de aprobare, rapoarte",
    href: "/business/par",
    icon: ClipboardList,
  },
  {
    title: "ITPark — Rezidenți",
    description: "Gestionare rezidenți și contracte",
    href: "/business/itpark",
    icon: Building2,
  },
];

export function BusinessDashboardPage() {
  return (
    <BusinessShell
      pageTitle="Business Suite"
      pageDescription="Tablou de bord FinDesk · PAR · ITPark"
    >
      {/* Quick access cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {QUICK_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.href}
              to={card.href}
              className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-5 hover:bg-muted/50 hover:border-primary/40 transition-colors"
              aria-label={`Deschide ${card.title}`}
            >
              <div className="inline-flex items-center justify-center rounded-lg bg-primary/10 p-3 w-fit">
                <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground text-sm">{card.title}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{card.description}</p>
              </div>
            </Link>
          );
        })}
      </div>

      {/* KPI placeholder — SPLIT-204 va popula cu date reale */}
      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Dashboard unificat cu KPI reali (FinDesk + PAR + ITPark) — în curs de construcție (SPLIT-204).
        </p>
      </div>
    </BusinessShell>
  );
}
