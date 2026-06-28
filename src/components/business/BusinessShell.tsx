/**
 * SPLIT-101: BusinessShell — shell-ul aplicației Business Suite.
 *
 * Echivalentul AppShell pentru Business Suite (FinDesk + PAR + ITPark).
 * Sidebar propriu cu secțiunile: Dashboard, FinDesk, PAR, ITPark.
 * Guard: dacă sesiunea business lipsește → redirect la /business/login.
 * Design: Vector 365 semantic tokens, light+dark, WCAG AA.
 */
import { ReactNode, useEffect, useState } from "react";
import {
  LayoutDashboard,
  LogOut,
  Briefcase,
  Landmark,
  ClipboardList,
  Building2,
  FileText,
  DollarSign,
  CreditCard,
  BarChart3,
  BookOpen,
  Users,
  Home,
  Receipt,
  Banknote,
  Settings,
  FileSpreadsheet,
  Wand2,
  Zap,
  RefreshCw,
  Calendar,
  ListChecks,
  TrendingUp,
  ShieldCheck,
  Shield,
  ArrowLeft,
  FolderOpen,
} from "lucide-react";
import { Link, useRouter } from "@/router/HashRouter";
import { cn } from "@/lib/utils";
import { useBusinessSession } from "@/hooks/useBusinessSession";
import { useParRoles } from "@/hooks/useParRoles";
import { getParInbox } from "@/lib/api/par";
import { NotificationBell } from "@/components/app/NotificationBell";

interface BusinessShellProps {
  children: ReactNode;
  pageTitle: string;
  pageDescription?: string;
  actions?: ReactNode;
}

/** PAR role labels used to gate per-feature nav visibility (SHELL-502). */
type ParNavRole = "requestor" | "approver" | "finance" | "par_admin";

interface NavItem {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  /**
   * SHELL-502: PAR roles allowed to SEE this nav item. Undefined = any PAR member.
   * A requestor (project manager) must not even see approval/finance/admin links —
   * the backend already 403s the data, this hides the links so the UI matches the rights.
   */
  roles?: ParNavRole[];
}

