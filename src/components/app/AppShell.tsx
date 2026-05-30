import { ReactNode } from "react";
import { Users, Calendar, GraduationCap, CreditCard, LogOut, LayoutDashboard, TrendingUp, Zap, BarChart3, DollarSign } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Link, useRouter } from "@/router/HashRouter";
import { useSession } from "@/hooks/useSession";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/NotificationBell";

interface AppShellProps {
  children: ReactNode;
  pageTitle: string;
  pageDescription?: string;
  actions?: ReactNode;
}

const NAV = [
  { label: "Dashboard", href: "/app", icon: LayoutDashboard },
  { label: "Leads", href: "/app/leads", icon: TrendingUp },
  { label: "Elevi", href: "/app/students", icon: Users },
  { label: "Orar", href: "/app/schedule", icon: Calendar },
  { label: "Profesori", href: "/app/teachers", icon: GraduationCap },
  { label: "Plăți", href: "/app/payments", icon: CreditCard },
  { label: "Salarizare", href: "/app/hr/payroll", icon: DollarSign },
  { label: "Automatizări", href: "/app/settings/crm/automations", icon: Zap },
  { label: "Analytics", href: "/app/analytics/crm", icon: BarChart3 },
];

export function AppShell({ children, pageTitle, pageDescription, actions }: AppShellProps) {
  const { data, logout } = useSession();
  const { path, navigate } = useRouter();

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
          <nav className="space-y-1">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = item.href === "/app" ? path === "/app" || path === "/app/" : path.startsWith(item.href);
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
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
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

      <nav className="md:hidden border-t border-border bg-card sticky bottom-0 z-20">
        <div className="grid grid-cols-6">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = item.href === "/app" ? path === "/app" || path === "/app/" : path.startsWith(item.href);
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
