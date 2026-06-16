/**
 * SPLIT-101: BusinessShell — shell-ul aplicației Business Suite.
 *
 * Echivalentul AppShell pentru Business Suite (FinDesk + PAR + ITPark).
 * Sidebar propriu cu secțiunile: Dashboard, FinDesk, PAR, ITPark.
 * Guard: dacă sesiunea business lipsește → redirect la /business/login.
 * Design: Vector 365 semantic tokens, light+dark, WCAG AA.
 */
import { ReactNode, useEffect } from "react";
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
} from "lucide-react";
import { Link, useRouter } from "@/router/HashRouter";
import { cn } from "@/lib/utils";
import { useBusinessSession } from "@/hooks/useBusinessSession";
import { NotificationBell } from "@/components/app/NotificationBell";

interface BusinessShellProps {
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
    section: "FinDesk",
    items: [
      { label: "Acasă FinDesk", href: "/business/fin/", icon: Home },
      { label: "Facturi", href: "/business/fin/invoices", icon: Receipt },
      { label: "Cheltuieli", href: "/business/fin/expenses", icon: DollarSign },
      { label: "Plăți", href: "/business/fin/payments", icon: CreditCard },
      { label: "Conturi bancare", href: "/business/fin/banklink", icon: Banknote },
      { label: "Parteneri", href: "/business/fin/parties", icon: Users },
      { label: "Rapoarte", href: "/business/fin/export", icon: BarChart3 },
    ],
  },
  {
    section: "PAR — Cereri de plată",
    items: [
      { label: "Cereri", href: "/business/par", icon: ClipboardList },
      { label: "Inbox aprobare", href: "/business/par/inbox", icon: BookOpen },
      { label: "Rapoarte PAR", href: "/business/par/reports", icon: FileText },
    ],
  },
  {
    section: "ITPark — Rezidenți",
    items: [
      // FIX-503: ItparkDetail is mounted at /business/fin/itpark (not /business/itpark)
      { label: "Rezidenți", href: "/business/fin/itpark", icon: Building2 },
      // /business/itpark/dashboard has no dedicated route; redirect to the ITPark page
      { label: "Dashboard ITPark", href: "/business/fin/itpark", icon: Landmark },
    ],
  },
  {
    section: "Document Merge",
    items: [
      // DOCMERGE-001: mail-merge templates
      { label: "Templates", href: "/business/docmerge", icon: FileText },
      // DOCMERGE-002: Excel import wizard
      { label: "Import Excel", href: "/business/docmerge/job", icon: FileSpreadsheet },
    ],
  },
  {
    section: null,
    items: [
      { label: "Setări", href: "/business/fin/settings/security", icon: Settings },
    ],
  },
];

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
            {NAV_GROUPS.map((group, gi) => (
              <div key={gi} className={gi > 0 ? "mt-3" : undefined}>
                {group.section && (
                  <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.section}
                  </p>
                )}
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active =
                    item.href === "/business/dashboard"
                      ? path === "/business/dashboard" || path === "/business/dashboard/"
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
        <div className="grid grid-cols-4">
          {[
            { label: "Dashboard", href: "/business/dashboard", icon: LayoutDashboard },
            { label: "FinDesk", href: "/business/fin/", icon: Landmark },
            { label: "PAR", href: "/business/par", icon: ClipboardList },
            { label: "ITPark", href: "/business/itpark", icon: Building2 },
          ].map((item) => {
            const Icon = item.icon;
            const active = path.startsWith(item.href);
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
      </nav>
    </div>
  );
}
