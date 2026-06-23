/**
 * PAR-SHELL: dedicated shell for the PAR module (/business/par/*).
 *
 * The owner asked for PAR to be its OWN section with its OWN sidebar — not the
 * Business Suite menu with PAR items swapped in. #196 already swapped the nav
 * inside BusinessShell; this lifts that into a standalone shell with its own
 * brand identity ("PAR — Cereri de plată"), its own focused sidebar, a back link
 * to the rest of the suite, and its own mobile nav. BusinessShell delegates here
 * for every /business/par/* route, so all existing PAR pages get it for free
 * (they render via AppShell → BusinessShell → ParShell).
 *
 * Design: Vector 365 semantic tokens, light + dark, WCAG AA (44px targets,
 * aria-current, labelled nav). No hardcoded colors.
 */
import { ReactNode } from "react";
import {
  ClipboardList,
  ShieldCheck,
  Banknote,
  BarChart3,
  Settings,
  LogOut,
  ArrowLeft,
  FileCheck2,
} from "lucide-react";
import { Link, useRouter } from "@/router/HashRouter";
import { cn } from "@/lib/utils";
import { useBusinessSession } from "@/hooks/useBusinessSession";
import { NotificationBell } from "@/components/app/NotificationBell";

interface ParShellProps {
  children: ReactNode;
  pageTitle: string;
  pageDescription?: string;
  actions?: ReactNode;
}

interface ParNavItem {
  label: string;
  href: string;
  icon: typeof ClipboardList;
  /** Index items use exact-match active state so they don't stay lit on sub-routes. */
  index?: boolean;
}

interface ParNavGroup {
  section: string | null;
  items: ParNavItem[];
}

const PAR_NAV: ParNavGroup[] = [
  {
    section: null,
    items: [
      { label: "Cereri de plată", href: "/business/par", icon: ClipboardList, index: true },
      { label: "Inbox aprobare", href: "/business/par/inbox", icon: ShieldCheck },
      { label: "Coadă finanțe", href: "/business/par/finance", icon: Banknote },
    ],
  },
  {
    section: "Analiză",
    items: [{ label: "Rapoarte & statistici", href: "/business/par/reports", icon: BarChart3 }],
  },
  {
    section: "Administrare",
    items: [{ label: "Administrare PAR", href: "/business/par/admin", icon: Settings }],
  },
];

/** Bottom-nav tabs on mobile (4 primary PAR destinations). */
const PAR_MOBILE_TABS: ParNavItem[] = [
  { label: "Cereri", href: "/business/par", icon: ClipboardList, index: true },
  { label: "Aprobări", href: "/business/par/inbox", icon: ShieldCheck },
  { label: "Rapoarte", href: "/business/par/reports", icon: BarChart3 },
  { label: "Admin", href: "/business/par/admin", icon: Settings },
];

function isActive(path: string, item: ParNavItem): boolean {
  if (item.index) return path === item.href || path === item.href + "/";
  return path.startsWith(item.href);
}

export function ParShell({ children, pageTitle, pageDescription, actions }: ParShellProps) {
  const { path, navigate } = useRouter();
  const session = useBusinessSession();

  const handleLogout = async () => {
    await session.logout();
    navigate("/business/login");
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header — PAR identity, distinct from the Business Suite header. */}
      <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-3 shrink-0 z-20 sticky top-0">
        <Link
          to="/business/par"
          className="flex items-center gap-2 font-display font-bold text-base select-none"
          aria-label="PAR — Cereri de plată, acasă"
        >
          <FileCheck2 className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline text-foreground">PAR · Cereri de plată</span>
        </Link>
        <div className="flex-1" />
        <NotificationBell />
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors min-h-[44px]"
          aria-label="Deconectare"
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline">Ieșire</span>
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Dedicated PAR sidebar */}
        <aside
          className="hidden md:flex flex-col w-56 shrink-0 border-r border-border bg-card overflow-y-auto"
          aria-label="Navigare PAR"
        >
          <nav className="flex flex-col gap-1 p-3 flex-1">
            <Link
              to="/business/dashboard"
              className="flex items-center gap-2 rounded-md px-3 py-2 mb-2 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors min-h-[44px]"
              aria-label="Înapoi la toate modulele"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Toate modulele</span>
            </Link>
            {PAR_NAV.map((group, gi) => (
              <div key={gi} className={gi > 0 ? "mt-3" : undefined}>
                {group.section && (
                  <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.section}
                  </p>
                )}
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(path, item);
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

      {/* Mobile bottom nav — PAR tabs only */}
      <nav
        className="md:hidden border-t border-border bg-card sticky bottom-0 z-20"
        aria-label="Navigare mobilă PAR"
      >
        <div className="grid grid-cols-4">
          {PAR_MOBILE_TABS.map((item) => {
            const Icon = item.icon;
            const active = isActive(path, item);
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
