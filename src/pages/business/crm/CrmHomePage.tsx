/**
 * CRM (Faza 1) — pagina de start a modulului: lansator de submodule.
 *
 * Doar Pipeline și Produse sunt construite azi; restul apar vizibil blocate
 * „În curând", exact ca pattern-ul din `src/pages/fin/FinHome.tsx` (flag
 * `available`, card mut opacity-60, fără link).
 */
import {
  KanbanSquare,
  Package,
  CalendarClock,
  Building2,
  Upload,
  MessageCircle,
  Zap,
  BarChart3,
  FileText,
  RefreshCw,
  History,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { Link } from "@/router/HashRouter";
import { cn } from "@/lib/utils";
import { useCrmPermissions } from "@/hooks/useCrmPermissions";
import type { CrmPermission } from "@/lib/api/crm";

interface CrmModuleTile {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: typeof KanbanSquare;
  available: boolean;
  /** Dacă e setat, tile-ul apare doar pentru cine are dreptul (jurnalul e de administrator). */
  requires?: CrmPermission;
}

const CRM_MODULES: CrmModuleTile[] = [
  {
    id: "pipeline",
    label: "Pipeline",
    description: "Leaduri pe stadii — de la primul contact până la client sau pierdut.",
    href: "/business/crm/pipeline",
    icon: KanbanSquare,
    available: true,
  },
  {
    id: "produse",
    label: "Produse",
    description: "Cataloagele de cursuri/servicii pe care le vinzi, cu preț și TVA.",
    href: "/business/crm/produse",
    icon: Package,
    available: true,
  },
  {
    id: "astazi",
    label: "Astăzi",
    description: "Ce ai de sunat, scris sau urmărit azi — dintr-o singură privire.",
    href: "/business/crm/astazi",
    icon: CalendarClock,
    available: true,
  },
  {
    id: "clienti",
    label: "Clienți & companii",
    description: "Baza de firme, fișele dublate și unificarea lor fără pierdere de istoric.",
    href: "/business/crm/clienti",
    icon: Building2,
    available: true,
  },
  {
    id: "import",
    label: "Import",
    description: "Adu o listă din Excel sau din alt CRM, cu previzualizare înainte de scriere.",
    href: "/business/crm/import",
    icon: Upload,
    available: true,
  },
  {
    id: "comunicare",
    label: "Comunicare",
    description: "Apeluri, email și WhatsApp din fișa leadului — fiecare atingere rămâne în cronologie.",
    href: "/business/crm/comunicare",
    icon: MessageCircle,
    available: true,
  },
  {
    id: "automatizari",
    label: "Automatizări",
    description: "Reguli care mișcă singure leadurile, creează taskuri și le împart pe agenți.",
    href: "/business/crm/automatizari",
    icon: Zap,
    available: true,
  },
  {
    id: "cadente",
    label: "Cadențe și reactivare",
    description: "Secvențe de urmărire pas cu pas și trezirea clienților pierduți de luni de zile.",
    href: "/business/crm/cadente",
    icon: RefreshCw,
    available: true,
  },
  {
    id: "rapoarte",
    label: "Rapoarte",
    description: "Conversie, motive de pierdere și rezultate pe agent, pentru perioada aleasă.",
    href: "/business/crm/rapoarte",
    icon: BarChart3,
    available: true,
  },
  {
    id: "drepturi",
    label: "Drepturi",
    description: "Cine ce poate face: rolul dă temelia, excepțiile se scriu pe om.",
    href: "/business/crm/drepturi",
    icon: ShieldCheck,
    available: true,
    requires: "audit.view",
  },
  {
    id: "jurnal",
    label: "Jurnal",
    description: "Cine ce a schimbat: leaduri, pâlnii, etape, reguli — cu nume și dată.",
    href: "/business/crm/jurnal",
    icon: History,
    available: true,
    requires: "audit.view",
  },
  {
    id: "documente",
    label: "Documente",
    description: "Oferte și contracte generate direct din datele leadului, cu motorul de acte FinFlow.",
    href: "/business/crm/documente",
    icon: FileText,
    available: true,
  },
];

export function CrmHomePage() {
  const { can } = useCrmPermissions();
  // Un tile care duce la un 403 e o promisiune falsă — se ascunde, nu se dezactivează.
  const visibleModules = CRM_MODULES.filter((mod) => !mod.requires || can(mod.requires));

  return (
    <BusinessShell
      pageTitle="CRM"
      pageDescription="Leaduri, produse și tot ce ține de vânzări, într-un singur loc."
    >
      <div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        role="list"
        aria-label="Module CRM"
      >
        {visibleModules.map((mod) => {
          const Icon = mod.icon;

          if (!mod.available) {
            return (
              <div
                key={mod.id}
                role="listitem"
                className="rounded-xl border border-border bg-muted/40 p-5 opacity-60 select-none"
                aria-label={`${mod.label} — în curând`}
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-muted p-2 shrink-0">
                    <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-muted-foreground">{mod.label}</p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5 line-clamp-2">
                      {mod.description}
                    </p>
                    <span className="mt-2 inline-block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/50">
                      În curând
                    </span>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <Link
              key={mod.id}
              to={mod.href}
              role="listitem"
              className={cn(
                "group rounded-xl border border-border bg-card p-5 transition-colors",
                "hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-none",
                "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                "min-h-[44px]"
              )}
              aria-label={`Accesează ${mod.label}`}
            >
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2 shrink-0 group-hover:bg-primary/15 transition-colors">
                  <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{mod.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {mod.description}
                  </p>
                </div>
                <ArrowRight
                  className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0 mt-0.5"
                  aria-hidden="true"
                />
              </div>
            </Link>
          );
        })}
      </div>
    </BusinessShell>
  );
}
