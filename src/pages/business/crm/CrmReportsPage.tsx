/**
 * CRM-G02 — Rapoarte de vânzări, refăcute ca raportul unui CRM adevărat.
 *
 * Ownerul: „rapoartele sunt proaste". Ecranul vechi era un zid de 14 plăcuțe cu cifre de
 * activitate, un grafic cu două axe și o „conversie" care lega etapele a patru pâlnii diferite.
 * Nu răspundea la întrebările cu care un manager deschide rapoartele. Noua ordine urmează exact
 * acele întrebări, de sus în jos:
 *
 *   1. Cum stăm față de perioada trecută?  → plăcuțe cu variație; click pe una = graficul ei
 *   2. Câștigăm sau pierdem?                → câștigate față de pierdute, în timp
 *   3. Unde se opresc afacerile?            → pâlnia: au ajuns / trec mai departe / zile în etapă
 *   4. Ce afaceri mor în tăcere?            → cele neatinse de peste 14 zile, cu link la fișă
 *   5. De unde vin clienții buni?           → sursele, cu rata de câștig
 *   6. De ce pierdem? Cine vinde?           → motive; clasamentul echipei
 *   7. Cât s-a muncit?                      → activitatea, cu norma și perioada precedentă
 *
 * Toată agregarea e pe server (o cerere); aici e doar afișarea. Exportul Excel/PDF poartă
 * aceleași cifre ca ecranul.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, BarChart3, Download, FileText, Loader2, Target } from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { KpiTargetsDialog } from "@/components/crm/KpiTargetsDialog";
import { Alert, Button, Card, DateField, EmptyState, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ds";
import { TrendChart, WonLostChart, type TrendPoint, type TrendSize } from "@/components/crm/ReportsCharts";
import { crmSourceLabel } from "@/components/crm/constants";
import { formatCentsShort } from "@/components/crm/format";
import { downloadCrmReportPdf } from "@/lib/crmReportPdf";
import { pipelineHref } from "@/lib/crm/pipelineUrl";
import { useBusinessSession } from "@/hooks/useBusinessSession";
import { Link } from "@/router/HashRouter";
import { cn } from "@/lib/utils";
import {
  getCrmReports,
  presetRange,
  CRM_PERIOD_LABELS,
  type CrmPeriodPreset,
  type CrmReportsResponse,
  type CrmSalesKpis,
  type CrmTimelineBucket,
} from "@/lib/api/crmReports";

// ─── Formatare ────────────────────────────────────────────────────────────────

/** Bani fără zecimale, cu moneda: „48.000 MDL". Zecimalele nu spun nimic într-un raport. */
const money = (cents: number | null | undefined) => (cents == null ? "—" : formatCentsShort(cents));
const pct = (v: number | null | undefined) => (v == null ? "—" : `${v}%`);
const days = (v: number | null | undefined) => (v == null || v === 0 ? "—" : `${v.toLocaleString("ro-MD")} zile`);

/** CSV corect pentru Excel în română: `;` + BOM, câmpurile cu separator între ghilimele. */
function toCsv(rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(esc).join(";")).join("\r\n");
}

