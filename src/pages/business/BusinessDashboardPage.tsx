/**
 * SPLIT-204 / HR365-004: FinFlow Dashboard — /business/dashboard
 *
 * Unified KPI board: FinDesk (expenses/invoices) + PAR (pending approvals) +
 * ITPark (active residents). Each card loads independently — one failure
 * shows N/A, the other two still render.
 *
 * POLISH-002: Widget customization (show/hide + reorder) via DashboardCustomizer.
 * Preferences saved in localStorage under `vl_dashboard_widgets_<userId>`.
 *
 * Design: HR365 — dashboard cards on `rounded-2xl` with a pastel icon chip per
 * category, and the module launcher as flat saturated tiles.
 */
import { useState, type ReactNode } from "react";
import {
  Landmark,
  ClipboardList,
  Building2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Clock,
  Settings,
  Receipt,
  Users2,
  BarChart3,
} from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { DashboardCustomizer } from "@/components/DashboardCustomizer";
import { Link } from "@/router/HashRouter";
import { useBusinessDashboard } from "@/hooks/useBusinessDashboard";
import { useBusinessSession } from "@/hooks/useBusinessSession";
import { useDashboardWidgets, type WidgetId } from "@/hooks/useDashboardWidgets";
import { useEnabledModules, type ModuleKey } from "@/hooks/useEnabledModules";
import { ParFocusDashboard } from "@/components/business/ParFocusDashboard";
import { formatCents } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  Button,
  Card,
  KpiTile,
  ModuleCard,
  PastelIcon,
  type ChipTone,
  type ModuleTone,
} from "@/components/ds";

// ─── Widget card ──────────────────────────────────────────────────────────────

interface WidgetCardProps {
  title: string;
  subtitle?: string;
  href: string;
  icon: ReactNode;
  tone: ChipTone;
  loading: boolean;
  error?: boolean;
  children: ReactNode;
}

