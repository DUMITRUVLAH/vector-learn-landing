/**
 * CORE-004: FinDesk sidebar navigation component.
 * Renders module links with role-based visibility.
 * Design system: Vector 365 tokens only — zero hardcoded hex.
 * CORE: backlog/fin/FIN-CORE.md §1.3
 *
 * FIX-501 (2026-06-17): All hrefs were /app/fin/* (dead links — App.tsx routes are
 * /business/fin/* and the catch-all RedirectToBusiness ejected the user).
 * Mapping applied:
 *   /app/fin           → /business/fin/
 *   /app/fin/company   → /business/fin/onboarding  (no dedicated route; onboarding is closest)
 *   /app/fin/members   → /business/fin/onboarding  (no dedicated route; onboarding is closest)
 *   /app/fin/parties   → /business/fin/parties
 *   /app/fin/agreements→ /business/fin/agreements
 *   /app/fin/invoices  → /business/fin/invoices
 *   /app/fin/einvoice  → /business/fin/einvoices   (note plural)
 *   /app/fin/cash      → /business/fin/cash
 *   /app/fin/expenses  → /business/fin/expenses
 *   /app/fin/capture   → /business/fin/captures    (note plural)
 *   /app/fin/payroll   → /business/fin/payroll
 *   /app/fin/assets    → /business/fin/assets
 *   /app/fin/tax       → /business/fin/tax
 *   /app/fin/insight   → /business/fin/ledger      (FinInsightsPage is mounted here)
 *   /app/fin/calendar  → /business/fin/calendar
 *   /app/fin/bulk      → /business/fin/mass        (FinMassPage is mounted here)
 *   /app/fin/security  → /business/fin/settings/security
 *
 * GUARD: No href here may start with /app/fin — grep AC1 in FIX-501.
 */
import {
  Building2,
  Users2,
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
  LayoutDashboard,
  ChevronRight,
  FileUp,
} from "lucide-react";
import { Link, useRouter } from "@/router/HashRouter";
import { cn } from "@/lib/utils";
import type { FinRole } from "@/lib/api/fin";

// ─── Nav definition ───────────────────────────────────────────────────────────

interface FinNavItem {
  id: string;
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  /** Minimum role required to see this item; omit = visible to everyone */
  minRole?: FinRole;
}

interface FinNavGroup {
  section: string | null;
  items: FinNavItem[];
}

// All hrefs MUST be /business/fin/* — they must match real routes in App.tsx.
// See FIX-501 mapping comment above. Never use /app/fin/* here.
const FIN_NAV: FinNavGroup[] = [
  {
    section: null,
    items: [
      { id: "home", label: "Tablou de bord", href: "/business/fin/", icon: LayoutDashboard },
    ],
  },
  {
    section: "Configurare",
    items: [
      // /business/fin/company and /members have no dedicated route — mapped to onboarding.
      { id: "company", label: "Compania mea", href: "/business/fin/onboarding", icon: Building2 },
      { id: "members", label: "Membri", href: "/business/fin/onboarding", icon: Users2, minRole: "owner" },
    ],
  },
  {
    section: "Parteneri & Acorduri",
    items: [
      { id: "parties", label: "Parteneri", href: "/business/fin/parties", icon: Handshake },
      { id: "agreements", label: "Acorduri", href: "/business/fin/agreements", icon: FileText },
    ],
  },
  {
    section: "Facturare",
    items: [
      { id: "invoices", label: "Facturi", href: "/business/fin/invoices", icon: FileText },
      { id: "einvoice", label: "e-Factura SFS", href: "/business/fin/einvoices", icon: Zap },
      { id: "cash", label: "Încasări", href: "/business/fin/cash", icon: Landmark },
    ],
  },
  {
    section: "Cheltuieli",
    items: [
      { id: "expenses", label: "Cheltuieli", href: "/business/fin/expenses", icon: ShoppingCart },
      { id: "capture", label: "Invoice Reporting", href: "/business/fin/captures", icon: ScanLine },
      { id: "statement", label: "Import Extras", href: "/business/fin/statement/upload", icon: FileUp },
    ],
  },
  {
    section: "Salarizare & Active",
    items: [
      { id: "payroll", label: "Salarii", href: "/business/fin/payroll", icon: Wallet },
      { id: "assets", label: "Mijloace fixe", href: "/business/fin/assets", icon: PackageSearch },
    ],
  },
  {
    section: "Raportare",
    items: [
      { id: "tax", label: "TVA & Declarații", href: "/business/fin/tax", icon: Calculator },
      // /app/fin/insight → /business/fin/ledger (FinInsightsPage is mounted at /business/fin/ledger)
      { id: "insight", label: "Insight CFO", href: "/business/fin/ledger", icon: BarChart3 },
      { id: "calendar", label: "Calendar fiscal", href: "/business/fin/calendar", icon: CalendarDays },
    ],
  },
  {
    section: "Operațiuni",
    items: [
      // /app/fin/bulk → /business/fin/mass (FinMassPage is mounted at /business/fin/mass)
      { id: "bulk", label: "Operațiuni în masă", href: "/business/fin/mass", icon: PackageSearch, minRole: "accountant" },
      // /app/fin/security → /business/fin/settings/security
      { id: "security", label: "Securitate", href: "/business/fin/settings/security", icon: Shield, minRole: "owner" },
    ],
  },
];

// ─── Role level helper ────────────────────────────────────────────────────────

const ROLE_LEVEL: Record<FinRole, number> = {
  viewer: 0,
  cfo: 1,
  accountant: 2,
  owner: 3,
};

function hasMinRole(userRole: FinRole, minRole?: FinRole): boolean {
  if (!minRole) return true;
  return ROLE_LEVEL[userRole] >= ROLE_LEVEL[minRole];
}

// ─── Component ────────────────────────────────────────────────────────────────

interface FinNavProps {
  /** Current authenticated user's FinDesk role. */
  role: FinRole;
  /** Whether to render in compact (icon-only) mode. */
  compact?: boolean;
  /** Optional class override for the root nav element. */
  className?: string;
}

export function FinNav({ role, compact = false, className }: FinNavProps) {
  const { path } = useRouter();

  return (
    <nav
      aria-label="FinDesk navigație"
      className={cn("space-y-4", className)}
    >
      {FIN_NAV.map((group) => {
        // Filter items by role
        const visibleItems = group.items.filter((item) => hasMinRole(role, item.minRole));
        if (visibleItems.length === 0) return null;

        return (
          <div key={group.section ?? "_top"} className="space-y-0.5">
            {group.section && !compact && (
              <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {group.section}
              </p>
            )}
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const isHome = item.id === "home";
              const active = isHome
                ? path === "/business/fin" || path === "/business/fin/"
                : path.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  to={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors min-h-[44px]",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                  title={compact ? item.label : undefined}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {!compact && (
                    <>
                      <span className="flex-1">{item.label}</span>
                      {active && (
                        <ChevronRight className="h-3 w-3 opacity-50" aria-hidden="true" />
                      )}
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

export { FIN_NAV };
