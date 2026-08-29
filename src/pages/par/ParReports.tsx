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
import { useKeepAliveState } from "@/hooks/useKeepAliveState";
import { useBusinessSession } from "@/hooks/useBusinessSession";
import {
  Download,
  AlertCircle,
  Loader2,
  TrendingUp,
  Clock,
  FileText,
  FileDown,
  SlidersHorizontal,
  X,
  AlertTriangle,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { Link } from "@/router/HashRouter";
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
  getParReportByEvent,
  getParReportBreakdown,
  listPayers,
  listProjects,
  listDepartments,
  getParReportUrgent,
  type ParSpendByItem,
  type ParAgingItem,
  type ParCycleTimeItem,
  type ParCurrencyBreakdownItem,
  type ParUrgentReport,
  type ParReportBreakdownItem,
  type ParReportDimension,
  type ParReportFilters,
} from "@/lib/api/par";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Input,
  KpiTile,
  Label,
  Sheet,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
} from "@/components/ds";
import { cn } from "@/lib/utils";
import { downloadReportPdf } from "@/lib/parReportPdf";
import {
  STATUS_LABELS,
  EMPTY_CONFIG,
  activeFilterLabels,
  basisCents,
  configToFilters,
  loadReportConfig,
  saveReportConfig,
  CHARGE_LABELS,
  PURPOSE_LABELS,
  type ReportConfig,
  type ReportTab,
  type SpendBasis,
} from "@/lib/par/reportConfig";

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
  basis: SpendBasis;
  /** Câte rânduri arătăm; 0 = toate. Înainte erau 10 fixe, fără să scrie nicăieri. */
  topN: number;
  /** Deschide cererile din spatele unui rând. */
  onSelect: (item: ParSpendByItem) => void;
}

/**
 * Clasament orizontal, nu coloane verticale.
 *
 * Numele beneficiarilor sunt lungi („Agenția de Stat pentru Proprietatea Intelectuală"), iar pe
 * o axă verticală ajungeau rotite la 30°, tăiate la margine și imposibil de citit — jumătate din
 * card era spațiu gol, iar barele mici arătau ca niște linii. Pe orizontală, eticheta are un rând
 * întreg, cifra stă lângă ea, iar proporțiile rămân comparabile dintr-o privire.
 *
 * Fiecare rând e un buton: raportul spune „24.000 la Explor Tur SRL", clicul arată DIN CE cereri.
 */
