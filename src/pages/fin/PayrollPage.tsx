/**
 * PAY-002 (FIN): Pagina /app/fin/payroll
 *
 * Lista rulaje de salarizare cu status, total brut/net/cost angajator,
 * buton "Calculează" (POST /runs/:id/calculate) și buton "Confirmă"
 * (POST /runs/:id/confirm).
 *
 * Design: design-system tokens, light+dark, WCAG AA, fără hex hardcodate.
 */

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/app/AppShell";
import { cn } from "@/lib/utils";
import {
  Users,
  Calculator,
  CheckCircle,
  Clock,
  AlertCircle,
  Plus,
  RefreshCw,
  ChevronRight,
  ExternalLink,
  Banknote,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PayrollRunSummary {
  id: string;
  periodMonth: string;
  status: "draft" | "confirmed" | "paid";
  confirmedAt: string | null;
  paidAt: string | null;
  notes: string | null;
  totalGrossCents: number;
  totalNetCents: number;
  totalEmployerCostCents: number;
  itemCount: number;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  "draft" | "confirmed" | "paid",
  { label: string; icon: React.ElementType; className: string }
> = {
  draft: {
    label: "Ciornă",
    icon: Clock,
    className:
      "bg-muted text-muted-foreground border-border",
  },
  confirmed: {
    label: "Confirmat",
    icon: CheckCircle,
    className:
      "bg-success/10 text-success border-success/20",
  },
  paid: {
    label: "Plătit",
    icon: Banknote,
    className:
      "bg-primary/10 text-primary border-primary/20",
  },
};

function formatCents(cents: number): string {
  return new Intl.NumberFormat("ro-RO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function StatusBadge({ status }: { status: "draft" | "confirmed" | "paid" }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        cfg.className
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {cfg.label}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PayrollFINPage() {
  const [runs, setRuns] = useState<PayrollRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Create run state
  const [showCreate, setShowCreate] = useState(false);
  const [newMonth, setNewMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/fin/payroll/runs", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { runs: PayrollRunSummary[] };
      setRuns(json.runs);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Eroare la încărcare.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createRun() {
    if (!newMonth) return;
    setActionLoading("create");
    try {
      const res = await fetch("/api/fin/payroll/runs", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodMonth: newMonth }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setShowCreate(false);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Eroare la creare rulaj.");
    } finally {
      setActionLoading(null);
    }
  }

  async function calculate(runId: string) {
    setActionLoading(runId + "-calc");
    try {
      const res = await fetch(`/api/fin/payroll/runs/${runId}/calculate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jurisdiction: "MD" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Eroare la calcul.");
    } finally {
      setActionLoading(null);
    }
  }

  async function confirm(runId: string) {
    setActionLoading(runId + "-confirm");
    try {
      const res = await fetch(`/api/fin/payroll/runs/${runId}/confirm`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Eroare la confirmare.");
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <AppShell pageTitle="Salarizare (Payroll)">
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Salarizare</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Rulaje lunare de calcul salarii — calcul DETERMINIST brut↔net
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="#/business/fin/payroll/employees"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium",
                "bg-background text-foreground hover:bg-muted transition-colors"
              )}
            >
              <Users className="h-4 w-4" aria-hidden="true" />
              Angajați
            </a>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              aria-label="Reîncarcă"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm",
                "bg-background text-foreground hover:bg-muted transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              <RefreshCw
                className={cn("h-4 w-4", loading && "animate-spin")}
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium",
                "bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              )}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Rulaj nou
            </button>
          </div>
        </div>

        {/* Create run modal */}
        {showCreate && (
          <div
            role="dialog"
            aria-labelledby="create-run-title"
            className="rounded-lg border border-border bg-card p-4 shadow-sm"
          >
            <h2
              id="create-run-title"
              className="text-sm font-semibold text-foreground mb-3"
            >
              Creare rulaj nou
            </h2>
            <div className="flex items-center gap-3">
              <label htmlFor="period-month" className="text-sm text-muted-foreground">
                Luna perioadei:
              </label>
              <input
                id="period-month"
                type="month"
                value={newMonth}
                onChange={(e) => setNewMonth(e.target.value)}
                className={cn(
                  "rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground",
                  "focus:outline-none focus:ring-2 focus:ring-primary/50"
                )}
              />
              <button
                type="button"
                onClick={() => void createRun()}
                disabled={actionLoading === "create"}
                className={cn(
                  "rounded-lg px-4 py-1.5 text-sm font-medium",
                  "bg-primary text-primary-foreground hover:bg-primary/90 transition-colors",
                  "disabled:opacity-50"
                )}
              >
                {actionLoading === "create" ? "Se creează…" : "Crează"}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Anulează
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
            <button
              type="button"
              className="ml-auto text-xs underline"
              onClick={() => setError(null)}
            >
              Închide
            </button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && runs.length === 0 && (
          <div className="space-y-3" aria-label="Se încarcă…">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" aria-hidden="true" />
            ))}
          </div>
        )}

        {/* Runs list */}
        {!loading && runs.length === 0 && (
          <div className="text-center py-12">
            <Users
              className="h-10 w-10 mx-auto text-muted-foreground mb-3"
              aria-hidden="true"
            />
            <p className="text-muted-foreground text-sm">
              Niciun rulaj de salarizare. Creați primul rulaj.
            </p>
            <a
              href="#/business/fin/payroll/employees"
              className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              Adăugați angajați mai întâi
              <ChevronRight className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>
        )}

        {runs.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-left border-b border-border">
                  <th scope="col" className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Perioadă
                  </th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right">
                    Total brut
                  </th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right">
                    Total net
                  </th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right">
                    Cost angajator
                  </th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">
                    Angajați
                  </th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Acțiuni
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {runs.map((run) => (
                  <tr key={run.id} className="bg-card hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {run.periodMonth}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      {run.itemCount > 0 ? formatCents(run.totalGrossCents) : "—"} MDL
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-success">
                      {run.itemCount > 0 ? formatCents(run.totalNetCents) : "—"} MDL
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {run.itemCount > 0 ? formatCents(run.totalEmployerCostCents) : "—"} MDL
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground">
                      {run.itemCount}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {run.status === "draft" && (
                          <>
                            <button
                              type="button"
                              onClick={() => void calculate(run.id)}
                              disabled={actionLoading === run.id + "-calc"}
                              className={cn(
                                "inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium",
                                "bg-muted text-foreground border border-border hover:bg-muted/70 transition-colors",
                                "disabled:opacity-50"
                              )}
                            >
                              <Calculator className="h-3 w-3" aria-hidden="true" />
                              {actionLoading === run.id + "-calc" ? "…" : "Calculează"}
                            </button>
                            {run.itemCount > 0 && (
                              <button
                                type="button"
                                onClick={() => void confirm(run.id)}
                                disabled={actionLoading === run.id + "-confirm"}
                                className={cn(
                                  "inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium",
                                  "bg-success/10 text-success border border-success/20 hover:bg-success/20 transition-colors",
                                  "disabled:opacity-50"
                                )}
                              >
                                <CheckCircle className="h-3 w-3" aria-hidden="true" />
                                {actionLoading === run.id + "-confirm" ? "…" : "Confirmă"}
                              </button>
                            )}
                          </>
                        )}
                        {run.status !== "draft" && (
                          <span className="text-xs text-muted-foreground">
                            {run.status === "confirmed"
                              ? `Confirmat ${run.confirmedAt ? new Date(run.confirmedAt).toLocaleDateString("ro-RO") : ""}`
                              : "Plătit"}
                          </span>
                        )}
                        <a
                          href={`#/business/fin/payroll/runs/${run.id}`}
                          aria-label={`Deschide detaliu rulaj ${run.periodMonth}`}
                          className={cn(
                            "inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium",
                            "border border-border bg-background text-foreground hover:bg-muted transition-colors"
                          )}
                        >
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          Detalii
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
