/**
 * INSIGHT-004 (FIN) — FinDesk Insights dashboard /app/finance/insights
 *
 * Shows: 4 KPI cards + revenue/receivable chart + cashflow forecast + top sources
 * + saved views dropdown + AI narrative section.
 *
 * FIN-CORE §1.13: AI narează, nu calculează. Cifrele vin din API-ul determinist.
 */

import { useEffect, useState, useCallback } from "react";
import { Bookmark, Plus, Sparkles, AlertTriangle } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { AppShell } from "@/components/app/AppShell";
import { KpiCard } from "@/components/fin/KpiCard";
import { CashflowChart } from "@/components/fin/CashflowChart";
import { SaveViewModal } from "@/components/fin/SaveViewModal";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  getFinMetrics,
  getFinAging,
  getCashflowForecast,
  listSavedViews,
  createSavedView,
  listNarratives,
  generateAiNarrative,
  type FinMetricPoint,
  type FinSavedView,
  type FinNarrative,
  type CashflowForecastResponse,
  type CreateSavedViewData,
} from "@/lib/api/finInsight";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgingTotals {
  "0_30": number;
  "31_60": number;
  "61_90": number;
  "90_plus": number;
  total: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMDL(cents: number): string {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: "MDL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatMDLShort(cents: number): string {
  const mdl = cents / 100;
  if (Math.abs(mdl) >= 1_000_000)
    return `${(mdl / 1_000_000).toFixed(1)}M MDL`;
  if (Math.abs(mdl) >= 1000) return `${(mdl / 1000).toFixed(1)}k MDL`;
  return `${mdl.toFixed(0)} MDL`;
}

/** Calculates delta % between current and previous value */
function delta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** Sentiment badge color class */
function sentimentClass(
  sentiment: FinNarrative["sentiment"]
): string {
  switch (sentiment) {
    case "positive":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400";
    case "negative":
      return "bg-destructive/10 text-destructive";
    default:
      return "bg-muted text-muted-foreground";
  }
}

/** Sentiment label */
function sentimentLabel(sentiment: FinNarrative["sentiment"]): string {
  switch (sentiment) {
    case "positive":
      return "Pozitiv";
    case "negative":
      return "Negativ";
    default:
      return "Neutru";
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FinInsightsPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  // ── Auth gate ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  // ── Data state ───────────────────────────────────────────────────────────────
  const [metrics, setMetrics] = useState<FinMetricPoint[]>([]);
  const [aging, setAging] = useState<AgingTotals | null>(null);
  const [forecast, setForecast] = useState<CashflowForecastResponse | null>(null);
  const [savedViews, setSavedViews] = useState<FinSavedView[]>([]);
  const [narratives, setNarratives] = useState<FinNarrative[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // ── Fetch all data ───────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [metricsRes, agingRes, forecastRes, viewsRes, narrativesRes] =
        await Promise.all([
          getFinMetrics({ period: "last_6m", groupBy: "month" }),
          getFinAging(),
          getCashflowForecast(),
          listSavedViews(),
          listNarratives(new Date().getFullYear()),
        ]);
      setMetrics(metricsRes.metrics);
      setAging(agingRes.aging);
      setForecast(forecastRes);
      setSavedViews(viewsRes.views);
      setNarratives(narrativesRes.narratives);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Eroare la încărcarea datelor."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionStatus === "authenticated") {
      void fetchData();
    }
  }, [sessionStatus, fetchData]);

  // ── Derived KPI values ────────────────────────────────────────────────────────
  const currentMonthMetric = metrics[metrics.length - 1] ?? null;
  const prevMonthMetric = metrics[metrics.length - 2] ?? null;

  const revenue = currentMonthMetric?.revenue ?? 0;
  const receivable = currentMonthMetric?.receivable ?? 0;
  const profit = currentMonthMetric?.profit ?? 0;
  const agingTotal = aging?.total ?? 0;

  const revenueDelta = prevMonthMetric
    ? delta(revenue, prevMonthMetric.revenue)
    : null;
  const receivableDelta = prevMonthMetric
    ? delta(receivable, prevMonthMetric.receivable)
    : null;
  const profitDelta = prevMonthMetric
    ? delta(profit, prevMonthMetric.profit)
    : null;

  // ── Top sources (dummy — based on current metric, no course breakdown in API) ─
  // In real implementation, the metrics API would return groupBy=category.
  // For now we show a summary from aging breakdown.
  const topSources = metrics.slice(-3).map((m, i) => ({
    name: m.period,
    amountCents: m.revenue,
    pct:
      revenue > 0 ? Math.round((m.revenue / revenue) * 100) : 0,
    rank: i + 1,
  }));

  // ── Current month narrative ───────────────────────────────────────────────────
  const currentMonth = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  })();
  const currentNarrative = narratives.find((n) => n.month === currentMonth);
  const publishedNarrative =
    currentNarrative?.publishedAt != null ? currentNarrative : null;
  const draftNarrative =
    currentNarrative != null && currentNarrative.publishedAt == null
      ? currentNarrative
      : null;

  // ── Generate AI narrative ─────────────────────────────────────────────────────
  async function handleGenerateNarrative() {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await generateAiNarrative(currentMonth);
      // Add/replace narrative in list
      setNarratives((prev) => {
        const filtered = prev.filter((n) => n.month !== currentMonth);
        return [...filtered, res.narrative];
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Eroare la generarea narativei.";
      setAiError(msg);
    } finally {
      setAiLoading(false);
    }
  }

  // ── Save view ─────────────────────────────────────────────────────────────────
  async function handleSaveView(data: CreateSavedViewData) {
    const res = await createSavedView(data);
    setSavedViews((prev) => [res.view, ...prev]);
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <AppShell
      pageTitle="FinDesk Insights"
      pageDescription="Analiză financiară avansată — metrici, forecast, narativă AI"
      actions={
        <div className="flex items-center gap-2">
          {savedViews.length > 0 && (
            <div className="relative">
              <select
                aria-label="Vederi salvate"
                className="appearance-none rounded-md border bg-background pl-8 pr-3 py-1.5 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                defaultValue=""
                onChange={() => {
                  /* TODO: apply saved view filters */
                }}
              >
                <option value="" disabled>
                  Vederi salvate...
                </option>
                {savedViews.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
              <Bookmark
                className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none"
                aria-hidden="true"
              />
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowSaveModal(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Salvează vederea curentă"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Salvează vedere
          </button>
        </div>
      }
    >
      {/* ── Error banner ─────────────────────────────────────────────────────── */}
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 flex items-start gap-2 text-sm text-destructive"
        >
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {/* ── KPI Cards ─────────────────────────────────────────────────────────── */}
      <section
        aria-label="Indicatori cheie financiari"
        className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
      >
        <KpiCard
          label="Revenue"
          valueCents={revenue}
          deltaPct={revenueDelta}
          loading={loading}
          subtitle="plăți încasate"
        />
        <KpiCard
          label="Receivable"
          valueCents={receivable}
          deltaPct={receivableDelta}
          loading={loading}
          subtitle="facturi emise"
        />
        <KpiCard
          label="Profit estimat"
          valueCents={profit}
          deltaPct={profitDelta}
          loading={loading}
          subtitle="revenue − receivable"
        />
        <KpiCard
          label="Aging (restanțe)"
          valueCents={agingTotal}
          loading={loading}
          subtitle="total neîncasat"
        />
      </section>

      {/* ── Revenue / Receivable Chart ──────────────────────────────────────────── */}
      {!loading && metrics.length > 0 && (
        <section
          aria-label="Grafic venituri și creanțe"
          className="rounded-lg border bg-card p-5 shadow-sm mb-6"
        >
          <h3 className="text-base font-semibold text-foreground mb-4">
            Venituri și creanțe — ultimele 6 luni
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart
              data={metrics}
              margin={{ top: 5, right: 10, bottom: 5, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="period"
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
              />
              <YAxis
                tickFormatter={formatMDLShort}
                tick={{ fontSize: 11 }}
                width={70}
                className="fill-muted-foreground"
              />
              <Tooltip
                formatter={(value: unknown) => [formatMDL(Number(value)), ""]}
                contentStyle={{
                  borderRadius: "var(--radius)",
                  fontSize: "12px",
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="revenue"
                name="Venituri"
                strokeWidth={2}
                dot={{ r: 3 }}
                stroke="var(--color-emerald-500, #10b981)"
              />
              <Line
                type="monotone"
                dataKey="receivable"
                name="Creanțe"
                strokeWidth={2}
                dot={{ r: 3 }}
                stroke="var(--color-blue-500, #3b82f6)"
                strokeDasharray="4 2"
              />
            </LineChart>
          </ResponsiveContainer>
        </section>
      )}

      {/* ── Cashflow Forecast ────────────────────────────────────────────────── */}
      <div className="mb-6">
        <CashflowChart
          scenarios={forecast?.scenarios ?? null}
          loading={loading}
        />
      </div>

      {/* ── Top surse venit ──────────────────────────────────────────────────── */}
      {!loading && topSources.length > 0 && (
        <section
          aria-label="Top surse venit"
          className="rounded-lg border bg-card p-5 shadow-sm mb-6"
        >
          <h3 className="text-base font-semibold text-foreground mb-3">
            Top surse venit
          </h3>
          <table className="w-full text-sm" role="table">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-2 font-medium" scope="col">
                  Perioadă
                </th>
                <th className="text-right py-2 font-medium" scope="col">
                  Sumă (MDL)
                </th>
                <th className="text-right py-2 font-medium" scope="col">
                  %
                </th>
              </tr>
            </thead>
            <tbody>
              {topSources.map((s) => (
                <tr key={s.name} className="border-b last:border-0">
                  <td className="py-2 text-foreground">{s.name}</td>
                  <td className="py-2 text-right tabular-nums text-foreground">
                    {formatMDLShort(s.amountCents)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">
                    {s.pct}%
                  </td>
                </tr>
              ))}
              {topSources.length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    className="py-4 text-center text-muted-foreground"
                  >
                    Fără date disponibile.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      {/* ── Narativă AI ─────────────────────────────────────────────────────── */}
      <section
        aria-label="Narativă luna curentă"
        className="rounded-lg border bg-card p-5 shadow-sm mb-6"
      >
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-base font-semibold text-foreground">
            Narativă luna curentă ({currentMonth})
          </h3>
          {publishedNarrative && (
            <span
              className={`text-xs font-medium rounded-full px-2.5 py-0.5 ${sentimentClass(
                publishedNarrative.sentiment
              )}`}
            >
              {sentimentLabel(publishedNarrative.sentiment)}
            </span>
          )}
          {draftNarrative && (
            <span className="text-xs font-medium rounded-full px-2.5 py-0.5 bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
              Draft — nepublicat
            </span>
          )}
        </div>

        {/* Published narrative */}
        {publishedNarrative && (
          <div className="prose prose-sm dark:prose-invert max-w-none text-foreground">
            <p className="font-medium mb-1">{publishedNarrative.title}</p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {publishedNarrative.body}
            </p>
          </div>
        )}

        {/* Draft narrative */}
        {!publishedNarrative && draftNarrative && (
          <div className="rounded-md bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-4">
            <p className="font-medium text-sm text-foreground mb-1">
              {draftNarrative.title}
            </p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
              {draftNarrative.body}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Generată de AI — publicată manual de director înainte de a fi
              trimisă la board.
            </p>
          </div>
        )}

        {/* No narrative yet */}
        {!currentNarrative && !loading && (
          <p className="text-sm text-muted-foreground mb-4">
            Nu există o narativă pentru luna curentă. Generează una cu ajutorul
            AI-ului pe baza cifrelor din DB.
          </p>
        )}

        {/* AI error */}
        {aiError && (
          <div
            role="alert"
            className="mt-2 text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2"
          >
            {aiError}
          </div>
        )}

        {/* Generate button */}
        {!publishedNarrative && (
          <button
            type="button"
            onClick={() => void handleGenerateNarrative()}
            disabled={aiLoading || loading}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 transition-colors"
            aria-busy={aiLoading}
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {aiLoading
              ? "Se generează..."
              : draftNarrative
              ? "Regenerează narativă AI"
              : "Generează narativă AI"}
          </button>
        )}
      </section>

      {/* ── Save View Modal ──────────────────────────────────────────────────── */}
      <SaveViewModal
        open={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        onSave={handleSaveView}
      />
    </AppShell>
  );
}
