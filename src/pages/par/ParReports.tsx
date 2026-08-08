/**
 * PAR-117 — /business/par/reports
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
  getParReportByPayer,
  getParReportByVendor,
  getParReportByChargeTo,
  getParReportAging,
  getParReportCycleTime,
  getParReportExportUrl,
  getParReportExportXlsxUrl,
  getParReportCurrencyBreakdown,
  type ParSpendByItem,
  type ParAgingItem,
  type ParCycleTimeItem,
  type ParCurrencyBreakdownItem,
} from "@/lib/api/par";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Input,
  KpiTile,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
} from "@/components/ds";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

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
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Se încarcă" />
        </div>
      ) : data.length === 0 ? (
        <EmptyState compact title="Nicio înregistrare" />
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
    </Card>
  );
}

function BudgetExecutionTable({ items }: { items: ParSpendByItem[] }) {
  if (!items.some((item) => item.allocatedCents !== undefined)) return null;
  return (
    <div className="mt-4">
      <Table aria-label="Execuție bugetară pe cod">
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Cod bugetar</TableHead>
            <TableHead scope="col" className="text-right">Alocat</TableHead>
            <TableHead scope="col" className="text-right">Angajat</TableHead>
            <TableHead scope="col" className="text-right">Plătit efectiv</TableHead>
            <TableHead scope="col" className="text-right">Disponibil</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id ?? item.label}>
              <TableCell className="font-medium text-foreground">{item.label}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMDL(item.allocatedCents ?? 0)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMDL(item.committedCents ?? 0)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMDL(item.paidCents ?? 0)}</TableCell>
              <TableCell
                className={cn(
                  "text-right font-medium tabular-nums",
                  (item.availableCents ?? 0) < 0 ? "text-destructive" : "text-foreground",
                )}
              >
                {formatMDL(item.availableCents ?? 0)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
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
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-semibold text-foreground">Vechime cereri (Aging)</h3>
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
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ParReports() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [tab, setTab] = useState<"payer" | "budget" | "department" | "project" | "vendor" | "event" | "charge">("budget");

  const [byBudget, setByBudget] = useState<ParSpendByItem[]>([]);
  const [byPayer, setByPayer] = useState<ParSpendByItem[]>([]);
  const [byDept, setByDept] = useState<ParSpendByItem[]>([]);
  const [byProject, setByProject] = useState<ParSpendByItem[]>([]);
  const [byVendor, setByVendor] = useState<ParSpendByItem[]>([]); // PARQA-019
  const [byEvent, setByEvent] = useState<ParSpendByItem[]>([]); // VM1-04
  const [byCharge, setByCharge] = useState<ParSpendByItem[]>([]);
  const [aging, setAging] = useState<ParAgingItem[]>([]);
  const [cycleTime, setCycleTime] = useState<ParCycleTimeItem | null>(null);
  // VM1-03: per-currency breakdown
  const [currencyBreakdown, setCurrencyBreakdown] = useState<ParCurrencyBreakdownItem[]>([]);
  const [totalMdlCents, setTotalMdlCents] = useState(0);
  const [loadingCharts, setLoadingCharts] = useState(false);
  const [loadingAging, setLoadingAging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presetApplyKey, setPresetApplyKey] = useState(0);

  const filters = { period_from: fromDate || undefined, period_to: toDate || undefined };

  const loadCharts = async () => {
    setLoadingCharts(true);
    setError(null);
    try {
      const qs = [
        filters.period_from ? `from=${encodeURIComponent(filters.period_from)}` : "",
        filters.period_to ? `to=${encodeURIComponent(filters.period_to)}` : "",
      ].filter(Boolean).join("&");
      const [payerRows, b, d, p, v, evts, ch, cb] = await Promise.all([
        getParReportByPayer(filters),
        getParReportByBudget(filters),
        getParReportByDepartment(filters),
        getParReportByProject(filters),
        getParReportByVendor(filters), // PARQA-019
        api<{ items: ParSpendByItem[] }>(`/api/par/reports/by-event${qs ? `?${qs}` : ""}`),
        getParReportByChargeTo(filters),
        getParReportCurrencyBreakdown(filters),
      ]);
      setByPayer(payerRows.items ?? []);
      setByBudget(b.items ?? []);
      setByDept(d.items ?? []);
      setByProject(p.items ?? []);
      setByVendor(v.items ?? []); // PARQA-019
      setByEvent(evts.items ?? []); // VM1-04
      setByCharge(ch.items ?? []);
      setCurrencyBreakdown(cb.byCurrency ?? []);
      setTotalMdlCents(cb.totalMdlCents ?? 0);
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

  useEffect(() => {
    if (presetApplyKey > 0) loadCharts();
  }, [presetApplyKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyPreset = (preset: "month" | "quarter" | "year" | "30" | "90") => {
    const end = new Date();
    const start = new Date(end);
    if (preset === "month") start.setDate(1);
    if (preset === "quarter") { start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1); }
    if (preset === "year") { start.setMonth(0, 1); }
    if (preset === "30") start.setDate(start.getDate() - 29);
    if (preset === "90") start.setDate(start.getDate() - 89);
    setFromDate(start.toISOString().slice(0, 10));
    setToDate(end.toISOString().slice(0, 10));
    setPresetApplyKey((v) => v + 1);
  };

  const handleApply = () => {
    loadCharts();
  };

  // VM1-03: use totalMdlCents (MDL aggregate from currency-breakdown) as the canonical total.
  const totalSpend = totalMdlCents;
  const totalCount = currencyBreakdown.reduce((s, it) => s + it.count, 0);

  /**
   * Every number on this page is scoped by the period filter, but nothing said so —
   * a reader comparing the report total against the request list saw a ~20% gap and
   * no explanation. Spell the window out next to the figure.
   */
  const periodLabel = (() => {
    const fmt = (d: string) => new Date(d).toLocaleDateString("ro-MD", { day: "2-digit", month: "short", year: "numeric" });
    if (fromDate && toDate) return `${fmt(fromDate)} – ${fmt(toDate)}`;
    if (fromDate) return `din ${fmt(fromDate)}`;
    if (toDate) return `până la ${fmt(toDate)}`;
    return "toate perioadele";
  })();

  const exportUrl = getParReportExportUrl(filters);
  const exportXlsxUrl = getParReportExportXlsxUrl(filters);

  return (
    <AppShell
      pageTitle="Rapoarte PAR"
      pageDescription={`Statistici pe perioadă, departament și cod bugetar · ${periodLabel}`}
      actions={
        <>
          {/* Native <a download> — these are file downloads, not navigations. */}
          <a
            href={exportXlsxUrl}
            download="par-export.xlsx"
            className="inline-flex h-10 max-sm:h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground no-underline transition-colors hover:bg-primary/90 hover:no-underline"
            aria-label="Exportă Excel"
          >
            <Download className="h-4 w-4" aria-hidden />
            Export Excel
          </a>
          <a
            href={exportUrl}
            download="par-export.csv"
            className="inline-flex h-10 max-sm:h-11 items-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground no-underline transition-colors hover:bg-accent/10 hover:no-underline"
            aria-label="Exportă CSV"
          >
            <Download className="h-4 w-4" aria-hidden />
            Export CSV
          </a>
        </>
      }
    >
      <div className="space-y-6">

        {/* Period filter */}
        <Card className="flex flex-wrap items-end gap-3 p-4">
          <div className="flex basis-full flex-wrap gap-1.5" aria-label="Perioade prestabilite">
            {([['month', 'Luna curentă'], ['quarter', 'Trimestrul curent'], ['year', 'Anul curent'], ['30', 'Ultimele 30 zile'], ['90', 'Ultimele 90 zile']] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => applyPreset(key)}
                className="min-h-[44px] rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted sm:min-h-0"
              >
                {label}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="par-report-from">De la</Label>
            <Input
              id="par-report-from"
              className="w-auto"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="par-report-to">Până la</Label>
            <Input
              id="par-report-to"
              className="w-auto"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
          <Button onClick={handleApply} disabled={loadingCharts} aria-label="Aplică filtrele">
            {loadingCharts ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Aplică
          </Button>
        </Card>

        {error && (
          <Alert variant="destructive" icon={<AlertCircle className="h-4 w-4" />}>{error}</Alert>
        )}

        {/* KPI cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiTile
            label="Total estimat (perioadă)"
            value={formatMDL(totalSpend)}
            tone="indigo"
            icon={<FileText className="h-5 w-5" />}
            hint={`${totalCount} cereri · ${periodLabel}`}
          />
          <KpiTile
            label="Timp mediu submit→aprobare"
            value={fmtDays(cycleTime?.avgSubmitToApprovedDays)}
            tone="amber"
            icon={<Clock className="h-5 w-5" />}
          />
          <KpiTile
            label="Timp mediu submit→plată"
            value={fmtDays(cycleTime?.avgSubmitToPaidDays)}
            tone="emerald"
            icon={<TrendingUp className="h-5 w-5" />}
          />
        </div>

        {/* Spend charts — tab selector */}
        <div>
          <Tabs
            className="mb-4 flex-wrap"
            aria-label="Cheltuieli per categorie"
            value={tab}
            onChange={(v) => setTab(v as typeof tab)}
            tabs={[
              { value: "payer", label: "Plătitor" },
              { value: "budget", label: "Cod bugetar" },
              { value: "department", label: "Departament" },
              { value: "project", label: "Proiect" },
              { value: "vendor", label: "Beneficiar" },
              { value: "event", label: "Eveniment" },
              { value: "charge", label: "Charge To" },
            ]}
          />

          {tab === "payer" && (
            <><SpendChart title="Execuție pe plătitor / organizație" items={byPayer} loading={loadingCharts} /><BudgetExecutionTable items={byPayer} /></>
          )}

          {tab === "budget" && (
            <><SpendChart title="Execuție pe cod bugetar" items={byBudget} loading={loadingCharts} /><BudgetExecutionTable items={byBudget} /></>
          )}
          {tab === "department" && (
            <SpendChart title="Cheltuieli pe departament" items={byDept} loading={loadingCharts} />
          )}
          {tab === "project" && (
            <><SpendChart title="Cheltuieli pe proiect/program" items={byProject} loading={loadingCharts} /><BudgetExecutionTable items={byProject} /></>
          )}
          {tab === "vendor" && (
            <SpendChart title="Cheltuieli pe beneficiar" items={byVendor} loading={loadingCharts} />
          )}
          {tab === "event" && (
            <><SpendChart title="Cheltuieli pe eveniment" items={byEvent} loading={loadingCharts} /><BudgetExecutionTable items={byEvent} /></>
          )}
          {tab === "charge" && (
            <SpendChart title="Cheltuieli pe Charge To" items={byCharge} loading={loadingCharts} />
          )}
        </div>

        {/* VM1-03: Currency breakdown — per-currency native totals */}
        {currencyBreakdown.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Defalcare pe valute</h2>
            <p className="text-xs text-muted-foreground">
              Totalul MDL agregat include cereri în valute mixte, convertite la cursul BNM înghețat la trimitere.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="pb-2 pr-4 font-medium">Valuta</th>
                    <th className="pb-2 pr-4 font-medium text-right">Total nativ</th>
                    <th className="pb-2 pr-4 font-medium text-right">Echiv. MDL</th>
                    <th className="pb-2 font-medium text-right">Cereri</th>
                  </tr>
                </thead>
                <tbody>
                  {currencyBreakdown.map((row) => (
                    <tr key={row.currency} className="border-b border-border/50">
                      <td className="py-2 pr-4 font-medium text-foreground">{row.currency}</td>
                      <td className="py-2 pr-4 text-right text-foreground">
                        {(row.nativeTotalCents / 100).toLocaleString("ro-MD", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })} {row.currency}
                      </td>
                      <td className="py-2 pr-4 text-right text-foreground">{formatMDL(row.mdlTotalCents)}</td>
                      <td className="py-2 text-right text-muted-foreground">{row.count}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border font-semibold">
                    <td className="pt-2 pr-4 text-foreground">Total MDL</td>
                    <td className="pt-2 pr-4 text-right text-muted-foreground">—</td>
                    <td className="pt-2 pr-4 text-right text-foreground">{formatMDL(totalMdlCents)}</td>
                    <td className="pt-2 text-right text-muted-foreground">
                      {currencyBreakdown.reduce((s, r) => s + r.count, 0)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Aging table */}
        <AgingTable items={aging} loading={loadingAging} />

      </div>
    </AppShell>
  );
}

export default ParReports;
