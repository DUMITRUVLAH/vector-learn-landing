import { ReactNode, useEffect, useState } from "react";
import { Users, Calendar, GraduationCap, CreditCard, LogOut, LayoutDashboard, TrendingUp, Zap, BarChart3, DollarSign, Sun, ListChecks, Shield, FileText, MessageSquare, Receipt, BookOpen, School, ClipboardList, Award, Baby, Syringe, MessageCircle, ShieldCheck, AlertTriangle, Medal, Landmark, Building2, Briefcase, RefreshCw } from "lucide-react";
import { Logo } from "@/components/Logo";
import { NotificationBell } from "@/components/app/NotificationBell";
import { BranchSwitcher } from "@/components/app/BranchSwitcher";
import { Link, useRouter } from "@/router/HashRouter";
import { useSession } from "@/hooks/useSession";
import { cn } from "@/lib/utils";
import { isModuleVisible, type ModuleAudience } from "@/lib/institution";

interface AppShellProps {
  children: ReactNode;
  pageTitle: string;
  pageDescription?: string;
  actions?: ReactNode;
}

interface NavItem {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
}

interface NavGroup {
  /** Section heading shown in the sidebar; `null` = no heading (top-level items). */
  section: string | null;
  /** INST-001: which institution types see this group. Defaults to "shared" (always). */
  audience?: ModuleAudience;
  items: NavItem[];
}

/**
 * Sidebar navigation grouped per module. Each section is one product area so
 * the (now 28-item) menu reads as distinct modules instead of one flat list.
 * Grădinița is its own self-contained module; CX cohorts are surfaced as
 * "Grupe" under Școală (terminology: cohorte → grupe/clase).
 */
const NAV_GROUPS: NavGroup[] = [
  {
    section: null,
    items: [
      { label: "Dashboard", href: "/app", icon: LayoutDashboard },
      { label: "Azi", href: "/app/leads/today", icon: Sun }, // CRM-120: Today dashboard
    ],
  },
  {
    section: "CRM & Vânzări",
    items: [
      { label: "Leads", href: "/app/leads", icon: TrendingUp },
      { label: "Cadences", href: "/app/cadences", icon: ListChecks },
      { label: "Automatizări", href: "/app/settings/crm/automations", icon: Zap },
      { label: "Feedback", href: "/app/feedback", icon: MessageSquare },
      { label: "Analytics CRM", href: "/app/analytics/crm", icon: BarChart3 },
    ],
  },
  {
    section: "Școală",
    audience: "scoala",
    items: [
      { label: "Elevi", href: "/app/students", icon: Users },
      { label: "Grupe", href: "/app/cx", icon: BookOpen }, // CX-702 (fost „CX Cohorte")
      { label: "Clase", href: "/app/school/classes", icon: School }, // SCHOOL-001
      { label: "Orar", href: "/app/schedule", icon: Calendar },
      { label: "Prezență", href: "/app/school/attendance", icon: ClipboardList }, // SCHOOL-003
      { label: "Profesori", href: "/app/teachers", icon: GraduationCap },
      { label: "Clasament", href: "/app/gamification", icon: Medal }, // GAP-020
      { label: "Diplome", href: "/app/diplome", icon: Award }, // DIPLOMA-802
    ],
  },
  {
    section: "Finanțe",
    items: [
      { label: "Plăți", href: "/app/payments", icon: CreditCard },
      { label: "Facturi", href: "/app/invoices", icon: Receipt },
      { label: "Cont de plată", href: "/app/conturi-plata", icon: Landmark }, // CONT-PLATA
      { label: "Contracte", href: "/app/contracts", icon: FileText },
      { label: "Salarizare", href: "/app/hr/payroll", icon: DollarSign },
    ],
  },
  {
    section: "Grădiniță",
    audience: "gradinita",
    items: [
      { label: "Check-in", href: "/app/kinder/checkin", icon: Baby }, // KINDER-001
      { label: "Jurnal copil", href: "/app/kinder/diary", icon: FileText }, // KINDER-002
      { label: "Raport personal", href: "/app/kinder/ratio", icon: Shield }, // KINDER-003
      { label: "Vaccinuri", href: "/app/kinder/immunization-report", icon: Syringe }, // KINDER-004
      { label: "Feed parental", href: "/app/kinder/students", icon: MessageCircle }, // KINDER-005
      { label: "Conformitate", href: "/app/kinder/compliance", icon: ShieldCheck }, // KINDER-006
      { label: "Incidente", href: "/app/kinder/incidents", icon: AlertTriangle }, // KINDER-007
    ],
  },
  {
    section: "Analiză & Securitate",
    items: [
      { label: "Analytics", href: "/app/analytics", icon: TrendingUp }, // GAP-016
      { label: "Audit Log", href: "/app/audit-log", icon: Shield },
    ],
  },
  {
    section: "Setări",
    items: [
      { label: "Instituție", href: "/app/settings/institution", icon: Building2 }, // INST-001
      // AUTH-003/004: user profile + security settings
      { label: "Profil", href: "/app/settings/profile", icon: Shield },
      { label: "Securitate", href: "/app/settings/security", icon: Shield },
    ],
  },
];