function SpendChart({ title, items, loading, basis, topN, onSelect }: SpendChartProps) {
  const sorted = items
    .slice()
    .sort((a, b) => basisCents(b, basis) - basisCents(a, basis))
    .filter((it) => basisCents(it, basis) !== 0 || basis === "estimated");
  const shown = topN > 0 ? sorted.slice(0, topN) : sorted;
  const hidden = sorted.length - shown.length;
  const max = Math.max(1, ...shown.map((it) => basisCents(it, basis)));
  const total = sorted.reduce((sum, it) => sum + basisCents(it, basis), 0);

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="text-xs text-muted-foreground">
          {basis === "paid" ? "sume plătite efectiv" : "sume estimate"}
          {hidden > 0 ? ` · încă ${hidden} sub prag` : ""}
        </span>
      </div>
      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Se încarcă" />
        </div>
      ) : shown.length === 0 ? (
        <EmptyState compact title="Nicio înregistrare" />
      ) : (
        <ul className="flex flex-col gap-1">
          {shown.map((it, idx) => {
            const value = basisCents(it, basis);
            const share = total > 0 ? (value / total) * 100 : 0;
            return (
              <li key={it.id ?? it.label}>
                <button
                  type="button"
                  onClick={() => onSelect(it)}
                  className="group flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`${it.label} — ${formatMDL(value)}, ${it.count} cereri. Deschide cererile.`}
                >
                  <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{idx + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm text-foreground group-hover:underline" title={it.label}>
                        {it.label}
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                        {formatMDL(value)}
                      </span>
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${Math.max(2, (value / max) * 100)}%`, background: chartColor(idx) }}
                        />
                      </span>
                      <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
                        {it.count} {it.count === 1 ? "cerere" : "cereri"} · {share.toFixed(0)}%
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
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

/**
 * Cererile din spatele unui rând de raport.
 *
 * Owner: „dacă apeși pe vreun furnizor ar fi bine să se deschidă tot cartonașul, toate plățile
 * către acesta." Panoul arată totalurile lui (estimat, plătit, câte cereri) și fiecare cerere cu
 * status, dată, sumă și referința plății — fiecare rând duce la cererea întreagă.
 */
function BreakdownSheet({
  open, onClose, title, dimension, value, filters, basis,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  dimension: ParReportDimension;
  value: string | null;
  filters: ParReportFilters;
  basis: SpendBasis;
}) {
  const [items, setItems] = useState<ParReportBreakdownItem[] | null>(null);
  const [totals, setTotals] = useState<{ count: number; estimatedCents: number; paidCents: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setItems(null);
    setTotals(null);
    setFailed(false);
    getParReportBreakdown(dimension, value, filters)
      .then((r) => { if (alive) { setItems(r.items); setTotals(r.totals); } })
      .catch(() => { if (alive) { setItems([]); setFailed(true); } });
    return () => { alive = false; };
    // `filters` e recreat la fiecare randare; cheia stabilă e conținutul lui.
  }, [open, dimension, value, JSON.stringify(filters)]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Sheet open={open} onClose={onClose} title={title} description="Cererile care compun acest rând, cu aceleași filtre ca raportul" size="lg">
      {failed && (
        <Alert variant="destructive" icon={<AlertCircle className="h-4 w-4" />}>
          Lista nu a putut fi încărcată.
        </Alert>
      )}
      {items === null ? (
        <div className="flex h-24 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Se încarcă" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState compact title="Nicio cerere" description="Cu filtrele curente nu rămâne nicio cerere pentru acest rând." />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Cereri</p>
              <p className="text-lg font-semibold text-foreground">{totals?.count ?? items.length}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Estimat</p>
              <p className="text-lg font-semibold text-foreground">{formatMDL(totals?.estimatedCents ?? 0)}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Plătit efectiv</p>
              <p className={cn("text-lg font-semibold", basis === "paid" ? "text-success" : "text-foreground")}>
                {formatMDL(totals?.paidCents ?? 0)}
              </p>
            </div>
          </div>

          <ul className="flex flex-col gap-2">
            {items.map((it) => (
              <li key={it.id}>
                <Link
                  to={`/business/par/${it.id}`}
                  className="block rounded-lg border border-border p-3 no-underline hover:bg-accent hover:no-underline"
                >
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">{it.requestNo}</span>
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {formatMDL(it.estimatedCents)}
                      {it.currency !== "MDL" && (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          ({(it.nativeTotalCents / 100).toLocaleString("ro-MD", { minimumFractionDigits: 2 })} {it.currency})
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span className="rounded-full border border-border px-2 py-0.5">{STATUS_LABELS[it.status] ?? it.status}</span>
                    <span>{new Date(it.dateOfRequest).toLocaleDateString("ro-MD", { day: "2-digit", month: "short", year: "numeric" })}</span>
                    {it.projectName && <span>{it.projectName}</span>}
                    {it.requestorName && <span>{it.projectName ? "· " : ""}cerut de {it.requestorName}</span>}
                  </span>
                  {it.paidCents > 0 && (
                    <span className="mt-1 block text-xs text-success">
                      Plătit {formatMDL(it.paidCents)}
                      {it.paymentDate ? ` · ${new Date(it.paymentDate).toLocaleDateString("ro-MD", { day: "2-digit", month: "short", year: "numeric" })}` : ""}
                      {it.paymentRef ? ` · ${it.paymentRef}` : ""}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Sheet>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ParReports() {
  // Numele workspace-ului intră în antetul PDF-ului: un raport care circulă prin email trebuie
  // să spună A CUI e, altfel două organizații nu-și mai deosebesc fișierele.
  const session = useBusinessSession();
  const orgName = session.data?.tenant?.name ?? "Organizație";
  const [cfg, setCfgState] = useKeepAliveState<ReportConfig>("par.reports.cfg", loadReportConfig);
  const setCfg = (patch: Partial<ReportConfig>) =>
    setCfgState((prev) => {
      const next = { ...prev, ...patch };
      saveReportConfig(next);
      return next;
    });
  const fromDate = cfg.from;
  const toDate = cfg.to;
  const tab = cfg.tab;
  const setTab = (v: ReportTab) => setCfg({ tab: v });
  const setFromDate = (v: string) => setCfg({ from: v });
  const setToDate = (v: string) => setCfg({ to: v });

  // Listele pentru filtre — încărcate o dată, ținute minte între navigări.
  const [payerOpts, setPayerOpts] = useKeepAliveState<{ id: string; name: string }[]>("par.reports.payers", []);
  const [projectOpts, setProjectOpts] = useKeepAliveState<{ id: string; name: string }[]>("par.reports.projects", []);
  const [deptOpts, setDeptOpts] = useKeepAliveState<{ id: string; name: string }[]>("par.reports.departments", []);

  const [byBudget, setByBudget] = useKeepAliveState<ParSpendByItem[]>("par.reports.byBudget", []);
  const [byPayer, setByPayer] = useKeepAliveState<ParSpendByItem[]>("par.reports.byPayer", []);
  const [byDept, setByDept] = useKeepAliveState<ParSpendByItem[]>("par.reports.byDept", []);
  const [byProject, setByProject] = useKeepAliveState<ParSpendByItem[]>("par.reports.byProject", []);
  const [byVendor, setByVendor] = useKeepAliveState<ParSpendByItem[]>("par.reports.byVendor", []); // PARQA-019
  const [byEvent, setByEvent] = useKeepAliveState<ParSpendByItem[]>("par.reports.byEvent", []); // VM1-04
  const [byCharge, setByCharge] = useKeepAliveState<ParSpendByItem[]>("par.reports.byCharge", []);
  const [aging, setAging] = useKeepAliveState<ParAgingItem[]>("par.reports.aging", []);
  const [cycleTime, setCycleTime] = useKeepAliveState<ParCycleTimeItem | null>("par.reports.cycleTime", null);
  // VM1-03: per-currency breakdown
  const [currencyBreakdown, setCurrencyBreakdown] = useKeepAliveState<ParCurrencyBreakdownItem[]>("par.reports.currency", []);
  const [totalMdlCents, setTotalMdlCents] = useKeepAliveState("par.reports.totalMdl", 0);
  // Urgență (owner request, 2026-08-28): cine cere urgent cel mai des și de ce.
  const [urgentReport, setUrgentReport] = useKeepAliveState<ParUrgentReport | null>("par.reports.urgent", null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  /** Rândul de raport deschis („cartonașul" furnizorului), null = panou închis. */
  const [drill, setDrill] = useState<{ dimension: ParReportDimension; value: string | null; title: string } | null>(null);
  const [loadingCharts, setLoadingCharts] = useState(false);
  const [loadingAging, setLoadingAging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presetApplyKey, setPresetApplyKey] = useState(0);

  const filters = configToFilters(cfg);

  const loadCharts = async () => {
    setLoadingCharts(true);
    setError(null);
    try {
      const [payerRows, b, d, p, v, evts, ch, cb, ur] = await Promise.all([
        getParReportByPayer(filters),
        getParReportByBudget(filters),
        getParReportByDepartment(filters),
        getParReportByProject(filters),
        getParReportByVendor(filters), // PARQA-019
        getParReportByEvent(filters),
        getParReportByChargeTo(filters),
        getParReportCurrencyBreakdown(filters),
        getParReportUrgent(filters),
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
      setUrgentReport(ur.urgent ?? null);
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
        getParReportAging(filters),
        getParReportCycleTime(filters),
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
    // Listele pentru filtre: o singură dată pe sesiune (sunt mici și stabile).
    listPayers().then((r) => setPayerOpts(r.items.map((x) => ({ id: x.id, name: x.name })))).catch(() => {});
    listProjects().then((r) => setProjectOpts(r.items.map((x) => ({ id: x.id, name: x.name })))).catch(() => {});
    listDepartments().then((r) => setDeptOpts(r.items.map((x) => ({ id: x.id, name: x.name })))).catch(() => {});
  }, []); // eslint-disable-line

  useEffect(() => {
    if (presetApplyKey > 0) { loadCharts(); loadAging(); }
  }, [presetApplyKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyPreset = (preset: "month" | "quarter" | "year" | "30" | "90") => {
    const end = new Date();
    const start = new Date(end);
    if (preset === "month") start.setDate(1);
    if (preset === "quarter") { start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1); }
    if (preset === "year") { start.setMonth(0, 1); }
    if (preset === "30") start.setDate(start.getDate() - 29);
    if (preset === "90") start.setDate(start.getDate() - 89);
    setCfg({ from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) });
    setPresetApplyKey((v) => v + 1);
  };

  const handleApply = () => {
    loadCharts();
    loadAging();
  };

  // VM1-03: totalul canonic e agregatul MDL. Cu baza „plătit" raportăm banii chiar ieșiți —
  // însumați pe plătitor, fiindcă ORICE cerere are un plătitor (deci nu se pierde niciun rând).
  const totalPaid = byPayer.reduce((sum, it) => sum + (it.paidCents ?? 0), 0);
  const totalSpend = cfg.basis === "paid" ? totalPaid : totalMdlCents;
  const totalCount = currencyBreakdown.reduce((s, it) => s + it.count, 0);
  const basisLabel = cfg.basis === "paid" ? "plătit efectiv" : "estimat";

  const nameMaps = {
    payers: Object.fromEntries(payerOpts.map((o) => [o.id, o.name])),
    projects: Object.fromEntries(projectOpts.map((o) => [o.id, o.name])),
    departments: Object.fromEntries(deptOpts.map((o) => [o.id, o.name])),
  };
  const filterLabels = activeFilterLabels(cfg, nameMaps);

  const TAB_DIMENSION: Record<ReportTab, ParReportDimension> = {
    payer: "payer", budget: "budget", department: "department",
    project: "project", vendor: "vendor", event: "event", charge: "charge",
  };
  const openDrill = (item: ParSpendByItem) =>
    setDrill({ dimension: TAB_DIMENSION[cfg.tab], value: item.id, title: item.label });

  const currentSection = (() => {
    const map: Record<ReportTab, { title: string; labelHead: string; items: ParSpendByItem[] }> = {
      payer: { title: "Execuție pe plătitor / organizație", labelHead: "Plătitor", items: byPayer },
      budget: { title: "Execuție pe cod bugetar", labelHead: "Cod bugetar", items: byBudget },
      department: { title: "Cheltuieli pe departament", labelHead: "Departament", items: byDept },
      project: { title: "Cheltuieli pe proiect/program", labelHead: "Proiect", items: byProject },
      vendor: { title: "Cheltuieli pe beneficiar", labelHead: "Beneficiar", items: byVendor },
      event: { title: "Cheltuieli pe eveniment", labelHead: "Eveniment", items: byEvent },
      charge: { title: "Cheltuieli pe Charge To", labelHead: "Charge To", items: byCharge },
    };
    return map[cfg.tab];
  })();

  /** PDF-ul conține EXACT ce e pe ecran: aceleași filtre, aceeași bază, aceleași rânduri. */
  const handlePdf = async () => {
    setExportingPdf(true);
    try {
      await downloadReportPdf({
        orgName,
        periodLabel,
        filterLabels,
        basisLabel,
        totalCents: totalSpend,
        totalCount,
        cycleTime,
        currencyBreakdown,
        sections: [currentSection],
        aging,
        agingStatusLabel: (st) => STATUS_LABELS[st] ?? st,
      }, `Raport_PAR_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch {
      setError("PDF-ul nu a putut fi generat. Încearcă exportul Excel.");
    } finally {
      setExportingPdf(false);
    }
  };

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
          <Button onClick={handlePdf} disabled={exportingPdf} aria-label="Exportă PDF">
            {exportingPdf ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileDown className="h-4 w-4" aria-hidden />}
            Export PDF
          </Button>
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
          <div className="ml-auto flex items-end gap-2">
            <Button
              variant="outline"
              onClick={() => setShowFilters((v) => !v)}
              aria-expanded={showFilters}
              aria-label="Mai multe filtre"
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden />
              Filtre
              {filterLabels.length > 0 && (
                <span className="ml-1 rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                  {filterLabels.length}
                </span>
              )}
            </Button>
            <Button onClick={handleApply} disabled={loadingCharts} aria-label="Aplică filtrele">
              {loadingCharts ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Aplică
            </Button>
          </div>

          {showFilters && (
            <div className="basis-full border-t border-border pt-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="rep-payer">Plătitor</Label>
                  <select
                    id="rep-payer"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                    value={cfg.payerId}
                    onChange={(e) => setCfg({ payerId: e.target.value })}
                  >
                    <option value="">Toți plătitorii</option>
                    {payerOpts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rep-project">Proiect</Label>
                  <select
                    id="rep-project"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                    value={cfg.projectId}
                    onChange={(e) => setCfg({ projectId: e.target.value })}
                  >
                    <option value="">Toate proiectele</option>
                    {projectOpts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rep-dept">Departament</Label>
                  <select
                    id="rep-dept"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                    value={cfg.departmentId}
                    onChange={(e) => setCfg({ departmentId: e.target.value })}
                  >
                    <option value="">Toate departamentele</option>
                    {deptOpts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rep-currency">Monedă</Label>
                  <select
                    id="rep-currency"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                    value={cfg.currency}
                    onChange={(e) => setCfg({ currency: e.target.value })}
                  >
                    <option value="">Toate monedele</option>
                    {["MDL", "EUR", "USD"].map((cur) => <option key={cur} value={cur}>{cur}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rep-purpose">Scopul cererii</Label>
                  <select
                    id="rep-purpose"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                    value={cfg.purpose}
                    onChange={(e) => setCfg({ purpose: e.target.value })}
                  >
                    <option value="">Toate scopurile</option>
                    {Object.entries(PURPOSE_LABELS).map(([v, l]) => <option key={v} value={v}>{String(l)}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rep-charge">Charge To</Label>
                  <select
                    id="rep-charge"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                    value={cfg.chargeTo}
                    onChange={(e) => setCfg({ chargeTo: e.target.value })}
                  >
                    <option value="">Toate</option>
                    {Object.entries(CHARGE_LABELS).map(([v, l]) => <option key={v} value={v}>{String(l)}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rep-q">Caută (nr. cerere / beneficiar)</Label>
                  <Input id="rep-q" value={cfg.q} onChange={(e) => setCfg({ q: e.target.value })} placeholder="ex. PAR-2026 sau Orange" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rep-topn">Rânduri în grafic</Label>
                  <select
                    id="rep-topn"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                    value={String(cfg.topN)}
                    onChange={(e) => setCfg({ topN: Number(e.target.value) })}
                  >
                    <option value="10">Primele 10</option>
                    <option value="25">Primele 25</option>
                    <option value="0">Toate</option>
                  </select>
                </div>
              </div>

              <fieldset className="mt-3">
                <legend className="mb-1.5 text-xs font-medium text-muted-foreground">Statusuri incluse</legend>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(STATUS_LABELS).map(([value, label]) => {
                    const on = cfg.status.includes(value);
                    return (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setCfg({
                          status: on ? cfg.status.filter((x) => x !== value) : [...cfg.status, value],
                        })}
                        className={cn(
                          "min-h-[36px] rounded-full border px-3 text-xs font-medium transition-colors",
                          on
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Niciun status selectat = toate cererile, inclusiv ciornele și cele anulate.
                </p>
              </fieldset>
            </div>
          )}
        </Card>

        {/* Ce sumă raportăm + filtrele active, în cuvinte */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Ce sumă raportăm">
            {([["estimated", "Estimat"], ["paid", "Plătit efectiv"]] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={cfg.basis === value}
                onClick={() => setCfg({ basis: value })}
                className={cn(
                  "min-h-[36px] rounded px-3 text-xs font-medium transition-colors",
                  cfg.basis === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {filterLabels.map((label) => (
            <span key={label} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-foreground">
              {label}
            </span>
          ))}
          {(filterLabels.length > 0 || cfg.from || cfg.to) && (
            <button
              type="button"
              onClick={() => { setCfg({ ...EMPTY_CONFIG, tab: cfg.tab, basis: cfg.basis, topN: cfg.topN }); setPresetApplyKey((v) => v + 1); }}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              <X className="h-3 w-3" aria-hidden />
              Resetează filtrele
            </button>
          )}
        </div>

        {error && (
          <Alert variant="destructive" icon={<AlertCircle className="h-4 w-4" />}>{error}</Alert>
        )}

        {/* KPI cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiTile
            label={cfg.basis === "paid" ? "Total plătit efectiv (perioadă)" : "Total estimat (perioadă)"}
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
            <><SpendChart title="Execuție pe plătitor / organizație" items={byPayer} loading={loadingCharts} basis={cfg.basis} topN={cfg.topN} onSelect={openDrill} /><BudgetExecutionTable items={byPayer} /></>
          )}

          {tab === "budget" && (
            <><SpendChart title="Execuție pe cod bugetar" items={byBudget} loading={loadingCharts} basis={cfg.basis} topN={cfg.topN} onSelect={openDrill} /><BudgetExecutionTable items={byBudget} /></>
          )}
          {tab === "department" && (
            <SpendChart title="Cheltuieli pe departament" items={byDept} loading={loadingCharts} basis={cfg.basis} topN={cfg.topN} onSelect={openDrill} />
          )}
          {tab === "project" && (
            <><SpendChart title="Cheltuieli pe proiect/program" items={byProject} loading={loadingCharts} basis={cfg.basis} topN={cfg.topN} onSelect={openDrill} /><BudgetExecutionTable items={byProject} /></>
          )}
          {tab === "vendor" && (
            <SpendChart title="Cheltuieli pe beneficiar" items={byVendor} loading={loadingCharts} basis={cfg.basis} topN={cfg.topN} onSelect={openDrill} />
          )}
          {tab === "event" && (
            <><SpendChart title="Cheltuieli pe eveniment" items={byEvent} loading={loadingCharts} basis={cfg.basis} topN={cfg.topN} onSelect={openDrill} /><BudgetExecutionTable items={byEvent} /></>
          )}
          {tab === "charge" && (
            <SpendChart title="Cheltuieli pe Charge To" items={byCharge} loading={loadingCharts} basis={cfg.basis} topN={cfg.topN} onSelect={openDrill} />
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

        {/* Urgență (owner request, 2026-08-28): cine cere urgent cel mai des și de ce. */}
        {urgentReport && urgentReport.totalUrgent > 0 && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />
              Cereri urgente
            </h2>
            <p className="text-xs text-muted-foreground">
              {urgentReport.totalUrgent} {urgentReport.totalUrgent === 1 ? "cerere urgentă" : "cereri urgente"} · {periodLabel}
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="overflow-x-auto">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Cine cere cel mai des urgent
                </h3>
                <table className="w-full text-sm border-collapse" aria-label="Cine cere cel mai des urgent">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="pb-2 pr-4 font-medium">Solicitant</th>
                      <th className="pb-2 font-medium text-right">Cereri urgente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {urgentReport.byRequester.length === 0 ? (
                      <tr><td colSpan={2} className="py-3 text-center text-xs text-muted-foreground">Nicio înregistrare.</td></tr>
                    ) : urgentReport.byRequester.map((row) => (
                      <tr key={row.userId ?? row.name} className="border-b border-border/50">
                        <td className="py-2 pr-4 text-foreground">{row.name}</td>
                        <td className="py-2 text-right font-medium text-foreground">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="overflow-x-auto">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">De ce</h3>
                <table className="w-full text-sm border-collapse" aria-label="De ce sunt cererile urgente">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="pb-2 pr-4 font-medium">Motiv</th>
                      <th className="pb-2 font-medium text-right">Cereri</th>
                    </tr>
                  </thead>
                  <tbody>
                    {urgentReport.byReason.length === 0 ? (
                      <tr><td colSpan={2} className="py-3 text-center text-xs text-muted-foreground">Nicio înregistrare.</td></tr>
                    ) : urgentReport.byReason.map((row) => (
                      <tr key={row.reason} className="border-b border-border/50">
                        <td className="py-2 pr-4 text-foreground">{row.label}</td>
                        <td className="py-2 text-right font-medium text-foreground">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Aging table */}
        <AgingTable items={aging} loading={loadingAging} />

        {/* Cererile din spatele rândului pe care s-a dat click */}
        <BreakdownSheet
          open={drill !== null}
          onClose={() => setDrill(null)}
          title={drill?.title ?? ""}
          dimension={drill?.dimension ?? "vendor"}
          value={drill?.value ?? null}
          filters={filters}
          basis={cfg.basis}
        />

      </div>
    </AppShell>
  );
}

export default ParReports;
