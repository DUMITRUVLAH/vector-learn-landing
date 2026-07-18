/**
 * SPLIT-101: BusinessShell — shell-ul aplicației Business Suite.
 *
 * Echivalentul AppShell pentru Business Suite (FinDesk + PAR + ITPark).
 * Sidebar propriu cu secțiunile: Dashboard, PAR (primul), FinDesk, ITPark.
 * Guard: dacă sesiunea business lipsește → redirect la /business/login.
 * Design: Vector 365 semantic tokens, light+dark, WCAG AA.
 */
import { ReactNode, useEffect, useState } from "react";
import {
  LayoutDashboard,
  LogOut,
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
  ChevronDown,
} from "lucide-react";
import { FinFlowMark } from "@/components/business/FinFlowLogo";
import { Link, useRouter } from "@/router/HashRouter";
import { cn } from "@/lib/utils";
import { useBusinessSession } from "@/hooks/useBusinessSession";
import { useParRoles } from "@/hooks/useParRoles";
import { getParInbox, getFinanceQueue } from "@/lib/api/par";
import { NotificationBell } from "@/components/app/NotificationBell";
import { api } from "@/lib/api";

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
   */
  roles?: ParNavRole[];
}

interface NavGroup {
  section: string | null;
  /** Prefix used to detect if the current path is inside this group (for auto-expand). */
  prefix?: string;
  items: NavItem[];
}

// Două secțiuni principale: PAR (prima) și FinDesk.
// ITPark / DocMerge / Setări apar în sidebar doar când ești pe rutele lor (prefix match).
const NAV_GROUPS: NavGroup[] = [
  {
    section: "PAR — Cereri de plată",
    prefix: "/business/par",
    items: [
      { label: "Cereri", href: "/business/par", icon: ClipboardList },
      { label: "Inbox aprobare", href: "/business/par/inbox", icon: ShieldCheck, roles: ["approver", "par_admin"] },
      { label: "Rapoarte PAR", href: "/business/par/reports", icon: FileText, roles: ["approver", "finance", "par_admin"] },
    ],
  },
  {
    section: "FinDesk — Finanțe",
    prefix: "/business/fin",
    items: [
      { label: "Acasă FinDesk", href: "/business/fin/", icon: Home },
      { label: "Compania mea", href: "/business/fin/company", icon: Building2 },
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
      { label: "Invoice Reporting", href: "/business/fin/captures", icon: Zap },
      { label: "Import extras bancar", href: "/business/fin/statement/upload", icon: FileSpreadsheet },
      { label: "Istoric extrase", href: "/business/fin/statement", icon: FileText },
      { label: "Reconciliere & TVA import", href: "/business/fin/reconcile", icon: RefreshCw },
      { label: "Conturi bancare", href: "/business/fin/banklink", icon: Banknote },
      { label: "Calendar fiscal", href: "/business/fin/calendar", icon: Calendar },
      { label: "Operațiuni în masă", href: "/business/fin/mass", icon: ListChecks },
      { label: "Export & rapoarte", href: "/business/fin/export", icon: BarChart3 },
      { label: "Rezidenți ITPark", href: "/business/fin/itpark", icon: Building2 },
      { label: "Securitate", href: "/business/fin/settings/security", icon: Shield },
      { label: "Audit AI", href: "/business/fin/settings/ai-audit", icon: Settings },
    ],
  },
  {
    // DocMerge — secțiune separată, vizibilă doar când ești pe /business/docmerge/*
    section: "Document Merge",
    prefix: "/business/docmerge",
    items: [
      { label: "Documente în masă", href: "/business/docmerge/wizard", icon: Wand2 },
      { label: "Templates", href: "/business/docmerge", icon: FileText },
      { label: "Import Excel", href: "/business/docmerge/job", icon: FileSpreadsheet },
    ],
  },
];

/**
 * PAR-only navigation — shown when the current route is under /business/par/*.
 */
