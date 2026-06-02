/**
 * DashboardPage — main app dashboard with customizable widgets.
 * POLISH-002: widgets can be toggled and reordered via the gear button.
 */
import { useState, useEffect } from "react";
import {
  Users,
  Calendar,
  CreditCard,
  GraduationCap,
  LogOut,
  Loader2,
  Settings2,
  TrendingUp,
  AlertCircle,
  UserPlus,
  DollarSign,
} from "lucide-react";
import { useSession } from "@/hooks/useSession";
import { Logo } from "@/components/Logo";
import { Link, useRouter } from "@/router/HashRouter";
import { DashboardCustomizer } from "@/components/app/DashboardCustomizer";
import { useDashboardWidgets, WidgetId } from "@/hooks/useDashboardWidgets";
import { getKpi } from "@/lib/api/analytics";
import { paymentStats } from "@/lib/api/payments";
import { fetchTodayDashboard, fetchLeadsList } from "@/lib/api/leads";
import { listStudents } from "@/lib/api/students";

function formatCents(cents: number): string {
  const value = cents / 100;
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k RON`;
  }
  return `${Math.round(value)} RON`;
}

interface WidgetData {
  revenue?: number;
  activeStudents?: number;
  lessonsToday?: number;
  overdueTasksCount?: number;
  newLeadsCount?: number;
  debtCents?: number;
}

const WIDGET_ICONS: Record<WidgetId, React.ReactNode> = {
  revenue: <TrendingUp className="h-5 w-5 text-foreground/80" />,
  "active-students": <Users className="h-5 w-5 text-foreground/80" />,
  "lessons-today": <Calendar className="h-5 w-5 text-foreground/80" />,
  "crm-overdue": <AlertCircle className="h-5 w-5 text-foreground/80" />,
  "new-leads": <UserPlus className="h-5 w-5 text-foreground/80" />,
  "debt-summary": <DollarSign className="h-5 w-5 text-foreground/80" />,
};

const WIDGET_PASTEL: Record<WidgetId, string> = {
  revenue: "pastel-mint",
  "active-students": "pastel-sky",
  "lessons-today": "pastel-lavender",
  "crm-overdue": "pastel-peach",
  "new-leads": "pastel-mint",
  "debt-summary": "pastel-peach",
};

function getWidgetValue(id: WidgetId, data: WidgetData): string {
  switch (id) {
    case "revenue":
      return data.revenue !== undefined ? formatCents(data.revenue) : "—";
    case "active-students":
      return data.activeStudents !== undefined ? String(data.activeStudents) : "—";
    case "lessons-today":
      return data.lessonsToday !== undefined ? String(data.lessonsToday) : "—";
    case "crm-overdue":
      return data.overdueTasksCount !== undefined ? String(data.overdueTasksCount) : "—";
    case "new-leads":
      return data.newLeadsCount !== undefined ? String(data.newLeadsCount) : "—";
    case "debt-summary":
      return data.debtCents !== undefined ? formatCents(data.debtCents) : "—";
    default:
      return "—";
  }
}

const WIDGET_HREF: Record<WidgetId, string> = {
  revenue: "/app/analytics",
  "active-students": "/app/students",
  "lessons-today": "/app/schedule",
  "crm-overdue": "/app/leads/today",
  "new-leads": "/app/leads",
  "debt-summary": "/app/invoices",
};

export function DashboardPage() {
  const { status, data, logout } = useSession();
  const { navigate } = useRouter();
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [widgetData, setWidgetData] = useState<WidgetData>({});
  const [dataLoading, setDataLoading] = useState(false);

  const userId = data?.user?.id ?? "anon";
  const {
    widgets,
    visibleWidgets,
    toggleWidget,
    moveUp,
    moveDown,
    reset,
  } = useDashboardWidgets(userId);

  // Fetch widget data when logged in
  useEffect(() => {
    if (status !== "authenticated" || !data) return;
    setDataLoading(true);

    Promise.allSettled([
      getKpi("30d"),
      paymentStats(),
      fetchTodayDashboard(),
      fetchLeadsList({ pageSize: 100, sort: "createdAt", dir: "desc" }),
      listStudents({ status: "active", limit: 1 }),
    ]).then(([kpiRes, payRes, todayRes, leadsRes, stuRes]) => {
      const partial: WidgetData = {};

      if (kpiRes.status === "fulfilled") {
        partial.revenue = kpiRes.value.mrrCents;
        partial.activeStudents = kpiRes.value.activeStudents;
      }
      if (payRes.status === "fulfilled") {
        partial.debtCents = payRes.value.overdueCents;
      }
      if (todayRes.status === "fulfilled") {
        partial.overdueTasksCount = todayRes.value.overdueOrDueToday.length;
        // Count lessons today from schedule — use totalActions as proxy
        partial.lessonsToday = todayRes.value.totalActions ?? 0;
      }
      if (leadsRes.status === "fulfilled") {
        // Count leads created in last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        partial.newLeadsCount = (leadsRes.value.items ?? []).filter(
          (l) => new Date(l.createdAt) > sevenDaysAgo
        ).length;
      }
      if (stuRes.status === "fulfilled") {
        // If KPI didn't give active students, use listStudents total
        if (partial.activeStudents === undefined) {
          partial.activeStudents = stuRes.value.total;
        }
      }

      setWidgetData(partial);
      setDataLoading(false);
    });
  }, [status, data]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    navigate("/app/login");
    return null;
  }

  if (status === "error" || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-destructive">
        Eroare conectare server.{" "}
        <Link to="/app/login" className="ml-2 underline">
          Înapoi la login
        </Link>
      </div>
    );
  }

  const { user, tenant } = data;

  const handleLogout = async () => {
    await logout();
    navigate("/app/login");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* DashboardCustomizer slide-over */}
      <DashboardCustomizer
        isOpen={customizerOpen}
        onClose={() => setCustomizerOpen(false)}
        widgets={widgets}
        onToggle={toggleWidget}
        onMoveUp={moveUp}
        onMoveDown={moveDown}
        onReset={reset}
      />

      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="hidden sm:inline text-xs text-muted-foreground">/</span>
            <span className="text-sm font-semibold">{tenant.name}</span>
            <span className="hidden sm:inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-bold uppercase">
              {tenant.plan}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* POLISH-001 hint */}
            <button
              type="button"
              aria-label="Caută rapid (Cmd+K)"
              onClick={() => {
                // Trigger command palette via keyboard event
                window.dispatchEvent(
                  new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true })
                );
              }}
              className="hidden sm:flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
            >
              <span>Caută...</span>
              <kbd className="bg-muted rounded px-1 font-mono text-[10px]">⌘K</kbd>
            </button>

            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold">{user.name}</p>
              <p className="text-[10px] text-muted-foreground capitalize">{user.role}</p>
            </div>
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-xs font-bold text-primary-foreground">
              {user.name
                .split(" ")
                .map((n: string) => n[0])
                .slice(0, 2)
                .join("")}
            </div>
            {/* POLISH-002: Customize dashboard */}
            <button
              type="button"
              aria-label="Personalizează dashboard"
              onClick={() => setCustomizerOpen(true)}
              className="touch-target rounded-md hover:bg-muted flex items-center justify-center"
            >
              <Settings2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Logout"
              className="touch-target rounded-md hover:bg-muted flex items-center justify-center"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight">
            Salut, {user.name.split(" ")[0]} 👋
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Conectat ca {user.role} la {tenant.name}
          </p>
        </div>

        {/* POLISH-002: Customizable widget grid */}
        {visibleWidgets.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {visibleWidgets.map((widget) => {
              const value = getWidgetValue(widget.id, widgetData);
              return (
                <Link
                  key={widget.id}
                  to={WIDGET_HREF[widget.id]}
                  className="rounded-2xl border border-border bg-card p-5 card-hover block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <div
                    className={`${WIDGET_PASTEL[widget.id]} rounded-xl p-2.5 w-fit mb-3`}
                  >
                    {WIDGET_ICONS[widget.id]}
                  </div>
                  <p className="text-xs text-muted-foreground mb-0.5">{widget.label}</p>
                  <p className="text-xl font-bold tabular-nums">
                    {dataLoading ? (
                      <span className="inline-block h-5 w-16 bg-muted animate-pulse rounded" />
                    ) : (
                      value
                    )}
                  </p>
                </Link>
              );
            })}
          </div>
        )}

        {/* Navigation quick-access cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: Users, label: "Elevi", href: "/app/students", pastel: "pastel-mint", desc: "Lista, profile, status" },
            { icon: Calendar, label: "Orar", href: "/app/schedule", pastel: "pastel-sky", desc: "Lecții programate" },
            { icon: GraduationCap, label: "Profesori", href: "/app/teachers", pastel: "pastel-lavender", desc: "Echipa academiei" },
            { icon: CreditCard, label: "Plăți", href: "/app/payments", pastel: "pastel-peach", desc: "Facturi, restanțe" },
          ].map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.label}
                to={card.href}
                className="rounded-2xl border border-border bg-card p-6 card-hover block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <div className={`${card.pastel} rounded-xl p-2.5 w-fit mb-4`}>
                  <Icon className="h-5 w-5 text-foreground/80" />
                </div>
                <h3 className="text-base font-bold mb-1">{card.label}</h3>
                <p className="text-xs text-muted-foreground">{card.desc}</p>
              </Link>
            );
          })}
        </div>

        <div className="mt-8 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-base font-bold mb-1">Acțiuni rapide</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Cele mai folosite acțiuni, la un click distanță.
          </p>
          <div className="grid sm:grid-cols-3 gap-3">
            <Link
              to="/app/leads/today"
              className="rounded-lg border border-border bg-muted/40 hover:bg-muted hover:border-primary/40 p-4 transition-colors"
            >
              <p className="font-semibold text-sm">☀️ Ce am de făcut azi</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Task-uri, leaduri noi, follow-up
              </p>
            </Link>
            <Link
              to="/app/leads"
              className="rounded-lg border border-border bg-muted/40 hover:bg-muted hover:border-primary/40 p-4 transition-colors"
            >
              <p className="font-semibold text-sm">＋ Adaugă un lead</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Pipeline CRM · kanban sau listă
              </p>
            </Link>
            <Link
              to="/app/contracts"
              className="rounded-lg border border-border bg-muted/40 hover:bg-muted hover:border-primary/40 p-4 transition-colors"
            >
              <p className="font-semibold text-sm">📄 Generează un contract</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                OCR buletin · PDF · număr auto
              </p>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
