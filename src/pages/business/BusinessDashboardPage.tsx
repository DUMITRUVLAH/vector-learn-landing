/**
 * SPLIT-204: Business Suite Dashboard — /business/dashboard
 *
 * Unified KPI board: FinDesk (expenses/invoices) + PAR (pending approvals) +
 * ITPark (active residents). Each card loads independently — one failure
 * shows N/A, the other two still render.
 *
 * POLISH-002: Widget customization (show/hide + reorder) via DashboardCustomizer.
 * Preferences saved in localStorage under `vl_dashboard_widgets_<userId>`.
 *
 * Wrapped in BusinessShell (created in SPLIT-101).
 */
import { useState } from "react";
import { Landmark, ClipboardList, Building2, RefreshCw, TrendingUp, TrendingDown, Clock, ArrowRight, Settings, Receipt, Users2, BarChart3 } from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { DashboardCustomizer } from "@/components/DashboardCustomizer";
import { Link } from "@/router/HashRouter";
import { useBusinessDashboard } from "@/hooks/useBusinessDashboard";
import { useBusinessSession } from "@/hooks/useBusinessSession";
import { useDashboardWidgets, type WidgetId } from "@/hooks/useDashboardWidgets";
import { formatCents } from "@/lib/utils";
import { cn } from "@/lib/utils";

// ─── Skeleton ────────────────────────────────────────────────────────────────

function KpiSkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-8 bg-muted rounded w-28" />
      <div className="h-4 bg-muted rounded w-20" />
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  title: string;
  subtitle?: string;
  href: string;
  icon: typeof Landmark;
  loading: boolean;
  error?: boolean;
  children: React.ReactNode;
}

