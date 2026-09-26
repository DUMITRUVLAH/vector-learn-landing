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
import { ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Landmark,
  ClipboardList,
  Building2,
  Upload,
  FileText,
  DollarSign,
  BarChart3,
  Users,
  Filter,
  Home,
  Receipt,
  ReceiptText,
  FileCheck2,
  ArrowLeftRight,
  Banknote,
  Settings,
  FileSpreadsheet,
  Wand2,
  MessageCircle,
  Zap,
  RefreshCw,
  Calendar,
  ShieldCheck,
  ArrowLeft,
  FolderOpen,
  CloudUpload,
  ChevronDown,
  Search,
  Menu,
  X, Activity, KanbanSquare, Package, CalendarClock, History as HistoryIcon, UserPlus, Inbox, PlugZap } from "lucide-react";
import { FinFlowMark } from "@/components/business/FinFlowLogo";
import { Link, useRouter } from "@/router/HashRouter";
import { clearOrphanScrollLock } from "@/lib/scrollLockGuard";
import { ImpersonationBanner } from "@/components/platform/ImpersonationBanner";
import { cn } from "@/lib/utils";
import { useBusinessSession } from "@/hooks/useBusinessSession";
import { useParRoles } from "@/hooks/useParRoles";
import { useCrmPermissions } from "@/hooks/useCrmPermissions";
import { useEnabledModules } from "@/hooks/useEnabledModules";
import { getParInbox, getFinanceQueue } from "@/lib/api/par";
import { onParBadgeRefresh } from "@/lib/par/badgeBus";
import { DOCS_BASE } from "@/lib/docs/paths";
import type { CrmPermission } from "@/lib/api/crm";
import { CRM_FIN_ITEMS, visibleFinNavGroups } from "@/lib/fin/finNav";
import { NotificationBell } from "@/components/app/NotificationBell";
import { api } from "@/lib/api";
import { cachedOnce, peekResolved } from "@/lib/sessionCache";
import { Avatar, LanguageSwitcher, PageHeader, SidebarNavItem, type ChipTone } from "@/components/ds";

