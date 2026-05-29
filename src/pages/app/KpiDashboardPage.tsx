/**
 * REP-301 — Dashboard KPI: MRR, elevi activi, churn, ARPU
 * Pagina /app/analytics/kpi cu period toggle (7z/30z/90z/12l)
 */
import { useEffect, useState, useCallback } from "react";
import { TrendingUp, TrendingDown, Users, UserPlus, AlertTriangle, Euro } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import { getKpi, type KpiData, type KpiPeriod } from "@/lib/api/analytics";
import { cn } from "@/lib/utils";

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatEur(cents: number): string {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function deltaPercent(current: number, prev: number): number {
  if (prev === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - prev) / prev) * 100);
}

// ─── Period labels ────────────────────────────────────────────────────────────

const PERIODS: { key: KpiPeriod; label: string }[] = [
  { key: "7d", label: "7 zile" },
  { key: "30d", label: "30 zile" },
  { key: "90d", label: "90 zile" },
  { key: "12m", label: "12 luni" },
];

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  delta?: number;
  icon: React.ReactNode;
  loading?: boolean;
}

function KpiCard({ label, value, delta, icon, loading }: KpiCardProps) {
  const isPositive = (delta ?? 0) >= 0;
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3" aria-label={label}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <span className="text-muted-foreground/60">{icon}</span>
      </div>
      {loading ? (
        <div className="h-8 bg-muted/40 rounded animate-pulse" aria-label="Se încarcă" />
      ) : (
        <div className="flex items-end justify-between gap-2">
          <p className="text-2xl font-bold text-foreground" aria-live="polite">{value}</p>
          {delta !== undefined && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                isPositive
                  ? "bg-success/10 text-success"
                  : "bg-destructive/10 text-destructive"
              )}
              aria-label={`${isPositive ? "Creștere" : "Scădere"} ${Math.abs(delta)}%`}
            >
              {isPositive
                ? <TrendingUp className="h-3 w-3" aria-hidden="true" />
                : <TrendingDown className="h-3 w-3" aria-hidden="true" />}
              {isPositive ? "+" : ""}{delta}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function KpiDashboardPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const [period, setPeriod] = useState<KpiPeriod>("30d");
  const [kpi, setKpi] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  const fetchKpi = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getKpi(period);
      setKpi(data);
    } catch {
      setError("Nu pot încărca KPI-urile.");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { void fetchKpi(); }, [fetchKpi]);

  return (
    <AppShell
      pageTitle="Dashboard KPI"
      pageDescription="Metrici cheie ale academiei — actualizate în timp real"
    >
      {/* Period toggle */}
      <div className="flex gap-1.5 mb-6" role="group" aria-label="Selectează perioadă">
        {PERIODS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setPeriod(key)}
            aria-pressed={period === key}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors min-h-[36px]",
              period === key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:bg-muted text-muted-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm text-destructive mb-6">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {/* KPI Cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="kpi-grid">
        <KpiCard
          label="MRR (plăți perioadă)"
          value={kpi ? formatEur(kpi.mrrCents) : "—"}
          delta={kpi ? deltaPercent(kpi.mrrCents, kpi.prevMrrCents) : undefined}
          icon={<Euro className="h-5 w-5" aria-hidden="true" />}
          loading={loading}
        />
        <KpiCard
          label="Elevi activi"
          value={kpi ? String(kpi.activeStudents) : "—"}
          delta={kpi ? deltaPercent(kpi.activeStudents, kpi.prevActiveStudents) : undefined}
          icon={<Users className="h-5 w-5" aria-hidden="true" />}
          loading={loading}
        />
        <KpiCard
          label="Elevi noi"
          value={kpi ? String(kpi.newStudents) : "—"}
          icon={<UserPlus className="h-5 w-5" aria-hidden="true" />}
          loading={loading}
        />
        <KpiCard
          label="Churn rate (%)"
          value={kpi ? `${kpi.churnRatePct}%` : "—"}
          icon={<TrendingDown className="h-5 w-5" aria-hidden="true" />}
          loading={loading}
        />
        <KpiCard
          label="ARPU (€ per elev)"
          value={kpi ? formatEur(kpi.arpuCents) : "—"}
          icon={<TrendingUp className="h-5 w-5" aria-hidden="true" />}
          loading={loading}
        />
      </div>

      {/* Last updated note */}
      {kpi && !loading && (
        <p className="mt-6 text-xs text-muted-foreground">
          Perioadă analizată: ultimele {
            period === "7d" ? "7 zile" :
            period === "30d" ? "30 de zile" :
            period === "90d" ? "90 de zile" :
            "12 luni"
          } față de perioada anterioară egală.
        </p>
      )}
    </AppShell>
  );
}
