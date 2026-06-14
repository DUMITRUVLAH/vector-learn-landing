/**
 * MULTICURRENCY-002: Revaluare sold la închiderea lunii
 * Route: /app/fin/revaluation
 */
import { useState, useEffect, useCallback } from "react";
import { Loader2, RefreshCcw, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import {
  triggerRevaluation,
  listRevaluations,
  type RevaluationResult,
  type RevaluationSummary,
} from "@/lib/api/finRevaluation";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMDL(cents: number): string {
  const sign = cents < 0 ? "-" : cents > 0 ? "+" : "";
  return `${sign}${Math.abs(cents / 100).toLocaleString("ro-MD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} MDL`;
}

function formatMonth(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("ro-MD", { month: "long", year: "numeric" });
}

function currentMonthFirst(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  readonly?: boolean;
}

export function RevaluationPage(_props: Props) {
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthFirst());
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [result, setResult] = useState<RevaluationResult | null>(null);
  const [history, setHistory] = useState<RevaluationSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setListLoading(true);
    try {
      const data = await listRevaluations(5);
      setHistory(data);
    } catch {
      // Non-blocking — table just stays empty
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  async function handleRevaluate() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await triggerRevaluation(selectedMonth);
      setResult(res);
      await loadHistory();
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Eroare la revaluare. Încearcă din nou.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell pageTitle="Revaluare sold">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Revaluare sold
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Compară cursul BNM de la finele lunii cu cursul de înregistrare și
            postează diferențele în registrul contabil.
          </p>
        </div>

        {/* Trigger card */}
        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <h2 className="text-base font-medium text-card-foreground">
            Inițiază revaluare
          </h2>

          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
            <div className="space-y-1 flex-1">
              <label
                htmlFor="period-month"
                className="text-sm text-muted-foreground"
              >
                Luna
              </label>
              <input
                id="period-month"
                type="month"
                value={selectedMonth.slice(0, 7)}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) setSelectedMonth(`${val}-01`);
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                aria-label="Selectează luna pentru revaluare"
              />
            </div>

            <button
              type="button"
              onClick={handleRevaluate}
              disabled={loading}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium",
                "bg-primary text-primary-foreground",
                "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "disabled:opacity-60 disabled:pointer-events-none",
                "min-h-[44px]" // WCAG touch target
              )}
              aria-busy={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCcw className="h-4 w-4" aria-hidden />
              )}
              {loading ? "Procesare..." : "Revaluează"}
            </button>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          {result && (
            <div className="rounded-md bg-muted/40 p-4 space-y-2">
              <p className="text-sm font-medium text-foreground">
                Rezultat revaluare — {formatMonth(result.period_month)}
              </p>
              <p className="text-sm text-muted-foreground">
                Înregistrări create:{" "}
                <span className="font-medium text-foreground">
                  {result.entries_created}
                </span>
              </p>
              <p className="text-sm text-muted-foreground">
                Diferență totală curs:{" "}
                <span
                  className={cn(
                    "font-medium",
                    result.total_fx_gain_loss_mdl_cents > 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : result.total_fx_gain_loss_mdl_cents < 0
                        ? "text-destructive"
                        : "text-foreground"
                  )}
                >
                  {formatMDL(result.total_fx_gain_loss_mdl_cents)}
                </span>
              </p>
            </div>
          )}
        </div>

        {/* History */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-base font-medium text-card-foreground">
              Ultimele revaluări
            </h2>
          </div>

          {listLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              Nicio revaluare efectuată încă.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" role="table">
                <thead>
                  <tr className="bg-muted/30">
                    <th
                      scope="col"
                      className="px-6 py-3 text-left font-medium text-muted-foreground"
                    >
                      Lună
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-right font-medium text-muted-foreground"
                    >
                      Diferență curs (MDL)
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-right font-medium text-muted-foreground"
                    >
                      # Înregistrări
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-right font-medium text-muted-foreground"
                    >
                      Data postării
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {history.map((row) => {
                    const gainPositive = row.total_fx_gain_loss_mdl_cents > 0;
                    const gainNegative = row.total_fx_gain_loss_mdl_cents < 0;
                    return (
                      <tr key={row.period_month} className="hover:bg-muted/20">
                        <td className="px-6 py-3 text-foreground">
                          {formatMonth(row.period_month)}
                        </td>
                        <td className="px-6 py-3 text-right">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 font-medium",
                              gainPositive
                                ? "text-emerald-600 dark:text-emerald-400"
                                : gainNegative
                                  ? "text-destructive"
                                  : "text-muted-foreground"
                            )}
                          >
                            {gainPositive ? (
                              <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                            ) : gainNegative ? (
                              <TrendingDown
                                className="h-3.5 w-3.5"
                                aria-hidden
                              />
                            ) : (
                              <Minus className="h-3.5 w-3.5" aria-hidden />
                            )}
                            {formatMDL(row.total_fx_gain_loss_mdl_cents)}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-right text-muted-foreground">
                          {row.entries_count}
                        </td>
                        <td className="px-6 py-3 text-right text-muted-foreground">
                          {new Date(row.posted_at).toLocaleDateString("ro-MD")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default RevaluationPage;