function downloadCsv(name: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Metricile de sus (plăcuțe + graficul lor) ───────────────────────────────

type MetricKey = "sales" | "won" | "winRate" | "avgDeal" | "newLeads" | "cycle";

interface MetricDef {
  key: MetricKey;
  label: string;
  format: (v: number | null) => string;
  /** Mai mic e mai bine (durata ciclului). Inversează culoarea variației. */
  lowerIsBetter?: boolean;
  /** Variația în puncte procentuale, nu în procente (pentru rate). */
  points?: boolean;
  /** Seria pe intervale; lipsă = metrica nu are grafic (durata ciclului). */
  series?: (b: CrmTimelineBucket) => number | null;
}

const METRICS: MetricDef[] = [
  { key: "sales", label: "Vânzări", format: (v) => money(v), series: (b) => b.salesValueCents },
  { key: "won", label: "Afaceri câștigate", format: (v) => (v == null ? "—" : String(v)), series: (b) => b.contractsSigned },
  {
    key: "winRate",
    label: "Rata de câștig",
    format: (v) => pct(v),
    points: true,
    series: (b) => {
      const decided = b.contractsSigned + (b.lostCount ?? 0);
      return decided ? Math.round((b.contractsSigned / decided) * 100) : null;
    },
  },
  {
    key: "avgDeal",
    label: "Valoare medie",
    format: (v) => money(v),
    series: (b) => (b.contractsSigned ? Math.round(b.salesValueCents / b.contractsSigned) : null),
  },
  { key: "newLeads", label: "Leaduri noi", format: (v) => (v == null ? "—" : String(v)), series: (b) => b.leadsCreated },
  { key: "cycle", label: "Ciclu mediu", format: (v) => days(v), lowerIsBetter: true },
];

function metricValues(data: CrmReportsResponse, key: MetricKey): { cur: number | null; prev: number | null } {
  const o = data.outcomes;
  const p = data.previous?.outcomes;
  switch (key) {
    case "sales":
      return { cur: o?.wonValueCents ?? data.kpis.salesValueCents, prev: p?.wonValueCents ?? null };
    case "won":
      return { cur: o?.wonCount ?? data.kpis.contractsSigned, prev: p?.wonCount ?? null };
    case "winRate":
      return { cur: o?.winRatePct ?? null, prev: p?.winRatePct ?? null };
    case "avgDeal":
      return { cur: o?.avgDealCents ?? null, prev: p?.avgDealCents ?? null };
    case "newLeads":
      return { cur: o?.newLeads ?? data.kpis.leadsAllocated, prev: p?.newLeads ?? null };
    case "cycle":
      return { cur: data.cycleDays || null, prev: data.previous ? data.previous.cycleDays || null : null };
  }
}

/** Variația față de perioada precedentă, cum o scrie Analytics: „↑ 12%" / „↓ 3 pp". */
function delta(def: MetricDef, cur: number | null, prev: number | null): { text: string; good: boolean | null } | null {
  if (cur == null || prev == null) return null;
  if (def.points) {
    const d = cur - prev;
    if (d === 0) return { text: "0 pp", good: null };
    return { text: `${Math.abs(d)} pp`, good: def.lowerIsBetter ? d < 0 : d > 0 };
  }
  if (prev === 0) return cur === 0 ? { text: "0%", good: null } : { text: "nou", good: !def.lowerIsBetter };
  const d = Math.round(((cur - prev) / prev) * 100);
  if (d === 0) return { text: "0%", good: null };
  return { text: `${Math.abs(d)}%`, good: def.lowerIsBetter ? d < 0 : d > 0 };
}

// ─── Intervalele graficului ──────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Toate intervalele perioadei, și cele fără nicio mișcare. Serverul întoarce doar zilele cu
 * evenimente; un grafic care sare peste zilele goale arată o linie continuă de la marți la
 * vineri, adică minte despre ce s-a întâmplat miercuri și joi.
 */
function allBuckets(from: string | null, to: string | null, size: TrendSize, present: string[]): string[] {
  if (!from) return [...present].sort();
  const start = new Date(from);
  const end = to ? new Date(to) : new Date();
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  if (size === "week") cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));
  if (size === "month") cursor.setDate(1);
  const out: string[] = [];
  for (let guard = 0; cursor < end && guard < 400; guard++) {
    out.push(ymd(cursor));
    if (size === "day") cursor.setDate(cursor.getDate() + 1);
    else if (size === "week") cursor.setDate(cursor.getDate() + 7);
    else cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
}

// ─── Pagina ───────────────────────────────────────────────────────────────────

const ACTIVITY_ROWS: { key: keyof CrmSalesKpis; label: string; money?: boolean }[] = [
  { key: "leadsAllocated", label: "Leaduri alocate" },
  { key: "callsMade", label: "Apeluri efectuate" },
  { key: "successfulContacts", label: "Contacte reușite" },
  { key: "meetings", label: "Întâlniri" },
  { key: "offersSent", label: "Oferte trimise" },
  { key: "contractsSigned", label: "Contracte semnate" },
  { key: "salesValueCents", label: "Valoare vânzări", money: true },
  { key: "tasksDone", label: "Taskuri finalizate" },
  { key: "tasksOverdue", label: "Taskuri restante" },
];