interface NavGroup {
  section: string | null;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    section: null,
    items: [
      { label: "Dashboard", href: "/business/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    // SPLIT-402: this is the SINGLE Business Suite menu (was split across BusinessShell +
    // AppShell.BUSINESS_NAV_GROUPS). It's the full superset so no module is lost when AppShell
    // delegates here. Keep grouped + curated.
    section: "FinDesk — Finanțe",
    items: [
      { label: "Acasă FinDesk", href: "/business/fin/", icon: Home },
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
      { label: "Tablou de bord", href: "/business/fin/ledger", icon: TrendingUp },
      { label: "Invoice Reporting", href: "/business/fin/captures", icon: Zap },
      { label: "Reconciliere & TVA import", href: "/business/fin/reconcile", icon: RefreshCw },
      { label: "Conturi bancare", href: "/business/fin/banklink", icon: Banknote },
      { label: "Calendar fiscal", href: "/business/fin/calendar", icon: Calendar },
      { label: "Operațiuni în masă", href: "/business/fin/mass", icon: ListChecks },
      { label: "Export & rapoarte", href: "/business/fin/export", icon: BarChart3 },
    ],
  },
  {
    section: "PAR — Cereri de plată",
    items: [
      { label: "Cereri", href: "/business/par", icon: ClipboardList },
      { label: "Inbox aprobare", href: "/business/par/inbox", icon: ShieldCheck, roles: ["approver", "par_admin"] },
      { label: "Rapoarte PAR", href: "/business/par/reports", icon: FileText, roles: ["approver", "finance", "par_admin"] },
    ],
  },
  {
    section: "ITPark — Rezidenți",
    items: [
      // FIX-503: ItparkDetail is mounted at /business/fin/itpark (not /business/itpark)
      { label: "Rezidenți", href: "/business/fin/itpark", icon: Building2 },
    ],
  },
  {
    section: "Document Merge",
    items: [
      // DOCMERGE-004: end-to-end wizard (primary entry point)
      { label: "Documente în masă", href: "/business/docmerge/wizard", icon: Wand2 },
      // DOCMERGE-001: manage templates
      { label: "Templates", href: "/business/docmerge", icon: FileText },
      // DOCMERGE-002: Excel import wizard (legacy / advanced)
      { label: "Import Excel", href: "/business/docmerge/job", icon: FileSpreadsheet },
    ],
  },
  {
    section: "Setări",
    items: [
      { label: "Securitate", href: "/business/fin/settings/security", icon: Shield },
      { label: "Audit AI", href: "/business/fin/settings/ai-audit", icon: Settings },
    ],
  },
];

/**
 * PAR-only navigation — shown when the current route is under /business/par/*.
 * Entering the PAR module gives a focused sidebar with ONLY PAR features, plus a
 * "back to all modules" link. Mirrors the structure of the standalone PAR app.
 */
// SHELL-502: per-item PAR roles mirror the backend guards (requirePARRole):
//   - "Cereri de plată" (list, scoped to own): any PAR member (incl. requestor)
//   - Inbox/approve: approver | par_admin
//   - Finance queue: finance | par_admin
//   - Folders/Reports (analysis): approver | finance | par_admin (reports route 403s requestor)
//   - Administrare (members/DOA/settings/import): par_admin
const PAR_NAV_GROUPS: NavGroup[] = [
  {
    section: null,
    items: [
      { label: "Cereri de plată", href: "/business/par", icon: ClipboardList },
      { label: "Inbox aprobare", href: "/business/par/inbox", icon: ShieldCheck, roles: ["approver", "par_admin"] },
      { label: "Coadă finanțe", href: "/business/par/finance", icon: Banknote, roles: ["finance", "par_admin"] },
    ],
  },
  {
    section: "Analiză",
    items: [
      { label: "Foldere proiecte", href: "/business/par/folders", icon: FolderOpen, roles: ["approver", "finance", "par_admin"] }, // VM1-10
      { label: "Rapoarte & statistici", href: "/business/par/reports", icon: BarChart3, roles: ["approver", "finance", "par_admin"] },
    ],
  },
  {
    section: "Administrare",
    items: [
      // ParAdmin: tabs for Settings, Members (echipă), Reference data
      // (linii bugetare, departamente, proiecte, furnizori) + DOA matrix.
      { label: "Administrare PAR", href: "/business/par/admin", icon: Settings, roles: ["par_admin"] },
    ],
  },
];

/** Exported for testing purposes only (T-DOCMERGE-004-4). Do not use in production code. */
export const NAV_GROUPS_EXPORT: NavGroup[] = NAV_GROUPS;

/**
 * Pagini publice: nu necesită sesiune business.
 * /business = landing page (exact match sau /business exact)
 * /business/login = pagina de login
 */
const PUBLIC_PATHS = ["/business/login"];
const PUBLIC_EXACT = ["/business"];

export function BusinessShell({
  children,
  pageTitle,
  pageDescription,
  actions,
}: BusinessShellProps) {
  const { path, navigate } = useRouter();
  const session = useBusinessSession();

  // VM1-01: fetch PAR roles to gate the PAR navigation section.
  // While loading, hasPar = false so the section stays hidden (no flicker).
  // On error / 401 → useParRoles returns roles=[], so hasPar = false (fail-closed).
  const { roles: parRoles, status: parRolesStatus } = useParRoles();
  const hasPar = parRolesStatus === "resolved" && parRoles.length >= 1;

  // Notification badge: count of PARs awaiting THIS user's approval (refreshed periodically + on
  // navigation). Only fetched for approvers/admins; 0 hides the badge.
  const canApproveNav = parRoles.some((r) => ["approver", "par_admin"].includes(r));
  const [inboxCount, setInboxCount] = useState(0);
  useEffect(() => {
    if (!canApproveNav) { setInboxCount(0); return; }
    let alive = true;
    const fetchCount = () =>
      getParInbox().then((r) => { if (alive) setInboxCount(r.total ?? 0); }).catch(() => {});
    fetchCount();
    const iv = setInterval(fetchCount, 60_000);
    return () => { alive = false; clearInterval(iv); };
  }, [canApproveNav, path]);

  // SPLIT-501: inside the PAR module, show a focused PAR-only sidebar instead of
  // the full Business Suite menu. Every /business/par/* page (which renders via
  // AppShell → BusinessShell) gets it automatically.
  const isParModule = path.startsWith("/business/par");
  // VM1-01: PAR module sidebar is only shown if user has PAR roles.
  // If user navigates to /business/par/* without a role, server returns 403 — no need
  // to hide PAR_NAV_GROUPS here, but we do hide the main NAV_GROUPS PAR section.
  const baseGroups = isParModule
    ? PAR_NAV_GROUPS
    : NAV_GROUPS.filter((g) => {
        // Hide "PAR — Cereri de plată" section when user has no PAR role.
        // All other sections (FinDesk, ITPark, DocMerge, Setări, etc.) always visible.
        if (g.section === "PAR — Cereri de plată") return hasPar;
        return true;
      });
  // SHELL-502: per-item PAR role filter so a requestor (project manager) sees ONLY their part
  // (Cereri de plată) — not approve/finance/admin/reports. Items without `roles` are unrestricted
  // (FinDesk/ITPark/etc.). Drop groups left empty. Backend already 403s; this aligns the UI.
  const navGroups = baseGroups
    .map((g) => ({ ...g, items: g.items.filter((it) => !it.roles || it.roles.some((r) => parRoles.includes(r))) }))
    .filter((g) => g.items.length > 0);

  // Guard: redirecționează la /business/login dacă sesiunea lipsește.
  useEffect(() => {
    const isPublic =
      PUBLIC_EXACT.includes(path) ||
      PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));
    if (isPublic) return;
    if (session.status === "unauthenticated" || session.status === "error") {
      navigate("/business/login");
    }
  }, [session.status, path, navigate]);

  const handleLogout = async () => {
    await session.logout();
    navigate("/business/login");
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-3 shrink-0 z-20 sticky top-0">
        <Link
          to="/business/dashboard"
          className="flex items-center gap-2 font-display font-bold text-base select-none"
          aria-label="Business Suite — acasă"
        >
          <Briefcase className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline text-foreground">Business Suite</span>
        </Link>
        <div className="flex-1" />
        <NotificationBell />
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors min-h-[44px]"
          aria-label="Deconectare Business Suite"
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline">Ieșire</span>
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className="hidden md:flex flex-col w-56 shrink-0 border-r border-border bg-card overflow-y-auto"
          aria-label="Navigare Business Suite"
        >
          <nav className="flex flex-col gap-1 p-3 flex-1">
            {isParModule && (
              <Link
                to="/business/dashboard"
                className="flex items-center gap-2 rounded-md px-3 py-2 mb-2 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors min-h-[44px]"
                aria-label="Înapoi la toate modulele"
              >
                <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Toate modulele</span>
              </Link>
            )}
            {navGroups.map((group, gi) => (
              <div key={gi} className={gi > 0 ? "mt-3" : undefined}>
                {group.section && (
                  <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.section}
                  </p>
                )}
                {group.items.map((item) => {
                  const Icon = item.icon;
                  // Exact match for "index" items (dashboard, PAR root) so they
                  // don't stay highlighted on every sub-route.
                  const isIndexItem =
                    item.href === "/business/dashboard" || item.href === "/business/par";
                  const active = isIndexItem
                    ? path === item.href || path === item.href + "/"
                    : path.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors min-h-[44px]",
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="flex-1">{item.label}</span>
                      {item.href === "/business/par/inbox" && inboxCount > 0 && (
                        <span
                          className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[11px] font-semibold"
                          aria-label={`${inboxCount} cereri în așteptare`}
                        >
                          {inboxCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 overflow-y-auto">
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

      {/* Mobile bottom nav — 4 tab-uri principale */}
      <nav
        className="md:hidden border-t border-border bg-card sticky bottom-0 z-20"
        aria-label="Navigare mobilă Business Suite"
      >
        {(() => {
          // SHELL-502: mobile PAR tabs also gated by role (requestor sees only "Cereri").
          const canApprove = parRoles.some((r) => ["approver", "par_admin"].includes(r));
          const canAnalyse = parRoles.some((r) => ["approver", "finance", "par_admin"].includes(r));
          const isParAdmin = parRoles.includes("par_admin");
          const mobileItems = isParModule
            ? [
                { label: "Cereri", href: "/business/par", icon: ClipboardList },
                ...(canApprove ? [{ label: "Aprobări", href: "/business/par/inbox", icon: ShieldCheck }] : []),
                ...(canAnalyse ? [{ label: "Rapoarte", href: "/business/par/reports", icon: BarChart3 }] : []),
                ...(isParAdmin ? [{ label: "Admin", href: "/business/par/admin", icon: Settings }] : []),
              ]
            : [
                { label: "Dashboard", href: "/business/dashboard", icon: LayoutDashboard },
                { label: "FinDesk", href: "/business/fin/", icon: Landmark },
                // VM1-01: only show PAR tab if user has at least one PAR role
                ...(hasPar ? [{ label: "PAR", href: "/business/par", icon: ClipboardList }] : []),
                { label: "ITPark", href: "/business/itpark", icon: Building2 },
              ];
          const colsClass =
            mobileItems.length >= 4 ? "grid-cols-4"
            : mobileItems.length === 3 ? "grid-cols-3"
            : mobileItems.length === 2 ? "grid-cols-2"
            : "grid-cols-1";
          return (
          <div className={cn("grid", colsClass)}>
          {mobileItems.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/business/par"
                ? path === "/business/par" || path === "/business/par/"
                : path.startsWith(item.href);
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold min-h-[44px]",
                  active ? "text-primary" : "text-muted-foreground"
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
          </div>
          );
        })()}
      </nav>
    </div>
  );
}