// SHELL-502: per-item PAR roles mirror the backend guards (requirePARRole).
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
    prefix: "/business/par",
    items: [
      { label: "Foldere proiecte", href: "/business/par/folders", icon: FolderOpen, roles: ["approver", "finance", "par_admin"] },
      { label: "Rapoarte & statistici", href: "/business/par/reports", icon: BarChart3, roles: ["approver", "finance", "par_admin"] },
    ],
  },
  {
    section: "Administrare",
    prefix: "/business/par",
    items: [
      { label: "Administrare PAR", href: "/business/par/admin", icon: Settings, roles: ["par_admin"] },
    ],
  },
];

/** Exported for testing purposes only (T-DOCMERGE-004-4). Do not use in production code. */
export const NAV_GROUPS_EXPORT: NavGroup[] = NAV_GROUPS;

/**
 * Pagini publice: nu necesită sesiune business.
 */
const PUBLIC_PATHS = ["/business/login"];
const PUBLIC_EXACT = ["/business"];

/** Single nav link row used inside SidebarGroup. */
function NavLink({
  item,
  path,
  inboxCount,
  financeCount,
}: {
  item: NavItem;
  path: string;
  inboxCount: number;
  financeCount: number;
}) {
  const Icon = item.icon;
  // "Cereri" root and "Acasă FinDesk" should only be active on exact match, not every sub-route.
  const isIndexItem = item.href === "/business/par" || item.href === "/business/fin/";
  const active = isIndexItem
    ? path === item.href || path === item.href.replace(/\/$/, "")
    : path.startsWith(item.href);
  return (
    <Link
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
      {item.href === "/business/par/finance" && financeCount > 0 && (
        <span
          className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[11px] font-semibold"
          aria-label={`${financeCount} cereri în coada de finanțe`}
        >
          {financeCount}
        </span>
      )}
    </Link>
  );
}

// AUTOBILL/sidebar: the shell remounts on every navigation, so component state resets and the
// sidebar "jumps". These module-level stores survive remounts within a session.
const sectionOpenState = new Map<string, boolean>(); // section label → expanded?
const badgeCache = { inbox: 0, finance: 0 }; // last seen notification counts

