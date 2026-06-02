/**
 * CRM-112 — CRM Analytics page /app/analytics/crm
 * Funnel conversie + lost-reason pie + ROAS per campanie
 */
import { useEffect, useState, useCallback } from "react";
import {
  Loader2, AlertTriangle, DollarSign,
  BarChart3, PieChart, ArrowRight, RefreshCw, Building2, Layers,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { ForecastWidget } from "@/components/crm/ForecastWidget";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  getFunnel, getLostReasons, getRoas, setBudget, getBranchKpis,
  type FunnelData, type LostReasonsData, type RoasData, type BranchKpi,
} from "@/lib/api/analytics";
import { BranchKpiCards } from "@/components/reports/BranchKpiCards";
import { cn } from "@/lib/utils";

// ─── Color palette for lost reasons (semantic tokens only) ────────────────────

const LOST_REASON_COLORS = [
  "bg-destructive/70",
  "bg-amber-500",
  "bg-primary/70",
  "bg-success/70",
  "bg-sky-500",
  "bg-violet-500",
  "bg-rose-400",
  "bg-orange-500",
];

// ─── Funnel widget ─────────────────────────────────────────────────────────────

interface FunnelWidgetProps {
  data: FunnelData;
}

const STAGE_LABELS: Record<string, string> = {
  new: "Lead nou",
  contacted: "Contactat",
  trial: "Trial/Demo",
  paid: "Client",
};

