/**
 * HR-401 — Payroll management page /app/hr/payroll
 * Calculator salariu lunar per profesor + tabel status
 */
import React, { useEffect, useState, useCallback } from "react";
import { Loader2, Calculator, CheckCircle2, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  listPayroll,
  calculatePayroll,
  updatePayrollStatus,
  type PayrollEntry,
  type PayrollStatus,
} from "@/lib/api/payroll";
import { cn } from "@/lib/utils";

// ─── Status labels ────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<PayrollStatus, string> = {
  draft: "Ciornă",
  approved: "Aprobat",
  paid: "Plătit",
};

const STATUS_BADGE: Record<PayrollStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  approved: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  paid: "bg-success/10 text-success",
};

function formatEur(cents: number): string {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function PayrollPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const [entries, setEntries] = useState<PayrollEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Default to current month
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchPayroll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listPayroll(selectedMonth);
      setEntries(res.items);
    } catch {
      setError("Nu pot încărca datele de salarizare.");
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => { void fetchPayroll(); }, [fetchPayroll]);

  const handleCalculate = async () => {
    setCalculating(true);
    try {
      const res = await calculatePayroll(selectedMonth);
      setEntries(res.entries.map((e: PayrollEntry) => ({ ...e, teacherName: e.teacherName ?? "Profesor" })));
      setToast({
        kind: "success",
        message: `Salarizare calculată: ${formatEur(res.totalCents)} total pentru ${res.entries.length} profesori.`,
      });
    } catch {
      setToast({ kind: "error", message: "Eroare la calculul salarizării." });
    } finally {
      setCalculating(false);
    }
  };

  const handleStatusChange = async (id: string, status: PayrollStatus) => {
    try {
      const updated = await updatePayrollStatus(id, status);
      setEntries((prev) => prev.map((e) => e.id === id ? { ...e, status: updated.status } : e));
      setToast({ kind: "success", message: `Status actualizat: ${STATUS_LABEL[status]}` });
    } catch {
      setToast({ kind: "error", message: "Nu pot actualiza statusul." });
    }
  };

  const totalCents = entries.reduce((s, e) => s + e.totalCents, 0);

  return (
    <AppShell
      pageTitle="Salarizare"
      pageDescription="Calculul lunar al salariilor profesorilor"
      actions={
        <button
          type="button"
          onClick={() => void handleCalculate()}
          disabled={calculating}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 min-h-[44px]"
        >
          {calculating
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Calculator className="h-4 w-4" aria-hidden="true" />}
          Calculează luna
        </button>
      }
    >
      {/* Month picker */}
      <div className="flex items-center gap-3 mb-6">
        <label htmlFor="payroll-month" className="text-sm font-semibold text-muted-foreground">
          Luna:
        </label>
        <input
          id="payroll-month"
          type="month"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          aria-label="Luna pentru salarizare"
        />
        {entries.length > 0 && (
          <div className="ml-auto text-sm font-semibold">
            Total: <span className="text-primary">{formatEur(totalCents)}</span>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive mb-4">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {/* Payroll table */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-12 bg-muted/20 rounded animate-pulse" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="py-12 text-center">
          <Calculator className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Niciun calcul de salarizare pentru {selectedMonth}.</p>
          <p className="text-xs text-muted-foreground mt-1">Apasă „Calculează luna" pentru a genera salariile.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden" data-testid="payroll-table">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Profesor</th>
                <th className="text-right px-4 py-3 font-semibold">Ore</th>
                <th className="text-right px-4 py-3 font-semibold">Brut (€)</th>
                <th className="text-right px-4 py-3 font-semibold hidden sm:table-cell">Comision</th>
                <th className="text-right px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <React.Fragment key={entry.id}>
                  <tr
                    className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium">{entry.teacherName}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {Number(entry.totalHours).toFixed(1)}h
                    </td>
                    <td className="px-4 py-3 text-right font-bold">{formatEur(entry.totalCents)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground hidden sm:table-cell">
                      {formatEur(entry.commissionCents)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <select
                        value={entry.status}
                        onChange={(e) => void handleStatusChange(entry.id, e.target.value as PayrollStatus)}
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold border-0 outline-none cursor-pointer",
                          STATUS_BADGE[entry.status]
                        )}
                        aria-label={`Status salarizare ${entry.teacherName}`}
                      >
                        {(["draft", "approved", "paid"] as PayrollStatus[]).map((s) => (
                          <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-3">
                      {entry.breakdown && entry.breakdown.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                          className="rounded-md p-1 hover:bg-muted"
                          aria-label={expandedId === entry.id ? "Ascunde detalii" : "Arată detalii lecții"}
                          aria-expanded={expandedId === entry.id}
                        >
                          {expandedId === entry.id
                            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        </button>
                      )}
                    </td>
                  </tr>
                  {/* Breakdown */}
                  {expandedId === entry.id && entry.breakdown && (
                    <tr className="bg-muted/10 border-b border-border">
                      <td colSpan={6} className="px-6 py-3">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-muted-foreground">
                              <th className="text-left pb-1">Lecție</th>
                              <th className="text-right pb-1">Min.</th>
                              <th className="text-right pb-1">Tarif (€/h)</th>
                              <th className="text-right pb-1">Subtotal</th>
                            </tr>
                          </thead>
                          <tbody>
                            {entry.breakdown.map((b) => (
                              <tr key={b.lessonId} className="border-t border-border/50">
                                <td className="py-0.5">
                                  {new Date(b.scheduledAt).toLocaleDateString("ro-RO")}
                                </td>
                                <td className="py-0.5 text-right text-muted-foreground">{b.durationMinutes}</td>
                                <td className="py-0.5 text-right text-muted-foreground">
                                  {formatEur(b.rateCents)}
                                </td>
                                <td className="py-0.5 text-right font-semibold">{formatEur(b.subtotalCents)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "fixed bottom-4 right-4 z-50 rounded-lg border shadow-lg px-4 py-3 text-sm font-medium max-w-sm",
            toast.kind === "success"
              ? "bg-success/10 border-success/30 text-success"
              : "bg-destructive/10 border-destructive/30 text-destructive"
          )}
        >
          {toast.kind === "success"
            ? <CheckCircle2 className="inline h-4 w-4 mr-2" aria-hidden="true" />
            : <AlertTriangle className="inline h-4 w-4 mr-2" aria-hidden="true" />}
          {toast.message}
        </div>
      )}
    </AppShell>
  );
}