/** Collapsible sidebar section. Opens when active; always-open when section is null. */
function SidebarGroup({
  group,
  path,
  inboxCount,
  financeCount,
}: {
  group: NavGroup;
  path: string;
  inboxCount: number;
  financeCount: number;
}) {
  const isActive = !!group.prefix && path.startsWith(group.prefix);
  // Sections without a label are always visible (no toggle needed).
  const hasHeader = group.section !== null;
  // Persist open/closed across shell remounts (each nav remounts the shell) so sections don't
  // reset and the sidebar doesn't "jump". Keyed by section label.
  const stateKey = group.section ?? "_";
  const [open, setOpen] = useState(() => {
    const remembered = sectionOpenState.get(stateKey);
    return remembered ?? (!hasHeader || isActive);
  });
  const setOpenPersisted = (next: boolean) => {
    sectionOpenState.set(stateKey, next);
    setOpen(next);
  };

  // Keep in sync with route changes — expand active, keep others as-is.
  useEffect(() => {
    if (isActive) setOpenPersisted(true);
  }, [isActive]);

  if (!hasHeader) {
    // Render items directly, no toggle button.
    return (
      <div className="flex flex-col gap-0.5">
        {group.items.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            path={path}
            inboxCount={inboxCount}
            financeCount={financeCount}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpenPersisted(!open)}
        className={cn(
          "w-full flex items-center justify-between px-3 py-1.5 rounded-md text-[11px] font-semibold uppercase tracking-wider transition-colors",
          isActive
            ? "text-primary hover:bg-primary/5"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
        aria-expanded={open}
      >
        <span>{group.section}</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="mt-0.5 flex flex-col gap-0.5">
          {group.items.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              path={path}
              inboxCount={inboxCount}
              financeCount={financeCount}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function BusinessShell({
  children,
  pageTitle,
  pageDescription,
  actions,
}: BusinessShellProps) {
  const { path, navigate } = useRouter();
  const session = useBusinessSession();

  // VM1-01: fetch PAR roles to gate the PAR navigation section.
  const { roles: parRoles, status: parRolesStatus } = useParRoles();
  const hasPar = parRolesStatus === "resolved" && parRoles.length >= 1;
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  useEffect(() => {
    api("/api/platform/organizations").then(() => setIsPlatformAdmin(true)).catch(() => setIsPlatformAdmin(false));
  }, []);

  // Notification badges
  const canApproveNav = parRoles.some((r) => ["approver", "par_admin"].includes(r));
  const canFinanceNav = parRoles.some((r) => ["finance", "par_admin"].includes(r));
  // Seed from the module cache so a remount shows the last counts instantly (no flash), then
  // refresh. `path` is intentionally NOT a dependency — badges don't change per navigation, so
  // re-fetching on every click was pure noise (the "re-query on every click").
  const [inboxCount, setInboxCount] = useState(badgeCache.inbox);
  const [financeCount, setFinanceCount] = useState(badgeCache.finance);
  useEffect(() => {
    if (!canApproveNav && !canFinanceNav) { setInboxCount(0); setFinanceCount(0); return; }
    let alive = true;
    const fetchCounts = () => {
      if (canApproveNav) getParInbox().then((r) => { badgeCache.inbox = r.total ?? 0; if (alive) setInboxCount(badgeCache.inbox); }).catch(() => {});
      if (canFinanceNav) getFinanceQueue().then((r) => { badgeCache.finance = r.total ?? 0; if (alive) setFinanceCount(badgeCache.finance); }).catch(() => {});
    };
    fetchCounts();
    const iv = setInterval(fetchCounts, 60_000);
    return () => { alive = false; clearInterval(iv); };
  }, [canApproveNav, canFinanceNav]);

  // SPLIT-501: inside PAR module → focused PAR-only sidebar.
  const isParModule = path.startsWith("/business/par");

  const availableGroups: NavGroup[] = isPlatformAdmin
    ? [...NAV_GROUPS, { section: "Platformă", prefix: "/business/platform-admin", items: [{ label: "Superadmin module", href: "/business/platform-admin", icon: ShieldCheck }] }]
    : NAV_GROUPS;
  const baseGroups = isParModule
    ? PAR_NAV_GROUPS
    : availableGroups.filter((g) => {
        if (g.section === "PAR — Cereri de plată") return hasPar;
        // DocMerge apare în sidebar doar când ești pe rutele DocMerge
        if (g.section === "Document Merge") return path.startsWith("/business/docmerge");
        return true;
      });

  // SHELL-502: per-item PAR role filter.
  const navGroups = baseGroups
    .map((g) => ({ ...g, items: g.items.filter((it) => !it.roles || it.roles.some((r) => parRoles.includes(r))) }))
    .filter((g) => g.items.length > 0);

  // Guard: redirect if unauthenticated.
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
          aria-label="FinFlow — acasă"
        >
          <FinFlowMark size={28} />
          <span className="hidden sm:inline text-foreground">FinFlow</span>
        </Link>
        <div className="flex-1" />
        <NotificationBell />
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors min-h-[44px]"
          aria-label="Deconectare FinFlow"
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
          <nav className="flex flex-col gap-0.5 p-3 flex-1">
            {isParModule ? (
              <Link
                to="/business/dashboard"
                className="flex items-center gap-2 rounded-md px-3 py-2 mb-1 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors min-h-[44px]"
                aria-label="Înapoi la toate modulele"
              >
                <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Toate modulele</span>
              </Link>
            ) : (
              /* Dashboard standalone link — nu face parte din nicio secțiune */
              <Link
                to="/business/dashboard"
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors min-h-[44px] mb-1",
                  path === "/business/dashboard" || path === "/business/dashboard/"
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                aria-current={path.startsWith("/business/dashboard") ? "page" : undefined}
              >
                <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Dashboard</span>
              </Link>
            )}
            {navGroups.map((group) => (
              <SidebarGroup
                key={group.section}
                group={group}
                path={path}
                inboxCount={inboxCount}
                financeCount={financeCount}
              />
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