/** Multi-stat widget: chip + title on top, rows underneath. */
function WidgetCard({ title, subtitle, href, icon, tone, loading, error, children }: WidgetCardProps) {
  return (
    <Card
      tone="dashboard"
      className="flex flex-col gap-4 p-5"
      aria-label={`KPI ${title}`}
      data-testid={`widget-card-${title.toLowerCase().replace(/\s/g, "-")}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <PastelIcon tone={tone} size={40}>
            {icon}
          </PastelIcon>
          <div>
            <h2 className="text-sm font-semibold leading-tight text-foreground">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        <Link
          to={href}
          className="mt-0.5 inline-flex shrink-0 items-center text-xs text-primary hover:underline max-sm:min-h-[44px]"
          aria-label={`Deschide ${title}`}
        >
          Vezi tot
        </Link>
      </div>

      <div className="flex min-h-[56px] items-center">
        {loading ? (
          <div className="w-full animate-pulse space-y-2">
            <div className="h-8 w-28 rounded-md bg-muted" />
            <div className="h-4 w-20 rounded-md bg-muted" />
          </div>
        ) : error ? (
          <p className="text-sm italic text-muted-foreground">N/A — eroare de încărcare</p>
        ) : (
          <div className="w-full">{children}</div>
        )}
      </div>
    </Card>
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
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : null;
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-sm font-semibold tabular-nums", valueClass ?? "text-foreground")}>
        {TrendIcon && (
          <TrendIcon
            className={cn(
              "mr-1 inline h-3.5 w-3.5",
              trend === "up" ? "text-success" : "text-destructive",
            )}
            aria-hidden="true"
          />
        )}
        {value}
      </span>
    </div>
  );
}

// ─── Module launcher ───────────────────────────────────────────────────────────

interface ModuleTile {
  label: string;
  description: string;
  href: string;
  icon: ReactNode;
  tone: ModuleTone;
  /** PLATFORM-001: cheia din catalogul de module — dala dispare dacă modulul e oprit. */
  moduleKey: ModuleKey;
}

const MODULE_TILES: ModuleTile[] = [
  {
    label: "FinDesk",
    description: "Facturi, cheltuieli, plăți, TVA și e-Factura.",
    href: "/business/fin/",
    icon: <Landmark className="h-7 w-7" />,
    tone: "sky",
    moduleKey: "findesk",
  },
  {
    label: "PAR — Cereri de plată",
    description: "Creare, aprobări multi-nivel, finanțe și rapoarte.",
    href: "/business/par",
    icon: <ClipboardList className="h-7 w-7" />,
    tone: "violet",
    moduleKey: "par",
  },
  {
    label: "ITPark — Rezidenți",
    description: "Contracte MITP, declarații și raportare anuală.",
    href: "/business/fin/itpark",
    icon: <Building2 className="h-7 w-7" />,
    tone: "emerald",
    moduleKey: "itpark",
  },
];

// ─── Individual widget renderers ──────────────────────────────────────────────

interface WidgetRenderProps {
  loading: boolean;
  data: ReturnType<typeof useBusinessDashboard>["data"];
}

function FinDeskWidget({ loading, data }: WidgetRenderProps) {
  return (
    <WidgetCard
      title="FinDesk"
      subtitle="Finanțe"
      href="/business/fin/"
      icon={<Landmark className="h-5 w-5" />}
      tone="sky"
      loading={loading}
      error={data?.findesk === null && !loading}
    >
      {data?.findesk && (
        <>
          <StatRow label="Cheltuieli totale" value={formatCents(data.findesk.totalExpensesCents, "MDL")} trend="down" valueClass="text-destructive" />
          <StatRow label="Facturi emise" value={formatCents(data.findesk.totalInvoicesCents, "MDL")} trend="up" valueClass="text-success" />
          <div className="mt-2 border-t border-border pt-2">
            <StatRow
              label="Sold net"
              value={formatCents(Math.abs(data.findesk.netCents), "MDL")}
              valueClass={data.findesk.netCents >= 0 ? "text-success" : "text-destructive"}
            />
          </div>
        </>
      )}
    </WidgetCard>
  );
}

function ParWidget({ loading, data }: WidgetRenderProps) {
  const failed = data?.par === null && !loading;
  if (failed) {
    return (
      <WidgetCard
        title="PAR"
        subtitle="Cereri de plată"
        href="/business/par"
        icon={<ClipboardList className="h-5 w-5" />}
        tone="violet"
        loading={false}
        error
      >
        {null}
      </WidgetCard>
    );
  }
  return (
    <KpiTile
      label="Cereri PAR în așteptare"
      value={data?.par?.pendingCount ?? 0}
      icon={<ClipboardList className="h-5 w-5" />}
      tone="violet"
      href="/business/par"
      loading={loading}
      hint={
        data?.par
          ? data.par.pendingCount > 0
            ? `Valoare totală: ${formatCents(data.par.pendingValueCents, "MDL")}`
            : "Nicio cerere de aprobat"
          : undefined
      }
      data-testid="widget-card-par"
    />
  );
}

function ItparkWidget({ loading, data }: WidgetRenderProps) {
  const failed = data?.itpark === null && !loading;
  if (failed) {
    return (
      <WidgetCard
        title="ITPark"
        subtitle="Rezidenți IT Park"
        href="/business/fin/itpark"
        icon={<Building2 className="h-5 w-5" />}
        tone="emerald"
        loading={false}
        error
      >
        {null}
      </WidgetCard>
    );
  }
  return (
    <KpiTile
      label="Rezidenți ITPark activi"
      value={data?.itpark?.activeCount ?? 0}
      icon={<Building2 className="h-5 w-5" />}
      tone="emerald"
      href="/business/fin/itpark"
      loading={loading}
      hint={
        data?.itpark && data.itpark.inProgressCount > 0 ? (
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {data.itpark.inProgressCount} dosare în lucru
          </span>
        ) : undefined
      }
      data-testid="widget-card-itpark"
    />
  );
}

function InvoicesWidget({ loading }: Pick<WidgetRenderProps, "loading">) {
  return (
    <WidgetCard title="Facturi luna" subtitle="Facturi emise luna curentă" href="/business/fin/invoices" icon={<Receipt className="h-5 w-5" />} tone="blue" loading={loading}>
      <p className="text-sm text-muted-foreground">Disponibil în FinDesk → Facturi</p>
    </WidgetCard>
  );
}

function PayrollWidget({ loading }: Pick<WidgetRenderProps, "loading">) {
  return (
    <WidgetCard title="Angajați activi" subtitle="Statul de plată" href="/business/fin/payroll" icon={<Users2 className="h-5 w-5" />} tone="amber" loading={loading}>
      <p className="text-sm text-muted-foreground">Disponibil în FinDesk → Salarizare</p>
    </WidgetCard>
  );
}

function BudgetWidget({ loading }: Pick<WidgetRenderProps, "loading">) {
  return (
    <WidgetCard title="Buget" subtitle="Planificat vs realizat" href="/business/fin/budget" icon={<BarChart3 className="h-5 w-5" />} tone="rose" loading={loading}>
      <p className="text-sm text-muted-foreground">Disponibil în FinDesk → Buget</p>
    </WidgetCard>
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

/**
 * Din ce modul face parte fiecare widget. Un workspace care nu are FinDesk nu are ce face cu
 * dala „Facturi luna" — trimitea într-o pagină la care oricum primea „Modul indisponibil".
 */
const WIDGET_MODULE: Record<WidgetId, ModuleKey> = {
  findesk: "findesk",
  par: "par",
  itpark: "itpark",
  invoices: "findesk",
  payroll: "findesk",
  budget: "findesk",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export function BusinessDashboardPage() {
  const { data, loading, refetch } = useBusinessDashboard();
  const bizSession = useBusinessSession();
  const userId = bizSession.data?.user?.id ?? null;
  const firstName = (bizSession.data?.user?.name ?? "").split(/\s+/)[0];

  const [customizerOpen, setCustomizerOpen] = useState(false);
  const { visibleWidgets, allWidgets, toggleWidget, moveUp, moveDown, reset } = useDashboardWidgets(userId);
  // PLATFORM-001: dalele și widget-urile modulelor oprite din Consola Platformă nu se afișează.
  const { isEnabled, enabled: enabledModules } = useEnabledModules();
  const moduleTiles = MODULE_TILES.filter((tile) => isEnabled(tile.moduleKey));
  const shownWidgets = visibleWidgets.filter((id) => isEnabled(WIDGET_MODULE[id]));
  const moduleWidgets = allWidgets.filter((w) => isEnabled(WIDGET_MODULE[w.id]));
  // Un workspace cu un singur modul nu are „module" între care să aleagă: îi arătăm tabloul
  // acelui modul, nu un lansator cu o singură dală și KPI-uri din module pe care nu le are.
  const parOnly = enabledModules.length === 1 && enabledModules[0] === "par";
  const subtitle = parOnly
    ? "Tablou de bord — cereri de plată"
    : `Tablou de bord — ${MODULE_TILES.filter((t) => isEnabled(t.moduleKey))
        .map((t) => (t.moduleKey === "par" ? "PAR" : t.label.split(" — ")[0]))
        .join(" · ") || "FinFlow"}`;

  return (
    <BusinessShell
      pageTitle={firstName ? `Salut, ${firstName}` : "FinFlow"}
      pageDescription={subtitle}
      actions={
        <>
          {/* POLISH-002: Widget customizer trigger — n-are ce personaliza pe tabloul PAR. */}
          {!parOnly && (
            <Button
              variant="outline"
              onClick={() => setCustomizerOpen(true)}
              aria-label="Personalizează dashboard"
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Personalizează</span>
            </Button>
          )}
          <Button
            variant="outline"
            onClick={refetch}
            disabled={loading}
            aria-label="Reîncarcă datele"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden="true" />
            <span className="hidden sm:inline">Reîncarcă</span>
          </Button>
        </>
      }
    >
      {parOnly ? (
        <ParFocusDashboard
          pendingCount={data?.par?.pendingCount ?? null}
          pendingValueCents={data?.par?.pendingValueCents ?? null}
          loading={loading}
        />
      ) : (
        <>
        {/* POLISH-002: Dynamic widget grid — order and visibility from useDashboardWidgets */}
        {shownWidgets.length > 0 ? (
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="widget-grid">
            {shownWidgets.map((id) => renderWidget(id, loading, data))}
          </div>
        ) : (
          <div className="mb-8 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Niciun widget vizibil.{" "}
            <button type="button" className="text-primary underline" onClick={() => setCustomizerOpen(true)}>
              Personalizează
            </button>{" "}
            pentru a activa widget-uri.
          </div>
        )}

        {/* Module launcher — choose a module to work in */}
        <section aria-label="Module">
          <h2 className="mb-3 text-3xs font-semibold uppercase tracking-group text-muted-foreground">
            Alege un modul
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {moduleTiles.map((tile) => (
              <ModuleCard
                key={tile.href}
                title={tile.label}
                description={tile.description}
                icon={tile.icon}
                tone={tile.tone}
                href={tile.href}
              />
            ))}
          </div>
        </section>

        </>
      )}

      {/* POLISH-002: DashboardCustomizer panel */}
      <DashboardCustomizer
        isOpen={customizerOpen}
        onClose={() => setCustomizerOpen(false)}
        widgets={moduleWidgets}
        onToggle={toggleWidget}
        onMoveUp={moveUp}
        onMoveDown={moveDown}
        onReset={reset}
      />
    </BusinessShell>
  );
}
