/**
 * SPLIT-101 / HR365-003: BusinessShell — shell-ul aplicației FinFlow.
 *
 * Chrome-ul canonic pentru tot ce e sub /business/* (FinDesk + PAR + ITPark +
 * DocMerge). Guard: dacă sesiunea business lipsește → redirect la /business/login.
 *
 * Design: HR365 by Vector — sidebar de 260px pe suprafață proprie (`bg-sidebar`),
 * fiecare rând cu chip pastel colorat, etichete de grup uppercase 10px, rândul
 * activ pe primary cu halo colorat. Fără bară de titlu separată: brandul stă în
 * sidebar, iar dreapta-sus rămâne un rând de utilitare (clopoțel + ieșire).
 * Tokens semantice Vector 365 — zero hex în .tsx, light + dark, WCAG AA.
 */
import { ReactNode, useEffect, useMemo, useState } from "react";
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
  ShieldCheck,
  Shield,
  ArrowLeft,
  FolderOpen,
  ChevronDown,
  Search,
  Menu,
  X,
} from "lucide-react";
import { FinFlowMark } from "@/components/business/FinFlowLogo";
import { Link, useRouter } from "@/router/HashRouter";
import { ImpersonationBanner } from "@/components/platform/ImpersonationBanner";
import { cn } from "@/lib/utils";
import { useBusinessSession } from "@/hooks/useBusinessSession";
import { useParRoles } from "@/hooks/useParRoles";
import { useEnabledModules } from "@/hooks/useEnabledModules";
import { getParInbox, getFinanceQueue } from "@/lib/api/par";
import { onParBadgeRefresh } from "@/lib/par/badgeBus";
import { NotificationBell } from "@/components/app/NotificationBell";
import { api } from "@/lib/api";
import { Avatar, PageHeader, SidebarNavItem, type ChipTone } from "@/components/ds";

interface BusinessShellProps {
  children: ReactNode;
  pageTitle: string;
  pageDescription?: string;
  actions?: ReactNode;
}

/** PAR role labels used to gate per-feature nav visibility (SHELL-502). */
type ParNavRole = "requestor" | "approver" | "finance" | "par_admin";

/** Romanian labels for PAR roles, most authoritative first. */
const PAR_ROLE_LABELS: ReadonlyArray<[ParNavRole, string]> = [
  ["par_admin", "Administrator PAR"],
  ["finance", "Finanțe"],
  ["approver", "Aprobator"],
  ["requestor", "Solicitant"],
];

/**
 * The role to show under the user's name inside the PAR module. Someone can hold several
 * (approver + finance); we name the highest-authority one and count the rest, so the footer stays
 * one line. Returns null when the user has no PAR role — the caller falls back to the tenant role.
 */
function parRoleLabel(roles: string[]): string | null {
  const held = PAR_ROLE_LABELS.filter(([role]) => roles.includes(role));
  if (held.length === 0) return null;
  return held.length === 1 ? held[0][1] : `${held[0][1]} +${held.length - 1}`;
}

