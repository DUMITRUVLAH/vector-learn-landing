/**
 * TRUST-002: FinDesk AI Audit Log page
 *
 * Route: /app/fin/settings/ai-audit
 *
 * Shows all AI calls (action, model, tokens, cost, pseudonymized flag) for the tenant.
 * Supports pagination, filtering by action and date range.
 * Admin/manager can purge log entries older than the retention window.
 *
 * FIN-CORE §1.16 — GDPR traceability of AI data processing.
 */

import { useEffect, useState, useCallback } from "react";
import {
  Loader2,
  Trash2,
  RefreshCw,
  Shield,
  Filter,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import {
  listAiAuditLog,
  purgeAiAuditLog,
  type AiAuditEntry,
} from "@/lib/api/finAiAudit";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ro-RO", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatCostUsd(microUsd: number): string {
  if (microUsd === 0) return "—";
  return `$${(microUsd / 1_000_000).toFixed(4)}`;
}

const ACTION_LABELS: Record<string, string> = {
  lesson_summary: "Rezumat lecție",
  churn_prediction: "Predicție abandon",
  lead_qualification: "Calificare lead",
  reply_suggestion: "Sugestie răspuns",
  system: "Sistem",
};

const AI_ACTIONS = [
  "lesson_summary",
  "churn_prediction",
  "lead_qualification",
  "reply_suggestion",
  "system",
];

// ─── Component ───────────────────────────────────────────────────────────────

export function FinAiAuditPage() {
  const { status: sessionStatus } = useSession();

  const [entries, setEntries] = useState<AiAuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterAction, setFilterAction] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  // Purge dialog
  const [showPurgeDialog, setShowPurgeDialog] = useState(false);
  const [purging, setPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState<number | null>(null);

  const PAGE_SIZE = 50;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchData = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await listAiAuditLog({
        page: p,
        limit: PAGE_SIZE,
        action: filterAction || undefined,
        from: filterFrom || undefined,
        to: filterTo || undefined,
      });
      setEntries(res.data);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la încărcare");
    } finally {
      setLoading(false);
    }
  }, [filterAction, filterFrom, filterTo]);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    fetchData(page);
  }, [sessionStatus, page, fetchData]);

  function handleFilter() {
    setPage(1);
    fetchData(1);
  }

  async function handlePurge() {
    setPurging(true);
    try {
      const res = await purgeAiAuditLog();
      setPurgeResult(res.deleted);
      setShowPurgeDialog(false);
      // Refresh after purge
      fetchData(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la purge");
    } finally {
      setPurging(false);
    }
  }

  if (sessionStatus === "loading") {
    return (
      <AppShell pageTitle="Audit AI">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell pageTitle="Audit AI — FinDesk">
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Shield className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">
                Jurnal Audit AI
              </h1>
              <p className="text-sm text-muted-foreground">
                Toate apelurile AI ale tenantului — GDPR Art. 30 trasabilitate
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowPurgeDialog(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-md border border-destructive/50 text-destructive hover:bg-destructive/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
            aria-label="Șterge log vechi conform politicii de retenție"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Purge log vechi
          </button>
        </div>

        {/* Purge result toast */}
        {purgeResult !== null && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-md bg-success/10 border border-success/30 px-4 py-2 text-sm text-success"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {purgeResult} înregistrări șterse conform politicii de retenție.
          </div>
        )}

        {/* Filters */}
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm font-medium text-foreground">Filtre</span>
          </div>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1 min-w-[160px]">
              <label
                htmlFor="filter-action"
                className="text-xs text-muted-foreground"
              >
                Acțiune AI
              </label>
              <select
                id="filter-action"
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Toate acțiunile</option>
                {AI_ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {ACTION_LABELS[a] ?? a}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor="filter-from"
                className="text-xs text-muted-foreground"
              >
                De la
              </label>
              <input
                id="filter-from"
                type="date"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor="filter-to"
                className="text-xs text-muted-foreground"
              >
                Până la
              </label>
              <input
                id="filter-to"
                type="date"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <button
              onClick={handleFilter}
              className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Aplică
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/30 px-4 py-2 text-sm text-destructive"
          >
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            {error}
          </div>
        )}

        {/* Table */}
        <div className="rounded-lg border bg-card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2
                className="h-6 w-6 animate-spin text-muted-foreground"
                aria-label="Se încarcă"
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th
                      scope="col"
                      className="px-4 py-3 text-left font-medium text-muted-foreground"
                    >
                      Data
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-left font-medium text-muted-foreground"
                    >
                      Acțiune
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-left font-medium text-muted-foreground"
                    >
                      Model
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-right font-medium text-muted-foreground"
                    >
                      Tokene (in+out)
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-right font-medium text-muted-foreground"
                    >
                      Cost ($)
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-center font-medium text-muted-foreground"
                    >
                      Pseudonimizat
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-left font-medium text-muted-foreground"
                    >
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-12 text-center text-muted-foreground"
                      >
                        Niciun apel AI înregistrat{filterAction ? ` pentru acțiunea „${filterAction}"` : ""}.
                      </td>
                    </tr>
                  ) : (
                    entries.map((entry) => (
                      <tr
                        key={entry.id}
                        className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-4 py-3 text-foreground whitespace-nowrap">
                          {formatDate(entry.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary font-medium">
                            {ACTION_LABELS[entry.action] ?? entry.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                          {entry.model}
                        </td>
                        <td className="px-4 py-3 text-right text-foreground tabular-nums">
                          {(entry.promptTokens + entry.completionTokens).toLocaleString("ro-RO")}
                        </td>
                        <td className="px-4 py-3 text-right text-foreground tabular-nums">
                          {formatCostUsd(entry.costUsdMicro)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {entry.pseudonymized ? (
                            <span
                              className="inline-block w-2 h-2 rounded-full bg-success"
                              title="PII pseudonimizat"
                              aria-label="PII pseudonimizat"
                            />
                          ) : (
                            <span
                              className="inline-block w-2 h-2 rounded-full bg-destructive"
                              title="PII neprotejat"
                              aria-label="PII neprotejat"
                            />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              entry.status === "completed"
                                ? "bg-success/15 text-success"
                                : entry.status === "error"
                                ? "bg-destructive/15 text-destructive"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {entry.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!loading && total > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
              <p className="text-sm text-muted-foreground">
                {total.toLocaleString("ro-RO")} înregistrări totale · pagina{" "}
                {page} din {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-md border border-input text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Pagina anterioară"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-md border border-input text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Pagina următoare"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Purge confirmation dialog */}
      {showPurgeDialog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="purge-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-sm rounded-xl bg-background border shadow-xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-destructive/10 shrink-0">
                <AlertTriangle
                  className="h-5 w-5 text-destructive"
                  aria-hidden="true"
                />
              </div>
              <div>
                <h2
                  id="purge-dialog-title"
                  className="font-semibold text-foreground"
                >
                  Confirmare ștergere
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Vor fi șterse toate înregistrările de audit AI mai vechi decât
                  perioada de retenție configurată. Această acțiune este
                  ireversibilă.
                </p>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowPurgeDialog(false)}
                disabled={purging}
                className="px-4 py-2 text-sm rounded-md border border-input text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                Anulare
              </button>
              <button
                onClick={handlePurge}
                disabled={purging}
                className="px-4 py-2 text-sm rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive disabled:opacity-50 flex items-center gap-2"
              >
                {purging ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Se șterge...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Șterge log vechi
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