/** Titlul din `index.html` — la care revenim când shell-ul iese din ecran (ex. logout). */
const DEFAULT_DOCUMENT_TITLE = "FinFlow — Controlul financiar complet";

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
  /**
   * Rândul se deschide ȘI pre-aprobatorilor de proiect, care semnează pe nume fără să aibă rolul
   * `approver`. Doar pe rândul de inbox: pre-aprobarea e autoritate pe o cerere, nu acces la
   * rapoartele și folderele organizației.
   */
  alsoPreApprover?: boolean;
  /**
   * CRM-SIDEBAR: dreptul CRM necesar ca să VEZI rândul. Undefined = orice membru CRM.
   * Oglindește `requireCrmPermission` de pe server — ascunderea e curtoazie, nu apărare.
   */
  crmPermission?: CrmPermission;
  /** NAV-01: alte rute care aprind rândul (un modul cu file are un rând și mai multe rute). */
  alsoActive?: string[];
  /** NAV-04: rândul CRM care afișează date FinDesk — apare doar cu FinDesk pornit. */
  requiresFindesk?: boolean;
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
      { label: "Inbox aprobare", href: "/business/par/inbox", icon: ShieldCheck, tone: "emerald", roles: ["approver", "par_admin"], alsoPreApprover: true },
      { label: "Rapoarte PAR", href: "/business/par/reports", icon: FileText, tone: "sky", roles: ["approver", "finance", "par_admin"] },
      { label: "Curs valutar", href: "/business/par/exchange", icon: ArrowLeftRight, tone: "teal" },
      { label: "Google Drive", href: "/business/par/drive", icon: CloudUpload, tone: "violet", roles: ["par_admin"] },
    ],
  },
  {
    // NAV-01: pe tabloul general FinDesk e o secțiune de scurtături, nu cele 26 de rânduri — harta
    // completă, grupată, apare în interiorul modulului (FIN_SIDEBAR_GROUPS). Titlul rămâne cheia
    // după care filtrul de module ascunde secțiunea când FinDesk e oprit.
    section: "FinDesk — Finanțe",
    prefix: "/business/fin",
    items: [
      { label: "Acasă FinDesk", href: "/business/fin/", icon: Home, tone: "violet" },
      { label: "Facturi", href: "/business/fin/invoices", icon: Receipt, tone: "blue", alsoActive: ["/business/fin/einvoices"] },
      { label: "Cheltuieli", href: "/business/fin/expenses", icon: DollarSign, tone: "rose" },
      { label: "Calendar fiscal", href: "/business/fin/calendar", icon: Calendar, tone: "orange" },
      { label: "Rezidenți IT Park", href: "/business/fin/itpark", icon: Building2, tone: "emerald" },
    ],
  },
  {
    // DC-101: un SINGUR rând de meniu pentru tot ce ține de documente. Șabloanele erau al doilea
    // rând; acum sunt o filă în pagină — owner-ul a cerut explicit „doar o intrare, nu dublu".
    section: "Documente",
    prefix: DOCS_BASE,
    items: [
      { label: "Documente", href: DOCS_BASE, icon: FileText, tone: "sky" },
    ],
  },
  {
    // PONTAJ-001: rândul rămâne vizibil în toată aplicația când modulul e pornit — pontajul e
    // sarcina lunară a fiecărui angajat, nu o secțiune în care se intră dintr-un flux anume.
    section: "Pontaj",
    prefix: "/business/pontaj",
    items: [
      { label: "Pontajul meu", href: "/business/pontaj", icon: CalendarClock, tone: "amber" },
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
      { label: "Inbox aprobare", href: "/business/par/inbox", icon: ShieldCheck, tone: "emerald", roles: ["approver", "par_admin"], alsoPreApprover: true },
      { label: "Coadă finanțe", href: "/business/par/finance", icon: Banknote, tone: "amber", roles: ["finance", "par_admin"] },
      { label: "Dovezi de plată", href: "/business/par/dovezi", icon: FileCheck2, tone: "teal", roles: ["finance", "par_admin"] },
      { label: "e-Factura prestatori", href: "/business/par/efactura", icon: ReceiptText, tone: "violet", roles: ["finance", "par_admin"] },
    ],
  },
  {
    section: "Analiză",
    prefix: "/business/par",
    items: [
      { label: "Documente", href: DOCS_BASE, icon: FileText, tone: "sky" },
      { label: "Furnizori", href: "/business/par/vendors", icon: Building2, tone: "violet" },
      { label: "Foldere proiecte", href: "/business/par/folders", icon: FolderOpen, tone: "teal", roles: ["approver", "finance", "par_admin"] },
      // VM5-09: activitatea e deschisă tuturor — feedul arată oricum doar ce poate vedea omul.
      { label: "Activitate", href: "/business/par/activitate", icon: Activity, tone: "teal" },
      { label: "Rapoarte & statistici", href: "/business/par/reports", icon: BarChart3, tone: "sky", roles: ["approver", "finance", "par_admin"] },
      // Cursul oficial e informație publică — fără restricție de rol; îl folosește oricine
      // completează o cerere în valută.
      { label: "Curs valutar", href: "/business/par/exchange", icon: ArrowLeftRight, tone: "teal" },
      { label: "Google Drive", href: "/business/par/drive", icon: CloudUpload, tone: "violet", roles: ["par_admin"] },
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

/**
 * CRM-only navigation — shown when the current route is under /business/crm/*, exact ca PAR.
 *
 * De ce nu mai e o secțiune din meniul global: cu PAR și FinDesk deasupra, cele douăsprezece
 * rânduri de CRM începeau pe la jumătatea meniului, iar omul care intră în CRM de zece ori pe zi
 * derula ca să ajungă la Pipeline. În interiorul modulului, celelalte module sunt zgomot —
 * întoarcerea la ele se face prin „Înapoi la module", nu prin douăzeci de rânduri străine.
 *
 * Filele care cer un drept apar doar pentru cine îl are (`crmPermission`).
 */
const CRM_NAV_GROUPS: NavGroup[] = [
  {
    section: null,
    items: [
      { label: "Acasă", href: "/business/crm", icon: Home, tone: "violet" },
      { label: "Pipeline", href: "/business/crm/pipeline", icon: KanbanSquare, tone: "sky" },
      { label: "Astăzi", href: "/business/crm/astazi", icon: CalendarClock, tone: "amber" },
      // COMMS-301: inboxul omnicanal — lângă „Astăzi", fiindcă e tot munca zilei.
      { label: "Mesaje", href: "/business/crm/mesaje", icon: Inbox, tone: "blue" },
      { label: "Clienți", href: "/business/crm/clienti", icon: Building2, tone: "rose" },
      { label: "Produse", href: "/business/crm/produse", icon: Package, tone: "emerald" },
    ],
  },
  {
    // NAV-04: contractele și facturile sunt și acte de vânzare, deci CRM-ul le are în meniul lui —
    // aceleași pagini și aceleași date ca în FinDesk, doar meniul din jur e al CRM-ului. Apar doar
    // cu FinDesk pornit: seria de facturare și profilul fiscal se configurează acolo.
    section: "Contracte & facturare",
    prefix: "/business/crm",
    items: CRM_FIN_ITEMS.map((it) => ({
      label: it.label,
      href: it.href,
      icon: it.icon,
      tone: it.tone,
      requiresFindesk: true,
      alsoActive: it.alsoActive,
    })),
  },
  {
    // Nu „Vânzări": e și numele pâlniei implicite, iar două controale cu același nume pe
    // aceeași pagină se confundă (și pentru cititoarele de ecran).
    section: "Instrumente",
    prefix: "/business/crm",
    items: [
      { label: "Documente", href: "/business/crm/documente", icon: FileText, tone: "orange" },
      { label: "Comunicare", href: "/business/crm/comunicare", icon: MessageCircle, tone: "blue" },
      { label: "Cadențe", href: "/business/crm/cadente", icon: RefreshCw, tone: "amber" },
      { label: "Automatizări", href: "/business/crm/automatizari", icon: Zap, tone: "indigo" },
    ],
  },
  {
    section: "Analiză",
    prefix: "/business/crm",
    items: [
      { label: "Rapoarte", href: "/business/crm/rapoarte", icon: BarChart3, tone: "violet" },
      { label: "Tabloul pâlniei", href: "/business/crm/palnie", icon: Filter, tone: "sky" },
    ],
  },
  {
    // Import și Repartizare stăteau sub „Analiză", deși nu analizează nimic — sunt operațiuni
    // pe bază, făcute de manager. Aici stau lângă celelalte unelte de administrare.
    section: "Administrare",
    prefix: "/business/crm",
    items: [
      // CRM-D04: rechizitele firmei — o dată, pe toate actele. Vizibil pentru cine face acte.
      { label: "Datele firmei", href: "/business/crm/firma", icon: Landmark, tone: "sky", crmPermission: "documents.create" },
      { label: "Import", href: "/business/crm/import", icon: Upload, tone: "teal" },
      {
        label: "Repartizare",
        href: "/business/crm/repartizare",
        icon: Users,
        tone: "amber",
        crmPermission: "assignment.manage",
      },
      { label: "Echipă", href: "/business/crm/echipa", icon: UserPlus, tone: "emerald", crmPermission: "audit.view" },
      { label: "Drepturi", href: "/business/crm/drepturi", icon: ShieldCheck, tone: "teal", crmPermission: "audit.view" },
      { label: "Jurnal", href: "/business/crm/jurnal", icon: HistoryIcon, tone: "violet", crmPermission: "audit.view" },
      { label: "API", href: "/business/crm/api", icon: KeyRound, tone: "rose", crmPermission: "audit.view" },
      // COMMS-301: fără `crmPermission` — oricine își poate conecta propria cutie Gmail; butoanele
      // de conectare a canalelor comune cer `comms.manage` pe server.
      { label: "Canale de mesaje", href: "/business/crm/canale", icon: PlugZap, tone: "blue" },
    ],
  },
];

/**
 * NAV-01: meniul FinDesk din interiorul modulului — grupat, din harta unică `finNav.ts`, pe care o
 * citește și ecranul de start. Se construiește per randare fiindcă ascunde rânduri după modulele
 * pornite (Contracte trec în CRM, IT Park e modul separat).
 */
function finSidebarGroups(opts: { crmEnabled: boolean; itparkEnabled: boolean }): NavGroup[] {
  return visibleFinNavGroups(opts).map((g) => ({
    section: g.section,
    prefix: "/business/fin",
    items: g.items.map((it) => ({ label: it.label, href: it.href, icon: it.icon, tone: it.tone, alsoActive: it.alsoActive })),
  }));
}

/** Exported for testing purposes only (T-DOCMERGE-004-4). Do not use in production code. */
export const NAV_GROUPS_EXPORT: NavGroup[] = NAV_GROUPS;

/**
 * Pagini publice: nu necesită sesiune business.
 */
const PUBLIC_PATHS = ["/business/login"];
const PUBLIC_EXACT = ["/business"];

/**
 * Rândurile care duc la pagina de start a unui modul. Se aprind DOAR pe potrivire exactă: prin
 * prefix, „/business/crm" ar înghiți toate rutele copil și ar rămâne aprins pe tot modulul.
 */
const INDEX_HREFS = ["/business/par", "/business/fin/", "/business/crm"];

/** True when `path` should light up `item` — index rows match exactly, the rest by prefix. */
function isItemActive(item: NavItem, path: string): boolean {
  const isIndexItem = INDEX_HREFS.includes(item.href);
  if (isIndexItem) return path === item.href || path === item.href.replace(/\/$/, "");
  return path.startsWith(item.href) || !!item.alsoActive?.some((href) => path.startsWith(href));
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
/** Cât era derulat meniul când s-a schimbat pagina — altfel reapare mereu de la început. */
const navScroll = { top: 0 };
const PLATFORM_ADMIN_CACHE_KEY = "platform-admin-probe";

/** Collapsible sidebar section. Opens when active; always-open when section is null. */
function SidebarGroup({
  group,
  path,
  inboxCount,
  financeCount,
  /** When the user is filtering, groups stay expanded so matches are never hidden. */
  forceOpen,
  gm3 = false,
}: {
  group: NavGroup;
  path: string;
  inboxCount: number;
  financeCount: number;
  forceOpen: boolean;
  /** CRM-G01 — rânduri în stilul Google Drive (vezi SidebarNavItem `variant="gm3"`). */
  gm3?: boolean;
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
      icon={<item.icon className={gm3 ? "h-5 w-5" : "h-3.5 w-3.5"} />}
      active={isItemActive(item, path)}
      count={badgeFor(item.href, inboxCount, financeCount)}
      variant={gm3 ? "gm3" : "hr365"}
    />
  ));

  if (!hasHeader) {
    return <div className={cn("flex flex-col", gm3 ? "gap-0" : "gap-0.5")}>{rows}</div>;
  }

  const expanded = forceOpen || open;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpenPersisted(!expanded)}
        className={cn(
          gm3
            ? "flex w-full items-center justify-between rounded-full px-4 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/5"
            : "flex w-full items-center justify-between rounded-md px-3 py-1.5 text-3xs font-semibold uppercase tracking-group transition-colors",
          gm3 ? null : isActive
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
        <div className={cn("mt-1 flex flex-col", gm3 ? "gap-0" : "gap-0.5")}>{rows}</div>
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
  gm3 = false,
}: {
  gm3?: boolean;
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

  // Shell-ul se remontează la fiecare navigare, deci meniul reapărea derulat la început: dacă
  // dădeai click pe un rând de jos (FinDesk are 26), lista sărea sub degetul tău. Restaurăm
  // poziția ÎNAINTE de paint (useLayoutEffect), ca ochiul să nu prindă saltul.
  const navRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (navRef.current) navRef.current.scrollTop = navScroll.top;
  }, []);

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

      {/* CRM-G01 — butonul „Nou" din Drive: acțiunea cea mai frecventă stă sus, ridicată. */}
      {gm3 && (
        <div className="px-3 pb-4">
          <Link
            to="/business/crm/pipeline?nou=1"
            className="inline-flex h-14 items-center gap-3 rounded-2xl bg-card pl-4 pr-6 text-sm font-medium text-foreground no-underline shadow-md transition-shadow hover:no-underline hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="h-6 w-6" aria-hidden="true" />
            Lead nou
          </Link>
        </div>
      )}

      {/* Filter — în CRM îl înlocuiește căutarea din bara de sus */}
      {!gm3 && <div className="px-4 pb-2">
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
      </div>}

      {/* Back to modules — only inside a module, și doar dacă mai există altul */}
      {showBackToModules && gm3 && (
        <div className="px-3 pb-2">
          <Link
            to="/business/dashboard"
            className="flex h-8 items-center gap-4 rounded-full pl-4 pr-3 text-sm text-muted-foreground no-underline transition-colors hover:bg-foreground/5 hover:no-underline"
            aria-label="Înapoi la toate modulele"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            Toate modulele
          </Link>
        </div>
      )}
      {showBackToModules && !gm3 && (
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
      <nav
        ref={navRef}
        onScroll={(e) => { navScroll.top = (e.target as HTMLElement).scrollTop; }}
        className={cn("flex flex-1 flex-col overflow-y-auto px-3 py-2", gm3 ? "gap-4" : "gap-5")}
        aria-label="Meniu FinFlow"
      >
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
            gm3={gm3}
          />
        ))}
        {q && shownGroups.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">Nicio funcționalitate găsită.</p>
        )}
      </nav>

      {/* User */}
      <div className={cn("flex items-center gap-3 p-3", !gm3 && "border-t border-sidebar-border")}>
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

