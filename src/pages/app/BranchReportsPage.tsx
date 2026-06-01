/**
 * BRANCH-704 — Rapoarte consolidate vs per-filială
 *
 * Dashboard comparativ cu KPI-uri (elevi activi, venit lunar, rată retenție)
 * în două view-uri: "Consolidat" (total rețea) și "Per filială" (carduri color-coded).
 * Accesibil la /app/branches/reports.
 */
import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/app/AppShell";
import { Users, TrendingUp, BarChart3, Download, RefreshCw, Building2, AlertCircle } from "lucide-react";
import { getBranchKPI, type BranchKPI, type BranchKPIResponse } from "@/lib/api/branches";
import { cn } from "@/lib/utils";

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

type PerfLevel = "above" | "average" | "below";

/** Returns performance level relative to network average */
function getPerfLevel(value: number, avg: number): PerfLevel {
  if (avg === 0) return "average";
  const ratio = value / avg;
  if (ratio >= 1.05) return "above";
  if (ratio >= 0.85) return "average";
  return "below";
}

const perfLabelMap: Record<PerfLevel, string> = {
  above: "↑ Peste medie",
  average: "≈ Medie",
  below: "↓ Sub medie",
};

const perfColorMap: Record<PerfLevel, string> = {
  above: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  average: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  below: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
}

function StatCard({ title, value, icon: Icon, description }: StatCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      {description && (
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      )}
    </div>
  );
}

interface PerfBadgeProps {
  level: PerfLevel;
}

function PerfBadge({ level }: PerfBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        perfColorMap[level]
      )}
    >
      {perfLabelMap[level]}
    </span>
  );
}

interface BranchCardProps {
  kpi: BranchKPI;
  avgStudents: number;
  avgRevenue: number;
  avgRetention: number;
}