/**
 * Business Suite navigation — shown when the current route is under /business/*.
 * Distinct product (FinDesk + PAR + ITPark), so it must NOT show the CRM/Școală menu.
 */
const BUSINESS_NAV_GROUPS: NavGroup[] = [
  {
    section: null,
    items: [
      { label: "Dashboard", href: "/business/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    section: "FinDesk — Finanțe",
    items: [
      { label: "Facturi", href: "/business/fin/invoices", icon: Receipt },
      { label: "Cont de plată", href: "/business/fin/invoices/document", icon: FileText },
      { label: "e-Factura", href: "/business/fin/einvoices", icon: FileText },
      { label: "Încasări", href: "/business/fin/payments", icon: CreditCard },
      { label: "Cheltuieli", href: "/business/fin/expenses", icon: DollarSign },
      { label: "Parteneri", href: "/business/fin/parties", icon: Users },
      { label: "Acorduri", href: "/business/fin/agreements", icon: FileText },
      { label: "Registru general", href: "/business/fin/ledger", icon: Landmark },
      { label: "TVA & declarații", href: "/business/fin/tax", icon: ClipboardList },
      { label: "Salarii", href: "/business/fin/payroll", icon: DollarSign },
      { label: "Mijloace fixe", href: "/business/fin/assets", icon: Building2 },
      { label: "Stocuri", href: "/business/fin/inventory", icon: BookOpen },
      { label: "Buget", href: "/business/fin/budget", icon: BarChart3 },
      { label: "Tablou de bord", href: "/business/fin/insights", icon: TrendingUp },
      { label: "Documente AI", href: "/business/fin/captures", icon: Zap },
      { label: "Reconciliere & TVA import", href: "/business/fin/reconcile", icon: RefreshCw },
      { label: "Bancă", href: "/business/fin/banklink", icon: Landmark },
      { label: "Calendar fiscal", href: "/business/fin/calendar", icon: Calendar },
      { label: "Operațiuni în masă", href: "/business/fin/mass", icon: ListChecks },
      { label: "Export", href: "/business/fin/export", icon: FileText },
    ],
  },
  {
    section: "Aprobări plăți (PAR)",
    items: [
      { label: "Cereri de plată", href: "/business/par", icon: ClipboardList },
      { label: "Aprobări", href: "/business/par/inbox", icon: ShieldCheck },
    ],
  },
  {
    section: "ITPark",
    items: [
      { label: "Rezidenți", href: "/business/itpark", icon: Building2 },
    ],
  },
  {
    section: "Setări",
    items: [
      { label: "Securitate", href: "/business/fin/settings/security", icon: Shield },
      { label: "Audit AI", href: "/business/fin/settings/ai-audit", icon: Shield },
    ],
  },
];

/** Flat list of every nav item (handy for lookups). */
const NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** The 5 primary destinations shown in the mobile bottom bar. */
const MOBILE_NAV: NavItem[] = ["/app", "/app/leads/today", "/app/leads", "/app/students", "/app/payments"]
  .map((href) => NAV.find((i) => i.href === href))
  .filter((i): i is NavItem => Boolean(i));

export function AppShell({ children, pageTitle, pageDescription, actions }: AppShellProps) {
  const { data, logout } = useSession();
  const { path, navigate } = useRouter();
  /** CRM-120: Today action counter for nav badge */
  const [todayCount, setTodayCount] = useState<number | null>(null);

  /**
   * Context-aware nav: under /business/* this is the Business Suite (FinDesk+PAR+ITPark),
   * so show the business menu — NOT the CRM/Școală menu. Otherwise the CRM menu (filtered
   * by institution type, INST-001).
   */
  const isBusiness = path.startsWith("/business");
  const visibleGroups = isBusiness
    ? BUSINESS_NAV_GROUPS
    : NAV_GROUPS.filter((g) =>
        isModuleVisible(g.audience ?? "shared", data?.tenant.institutionType)
      );

  useEffect(() => {
    // Fetch today counter only when authenticated and not already on today page
    if (!data) return;
    if (path.startsWith("/business")) return; // business suite has no CRM 'today' counter
    // Use stored value first (session-level cache to avoid refetch on every nav)
    try {
      const cached = sessionStorage.getItem("today_count_cache");
      if (cached) {
        const { count, ts } = JSON.parse(cached) as { count: number; ts: number };
        // Use cache if < 5 min old
        if (Date.now() - ts < 5 * 60 * 1000) {
          setTodayCount(count);
          return;
        }
      }
    } catch { /* ignore */ }

    fetch("/api/leads/today", { credentials: "include" })
      .then((r) => r.ok ? r.json() as Promise<{ totalActions: number }> : Promise.reject())
      .then(({ totalActions }) => {
        setTodayCount(totalActions);
        try { sessionStorage.setItem("today_count_cache", JSON.stringify({ count: totalActions, ts: Date.now() })); } catch { /* ignore */ }
      })
      .catch(() => { /* ignore — badge is optional */ });
  }, [data]);

  const handleLogout = async () => {
    await logout();
    navigate("/app/login");
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border bg-card sticky top-0 z-30">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo />
            {data && (
              <>
                <span className="hidden sm:inline text-xs text-muted-foreground">/</span>
                <span className="text-sm font-semibold hidden sm:inline">{data.tenant.name}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            {data && (
              <>
                {/* BRANCH-702: Branch switcher */}
                <BranchSwitcher />
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-semibold">{data.user.name}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{data.user.role}</p>
                </div>
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-xs font-bold text-primary-foreground">
                  {data.user.name
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")}
                </div>
                <NotificationBell />
                <button
                  type="button"
                  onClick={handleLogout}
                  aria-label="Logout"
                  className="touch-target rounded-md hover:bg-muted flex items-center justify-center"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 flex">
        <aside className="hidden md:flex w-56 flex-col border-r border-border bg-card/40 p-4">
          <nav className="space-y-4">
            {visibleGroups.map((group) => (
              <div key={group.section ?? "_top"} className="space-y-1">
                {group.section && (
                  <p className="px-3 pt-1 pb-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {group.section}
                  </p>
                )}
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = item.href === "/app" ? path === "/app" || path === "/app/" : path.startsWith(item.href);
                  const isTodayItem = item.href === "/app/leads/today";
                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      {/* CRM-120: badge counter for Today dashboard */}
                      {isTodayItem && todayCount !== null && todayCount > 0 && (
                        <span
                          className="ml-auto inline-flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold min-w-[18px] h-[18px] px-1"
                          aria-label={`${todayCount} acțiuni de azi`}
                        >
                          {todayCount > 99 ? "99+" : todayCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
          {/* SPLIT-301: Business Suite discreet link — FinDesk/PAR/ITPark live in Business Suite, not CRM */}
          <div className="mt-auto pt-4 border-t border-border/60 mx-1">
            <a
              href="#/business"
              className="flex items-center gap-2 rounded-md px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Deschide Business Suite (FinDesk, PAR, ITPark)"
            >
              <Briefcase className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Business Suite</span>
            </a>
          </div>
        </aside>

        <main className="flex-1 min-w-0">
          <div className="container mx-auto px-4 py-6 sm:py-8">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
              <div>
                <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight">
                  {pageTitle}
                </h1>
                {pageDescription && (
                  <p className="text-sm text-muted-foreground mt-1">{pageDescription}</p>
                )}
              </div>
              {actions && <div className="flex items-center gap-2">{actions}</div>}
            </div>
            {children}
          </div>
        </main>
      </div>

      <nav className="md:hidden border-t border-border bg-card sticky bottom-0 z-20" aria-label="Navigare mobilă">
        <div className="grid grid-cols-5 overflow-x-auto">
          {MOBILE_NAV.map((item) => {
            const Icon = item.icon;
            const active = item.href === "/app" ? path === "/app" || path === "/app/" : path.startsWith(item.href);
            const isTodayItem = item.href === "/app/leads/today";
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "relative flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <div className="relative">
                  <Icon className="h-4 w-4" />
                  {isTodayItem && todayCount !== null && todayCount > 0 && (
                    <span
                      className="absolute -top-1.5 -right-2 inline-flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[8px] font-bold min-w-[14px] h-[14px] px-0.5"
                      aria-label={`${todayCount} acțiuni`}
                    >
                      {todayCount > 9 ? "9+" : todayCount}
                    </span>
                  )}
                </div>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
