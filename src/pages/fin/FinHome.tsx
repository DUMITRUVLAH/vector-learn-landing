/**
 * CORE-004: FinDesk home page — /app/fin
 * Overview with module cards, each linking to its real route.
 * Empty-state friendly: cards show "în curând" for unbuilt modules.
 * Design system: Vector 365 semantic tokens, zero hardcoded hex.
 * CORE: backlog/fin/FIN-CORE.md §1.3
 */
import { useEffect, useState } from "react";
import {
  Building2,
  Handshake,
  FileText,
  Zap,
  ShoppingCart,
  ScanLine,
  Landmark,
  Calculator,
  Wallet,
  BarChart3,
  CalendarDays,
  PackageSearch,
  Shield,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { FinLayout } from "./FinLayout";
import { Link } from "@/router/HashRouter";
import { getFinMe, type FinRole } from "@/lib/api/fin";
import { cn } from "@/lib/utils";

// ─── Module card definitions ──────────────────────────────────────────────────

interface ModuleCard {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: typeof Building2;
  available: boolean;
}

const MODULES: ModuleCard[] = [
  {
    id: "company",
    label: "Compania mea",
    description: "Profil fiscal, serie de facturare, configurare workspace",
    href: "/app/fin/company",
    icon: Building2,
    available: true,
  },
  {
    id: "parties",
    label: "Parteneri",
    description: "Clienți, furnizori, IDNO/IBAN, sold și aging",
    href: "/app/fin/parties",
    icon: Handshake,
    available: false,
  },
  {
    id: "agreements",
    label: "Acorduri",
    description: "Contracte recurente și servicii",
    href: "/app/fin/agreements",
    icon: FileText,
    available: false,
  },
  {
    id: "invoices",
    label: "Facturi",
    description: "Emitere, numerotare, TVA, remindere",
    href: "/app/fin/invoices",
    icon: FileText,
    available: false,
  },
  {
    id: "einvoice",
    label: "e-Factura SFS",
    description: "Trimitere electronică SFS Moldova",
    href: "/app/fin/einvoice",
    icon: Zap,
    available: false,
  },
  {
    id: "cash",
    label: "Încasări",
    description: "Extras bancar, reconciliere, alocare plăți",
    href: "/app/fin/cash",
    icon: Landmark,
    available: false,
  },
  {
    id: "expenses",
    label: "Cheltuieli",
    description: "Cheltuieli pe categorii, TVA deductibil",
    href: "/app/fin/expenses",
    icon: ShoppingCart,
    available: false,
  },
  {
    id: "capture",
    label: "Invoice Reporting",
    description: "OCR automat — extrage vendor/sumă/TVA din documente",
    href: "/app/fin/capture",
    icon: ScanLine,
    available: false,
  },
  {
    id: "tax",
    label: "TVA & Declarații",
    description: "Motor TVA, declarații MD/RO, export PDF",
    href: "/app/fin/tax",
    icon: Calculator,
    available: false,
  },
  {
    id: "payroll",
    label: "Salarii",
    description: "Calcul brut↔net, cote ANAF/SFS, state de plată",
    href: "/app/fin/payroll",
    icon: Wallet,
    available: false,
  },
  {
    id: "assets",
    label: "Mijloace fixe",
    description: "Registru, amortizare lunară, casare",
    href: "/app/fin/assets",
    icon: PackageSearch,
    available: false,
  },
  {
    id: "insight",
    label: "Insight CFO",
    description: "Dashboard: venituri, cheltuieli, profit, cashflow 60z",
    href: "/app/fin/insight",
    icon: BarChart3,
    available: false,
  },
  {
    id: "calendar",
    label: "Calendar fiscal",
    description: "Obligații fiscale, termene, period close",
    href: "/app/fin/calendar",
    icon: CalendarDays,
    available: false,
  },
  {
    id: "bulk",
    label: "Operațiuni în masă",
    description: "Facturi recurente bulk, import CSV, raport erori",
    href: "/app/fin/bulk",
    icon: PackageSearch,
    available: false,
  },
  {
    id: "security",
    label: "Securitate",
    description: "GDPR, audit AI, export date, retenție",
    href: "/app/fin/security",
    icon: Shield,
    available: false,
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function FinHome() {
  const [role, setRole] = useState<FinRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getFinMe()
      .then((res) => setRole(res?.member.role as FinRole ?? null))
      .catch(() => setRole(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <FinLayout pageTitle="FinDesk">
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </FinLayout>
    );
  }

  return (
    <FinLayout
      pageTitle="FinDesk"
      pageDescription="Modulele platformei de gestiune financiară"
    >
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        role="list"
        aria-label="Module FinDesk"
      >
        {MODULES.map((mod) => {
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

      {/* Quick actions for owners/accountants */}
      {role && (role === "owner" || role === "accountant") && (
        <div className="mt-8 rounded-xl border border-border bg-card/60 p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">Acțiuni rapide</h2>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/app/fin/company"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors min-h-[44px]"
            >
              <Building2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              Configurează firma
            </Link>
            <Link
              to="/app/fin/onboarding"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors min-h-[44px]"
            >
              <ArrowRight className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              Tur de instalare
            </Link>
          </div>
        </div>
      )}
    </FinLayout>
  );
}