interface NavItem {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  /** HR365 icon-chip tint. One tone per category — never two adjacent. */
  tone: ChipTone;
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
      { label: "Cereri", href: "/business/par", icon: ClipboardList, tone: "indigo" },
      { label: "Inbox aprobare", href: "/business/par/inbox", icon: ShieldCheck, tone: "emerald", roles: ["approver", "par_admin"] },
      { label: "Rapoarte PAR", href: "/business/par/reports", icon: FileText, tone: "sky", roles: ["approver", "finance", "par_admin"] },
    ],
  },
  {
    section: "FinDesk — Finanțe",
    prefix: "/business/fin",
    items: [
      { label: "Acasă FinDesk", href: "/business/fin/", icon: Home, tone: "violet" },
      { label: "Compania mea", href: "/business/fin/company", icon: Building2, tone: "indigo" },
      { label: "Facturi", href: "/business/fin/invoices", icon: Receipt, tone: "blue" },
      { label: "Cont de plată", href: "/business/fin/invoices/document", icon: FileText, tone: "sky" },
      { label: "e-Factura", href: "/business/fin/einvoices", icon: FileText, tone: "teal" },
      { label: "Încasări", href: "/business/fin/payments", icon: CreditCard, tone: "emerald" },
      { label: "Cheltuieli", href: "/business/fin/expenses", icon: DollarSign, tone: "rose" },
      { label: "Parteneri", href: "/business/fin/parties", icon: Users, tone: "amber" },
      { label: "Acorduri", href: "/business/fin/agreements", icon: FileText, tone: "violet" },
      { label: "Registru general", href: "/business/fin/ledger", icon: Landmark, tone: "indigo" },
      { label: "TVA & declarații", href: "/business/fin/tax", icon: ClipboardList, tone: "orange" },
      { label: "Salarii", href: "/business/fin/payroll", icon: DollarSign, tone: "emerald" },
      { label: "Mijloace fixe", href: "/business/fin/assets", icon: Building2, tone: "teal" },
      { label: "Stocuri", href: "/business/fin/inventory", icon: BookOpen, tone: "sky" },
      { label: "Buget", href: "/business/fin/budget", icon: BarChart3, tone: "violet" },
      { label: "Invoice Reporting", href: "/business/fin/captures", icon: Zap, tone: "amber" },
      { label: "Import extras bancar", href: "/business/fin/statement/upload", icon: FileSpreadsheet, tone: "blue" },
      { label: "Istoric extrase", href: "/business/fin/statement", icon: FileText, tone: "sky" },
      { label: "Reconciliere & TVA import", href: "/business/fin/reconcile", icon: RefreshCw, tone: "teal" },
      { label: "Conturi bancare", href: "/business/fin/banklink", icon: Banknote, tone: "emerald" },
      { label: "Calendar fiscal", href: "/business/fin/calendar", icon: Calendar, tone: "orange" },
      { label: "Operațiuni în masă", href: "/business/fin/mass", icon: ListChecks, tone: "rose" },
      { label: "Export & rapoarte", href: "/business/fin/export", icon: BarChart3, tone: "indigo" },
      { label: "Rezidenți ITPark", href: "/business/fin/itpark", icon: Building2, tone: "violet" },
      { label: "Securitate", href: "/business/fin/settings/security", icon: Shield, tone: "rose" },
      { label: "Audit AI", href: "/business/fin/settings/ai-audit", icon: Settings, tone: "amber" },
    ],
  },
  {
    // DocMerge — secțiune separată, vizibilă doar când ești pe /business/docmerge/*
    section: "Document Merge",
    prefix: "/business/docmerge",
    items: [
      { label: "Documente în masă", href: "/business/docmerge/wizard", icon: Wand2, tone: "violet" },
      { label: "Templates", href: "/business/docmerge", icon: FileText, tone: "sky" },
      { label: "Import Excel", href: "/business/docmerge/job", icon: FileSpreadsheet, tone: "emerald" },
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
      { label: "Cereri de plată", href: "/business/par", icon: ClipboardList, tone: "indigo" },
      { label: "Inbox aprobare", href: "/business/par/inbox", icon: ShieldCheck, tone: "emerald", roles: ["approver", "par_admin"] },
      { label: "Coadă finanțe", href: "/business/par/finance", icon: Banknote, tone: "amber", roles: ["finance", "par_admin"] },
    ],
  },
  {
    section: "Analiză",
    prefix: "/business/par",
    items: [
      { label: "Foldere proiecte", href: "/business/par/folders", icon: FolderOpen, tone: "teal", roles: ["approver", "finance", "par_admin"] },
      { label: "Rapoarte & statistici", href: "/business/par/reports", icon: BarChart3, tone: "sky", roles: ["approver", "finance", "par_admin"] },
    ],
  },
  {
    section: "Administrare",
    prefix: "/business/par",
    items: [
      { label: "Administrare PAR", href: "/business/par/admin", icon: Settings, tone: "rose", roles: ["par_admin"] },
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

/** True when `path` should light up `item` — index rows match exactly, the rest by prefix. */
function isItemActive(item: NavItem, path: string): boolean {
  const isIndexItem = item.href === "/business/par" || item.href === "/business/fin/";
  if (isIndexItem) return path === item.href || path === item.href.replace(/\/$/, "");
  return path.startsWith(item.href);
}

/** Notification pill count for the two nav rows that carry one. */
function badgeFor(href: string, inboxCount: number, financeCount: number): number | undefined {
  if (href === "/business/par/inbox") return inboxCount || undefined;
  if (href === "/business/par/finance") return financeCount || undefined;
  return undefined;
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
  /** When the user is filtering, groups stay expanded so matches are never hidden. */
  forceOpen,
}: {
  group: NavGroup;
  path: string;
  inboxCount: number;
  financeCount: number;
  forceOpen: boolean;
}) {
  const isActive = !!group.prefix && path.startsWith(group.prefix);
  // Sections without a label are always visible (no toggle needed).
  const hasHeader = group.section !== null;
  // Persist open/closed across shell remounts (each nav remounts the shell) so sections don't
  // reset and the sidebar doesn't "jump". Keyed by section label.
  const stateKey = group.section ?? "_";
  // HR365 keeps its sidebar groups expanded — a column of bare group labels reads as a
  // broken menu. Collapsing stays available (and is remembered), it just isn't the default.
  const [open, setOpen] = useState(() => sectionOpenState.get(stateKey) ?? true);
  const setOpenPersisted = (next: boolean) => {
    sectionOpenState.set(stateKey, next);
    setOpen(next);
  };

  // Keep in sync with route changes — expand active, keep others as-is.
  useEffect(() => {
    if (isActive) setOpenPersisted(true);
  }, [isActive]);

  const rows = group.items.map((item) => (
    <SidebarNavItem
      key={item.href}
      href={item.href}
      label={item.label}
      tone={item.tone}
      icon={<item.icon className="h-3.5 w-3.5" />}
      active={isItemActive(item, path)}
      count={badgeFor(item.href, inboxCount, financeCount)}
    />
  ));

  if (!hasHeader) {
    return <div className="flex flex-col gap-0.5">{rows}</div>;
  }

  const expanded = forceOpen || open;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpenPersisted(!expanded)}
        className={cn(
          "flex w-full items-center justify-between rounded-md px-3 py-1.5 text-3xs font-semibold uppercase tracking-group transition-colors",
          isActive
            ? "text-primary hover:bg-primary/5"
            : "text-sidebar-foreground/35 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
        )}
        aria-expanded={expanded}
      >
        <span>{group.section}</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200", expanded && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {expanded && (
        <div className="mt-1 flex flex-col gap-0.5">{rows}</div>
      )}
    </div>
  );
}