function BranchCard({ kpi, avgStudents, avgRevenue, avgRetention }: BranchCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-border">
        <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
        <h3 className="font-semibold text-base text-foreground truncate">{kpi.branchName}</h3>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground flex items-center gap-1">
            <Users className="h-3 w-3" aria-hidden="true" />
            Elevi activi
          </span>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="font-medium">{kpi.activeStudents}</span>
            <PerfBadge level={getPerfLevel(kpi.activeStudents, avgStudents)} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground flex items-center gap-1">
            <TrendingUp className="h-3 w-3" aria-hidden="true" />
            Venit lunar
          </span>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="font-medium">{formatCurrency(kpi.monthlyRevenue)}</span>
            <PerfBadge level={getPerfLevel(kpi.monthlyRevenue, avgRevenue)} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground flex items-center gap-1">
            <BarChart3 className="h-3 w-3" aria-hidden="true" />
            Rată retenție
          </span>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="font-medium">{kpi.retentionRate}%</span>
            <PerfBadge level={getPerfLevel(kpi.retentionRate, avgRetention)} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type ViewMode = "consolidated" | "per-branch";

export default function BranchReportsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("consolidated");
  const [data, setData] = useState<BranchKPIResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Default: last 30 days
  const [dateRange, setDateRange] = useState(() => {
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 86400_000);
    return { from: formatDate(from), to: formatDate(to) };
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getBranchKPI({ from: dateRange.from, to: dateRange.to });
      setData(result);
    } catch {
      setError("Nu s-au putut încărca rapoartele. Încearcă din nou.");
    } finally {
      setLoading(false);
    }
  }, [dateRange.from, dateRange.to]);

  useEffect(() => {
    load();
  }, [load]);

  /** Export current view as CSV */
  function exportCSV() {
    if (!data) return;

    let csv: string;
    if (viewMode === "consolidated") {
      csv =
        "Metric,Value\n" +
        `Elevi activi,${data.consolidated.activeStudents}\n` +
        `Venit lunar,${data.consolidated.monthlyRevenue}\n` +
        `Rată retenție,${data.consolidated.retentionRate}%\n`;
    } else {
      csv =
        "Filială,Elevi activi,Venit lunar (EUR),Rată retenție (%)\n" +
        data.byBranch
          .map(
            (b) =>
              `"${b.branchName}",${b.activeStudents},${b.monthlyRevenue},${b.retentionRate}`
          )
          .join("\n");
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `raport-filiale-${viewMode}-${dateRange.from}-${dateRange.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Per-branch averages (for color coding)
  const branches = data?.byBranch ?? [];
  const avgStudents = branches.length
    ? branches.reduce((s, b) => s + b.activeStudents, 0) / branches.length
    : 0;
  const avgRevenue = branches.length
    ? branches.reduce((s, b) => s + b.monthlyRevenue, 0) / branches.length
    : 0;
  const avgRetention = branches.length
    ? branches.reduce((s, b) => s + b.retentionRate, 0) / branches.length
    : 0;

  return (
    <AppShell
      pageTitle="Rapoarte filiale"
      pageDescription="KPI-uri consolidate și comparații per filială"
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            aria-label="Reîncarcă datele"
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={exportCSV}
            disabled={!data || loading}
            aria-label="Exportă CSV"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Export CSV
          </button>
        </div>
      }
    >
      {/* ── Filters row ── */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* View toggle */}
        <div
          role="group"
          aria-label="Selectați tipul de vizualizare"
          className="flex rounded-md border border-border overflow-hidden"
        >
          <button
            type="button"
            onClick={() => setViewMode("consolidated")}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors",
              viewMode === "consolidated"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-foreground hover:bg-muted"
            )}
            aria-pressed={viewMode === "consolidated"}
          >
            Consolidat
          </button>
          <button
            type="button"
            onClick={() => setViewMode("per-branch")}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-l border-border",
              viewMode === "per-branch"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-foreground hover:bg-muted"
            )}
            aria-pressed={viewMode === "per-branch"}
          >
            Per filială
          </button>
        </div>

        {/* Date range */}
        <div className="flex items-center gap-2 ml-auto">
          <label htmlFor="from-date" className="text-sm text-muted-foreground">
            De la
          </label>
          <input
            id="from-date"
            type="date"
            value={dateRange.from}
            onChange={(e) => setDateRange((d) => ({ ...d, from: e.target.value }))}
            className="border border-border rounded-md px-2 py-1.5 text-sm bg-background text-foreground"
            aria-label="Dată de început"
          />
          <span className="text-muted-foreground text-sm" aria-hidden="true">–</span>
          <label htmlFor="to-date" className="text-sm text-muted-foreground">
            Până la
          </label>
          <input
            id="to-date"
            type="date"
            value={dateRange.to}
            onChange={(e) => setDateRange((d) => ({ ...d, to: e.target.value }))}
            className="border border-border rounded-md px-2 py-1.5 text-sm bg-background text-foreground"
            aria-label="Dată de sfârșit"
          />
        </div>
      </div>

      {/* ── Error state ── */}
      {error && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4 mb-6 text-sm text-red-700 dark:text-red-400"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {loading && (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-5 animate-pulse">
              <div className="h-4 bg-muted rounded w-1/2 mb-4" />
              <div className="h-8 bg-muted rounded w-2/3" />
            </div>
          ))}
        </div>
      )}

      {/* ── Consolidated view ── */}
      {!loading && data && viewMode === "consolidated" && (
        <section aria-label="KPI consolidat rețea">
          <h2 className="text-lg font-semibold mb-4 text-foreground">Total rețea</h2>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
            <StatCard
              title="Elevi activi"
              value={data.consolidated.activeStudents}
              icon={Users}
              description="În toate filialele"
            />
            <StatCard
              title="Venit lunar"
              value={formatCurrency(data.consolidated.monthlyRevenue)}
              icon={TrendingUp}
              description={`${dateRange.from} → ${dateRange.to}`}
            />
            <StatCard
              title="Rată retenție"
              value={`${data.consolidated.retentionRate}%`}
              icon={BarChart3}
              description="Media rețelei"
            />
          </div>

          {/* Branch breakdown table below consolidated */}
          {data.byBranch.length > 0 && (
            <div className="mt-8">
              <h3 className="text-base font-semibold mb-3 text-muted-foreground">
                Detaliu pe filiale
              </h3>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th scope="col" className="text-left px-4 py-3 font-medium text-foreground">
                        Filială
                      </th>
                      <th scope="col" className="text-right px-4 py-3 font-medium text-foreground">
                        Elevi
                      </th>
                      <th scope="col" className="text-right px-4 py-3 font-medium text-foreground">
                        Venit
                      </th>
                      <th scope="col" className="text-right px-4 py-3 font-medium text-foreground">
                        Retenție
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byBranch.map((b, i) => (
                      <tr
                        key={b.branchId}
                        className={cn(
                          "border-t border-border",
                          i % 2 === 1 ? "bg-muted/20" : ""
                        )}
                      >
                        <td className="px-4 py-2.5 font-medium text-foreground">{b.branchName}</td>
                        <td className="px-4 py-2.5 text-right text-foreground">{b.activeStudents}</td>
                        <td className="px-4 py-2.5 text-right text-foreground">
                          {formatCurrency(b.monthlyRevenue)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-foreground">{b.retentionRate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Per-branch view ── */}
      {!loading && data && viewMode === "per-branch" && (
        <section aria-label="KPI per filială">
          <h2 className="text-lg font-semibold mb-4 text-foreground">
            Comparație filiale
            {branches.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({branches.length} {branches.length === 1 ? "filială" : "filiale"})
              </span>
            )}
          </h2>

          {branches.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-30" aria-hidden="true" />
              <p>Nu există filiale definite.</p>
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {branches.map((b) => (
                <BranchCard
                  key={b.branchId}
                  kpi={b}
                  avgStudents={avgStudents}
                  avgRevenue={avgRevenue}
                  avgRetention={avgRetention}
                />
              ))}
            </div>
          )}

          {/* Legend */}
          {branches.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <PerfBadge level="above" />
                <span className="ml-1">≥ 105% din medie</span>
              </span>
              <span className="flex items-center gap-1">
                <PerfBadge level="average" />
                <span className="ml-1">85–105%</span>
              </span>
              <span className="flex items-center gap-1">
                <PerfBadge level="below" />
                <span className="ml-1">&lt; 85%</span>
              </span>
            </div>
          )}
        </section>
      )}
    </AppShell>
  );
}