export function CrmReportsPage() {
  const [preset, setPreset] = useState<CrmPeriodPreset>("thisMonth");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [owner, setOwner] = useState<string>("all");
  /** `null` = pâlnia implicită (o alege serverul); `"all"` = toată baza. */
  const [pipeline, setPipeline] = useState<string | null>(null);
  const [metric, setMetric] = useState<MetricKey>("sales");
  const [exporting, setExporting] = useState(false);
  const [targetsOpen, setTargetsOpen] = useState(false);
  const { data: session } = useBusinessSession();
  const [data, setData] = useState<CrmReportsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => {
    if (preset !== "custom") return presetRange(preset);
    // Intervalul e semi-deschis [from, to): ziua „până la" se include mutând limita la miezul
    // nopții următoare, altfel ultima zi aleasă ar lipsi din raport.
    const from = customFrom ? new Date(`${customFrom}T00:00:00`).toISOString() : null;
    const to = customTo ? new Date(`${customTo}T00:00:00`) : null;
    if (to) to.setDate(to.getDate() + 1);
    return { from, to: to ? to.toISOString() : null };
  }, [preset, customFrom, customTo]);

  const periodLabel = useMemo(() => {
    if (preset === "all") return "toate perioadele";
    if (preset !== "custom") return CRM_PERIOD_LABELS[preset].toLowerCase();
    if (!customFrom && !customTo) return "toate perioadele";
    const fmt = (v: string) => new Date(`${v}T00:00:00`).toLocaleDateString("ro-MD", { day: "2-digit", month: "long", year: "numeric" });
    if (customFrom && customTo) return `${fmt(customFrom)} – ${fmt(customTo)}`;
    return customFrom ? `din ${fmt(customFrom)}` : `până la ${fmt(customTo)}`;
  }, [preset, customFrom, customTo]);

  const ownerLabel = useMemo(() => {
    if (owner === "all") return "toată echipa";
    return data?.owners.find((o) => o.id === owner)?.name ?? "agent";
  }, [owner, data]);

  const pipelineLabel = useMemo(() => {
    if (!data) return "";
    if (data.pipelineId == null && data.pipelines) return "toate pâlniile";
    return data.pipelines?.find((p) => p.id === data.pipelineId)?.name ?? "";
  }, [data]);

  const ownerName = useCallback(
    (id: string | null) => (id ? data?.owners.find((o) => o.id === id)?.name ?? "—" : "Nerepartizat"),
    [data]
  );
  const stageLabel = useCallback((key: string) => data?.stages.find((s) => s.key === key)?.label ?? key, [data]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getCrmReports({
        from: range.from,
        to: range.to,
        owner: owner === "all" ? null : owner,
        pipelineId: pipeline,
      });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nu am putut încărca rapoartele.");
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, owner, pipeline]);

  useEffect(() => {
    void load();
  }, [load]);

  const size: TrendSize = data?.bucketSize ?? "day";
  const activeMetric = METRICS.find((m) => m.key === metric) ?? METRICS[0];

  /** Punctele graficului: toate intervalele, cu perioada precedentă aliniată pe poziție. */
  const trend = useMemo((): { points: TrendPoint[]; hasPrevious: boolean } => {
    if (!data || !activeMetric.series) return { points: [], hasPrevious: false };
    const series = activeMetric.series;
    const tl = data.timeline ?? [];
    const byKey = new Map(tl.map((b) => [b.bucket, b]));
    const keys = allBuckets(data.range.from, data.range.to, size, tl.map((b) => b.bucket));
    const prevTl = data.previousTimeline ?? [];
    const prevByKey = new Map(prevTl.map((b) => [b.bucket, b]));
    const prevKeys = data.previous ? allBuckets(data.previous.range.from, data.previous.range.to, size, []) : [];
    // Rata de câștig pe perioada precedentă ar cere pierderile ei pe intervale — nu le avem, deci
    // nu desenăm o linie falsă de 100%.
    const hasPrevious = prevKeys.length > 0 && metric !== "winRate";
    const empty: CrmTimelineBucket = { bucket: "", leadsCreated: 0, offersSent: 0, contractsSigned: 0, salesValueCents: 0, lostCount: 0 };
    const toUnits = (v: number | null) => (v == null ? null : metric === "sales" || metric === "avgDeal" ? v / 100 : v);
    const points = keys.map((k, i) => {
      const prevKey = prevKeys[i];
      return {
        bucket: k,
        value: toUnits(series(byKey.get(k) ?? { ...empty, bucket: k })),
        previous: hasPrevious && prevKey ? toUnits(series(prevByKey.get(prevKey) ?? { ...empty, bucket: prevKey })) : null,
      };
    });
    return { points, hasPrevious };
  }, [data, activeMetric, metric, size]);

  const wonLost = useMemo(() => {
    if (!data) return [];
    const tl = data.timeline ?? [];
    const byKey = new Map(tl.map((b) => [b.bucket, b]));
    return allBuckets(data.range.from, data.range.to, size, tl.map((b) => b.bucket)).map((k) => ({
      bucket: k,
      won: byKey.get(k)?.contractsSigned ?? 0,
      lost: byKey.get(k)?.lostCount ?? 0,
    }));
  }, [data, size]);

  /** Echipa: rezultatele (clasament) + activitatea, într-un singur rând per agent. */
  const team = useMemo(() => {
    if (!data) return [];
    const activity = new Map(data.perOwner.map((o) => [o.ownerKey, o]));
    return (data.leaderboard ?? [])
      .map((r) => ({ ...r, name: ownerName(r.ownerKey), calls: activity.get(r.ownerKey)?.callsMade ?? 0, meetings: activity.get(r.ownerKey)?.meetings ?? 0 }))
      // Un om fără nicio afacere și niciun apel în perioadă nu e „ultimul în clasament" — nu vinde
      // deloc (contabilul, directorul). Rândul lui e zgomot.
      .filter((r) => r.wonCount + r.lostCount + r.openCount + r.calls + r.meetings > 0)
      .sort((a, b) => b.wonValueCents - a.wonValueCents || b.wonCount - a.wonCount);
  }, [data, ownerName]);

  const velocityByKey = useMemo(() => new Map((data?.velocity ?? []).map((v) => [v.key, v])), [data]);
  const funnelRows = useMemo(() => (data?.funnel ?? []).filter((r) => !r.isLost), [data]);
  const openTotals = useMemo(() => {
    const open = funnelRows.filter((r) => !r.isWon);
    return {
      value: open.reduce((n, r) => n + r.currentValueCents, 0),
      weighted: open.reduce((n, r) => n + r.weightedValueCents, 0),
      count: open.reduce((n, r) => n + r.currentCount, 0),
    };
  }, [funnelRows]);

  // ─── Export ────────────────────────────────────────────────────────────────

  function summaryRows(d: CrmReportsResponse): (string | number)[][] {
    return METRICS.map((m) => {
      const { cur, prev } = metricValues(d, m.key);
      return [m.label, m.format(cur), d.previous ? m.format(prev) : "—"];
    });
  }

  function exportCsv() {
    if (!data) return;
    const rows: (string | number)[][] = [["Indicator", "Perioada", "Perioada precedentă"], ...summaryRows(data)];
    rows.push([], ["Activitate", "Perioada", "Perioada precedentă", "Normă"]);
    for (const a of ACTIVITY_ROWS) {
      const att = data.attainment?.[a.key];
      const fmt = (v: number | undefined) => (v == null ? "—" : a.money ? money(v) : v);
      rows.push([a.label, fmt(data.kpis[a.key]), fmt(data.previous?.kpis[a.key]), att ? `${att.target} (${att.pct}%)` : "—"]);
    }
    if (funnelRows.length) {
      rows.push([], ["Etapă", "Acum", "Valoare", "Ponderat", "Au ajuns", "Trec mai departe", "Zile în etapă"]);
      for (const r of funnelRows) {
        rows.push([r.label, r.currentCount, money(r.currentValueCents), money(r.weightedValueCents), r.reached, r.isWon ? "—" : `${r.conversionPct}%`, velocityByKey.get(r.key)?.avgDays ?? "—"]);
      }
    }
    rows.push([], ["Sursă", "Leaduri", "Câștigate", "Rată", "Valoare câștigată"]);
    for (const s of data.sources ?? []) rows.push([crmSourceLabel(s.source), s.leads, s.won, pct(s.winRatePct), money(s.wonValueCents)]);
    rows.push([], ["Agent", "Câștigate", "Valoare", "Rată", "Valoare medie", "Deschise", "Apeluri", "Întâlniri"]);
    for (const t of team) rows.push([t.name, t.wonCount, money(t.wonValueCents), pct(t.winRatePct), money(t.avgDealCents), t.openCount, t.calls, t.meetings]);
    rows.push([], ["Motiv pierdere", "Număr", "Procent", "Valoare pierdută"]);
    for (const r of data.lostReasons) rows.push([r.reason, r.count, `${r.pct}%`, money(r.valueCents)]);
    rows.push([], ["Afacere în stagnare", "Etapă", "Valoare", "Zile fără activitate", "Responsabil"]);
    for (const s of data.aging?.stale ?? []) rows.push([s.title, stageLabel(s.stage), money(s.valueCents), s.daysIdle, ownerName(s.assignedTo)]);
    rows.push([], ["Produs", "Total", "Câștigate", "Pierdute", "Rată", "Valoare"]);
    for (const p of data.perProduct) rows.push([p.product, p.total, p.won, p.lost, `${p.winRatePct}%`, money(p.valueCents)]);
    downloadCsv(`rapoarte-crm-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
  }

  async function exportPdf() {
    if (!data) return;
    setExporting(true);
    try {
      await downloadCrmReportPdf(
        {
          orgName: session?.tenant.name ?? "Workspace",
          periodLabel,
          ownerLabel: pipelineLabel ? `${ownerLabel} · pâlnia ${pipelineLabel}` : ownerLabel,
          kpis: [
            ...METRICS.filter((m) => m.key !== "cycle").map((m) => ({ label: m.label, value: m.format(metricValues(data, m.key).cur) })),
            ...ACTIVITY_ROWS.map((a) => ({ label: a.label, value: a.money ? money(data.kpis[a.key]) : String(data.kpis[a.key]) })),
          ],
          cycleLabel: days(data.cycleDays),
          tables: [
            {
              title: "Pâlnia",
              head: ["Etapă", "Acum", "Valoare", "Au ajuns", "Trec mai departe", "Zile în etapă"],
              rows: funnelRows.map((r) => [r.label, r.currentCount, money(r.currentValueCents), r.reached, r.isWon ? "—" : `${r.conversionPct}%`, velocityByKey.get(r.key)?.avgDays ?? "—"]),
            },
            {
              title: "Surse",
              head: ["Sursă", "Leaduri", "Câștigate", "Rată", "Valoare câștigată"],
              rows: (data.sources ?? []).map((s) => [crmSourceLabel(s.source), s.leads, s.won, pct(s.winRatePct), money(s.wonValueCents)]),
            },
            {
              title: "Echipa",
              head: ["Agent", "Câștigate", "Valoare", "Rată", "Deschise", "Apeluri"],
              rows: team.map((t) => [t.name, t.wonCount, money(t.wonValueCents), pct(t.winRatePct), t.openCount, t.calls]),
            },
            {
              title: "De ce pierdem",
              head: ["Motiv", "Număr", "Procent", "Valoare pierdută"],
              rows: data.lostReasons.map((r) => [r.reason, r.count, `${r.pct}%`, money(r.valueCents)]),
            },
            {
              title: "Afaceri în stagnare",
              head: ["Afacere", "Etapă", "Valoare", "Zile fără activitate"],
              rows: (data.aging?.stale ?? []).map((s) => [s.title, stageLabel(s.stage), money(s.valueCents), s.daysIdle]),
            },
            {
              title: "Pe produs",
              head: ["Produs", "Total", "Câștigate", "Pierdute", "Rată", "Valoare"],
              rows: data.perProduct.map((p) => [p.product, p.total, p.won, p.lost, `${p.winRatePct}%`, money(p.valueCents)]),
            },
          ],
        },
        `raport-crm-${new Date().toISOString().slice(0, 10)}.pdf`
      );
    } finally {
      setExporting(false);
    }
  }

  // ─── Randare ───────────────────────────────────────────────────────────────

  const hasData = !!data && !data.schemaLag;

  return (
    <BusinessShell
      pageTitle="Rapoarte"
      actions={
        <>
          <Button variant="ghost" onClick={() => setTargetsOpen(true)}>
            <Target className="h-4 w-4" aria-hidden="true" />
            Norme
          </Button>
          <Button variant="outline" onClick={exportCsv} disabled={!hasData || loading}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Export Excel
          </Button>
          <Button variant="outline" onClick={() => void exportPdf()} disabled={!hasData || loading || exporting}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileText className="h-4 w-4" aria-hidden="true" />}
            Export PDF
          </Button>
        </>
      }
    >
      <div className="space-y-8">
        {/* Filtrele — cipuri, ca în Drive („Tip", „Persoane", „Modificat"). */}
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrele raportului">
          <FilterChip id="rap-palnie" label="Pâlnia" value={pipeline ?? data?.pipelineId ?? ""} onChange={(v) => setPipeline(v || null)}>
            {(data?.pipelines ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="all">Toate pâlniile</option>
          </FilterChip>
          <FilterChip id="rap-perioada" label="Perioadă" value={preset} onChange={(v) => setPreset(v as CrmPeriodPreset)}>
            {(Object.keys(CRM_PERIOD_LABELS) as CrmPeriodPreset[]).map((p) => (
              <option key={p} value={p}>
                {CRM_PERIOD_LABELS[p]}
              </option>
            ))}
          </FilterChip>
          {preset === "custom" && (
            <>
              <label className="sr-only" htmlFor="rap-de-la">De la</label>
              <DateField id="rap-de-la" aria-label="De la" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              <label className="sr-only" htmlFor="rap-pana-la">Până la</label>
              <DateField id="rap-pana-la" aria-label="Până la" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </>
          )}
          <FilterChip id="rap-agent" label="Agent" value={owner} onChange={setOwner}>
            <option value="all">Toată echipa</option>
            {(data?.owners ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </FilterChip>
          {data?.previous && (
            <span className="text-sm text-muted-foreground">
              comparat cu {formatRange(data.previous.range.from, data.previous.range.to)}
            </span>
          )}
        </div>

        {error && <Alert variant="destructive">{error}</Alert>}

        {loading && !data ? (
          <div className="flex items-center justify-center py-16" role="status">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se încarcă rapoartele" />
          </div>
        ) : !hasData ? (
          <EmptyState
            icon={<BarChart3 className="h-6 w-6" />}
            title="Nu sunt date de raportat"
            description="Rapoartele apar după primele leaduri și activități din perioada aleasă."
          />
        ) : (
          <div className={cn("space-y-8 transition-opacity", loading && "opacity-60")} aria-busy={loading}>
            {/* 1 · Plăcuțele + graficul metricii alese (Google Analytics). */}
            <Card className="overflow-hidden p-0">
              <div className="grid grid-cols-2 border-b border-border sm:grid-cols-3 lg:grid-cols-6" role="tablist" aria-label="Indicatori">
                {METRICS.map((m) => {
                  const { cur, prev } = metricValues(data, m.key);
                  const d = delta(m, cur, prev);
                  const selectable = !!m.series;
                  const selected = metric === m.key;
                  return (
                    <button
                      key={m.key}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      disabled={!selectable}
                      onClick={() => selectable && setMetric(m.key)}
                      className={cn(
                        "flex min-h-24 flex-col items-start gap-1 border-b-2 px-4 py-3 text-left transition-colors disabled:cursor-default",
                        selected ? "border-primary bg-card" : "border-transparent bg-muted/40 hover:bg-muted",
                      )}
                    >
                      <span className="text-sm text-muted-foreground">{m.label}</span>
                      <span className="text-2xl tabular-nums text-foreground">{m.format(cur)}</span>
                      {d ? (
                        <span
                          className={cn(
                            "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
                            d.good === true ? "text-success" : d.good === false ? "text-destructive" : "text-muted-foreground",
                          )}
                        >
                          {d.good !== null &&
                            ((cur ?? 0) >= (prev ?? 0) ? (
                              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                            ) : (
                              <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />
                            ))}
                          <span className="sr-only">{(cur ?? 0) >= (prev ?? 0) ? "crește cu" : "scade cu"}</span>
                          {d.text}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">{data.previous ? "fără comparație" : " "}</span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="p-4">
                <TrendChart
                  points={trend.points}
                  size={size}
                  label={activeMetric.label}
                  showPrevious={trend.hasPrevious}
                  format={(v) => activeMetric.format(metric === "sales" || metric === "avgDeal" ? Math.round(v * 100) : v)}
                />
                {trend.hasPrevious && (
                  <p className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-primary" aria-hidden="true" />Perioada aleasă</span>
                    <span className="inline-flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-muted-foreground" aria-hidden="true" />Perioada precedentă</span>
                  </p>
                )}
              </div>
            </Card>

            {/* 2 · Câștigat față de pierdut. */}
            <Section title="Câștigate și pierdute" subtitle={outcomeSentence(data)}>
              <Card className="p-4">
                <WonLostChart points={wonLost} size={size} />
                <p className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 bg-success" aria-hidden="true" />Câștigate</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 bg-destructive" aria-hidden="true" />Pierdute</span>
                </p>
              </Card>
            </Section>

            {/* 3 · Pâlnia: unde se opresc afacerile. */}
            {funnelRows.length > 0 && (
              <Section
                title="Pâlnia"
                subtitle={`${openTotals.count} afaceri deschise · ${money(openTotals.value)} în lucru · prognoză ponderată ${money(openTotals.weighted)}`}
                action={
                  <Link to={`/business/crm/palnie${data.pipelineId ? `?pipelineId=${data.pipelineId}` : ""}`} className="text-sm font-medium text-primary">
                    Tabloul pâlniei
                  </Link>
                }
              >
                <Table aria-label="Pâlnia pe etape">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Etapă</TableHead>
                      <TableHead className="text-right">Acum</TableHead>
                      <TableHead className="text-right">Valoare</TableHead>
                      <TableHead className="text-right">Au ajuns</TableHead>
                      <TableHead className="w-1/4">Trec mai departe</TableHead>
                      <TableHead className="text-right">Zile în etapă</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {funnelRows.map((r) => {
                      const v = velocityByKey.get(r.key);
                      return (
                        <TableRow key={r.key}>
                          <TableCell className="font-medium">{r.label}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.currentCount}</TableCell>
                          <TableCell className="text-right tabular-nums">{money(r.currentValueCents)}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.reached}</TableCell>
                          <TableCell>
                            {r.isWon ? (
                              <span className="text-muted-foreground">etapa finală</span>
                            ) : (
                              <Meter value={r.conversionPct} label={`${r.conversionPct}%`} />
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {v?.avgDays != null ? v.avgDays.toLocaleString("ro-MD") : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Section>
            )}

            {/* 4 · Afacerile care mor în tăcere. */}
            {data.aging && (
              <Section
                title="Afaceri care stagnează"
                subtitle={
                  data.aging.staleCount
                    ? `${data.aging.staleCount} afaceri deschise fără nicio activitate de peste 14 zile`
                    : "Nicio afacere deschisă neatinsă de peste 14 zile."
                }
              >
                <div className="mb-3 flex flex-wrap gap-2">
                  {data.aging.buckets.map((b) => (
                    <span key={b.key} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm">
                      <span className="text-muted-foreground">{b.label}</span>
                      <span className="font-medium tabular-nums">{b.count}</span>
                      <span className="text-muted-foreground tabular-nums">{money(b.valueCents)}</span>
                    </span>
                  ))}
                </div>
                {data.aging.stale.length > 0 && (
                  <Table aria-label="Afaceri în stagnare">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Afacere</TableHead>
                        <TableHead>Etapă</TableHead>
                        <TableHead className="text-right">Valoare</TableHead>
                        <TableHead className="text-right">Fără activitate</TableHead>
                        <TableHead>Responsabil</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.aging.stale.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell>
                            <Link to={pipelineHref(s.id)} className="font-medium text-foreground hover:text-primary hover:underline">
                              {s.title}
                            </Link>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{stageLabel(s.stage)}</TableCell>
                          <TableCell className="text-right tabular-nums">{money(s.valueCents)}</TableCell>
                          <TableCell className="text-right tabular-nums">{s.daysIdle} zile</TableCell>
                          <TableCell className="text-muted-foreground">{ownerName(s.assignedTo)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Section>
            )}

            <div className="grid gap-8 xl:grid-cols-2">
              {/* 5 · Surse. */}
              <Section title="Surse" subtitle="Leadurile intrate în perioadă și ce s-a ales de ele.">
                {(data.sources ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Niciun lead nou în perioada aleasă.</p>
                ) : (
                  <Table aria-label="Rezultate pe sursă">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sursă</TableHead>
                        <TableHead className="text-right">Leaduri</TableHead>
                        <TableHead className="text-right">Câștigate</TableHead>
                        <TableHead className="text-right">Rată</TableHead>
                        <TableHead className="text-right">Valoare</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(data.sources ?? []).map((s) => (
                        <TableRow key={s.source}>
                          <TableCell>{crmSourceLabel(s.source)}</TableCell>
                          <TableCell className="text-right tabular-nums">{s.leads}</TableCell>
                          <TableCell className="text-right tabular-nums">{s.won}</TableCell>
                          <TableCell className="text-right tabular-nums">{pct(s.winRatePct)}</TableCell>
                          <TableCell className="text-right tabular-nums">{money(s.wonValueCents)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Section>

              {/* 6a · De ce pierdem. */}
              <Section title="De ce pierdem" subtitle={data.outcomes ? `${money(data.outcomes.lostValueCents)} pierduți în perioadă` : undefined}>
                {data.lostReasons.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Niciun motiv de pierdere notat în perioada aleasă.</p>
                ) : (
                  <Table aria-label="Motivele pierderii">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Motiv</TableHead>
                        <TableHead className="w-1/3">Din pierderi</TableHead>
                        <TableHead className="text-right">Valoare</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.lostReasons.map((r) => (
                        <TableRow key={r.reason}>
                          <TableCell>{r.reason}</TableCell>
                          <TableCell>
                            <Meter value={r.pct} label={`${r.count} · ${r.pct}%`} tone="muted" />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{money(r.valueCents)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Section>
            </div>

            {/* 6b · Echipa. */}
            {team.length > 0 && (
              <Section title="Echipa" subtitle="Ordonată după valoarea vândută în perioadă.">
                <Table aria-label="Rezultate pe agent">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agent</TableHead>
                      <TableHead className="text-right">Câștigate</TableHead>
                      <TableHead className="text-right">Valoare</TableHead>
                      <TableHead className="text-right">Rată</TableHead>
                      <TableHead className="text-right">Valoare medie</TableHead>
                      <TableHead className="text-right">Deschise</TableHead>
                      <TableHead className="text-right">Apeluri</TableHead>
                      <TableHead className="text-right">Întâlniri</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {team.map((t) => (
                      <TableRow key={t.ownerKey}>
                        <TableCell className="font-medium">{t.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{t.wonCount}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(t.wonValueCents)}</TableCell>
                        <TableCell className="text-right tabular-nums">{pct(t.winRatePct)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(t.avgDealCents)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {t.openCount} <span className="text-muted-foreground">· {money(t.openValueCents)}</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{t.calls}</TableCell>
                        <TableCell className="text-right tabular-nums">{t.meetings}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Section>
            )}

            {/* 7 · Activitatea, cu norma și perioada precedentă (în locul celor 10 plăcuțe). */}
            <Section title="Activitate" subtitle="Munca din spatele rezultatelor, față de normă.">
              <Table aria-label="Activitate">
                <TableHeader>
                  <TableRow>
                    <TableHead>Indicator</TableHead>
                    <TableHead className="text-right">Perioada aleasă</TableHead>
                    <TableHead className="text-right">Perioada precedentă</TableHead>
                    <TableHead className="w-1/3">Față de normă</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ACTIVITY_ROWS.map((a) => {
                    const att = data.attainment?.[a.key];
                    const fmt = (v: number | undefined) => (v == null ? "—" : a.money ? money(v) : String(v));
                    return (
                      <TableRow key={a.key}>
                        <TableCell>{a.label}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(data.kpis[a.key])}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{fmt(data.previous?.kpis[a.key])}</TableCell>
                        <TableCell>
                          {att ? (
                            <Meter
                              value={Math.min(100, att.pct)}
                              label={`${att.pct}% din ${a.money ? money(att.target) : att.target}`}
                              tone={att.pct >= 100 ? "success" : "primary"}
                            />
                          ) : (
                            <span className="text-sm text-muted-foreground">fără normă</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Section>

            {/* Contactabilitatea — doar pe echipele care sună. */}
            {data.callFunnel && data.callFunnel.dialed > 0 && (
              <Section
                title="Contactabilitate"
                subtitle={`${data.callFunnel.dialed} apeluri · a răspuns cineva la ${data.callFunnel.connected} · ${data.callFunnel.decisionMakers} decidenți atinși${data.callFunnel.callsPerDecisionMaker ? ` · ${data.callFunnel.callsPerDecisionMaker} apeluri per decident` : ""}`}
              >
                <Table aria-label="Rezultatele apelurilor">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rezultatul apelului</TableHead>
                      <TableHead className="w-2/5">Din apeluri</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.callFunnel.byOutcome.map((r) => (
                      <TableRow key={r.outcome}>
                        <TableCell>{r.label}</TableCell>
                        <TableCell>
                          <Meter value={r.pct} label={`${r.count} · ${r.pct}%`} tone="muted" />
                        </TableCell>
                      </TableRow>
                    ))}
                    {data.callFunnel.unknown > 0 && (
                      <TableRow>
                        <TableCell className="text-muted-foreground">Fără rezultat notat</TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">{data.callFunnel.unknown}</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Section>
            )}

            {data.perProduct.length > 0 && (
              <Section title="Pe produs">
                <Table aria-label="Rezultate pe produs">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produs</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Câștigate</TableHead>
                      <TableHead className="text-right">Pierdute</TableHead>
                      <TableHead className="text-right">Rată</TableHead>
                      <TableHead className="text-right">Valoare</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.perProduct.map((p) => (
                      <TableRow key={p.product}>
                        <TableCell>{p.product}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.total}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.won}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.lost}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.winRatePct}%</TableCell>
                        <TableCell className="text-right tabular-nums">{money(p.valueCents)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Section>
            )}
          </div>
        )}
      </div>

      <KpiTargetsDialog open={targetsOpen} onClose={() => setTargetsOpen(false)} owners={data?.owners ?? []} onSaved={() => void load()} />
    </BusinessShell>
  );
}

// ─── Piese mici ───────────────────────────────────────────────────────────────

interface SectionProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}

function Section({ title, subtitle, action, children }: SectionProps) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-medium">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

interface FilterChipProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}

/** Cip de filtru GM3: 32px, contur, colț de 8px — un `<select>` nativ, deci accesibil din tastatură. */
function FilterChip({ id, label, value, onChange, children }: FilterChipProps) {
  return (
    <span className="inline-flex h-8 items-center gap-1 rounded-lg border border-input pl-3 pr-1 text-sm hover:bg-muted">
      <label htmlFor={id} className="text-muted-foreground">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-full cursor-pointer bg-transparent pr-1 font-medium text-foreground outline-none focus-visible:underline"
      >
        {children}
      </select>
    </span>
  );
}

interface MeterProps {
  value: number;
  label: string;
  tone?: "primary" | "success" | "muted";
}

/** Bară orizontală subțire cu eticheta alături — procentul se citește și fără culoare. */
function Meter({ value, label, tone = "primary" }: MeterProps) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <span className="flex items-center gap-3">
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <span
          className={cn("block h-full rounded-full", tone === "success" ? "bg-success" : tone === "muted" ? "bg-muted-foreground/60" : "bg-primary")}
          style={{ width: `${width}%` }}
        />
      </span>
      <span className="min-w-20 text-right text-sm tabular-nums">{label}</span>
    </span>
  );
}

function formatRange(from: string, to: string): string {
  const f = new Date(from);
  const t = new Date(new Date(to).getTime() - 1);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${f.toLocaleDateString("ro-MD", opts)} – ${t.toLocaleDateString("ro-MD", opts)}`;
}

function outcomeSentence(data: CrmReportsResponse): string | undefined {
  const o = data.outcomes;
  if (!o) return undefined;
  if (o.wonCount + o.lostCount === 0) return "Nicio afacere închisă în perioada aleasă.";
  return `${o.wonCount} câștigate (${money(o.wonValueCents)}) · ${o.lostCount} pierdute (${money(o.lostValueCents)})`;
}