/** The 260px sidebar body — shared by the desktop rail and the mobile drawer. */
function SidebarBody({
  navGroups,
  path,
  inboxCount,
  financeCount,
  showBackToModules,
  showDashboard,
  userName,
  userRole,
  onLogout,
  onNavigate,
}: {
  navGroups: NavGroup[];
  path: string;
  inboxCount: number;
  financeCount: number;
  /** „Înapoi la module" are sens doar când CHIAR există alt modul de întors. */
  showBackToModules: boolean;
  showDashboard: boolean;
  userName: string;
  userRole: string;
  onLogout: () => void;
  onNavigate?: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  // Filtering keeps a group only while it still has a matching row.
  const shownGroups = useMemo(() => {
    if (!q) return navGroups;
    return navGroups
      .map((g) => ({ ...g, items: g.items.filter((i) => i.label.toLowerCase().includes(q)) }))
      .filter((g) => g.items.length > 0);
  }, [navGroups, q]);

  return (
    <div className="flex h-full flex-col" onClick={onNavigate}>
      {/* Brand */}
      <Link
        to="/business/dashboard"
        className="flex items-center gap-3 px-5 pb-4 pt-5 no-underline hover:no-underline"
        aria-label="FinFlow — acasă"
      >
        <FinFlowMark size={36} className="shrink-0 rounded-xl shadow-sm" />
        <span className="text-[15px] font-bold tracking-tight text-sidebar-foreground">FinFlow</span>
      </Link>

      {/* Filter */}
      <div className="px-4 pb-2">
        <label htmlFor="finflow-nav-search" className="sr-only">
          Caută funcționalitate
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id="finflow-nav-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            placeholder="Caută funcționalitate…"
            className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      {/* Back to modules — only inside a module, și doar dacă mai există altul */}
      {showBackToModules && (
        <div className="px-4 pb-3 pt-1">
          <Link
            to="/business/dashboard"
            className="pastel-lavender flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-medium text-pastel-lavender-fg no-underline hover:no-underline"
            aria-label="Înapoi la toate modulele"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Înapoi la module
          </Link>
        </div>
      )}

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-2" aria-label="Meniu FinFlow">
        {showDashboard && (
          <SidebarNavItem
            href="/business/dashboard"
            label="Dashboard"
            tone="violet"
            icon={<LayoutDashboard className="h-3.5 w-3.5" />}
            active={path === "/business/dashboard" || path === "/business/dashboard/"}
          />
        )}
        {shownGroups.map((group) => (
          <SidebarGroup
            key={group.section ?? "_"}
            group={group}
            path={path}
            inboxCount={inboxCount}
            financeCount={financeCount}
            forceOpen={q.length > 0}
          />
        ))}
        {q && shownGroups.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">Nicio funcționalitate găsită.</p>
        )}
      </nav>

      {/* User */}
      <div className="flex items-center gap-3 border-t border-sidebar-border p-3">
        <Avatar name={userName} shape="square" size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-sidebar-foreground">{userName}</p>
          <p className="truncate text-3xs font-medium capitalize text-sidebar-foreground/40">{userRole}</p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex h-11 w-11 items-center justify-center rounded-md text-sidebar-foreground/40 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground sm:h-8 sm:w-8"
          aria-label="Deconectare FinFlow"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
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
  // PLATFORM-001: modulele dezactivate din Consola Platformă dispar din meniu.
  const { isEnabled, enabled: enabledModules } = useEnabledModules();
  const hasPar = parRolesStatus === "resolved" && parRoles.length >= 1 && isEnabled("par");
  // Un workspace care are DOAR PAR nu are „module" între care să comute: meniul lui e chiar
  // meniul PAR, complet, nu cele trei rânduri dintr-o secțiune pliabilă.
  const parOnlyWorkspace = enabledModules.length === 1 && enabledModules[0] === "par";
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  useEffect(() => {
    // Sonda cea mai ieftină pentru „sunt superadmin?" — /catalog nu atinge datele clienților.
    api("/api/platform/catalog").then(() => setIsPlatformAdmin(true)).catch(() => setIsPlatformAdmin(false));
  }, []);

  const [drawerOpen, setDrawerOpen] = useState(false);

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
    // A decision taken on any PAR page must be reflected here immediately — the 60s
    // poll otherwise leaves the pill claiming 4 while the list already shows 3.
    const off = onParBadgeRefresh(fetchCounts);
    return () => { alive = false; clearInterval(iv); off(); };
  }, [canApproveNav, canFinanceNav]);

  // SPLIT-501: inside PAR module → focused PAR-only sidebar.
  const isParModule = path.startsWith("/business/par");
  // Meniul PAR complet: în interiorul modulului SAU când PAR e tot ce are workspace-ul.
  const useParNav = isParModule || (parOnlyWorkspace && hasPar);

  const availableGroups: NavGroup[] = isPlatformAdmin
    ? [...NAV_GROUPS, { section: "Platformă", prefix: "/business/platform", items: [{ label: "Consola Platformă", href: "/business/platform", icon: ShieldCheck, tone: "rose" as ChipTone }] }]
    : NAV_GROUPS;
  const baseGroups = useParNav
    ? PAR_NAV_GROUPS
    : availableGroups.filter((g) => {
        if (g.section === "PAR — Cereri de plată") return hasPar;
        if (g.section === "FinDesk — Finanțe") return isEnabled("findesk");
        // DocMerge apare în sidebar doar când ești pe rutele DocMerge
        if (g.section === "Document Merge") return isEnabled("docmerge") && path.startsWith("/business/docmerge");
        return true;
      });

  // SHELL-502: per-item PAR role filter.
  const navGroups = baseGroups
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => {
        if (it.roles && !it.roles.some((r) => parRoles.includes(r))) return false;
        // Rândul ITPark trăiește sub FinDesk, dar e un modul separat în catalog.
        if (it.href.startsWith("/business/fin/itpark")) return isEnabled("itpark");
        return true;
      }),
    }))
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

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setDrawerOpen(false); }, [path]);

  const handleLogout = async () => {
    await session.logout();
    navigate("/business/login");
  };

  const userName = session.data?.user?.name || session.data?.user?.email || "Utilizator";
  // Inside PAR, the identity that matters is the PAR role — showing the tenant role there said
  // "Teacher" to someone whose whole job in the module is approving payments.
  const userRole = (isParModule ? parRoleLabel(parRoles) : null)
    ?? session.data?.user?.role
    ?? "membru";

  const sidebarBody = (
    <SidebarBody
      navGroups={navGroups}
      path={path}
      inboxCount={inboxCount}
      financeCount={financeCount}
      showBackToModules={isParModule && !parOnlyWorkspace}
      showDashboard={!isParModule || parOnlyWorkspace}
      userName={userName}
      userRole={userRole}
      onLogout={handleLogout}
    />
  );

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* PLATFORM-403: pe o sesiune de impersonare, banda stă deasupra întregului shell. */}
      <ImpersonationBanner />
      <div className="flex min-h-screen flex-1">
      {/* Desktop sidebar */}
      <aside
        className="hidden w-sidebar shrink-0 border-r border-sidebar-border bg-sidebar md:sticky md:top-0 md:flex md:h-screen md:flex-col"
        aria-label="Navigare Business Suite"
      >
        {sidebarBody}
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-foreground/60"
            aria-label="Închide meniul"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[280px] border-r border-sidebar-border bg-sidebar shadow-xl">
            <SidebarBody
              navGroups={navGroups}
              path={path}
              inboxCount={inboxCount}
              financeCount={financeCount}
              showBackToModules={isParModule && !parOnlyWorkspace}
              showDashboard={!isParModule || parOnlyWorkspace}
              userName={userName}
              userRole={userRole}
              onLogout={handleLogout}
              onNavigate={() => setDrawerOpen(false)}
            />
          </div>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-md bg-card text-foreground"
            aria-label="Închide meniul"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Main column. The utility row is a <header> SIBLING of <main>, not a child:
          the hamburger and the notification bell are app chrome, not page content,
          and burying them inside <main> puts them in the document's main landmark
          (assistive tech reads them as part of the page; "first control in main"
          resolves to the bell instead of the page's own first control). */}
      <div className="flex min-w-0 flex-1 flex-col pb-16 md:pb-0">
        <header className="flex items-center gap-2 px-5 pt-5 sm:px-8">
          {/* MOB-002: hamburgerul e cel mai apăsat control de pe telefon și măsura 40×40. */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
            aria-label="Deschide meniul"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="flex-1" />
          <NotificationBell />
        </header>

        <main className="mx-auto w-full max-w-7xl px-5 pb-8 pt-2 sm:px-8">
          {/* An empty pageTitle means the page owns its own header (FinLayout passes ""),
              so we must not emit a stray empty <h1> above it. */}
          {pageTitle ? (
            <PageHeader title={pageTitle} subtitle={pageDescription} actions={actions} />
          ) : null}
          {children}
        </main>
      </div>

      {/* Mobile bottom nav — 4 tab-uri principale */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-20 border-t border-sidebar-border bg-sidebar md:hidden"
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
                ...(isEnabled("findesk") ? [{ label: "FinDesk", href: "/business/fin/", icon: Landmark }] : []),
                // VM1-01: only show PAR tab if user has at least one PAR role
                ...(hasPar ? [{ label: "PAR", href: "/business/par", icon: ClipboardList }] : []),
                ...(isEnabled("itpark") ? [{ label: "ITPark", href: "/business/itpark", icon: Building2 }] : []),
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
                  "flex min-h-[44px] flex-col items-center gap-1 py-2.5 text-3xs font-semibold no-underline hover:no-underline",
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
    </div>
  );
}