function FunnelWidget({ data }: FunnelWidgetProps) {
  const maxCount = Math.max(...data.funnel.map((s) => s.count), 1);

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4" aria-label="Funnel conversie">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 className="text-base font-bold">Funnel conversie</h2>
        </div>
        <div className={cn(
          "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold border",
          data.conversionRate >= 20 ? "bg-success/10 text-success border-success/30" :
          data.conversionRate >= 10 ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-300" :
          "bg-muted text-muted-foreground border-border"
        )}>
          {data.conversionRate}% conversie
        </div>
      </div>

      {/* Funnel bars */}
      <div className="space-y-3" role="list" aria-label="Stadii funnel">
        {data.funnel.map((stage, i) => {
          const widthPct = maxCount > 0 ? Math.round((stage.count / maxCount) * 100) : 0;
          return (
            <div key={stage.stage} role="listitem" className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold">{STAGE_LABELS[stage.stage] ?? stage.stage}</span>
                <span className="text-muted-foreground">{stage.count.toLocaleString("ro-RO")}</span>
              </div>
              <div className="h-6 rounded-md bg-muted/40 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-md transition-all",
                    i === 0 ? "bg-primary/30" :
                    i === 1 ? "bg-primary/50" :
                    i === 2 ? "bg-primary/70" :
                    "bg-primary"
                  )}
                  style={{ width: `${widthPct}%` }}
                  role="progressbar"
                  aria-valuenow={stage.count}
                  aria-valuemax={maxCount}
                  aria-label={`${STAGE_LABELS[stage.stage] ?? stage.stage}: ${stage.count}`}
                />
              </div>
              {i < data.funnel.length - 1 && stage.count > 0 && data.funnel[i + 1].count > 0 && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground pl-1">
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  {Math.round((data.funnel[i + 1].count / stage.count) * 100)}% trec la {STAGE_LABELS[data.funnel[i + 1].stage] ?? data.funnel[i + 1].stage}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Source breakdown */}
      {data.sourceBreakdown.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Clienți per sursă</p>
          <div className="flex flex-wrap gap-2">
            {data.sourceBreakdown.map((s) => (
              <span
                key={s.source}
                className="inline-flex items-center rounded-full bg-primary/10 border border-primary/20 px-2 py-1 text-xs font-semibold text-primary"
              >
                {s.source}: {s.count}
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Total leaduri: <span className="font-semibold">{data.total.toLocaleString("ro-RO")}</span> · Clienți plătitori: <span className="font-semibold">{data.paid.toLocaleString("ro-RO")}</span>
      </p>
    </section>
  );
}

// ─── Lost reasons widget ──────────────────────────────────────────────────────

function LostReasonsWidget({ data }: { data: LostReasonsData }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4" aria-label="Motive pierdere leaduri">
      <div className="flex items-center gap-2">
        <PieChart className="h-5 w-5 text-destructive" aria-hidden="true" />
        <h2 className="text-base font-bold">Motive pierdere</h2>
      </div>

      {data.reasons.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Niciun lead pierdut cu motiv înregistrat.</p>
      ) : (
        <div className="space-y-2" role="list" aria-label="Lista motive pierdere">
          {data.reasons.map((r, i) => (
            <div key={r.reason} role="listitem" className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold">{r.reason}</span>
                <span className="text-muted-foreground">{r.count} ({r.percent}%)</span>
              </div>
              <div className="h-4 rounded-full bg-muted/40 overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", LOST_REASON_COLORS[i % LOST_REASON_COLORS.length])}
                  style={{ width: `${r.percent}%` }}
                  role="progressbar"
                  aria-valuenow={r.percent}
                  aria-valuemax={100}
                  aria-label={`${r.reason}: ${r.percent}%`}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Total pierdute cu motiv: <span className="font-semibold">{data.total}</span>
      </p>
    </section>
  );
}

// ─── ROAS widget ──────────────────────────────────────────────────────────────

interface RoasWidgetProps {
  data: RoasData;
  onSetBudget: (campaign: string, spendCents: number) => Promise<void>;
}

function RoasWidget({ data, onSetBudget }: RoasWidgetProps) {
  const [editingCampaign, setEditingCampaign] = useState<string | null>(null);
  const [spendInput, setSpendInput] = useState("");
  const [saving, setSaving] = useState(false);

  const currentMonth = new Date().toISOString().slice(0, 7);

  const handleSaveBudget = async (campaign: string) => {
    const cents = Math.round(parseFloat(spendInput) * 100);
    if (isNaN(cents) || cents < 0) return;
    setSaving(true);
    try {
      await onSetBudget(campaign, cents);
      setEditingCampaign(null);
      setSpendInput("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4" aria-label="ROAS per campanie">
      <div className="flex items-center gap-2">
        <DollarSign className="h-5 w-5 text-success" aria-hidden="true" />
        <h2 className="text-base font-bold">ROAS per campanie</h2>
      </div>

      {data.campaigns.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Niciun lead cu utm_campaign înregistrat.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs" aria-label="Tabel ROAS campanii">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-[10px] uppercase tracking-wide">
                <th className="text-left py-2 pr-3 font-semibold">Campanie</th>
                <th className="text-right py-2 px-2 font-semibold">Leaduri</th>
                <th className="text-right py-2 px-2 font-semibold">Clienți</th>
                <th className="text-right py-2 px-2 font-semibold">Conv %</th>
                <th className="text-right py-2 px-2 font-semibold">Buget</th>
                <th className="text-right py-2 pl-2 font-semibold">Cost/client</th>
                <th className="py-2 pl-2"></th>
              </tr>
            </thead>
            <tbody>
              {data.campaigns.map((row) => (
                <tr key={row.campaign} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="py-2 pr-3 font-mono font-semibold max-w-[120px] truncate">{row.campaign}</td>
                  <td className="text-right py-2 px-2">{row.totalLeads}</td>
                  <td className="text-right py-2 px-2 font-semibold text-success">{row.paidStudents}</td>
                  <td className={cn("text-right py-2 px-2 font-semibold", row.conversionRate >= 20 ? "text-success" : row.conversionRate >= 10 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
                    {row.conversionRate}%
                  </td>
                  <td className="text-right py-2 px-2">
                    {row.spendCents > 0 ? (
                      <span>{(row.spendCents / 100).toLocaleString("ro-RO", { style: "currency", currency: "RON", maximumFractionDigits: 0 })}</span>
                    ) : (
                      <span className="text-muted-foreground italic">—</span>
                    )}
                  </td>
                  <td className="text-right py-2 pl-2 font-semibold">
                    {row.costPerStudentCents != null ? (
                      <span>{(row.costPerStudentCents / 100).toLocaleString("ro-RO", { style: "currency", currency: "RON", maximumFractionDigits: 0 })}</span>
                    ) : (
                      <span className="text-muted-foreground italic">—</span>
                    )}
                  </td>
                  <td className="py-2 pl-2">
                    {editingCampaign === row.campaign ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          step={10}
                          value={spendInput}
                          onChange={(e) => setSpendInput(e.target.value)}
                          placeholder="RON"
                          className="w-20 rounded border border-input bg-background px-1.5 py-1 text-xs"
                          aria-label={`Buget campanie ${row.campaign} în RON`}
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => void handleSaveBudget(row.campaign)}
                          disabled={saving}
                          className="rounded px-1.5 py-1 bg-primary text-[10px] text-primary-foreground"
                          aria-label="Salvează buget"
                        >
                          {saving ? "…" : "OK"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCampaign(null)}
                          className="rounded px-1 py-1 text-muted-foreground hover:text-foreground text-[10px]"
                          aria-label="Anulează editare buget"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setEditingCampaign(row.campaign); setSpendInput(row.spendCents > 0 ? String(row.spendCents / 100) : ""); }}
                        className="text-[10px] text-primary hover:underline"
                        aria-label={`Editează buget campanie ${row.campaign}`}
                      >
                        {row.spendCents > 0 ? "Editează" : "Adaugă buget"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground italic">
        Cost per client = buget campanie / număr clienți plătitori. Setează bugetul lunar per campanie.
        Lună curentă: {currentMonth}.
      </p>
    </section>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AnalyticsPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const [funnelData, setFunnelData] = useState<FunnelData | null>(null);
  const [lostData, setLostData] = useState<LostReasonsData | null>(null);
  const [roasData, setRoasData] = useState<RoasData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  // BRANCH-704: toggle between consolidated and per-branch view
  const [branchView, setBranchView] = useState<"consolidated" | "per-branch">("consolidated");
  const [branchPeriod, setBranchPeriod] = useState<"month" | "quarter">("month");
  const [branchKpis, setBranchKpis] = useState<BranchKpi[]>([]);
  const [branchLoading, setBranchLoading] = useState(false);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [f, l, r] = await Promise.all([getFunnel(), getLostReasons(), getRoas()]);
      setFunnelData(f);
      setLostData(l);
      setRoasData(r);
    } catch {
      setError("Nu pot încărca analytics-ul CRM");
    } finally {
      setLoading(false);
    }
  }, []);

  // BRANCH-704: fetch branch KPIs when switching to per-branch view
  const fetchBranchKpis = useCallback(async (period: "month" | "quarter") => {
    setBranchLoading(true);
    try {
      const res = await getBranchKpis(period);
      setBranchKpis(res.branches);
    } catch {
      setBranchKpis([]);
    } finally {
      setBranchLoading(false);
    }
  }, []);

  useEffect(() => {
    if (branchView === "per-branch") {
      void fetchBranchKpis(branchPeriod);
    }
  }, [branchView, branchPeriod, fetchBranchKpis]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  const handleSetBudget = async (campaign: string, spendCents: number) => {
    const month = new Date().toISOString().slice(0, 7);
    await setBudget({ utmCampaign: campaign, spendCents, month });
    setToast({ kind: "success", message: "Buget salvat" });
    // Refresh ROAS
    const r = await getRoas();
    setRoasData(r);
  };

  if (loading) {
    return (
      <AppShell pageTitle="Analytics CRM" pageDescription="">
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Se încarcă…
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      pageTitle="Analytics CRM"
      pageDescription={
        branchView === "per-branch"
          ? "KPI per filială · Comparație side-by-side"
          : "Funnel conversie · Motive pierdere · ROAS campanii"
      }
      actions={
        <button
          type="button"
          onClick={() => void fetchAll()}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted"
          aria-label="Reîncarcă datele"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Actualizează</span>
        </button>
      }
    >
      {error && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          {error}
        </div>
      )}

      {/* BRANCH-704: Consolidated / Per-filială toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div
          role="group"
          aria-label="Mod vizualizare rapoarte"
          className="flex items-center rounded-lg border border-border bg-muted/20 p-1 gap-1"
        >
          <button
            type="button"
            role="radio"
            aria-checked={branchView === "consolidated"}
            onClick={() => setBranchView("consolidated")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
              branchView === "consolidated"
                ? "bg-card shadow text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            Consolidat
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={branchView === "per-branch"}
            onClick={() => setBranchView("per-branch")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
              branchView === "per-branch"
                ? "bg-card shadow text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
            Per filială
          </button>
        </div>

        {/* Period selector for per-branch view */}
        {branchView === "per-branch" && (
          <div
            role="group"
            aria-label="Perioadă"
            className="flex items-center rounded-lg border border-border bg-muted/20 p-1 gap-1"
          >
            <button
              type="button"
              role="radio"
              aria-checked={branchPeriod === "month"}
              onClick={() => setBranchPeriod("month")}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                branchPeriod === "month"
                  ? "bg-card shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Luna
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={branchPeriod === "quarter"}
              onClick={() => setBranchPeriod("quarter")}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                branchPeriod === "quarter"
                  ? "bg-card shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Trimestru
            </button>
          </div>
        )}
      </div>

      {/* Per-branch KPI cards */}
      {branchView === "per-branch" ? (
        <BranchKpiCards
          branches={branchKpis}
          loading={branchLoading}
          period={branchPeriod}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {funnelData && <FunnelWidget data={funnelData} />}
            {lostData && <LostReasonsWidget data={lostData} />}
          </div>

          {roasData && (
            <div className="mt-6">
              <RoasWidget
                data={roasData}
                onSetBudget={(campaign, spendCents) => handleSetBudget(campaign, spendCents)}
              />
            </div>
          )}
        </>
      )}

      {/* CRM-125: Weighted forecast */}
      <div className="mt-6">
        <ForecastWidget />
      </div>

      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "fixed bottom-4 right-4 z-50 rounded-lg border shadow-lg px-4 py-3 text-sm font-medium",
            toast.kind === "success"
              ? "bg-success/10 border-success/30 text-success"
              : "bg-destructive/10 border-destructive/30 text-destructive"
          )}
        >
          {toast.message}
        </div>
      )}
    </AppShell>
  );
}