/**
 * CRM-G01 — căutarea din bara de sus, ca „Caută în Drive": o pastilă largă, umplută, care devine
 * albă la focus. Caută în leaduri (nume, telefon, e-mail, firmă) și deschide Pipeline-ul filtrat —
 * același filtru pe care îl are tabla, deci rezultatul e cel pe care l-ai fi obținut acolo.
 */
function CrmSearchBar({ onSearch }: { onSearch: (q: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      role="search"
      className="min-w-0 flex-1"
      onSubmit={(e) => {
        e.preventDefault();
        const q = value.trim();
        if (q) onSearch(q);
      }}
    >
      <label htmlFor="crm-global-search" className="sr-only">
        Caută în CRM
      </label>
      <div className="relative max-w-2xl">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          id="crm-global-search"
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Caută leaduri, firme, telefoane"
          className="h-12 w-full rounded-full border-0 bg-secondary pl-12 pr-4 text-base text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus:bg-card focus:shadow-md focus-visible:ring-0"
        />
      </div>
    </form>
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

  // Fila de browser trebuie să spună CE pagină e deschisă: cu 3–4 taburi FinFlow deschise,
  // un titlu identic peste tot le face imposibil de deosebit (și la hover, în tooltip).
  useEffect(() => {
    document.title = pageTitle ? `${pageTitle} · FinFlow` : "FinFlow";
    return () => {
      document.title = DEFAULT_DOCUMENT_TITLE;
    };
  }, [pageTitle]);

  // VM1-01: fetch PAR roles to gate the PAR navigation section.
  const { roles: parRoles, status: parRolesStatus, preApprover } = useParRoles();
  // PLATFORM-001: modulele dezactivate din Consola Platformă dispar din meniu.
  const { isEnabled, enabled: enabledModules } = useEnabledModules();
  const hasPar = parRolesStatus === "resolved" && parRoles.length >= 1 && isEnabled("par");
  // Un workspace care are DOAR PAR nu are „module" între care să comute: meniul lui e chiar
  // meniul PAR, complet, nu cele trei rânduri dintr-o secțiune pliabilă.
  const parOnlyWorkspace = enabledModules.length === 1 && enabledModules[0] === "par";
  // Sonda „sunt superadmin?" trebuie citită SINCRON din cache la remount, altfel secțiunea
  // „Platformă" apare abia după primul paint și meniul își schimbă înălțimea la fiecare click.
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(
    () => peekResolved<boolean>(PLATFORM_ADMIN_CACHE_KEY) ?? false,
  );
  useEffect(() => {
    // Sonda cea mai ieftină pentru „sunt superadmin?" — /catalog nu atinge datele clienților.
    cachedOnce(PLATFORM_ADMIN_CACHE_KEY, () =>
      api("/api/platform/catalog").then(() => true).catch(() => false),
    ).then((isAdmin) => setIsPlatformAdmin(isAdmin));
  }, []);

  const [drawerOpen, setDrawerOpen] = useState(false);

  // Notification badges
  const canApproveNav = parRoles.some((r) => ["approver", "par_admin"].includes(r)) || preApprover;
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
  // CRM-SIDEBAR: la fel pentru CRM — în interiorul modulului meniul e doar al lui.
  const isCrmModule = path.startsWith("/business/crm");
  const crmOnlyWorkspace = enabledModules.length === 1 && enabledModules[0] === "crm";
  const useCrmNav = !useParNav && (isCrmModule || (crmOnlyWorkspace && isEnabled("crm")));
  // NAV-01: FinDesk are și el meniu propriu în interiorul modulului — 26 de rânduri plate sub PAR
  // erau exact problema pe care CRM-ul și PAR-ul o rezolvaseră deja.
  const isFinModule = path.startsWith("/business/fin");
  const finOnlyWorkspace = enabledModules.length === 1 && enabledModules[0] === "findesk";
  const useFinNav = !useParNav && !useCrmNav && (isFinModule || (finOnlyWorkspace && isEnabled("findesk")));
  // Drepturile se cer numai în CRM: pe restul rutelor n-au ce rând să ascundă.
  const { can: crmCan } = useCrmPermissions({ enabled: useCrmNav });

  const availableGroups: NavGroup[] = isPlatformAdmin
    ? [...NAV_GROUPS, { section: "Platformă", prefix: "/business/platform", items: [{ label: "Consola Platformă", href: "/business/platform", icon: ShieldCheck, tone: "rose" as ChipTone }] }]
    : NAV_GROUPS;
  const baseGroups = useParNav
    ? PAR_NAV_GROUPS
    : useCrmNav
    ? CRM_NAV_GROUPS
    : useFinNav
    ? finSidebarGroups({ crmEnabled: isEnabled("crm"), itparkEnabled: isEnabled("itpark") })
    : availableGroups.filter((g) => {
        if (g.section === "PAR — Cereri de plată") return hasPar;
        if (g.section === "FinDesk — Finanțe") return isEnabled("findesk");
        // DocMerge apare în sidebar doar când ești pe rutele DocMerge
        if (g.section === "Document Merge") return isEnabled("docmerge") && path.startsWith("/business/docmerge");
        if (g.section === "Pontaj") return isEnabled("pontaj");
        return true;
      });

  // SHELL-502: per-item PAR role filter.
  const navGroups = baseGroups
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => {
        if (it.roles && !it.roles.some((r) => parRoles.includes(r)) && !(it.alsoPreApprover && preApprover)) return false;
        if (it.crmPermission && !crmCan(it.crmPermission)) return false;
        if (it.requiresFindesk && !isEnabled("findesk")) return false;
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
  // O fereastră închisă prost pe pagina de dinainte nu are voie să blocheze derularea pe asta.
  useEffect(() => { clearOrphanScrollLock(); }, [path]);

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

  // „Înapoi la module" apare cât timp CHIAR există alt modul de întors; într-un workspace cu un
  // singur modul, meniul lui e tot meniul, deci rămâne rândul de Dashboard.
  const inFocusedModule =
    (isParModule && !parOnlyWorkspace) || (isCrmModule && !crmOnlyWorkspace) || (isFinModule && !finOnlyWorkspace);
  const showBackToModules = inFocusedModule;
  const showDashboard = !inFocusedModule;

  const sidebarBody = (
    <SidebarBody
      navGroups={navGroups}
      path={path}
      inboxCount={inboxCount}
      financeCount={financeCount}
      showBackToModules={showBackToModules}
      showDashboard={showDashboard}
      userName={userName}
      userRole={userRole}
      onLogout={handleLogout}
      gm3={useCrmNav}
    />
  );

  return (
    <div className={cn("flex min-h-screen flex-col bg-background text-foreground", useCrmNav && "gm3")}>
      {/* PLATFORM-403: pe o sesiune de impersonare, banda stă deasupra întregului shell. */}
      <ImpersonationBanner />
      {/* `flex-1` e de ajuns: părintele are deja `min-h-screen`. Al doilea `min-h-screen`
          adăuga înălțimea benzii peste 100vh, deci și paginile scurte aveau bară de derulare
          — și orice schimbare de conținut o făcea să apară și să dispară. */}
      <div className="flex flex-1">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden w-sidebar shrink-0 bg-sidebar md:sticky md:top-0 md:flex md:h-screen md:flex-col",
          useCrmNav ? "border-r-0" : "border-r border-sidebar-border",
        )}
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
              showBackToModules={showBackToModules}
              showDashboard={showDashboard}
              userName={userName}
              userRole={userRole}
              onLogout={handleLogout}
              onNavigate={() => setDrawerOpen(false)}
              gm3={useCrmNav}
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
        <header className={cn("flex items-center gap-2", useCrmNav ? "h-16 px-3 md:pl-0 md:pr-4" : "px-5 pt-5 sm:px-8")}>
          {/* MOB-002: hamburgerul e cel mai apăsat control de pe telefon și măsura 40×40. */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
            aria-label="Deschide meniul"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          {useCrmNav ? <CrmSearchBar onSearch={(q) => navigate(`/business/crm/pipeline?q=${encodeURIComponent(q)}`)} /> : <div className="flex-1" />}
          {/* Comutatorul stă lângă clopoțel, în rândul de utilitare: e chrome de
              aplicație, nu conținut de pagină, și rămâne în același loc pe toate rutele. */}
          <LanguageSwitcher variant="compact" />
          <NotificationBell />
        </header>

        {useCrmNav ? (
          /* CRM-G01 — semnătura Drive: conținutul stă pe o suprafață albă rotunjită care plutește
             pe fundalul nuanțat al aplicației; meniul și bara de sus NU sunt pe alb. */
          <div className="flex flex-1 flex-col bg-card md:mb-4 md:mr-4 md:rounded-2xl">
            {/* max-md:pb-24 — bara de navigare de jos e fixă (≈64px): fără spațiul ăsta, ultimul
                rând al oricărei pagini rămânea sub ea, de neatins. */}
            <main className="w-full px-4 pb-8 pt-4 max-md:pb-24 sm:px-6">
              {pageTitle ? (
                <PageHeader title={pageTitle} subtitle={pageDescription} actions={actions} variant="gm3" />
              ) : null}
              {children}
            </main>
          </div>
        ) : (
        <main className="mx-auto w-full max-w-7xl px-5 pb-8 pt-2 max-md:pb-24 sm:px-8">
          {/* An empty pageTitle means the page owns its own header (FinLayout passes ""),
              so we must not emit a stray empty <h1> above it. */}
          {pageTitle ? (
            <PageHeader title={pageTitle} subtitle={pageDescription} actions={actions} />
          ) : null}
          {children}
        </main>
        )}
      </div>

      {/* Mobile bottom nav — 4 tab-uri principale */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-20 border-t border-sidebar-border bg-sidebar md:hidden"
        aria-label="Navigare mobilă Business Suite"
      >
        {(() => {
          // SHELL-502: mobile PAR tabs also gated by role (requestor sees only "Cereri").
          const canApprove = parRoles.some((r) => ["approver", "par_admin"].includes(r)) || preApprover;
          const canAnalyse = parRoles.some((r) => ["approver", "finance", "par_admin"].includes(r));
          const isParAdmin = parRoles.includes("par_admin");
          const mobileItems = isCrmModule
            ? [
                { label: "Pipeline", href: "/business/crm/pipeline", icon: KanbanSquare },
                { label: "Astăzi", href: "/business/crm/astazi", icon: CalendarClock },
                { label: "Clienți", href: "/business/crm/clienti", icon: Building2 },
                { label: "Rapoarte", href: "/business/crm/rapoarte", icon: BarChart3 },
              ]
            : isParModule
            ? [
                { label: "Cereri", href: "/business/par", icon: ClipboardList },
                ...(canApprove ? [{ label: "Aprobări", href: "/business/par/inbox", icon: ShieldCheck }] : []),
                ...(canAnalyse ? [{ label: "Rapoarte", href: "/business/par/reports", icon: BarChart3 }] : []),
                ...(isParAdmin ? [{ label: "Admin", href: "/business/par/admin", icon: Settings }] : []),
              ]
            : useFinNav
            ? [
                // NAV-01: în FinDesk, filele de jos sunt munca zilnică a contabilului.
                { label: "Acasă", href: "/business/fin/", icon: Home },
                { label: "Facturi", href: "/business/fin/invoices", icon: Receipt },
                { label: "Cheltuieli", href: "/business/fin/expenses", icon: DollarSign },
                { label: "Termene", href: "/business/fin/calendar", icon: Calendar },
              ]
            : [
                { label: "Dashboard", href: "/business/dashboard", icon: LayoutDashboard },
                ...(isEnabled("findesk") ? [{ label: "FinDesk", href: "/business/fin/", icon: Landmark }] : []),
                // VM1-01: only show PAR tab if user has at least one PAR role
                ...(hasPar ? [{ label: "PAR", href: "/business/par", icon: ClipboardList }] : []),
                ...(isEnabled("crm") ? [{ label: "CRM", href: "/business/crm", icon: KanbanSquare }] : []),
                // Ruta ITPark e /business/fin/itpark — „/business/itpark" nu există și ducea la 404.
                ...(isEnabled("itpark") ? [{ label: "ITPark", href: "/business/fin/itpark", icon: Building2 }] : []),
                ...(isEnabled("pontaj") ? [{ label: "Pontaj", href: "/business/pontaj", icon: CalendarClock }] : []),
              ].slice(0, 5);
          // Cinci file încap (≥ 64px fiecare la 320px); a șasea ar fi rupt rândul în două.
          const colsClass =
            mobileItems.length >= 5 ? "grid-cols-5"
            : mobileItems.length === 4 ? "grid-cols-4"
            : mobileItems.length === 3 ? "grid-cols-3"
            : mobileItems.length === 2 ? "grid-cols-2"
            : "grid-cols-1";
          return (
          <div className={cn("grid", colsClass)}>
          {mobileItems.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/business/par" || item.href === "/business/crm"
                ? path === item.href || path === `${item.href}/`
                : item.href === "/business/fin/" && useFinNav
                ? path === "/business/fin/" || path === "/business/fin"
                : path.startsWith(item.href) || (item.href === "/business/fin/invoices" && path.startsWith("/business/fin/einvoices"));
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
