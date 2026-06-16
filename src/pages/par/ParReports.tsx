/**
 * PAR-117 — /app/par/reports
 *
 * Management reporting dashboard: spend aggregations + aging + cycle time + CSV export.
 * Uses recharts for bar charts (same chart lib used throughout the repo).
 * Role guard: approver | finance | par_admin (no "manager" — CORE §1).
 * Integer minor units; tenant-scoped; period filter.
 *
 * CORE: backlog/par/PAR-CORE.md §8
 * Design: Vector 365, light+dark, WCAG AA.
 */
import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import {
  BarChart2,
  Download,
  AlertCircle,
  Loader2,
  TrendingUp,
  Clock,
  FileText,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import {
  formatMDL,
  getParReportByBudget,
  getParReportByDepartment,
  getParReportByProject,
  getParReportByChargeTo,
  getParReportAging,
  getParReportCycleTime,
  getParReportExportUrl,
  getParReportExportXlsxUrl,
  type ParSpendByItem,
  type ParAgingItem,
  type ParCycleTimeItem,
} from "@/lib/api/par";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDays(days: number | null | undefined): string {
  if (days == null) return "—";
  return `${days.toFixed(1)} zile`;
}

// Chart colors using Tailwind palette (CSS variables for dark mode safety)
const CHART_COLORS = [
  "hsl(var(--chart-1, 217 91% 60%))",
  "hsl(var(--chart-2, 160 84% 39%))",
  "hsl(var(--chart-3, 30 80% 55%))",
  "hsl(var(--chart-4, 280 65% 60%))",
  "hsl(var(--chart-5, 340 75% 55%))",
];

function chartColor(idx: number): string {
  return CHART_COLORS[idx % CHART_COLORS.length];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  sub?: string;
}

function StatCard({ label, value, icon, sub }: StatCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 flex items-start gap-3">
      <div className="p-2 rounded-md bg-primary/10 text-primary flex-shrink-0">{icon}</div>
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
        <p className="text-lg font-bold text-foreground">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

interface SpendChartProps {
  title: string;
  items: ParSpendByItem[];
  loading: boolean;
}

function SpendChart({ title, items, loading }: SpendChartProps) {
  const data = items
    .slice(0, 10)
    .sort((a, b) => b.totalCents - a.totalCents)
    .map((it) => ({
      name: it.label ?? "—",
      totalMDL: it.totalCents / 100,
      count: it.count,
    }));

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground mb-3">{title}</h3>
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Se încarcă" />
        </div>
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Nicio înregistrare.</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              angle={-30}
              textAnchor="end"
              interval={0}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${(v as number / 1000).toFixed(0)}k`}
            />
            <Tooltip
              formatter={(val: unknown) => [formatMDL(Math.round((val as number) * 100)), "Total estimat"]}
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid hsl(var(--border))",
                background: "hsl(var(--popover))",
                color: "hsl(var(--popover-foreground))",
              }}
            />
            <Bar dataKey="totalMDL" radius={[4, 4, 0, 0]}>
              {data.map((_, idx) => (
                <Cell key={idx} fill={chartColor(idx)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

interface AgingTableProps {
  items: ParAgingItem[];
  loading: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Ciornă",
  pending_approval: "În aprobare",
  changes_requested: "Modificări",
  rejected: "Respinsă",
  approved: "Aprobată",
  in_finance: "La finanțe",
  reapproval_required: "Re-aprobare",
  paid: "Plătită",
  cancelled: "Anulată",
};

function AgingTable({ items, loading }: AgingTableProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground mb-3">Vechime cereri (Aging)</h3>
      {loading ? (
        <div className="flex items-center justify-center h-20">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Se încarcă" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Aging PAR">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-3 text-xs font-semibold text-muted-foreground">Status</th>
                <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">Nr.</th>
                <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">Total estimat</th>
                <th className="text-right py-2 pl-3 text-xs font-semibold text-muted-foreground">Vârstă medie</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-sm text-muted-foreground">Nicio înregistrare.</td>
                </tr>
              )}
              {items.map((it) => (
                <tr key={it.status} className="border-t border-border">
                  <td className="py-2 pr-3 text-foreground">{STATUS_LABELS[it.status] ?? it.status}</td>
                  <td className="py-2 px-3 text-right font-medium text-foreground">{it.count}</td>
                  <td className="py-2 px-3 text-right text-foreground">{formatMDL(it.totalCents)}</td>
                  <td className="py-2 pl-3 text-right text-muted-foreground">{fmtDays(it.avgAgingDays)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ParReports() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [tab, setTab] = useState<"budget" | "department" | "project" | "charge">("budget");

  const [byBudget, setByBudget] = useState<ParSpendByItem[]>([]);
  const [byDept, setByDept] = useState<ParSpendByItem[]>([]);
  const [byProject, setByProject] = useState<ParSpendByItem[]>([]);
  const [byCharge, setByCharge] = useState<ParSpendByItem[]>([]);
  const [aging, setAging] = useState<ParAgingItem[]>([]);
  const [cycleTime, setCycleTime] = useState<ParCycleTimeItem | null>(null);
  const [loadingCharts, setLoadingCharts] = useState(false);
  const [loadingAging, setLoadingAging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filters = { period_from: fromDate || undefined, period_to: toDate || undefined };

  const loadCharts = async () => {
    setLoadingCharts(true);
    setError(null);
    try {
      const [b, d, p, ch] = await Promise.all([
        getParReportByBudget(filters),
        getParReportByDepartment(filters),
        getParReportByProject(filters),
        getParReportByChargeTo(filters),
      ]);
      setByBudget(b.items ?? []);
      setByDept(d.items ?? []);
      setByProject(p.items ?? []);
      setByCharge(ch.items ?? []);
    } catch {
      setError("Eroare la încărcarea rapoartelor");
    } finally {
      setLoadingCharts(false);
    }
  };

  const loadAging = async () => {
    setLoadingAging(true);
    try {
      const [a, ct] = await Promise.all([
        getParReportAging(),
        getParReportCycleTime(),
      ]);
      setAging(a.items ?? []);
      setCycleTime(ct);
    } catch {
      // Non-blocking
    } finally {
      setLoadingAging(false);
    }
  };

  useEffect(() => {
    loadCharts();
    loadAging();
  }, []); // eslint-disable-line

  const handleApply = () => {
    loadCharts();
  };

  const totalSpend = byBudget.reduce((s, it) => s + it.totalCents, 0);
  const totalCount = byBudget.reduce((s, it) => s + it.count, 0);

  const exportUrl = getParReportExportUrl(filters);
  const exportXlsxUrl = getParReportExportXlsxUrl(filters);

  return (
    <AppShell pageTitle="Rapoarte PAR">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <BarChart2 className="h-5 w-5 text-primary flex-shrink-0" aria-hidden />
            <h1 className="text-xl font-bold text-foreground">Rapoarte PAR</h1>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={exportXlsxUrl}
              download="par-export.xlsx"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors min-h-[44px]"
              aria-label="Exportă Excel"
            >
              <Download className="h-4 w-4" aria-hidden />
              Export Excel
            </a>
            <a
              href={exportUrl}
              download="par-export.csv"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors min-h-[44px]"
              aria-label="Exportă CSV"
            >
              <Download className="h-4 w-4" aria-hidden />
              Export CSV
            </a>
          </div>
        </div>

        {/* Period filter */}
        <div className="flex flex-wrap items-end gap-3 p-4 rounded-lg border border-border bg-card">
          <div>
            <label htmlFor="par-report-from" className="text-xs font-medium text-muted-foreground block mb-1">De la</label>
            <input
              id="par-report-from"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-md border border-border bg-background text-sm px-3 py-2 min-h-[40px]"
              aria-label="Data de la"
            />
          </div>
          <div>
            <label htmlFor="par-report-to" className="text-xs font-medium text-muted-foreground block mb-1">Până la</label>
            <input
              id="par-report-to"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-md border border-border bg-background text-sm px-3 py-2 min-h-[40px]"
              aria-label="Data până la"
            />
          </div>
          <button
            type="button"
            onClick={handleApply}
            disabled={loadingCharts}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 min-h-[44px]"
            aria-label="Aplică filtrele"
          >
            {loadingCharts ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Aplică
          </button>
        </div>

        {error && (
          <div role="alert" className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        )}

        {/* KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label="Total estimat (perioadă)"
            value={formatMDL(totalSpend)}
            icon={<FileText className="h-4 w-4" />}
            sub={`${totalCount} cereri`}
          />
          <StatCard
            label="Timp mediu submit→aprobare"
            value={fmtDays(cycleTime?.avgSubmitToApprovedDays)}
            icon={<Clock className="h-4 w-4" />}
          />
          <StatCard
            label="Timp mediu submit→plată"
            value={fmtDays(cycleTime?.avgSubmitToPaidDays)}
            icon={<TrendingUp className="h-4 w-4" />}
          />
        </div>

        {/* Spend charts — tab selector */}
        <div>
          <div className="flex flex-wrap gap-1 mb-4" role="tablist" aria-label="Cheltuieli per categorie">
            {[
              { id: "budget" as const, label: "Cod bugetar" },
              { id: "department" as const, label: "Departament" },
              { id: "project" as const, label: "Proiect" },
              { id: "charge" as const, label: "Charge To" },
            ].map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={[
                  "px-3 py-1.5 rounded-full text-sm font-medium transition-colors min-h-[36px]",
                  tab === t.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "budget" && (
            <SpendChart title="Cheltuieli pe cod bugetar" items={byBudget} loading={loadingCharts} />
          )}
          {tab === "department" && (
            <SpendChart title="Cheltuieli pe departament" items={byDept} loading={loadingCharts} />
          )}
          {tab === "project" && (
            <SpendChart title="Cheltuieli pe proiect/program" items={byProject} loading={loadingCharts} />
          )}
          {tab === "charge" && (
            <SpendChart title="Cheltuieli pe Charge To" items={byCharge} loading={loadingCharts} />
          )}
        </div>

        {/* Aging table */}
        <AgingTable items={aging} loading={loadingAging} />

      </div>
    </AppShell>
  );
}

export default ParReports;