function KpiCard({ title, subtitle, href, icon: Icon, loading, error, children }: KpiCardProps) {
  return (
    <div
      className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4"
      aria-label={`KPI ${title}`}
      data-testid={`widget-card-${title.toLowerCase().replace(/\s/g, "-")}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center justify-center rounded-lg bg-primary/10 p-2.5">
            <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground text-sm leading-tight">{title}</h2>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
        <Link
          to={href}
          className="text-xs text-primary hover:underline shrink-0 mt-0.5"
          aria-label={`Deschide ${title}`}
        >
          Vezi tot
        </Link>
      </div>

      <div className="min-h-[56px] flex items-center">
        {loading ? (
          <KpiSkeleton />
        ) : error ? (
          <p className="text-sm text-muted-foreground italic">N/A — eroare de încărcare</p>
        ) : (
          <div className="w-full">{children}</div>
        )}
      </div>
    </div>
  );
}

// ─── Stat row inside a card ────────────────────────────────────────────────────

interface StatRowProps {
  label: string;
  value: string;
  trend?: "up" | "down" | "neutral";
  valueClass?: string;
}

function StatRow({ label, value, trend, valueClass }: StatRowProps) {
  const TrendIcon =
    trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : null;
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-sm font-semibold tabular-nums",
          valueClass,
          !valueClass && "text-foreground"
        )}
      >
        {TrendIcon && (
          <TrendIcon
            className={cn(
              "inline h-3.5 w-3.5 mr-1",
              trend === "up" ? "text-green-500" : "text-red-500"
            )}
            aria-hidden="true"
          />
        )}
        {value}
      </span>
    </div>
  );
}

// ─── Quick-access links ────────────────────────────────────────────────────────

interface ModuleTile {
  label: string;
  description: string;
  href: string;
  icon: typeof Landmark;
  /** Tailwind classes for the tile's tinted background + icon color (light/dark). */
  tint: string;
  iconClass: string;
}

const MODULE_TILES: ModuleTile[] = [
  {
    label: "FinDesk",
    description: "Facturi, cheltuieli, plăți, TVA și e-Factura.",
    href: "/business/fin/",
    icon: Landmark,
    tint: "bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-950/60",
    iconClass: "text-blue-600 dark:text-blue-400",
  },
  {
    label: "PAR — Cereri de plată",
    description: "Creare, aprobări multi-nivel, finanțe și rapoarte.",
    href: "/business/par",
    icon: ClipboardList,
    tint: "bg-violet-50 dark:bg-violet-950/40 hover:bg-violet-100 dark:hover:bg-violet-950/60",
    iconClass: "text-violet-600 dark:text-violet-400",
  },
  {
    label: "ITPark — Rezidenți",
    description: "Contracte MITP, declarații și raportare anuală.",
    href: "/business/fin/itpark",
    icon: Building2,
    tint: "bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-950/60",
    iconClass: "text-emerald-600 dark:text-emerald-400",
  },
];

// ─── Individual widget renderers ──────────────────────────────────────────────

interface WidgetRenderProps {
  loading: boolean;
  data: ReturnType<typeof useBusinessDashboard>["data"];
}

function FinDeskWidget({ loading, data }: WidgetRenderProps) {
  return (
    <KpiCard title="FinDesk" subtitle="Finanțe" href="/business/fin/" icon={Landmark} loading={loading} error={data?.findesk === null && !loading}>
      {data?.findesk && (
        <>
          <StatRow label="Cheltuieli totale" value={formatCents(data.findesk.totalExpensesCents, "MDL")} trend="down" valueClass="text-red-600 dark:text-red-400" />
          <StatRow label="Facturi emise" value={formatCents(data.findesk.totalInvoicesCents, "MDL")} trend="up" valueClass="text-green-600 dark:text-green-400" />
          <div className="mt-2 pt-2 border-t border-border">
            <StatRow label="Sold net" value={formatCents(Math.abs(data.findesk.netCents), "MDL")} valueClass={data.findesk.netCents >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"} />
          </div>
        </>
      )}
    </KpiCard>
  );
}

function ParWidget({ loading, data }: WidgetRenderProps) {
  return (
    <KpiCard title="PAR" subtitle="Cereri de plată" href="/business/par" icon={ClipboardList} loading={loading} error={data?.par === null && !loading}>
      {data?.par && (
        <>
          <div className="flex items-end gap-2 mb-3">
            <span className="text-3xl font-bold text-foreground tabular-nums">{data.par.pendingCount}</span>
            <span className="text-sm text-muted-foreground mb-0.5">cereri pending</span>
          </div>
          {data.par.pendingCount > 0 && (
            <StatRow label="Valoare totală pending" value={formatCents(data.par.pendingValueCents, "MDL")} trend="neutral" />
          )}
          {data.par.pendingCount === 0 && (
            <p className="text-xs text-green-600 dark:text-green-400">Nicio cerere de aprobat</p>
          )}
        </>
      )}
    </KpiCard>
  );
}

function ItparkWidget({ loading, data }: WidgetRenderProps) {
  return (
    <KpiCard title="ITPark" subtitle="Rezidenți IT Park" href="/business/fin/itpark" icon={Building2} loading={loading} error={data?.itpark === null && !loading}>
      {data?.itpark && (
        <>
          <div className="flex items-end gap-2 mb-3">
            <span className="text-3xl font-bold text-foreground tabular-nums">{data.itpark.activeCount}</span>
            <span className="text-sm text-muted-foreground mb-0.5">rezidenți activi</span>
          </div>
          {data.itpark.inProgressCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{data.itpark.inProgressCount} dosare în lucru</span>
            </div>
          )}
        </>
      )}
    </KpiCard>
  );
}

function InvoicesWidget({ loading }: Pick<WidgetRenderProps, "loading">) {
  return (
    <KpiCard title="Facturi luna" subtitle="Facturi emise luna curentă" href="/business/fin/invoices" icon={Receipt} loading={loading}>
      <p className="text-sm text-muted-foreground">Disponibil în FinDesk → Facturi</p>
    </KpiCard>
  );
}

function PayrollWidget({ loading }: Pick<WidgetRenderProps, "loading">) {
  return (
    <KpiCard title="Angajați activi" subtitle="Statul de plată" href="/business/fin/payroll" icon={Users2} loading={loading}>
      <p className="text-sm text-muted-foreground">Disponibil în FinDesk → Salarizare</p>
    </KpiCard>
  );
}

function BudgetWidget({ loading }: Pick<WidgetRenderProps, "loading">) {
  return (
    <KpiCard title="Buget" subtitle="Planificat vs realizat" href="/business/fin/budget" icon={BarChart3} loading={loading}>
      <p className="text-sm text-muted-foreground">Disponibil în FinDesk → Buget</p>
    </KpiCard>
  );
}

function renderWidget(id: WidgetId, loading: boolean, data: ReturnType<typeof useBusinessDashboard>["data"]) {
  switch (id) {
    case "findesk":  return <FinDeskWidget key={id} loading={loading} data={data} />;
    case "par":      return <ParWidget key={id} loading={loading} data={data} />;
    case "itpark":   return <ItparkWidget key={id} loading={loading} data={data} />;
    case "invoices": return <InvoicesWidget key={id} loading={loading} />;
    case "payroll":  return <PayrollWidget key={id} loading={loading} />;
    case "budget":   return <BudgetWidget key={id} loading={loading} />;
    default:         return null;
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function BusinessDashboardPage() {
  const { data, loading, refetch } = useBusinessDashboard();
  const bizSession = useBusinessSession();
  const userId = bizSession.data?.user?.id ?? null;

  const [customizerOpen, setCustomizerOpen] = useState(false);
  const { visibleWidgets, allWidgets, toggleWidget, moveUp, moveDown, reset } = useDashboardWidgets(userId);

  return (
    <BusinessShell
      pageTitle="Business Suite"
      pageDescription="Tablou de bord — FinDesk · PAR · ITPark"
      actions={
        <div className="flex items-center gap-2">
          {/* POLISH-002: Widget customizer trigger */}
          <button
            type="button"
            onClick={() => setCustomizerOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors min-h-[44px]"
            aria-label="Personalizează dashboard"
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Personalizează</span>
          </button>
          <button
            type="button"
            onClick={refetch}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50 min-h-[44px]"
            aria-label="Reîncarcă datele"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden="true" />
            <span className="hidden sm:inline">Reîncarcă</span>
          </button>
        </div>
      }
    >
      {/* POLISH-002: Dynamic widget grid — order and visibility from useDashboardWidgets */}
      {visibleWidgets.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8" data-testid="widget-grid">
          {visibleWidgets.map((id) => renderWidget(id, loading, data))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-8 text-center mb-8 text-sm text-muted-foreground">
          Niciun widget vizibil.{" "}
          <button type="button" className="text-primary underline" onClick={() => setCustomizerOpen(true)}>
            Personalizează
          </button>{" "}
          pentru a activa widget-uri.
        </div>
      )}

      {/* Module picker — choose a module to work in */}
      <section aria-label="Module">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Alege un modul
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {MODULE_TILES.map((tile) => {
            const Icon = tile.icon;
            return (
              <Link
                key={tile.href}
                to={tile.href}
                className={cn(
                  "group flex flex-col gap-3 rounded-2xl border border-border p-5 transition-colors min-h-[44px]",
                  tile.tint
                )}
                aria-label={`Deschide ${tile.label}`}
              >
                <Icon className={cn("h-6 w-6", tile.iconClass)} aria-hidden="true" />
                <div>
                  <h3 className="text-base font-semibold text-foreground">{tile.label}</h3>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    {tile.description}
                  </p>
                </div>
                <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-foreground group-hover:gap-2 transition-all">
                  Deschide <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* POLISH-002: DashboardCustomizer panel */}
      <DashboardCustomizer
        isOpen={customizerOpen}
        onClose={() => setCustomizerOpen(false)}
        widgets={allWidgets}
        onToggle={toggleWidget}
        onMoveUp={moveUp}
        onMoveDown={moveDown}
        onReset={reset}
      />
    </BusinessShell>
  );
}
