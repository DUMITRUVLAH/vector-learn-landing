/**
 * MASS-002: FinDesk Operații Bulk — /app/fin/mass
 *
 * Features:
 * - Card "Generează facturi recurente" cu buton + opțiune e-Factura SFS
 * - Tabel job-uri: tip, dată, status (badge), total/success/fail/skipped
 * - Detalii job cu rânduri expandabile (contract ID, status, mesaj)
 * - Auto-refresh la 3s dacă există job cu status "running" sau "pending"
 *
 * Design: Vector 365 tokens, light + dark mode, WCAG AA.
 * No hardcoded hex — semantic tokens only.
 */

import { useEffect, useState, useCallback } from "react";
import {
  RefreshCw,
  Play,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  SkipForward,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import {
  startRecurringInvoicesJob,
  listBulkJobs,
  getBulkJob,
  importPartiesFromCsv,
  importSpendFromCsv,
  type FinBulkJob,
  type FinBulkRow,
} from "@/lib/api/finMass";
import { CsvImportZone } from "@/components/fin/CsvImportZone";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ro-RO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function jobTypeLabel(t: string): string {
  switch (t) {
    case "recurring_invoices":
      return "Facturi recurente";
    case "csv_import_parties":
      return "Import clienți CSV";
    case "csv_import_spend":
      return "Import cheltuieli CSV";
    default:
      return t;
  }
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  done: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  running: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  pending: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  cancelled: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500",
  success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  fail: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  skipped: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
};

const STATUS_LABELS: Record<string, string> = {
  done: "Finalizat",
  running: "În curs",
  pending: "În așteptare",
  failed: "Eșuat",
  cancelled: "Anulat",
  success: "Succes",
  fail: "Eroare",
  skipped: "Ignorat",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        STATUS_COLORS[status] ?? "bg-muted text-muted-foreground"
      )}
      aria-label={`Status: ${STATUS_LABELS[status] ?? status}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ─── Row detail row ───────────────────────────────────────────────────────────

function RowDetail({ row }: { row: FinBulkRow }) {
  return (
    <tr className="bg-muted/30 dark:bg-muted/10">
      <td className="py-1 pl-8 pr-2 text-xs font-mono text-muted-foreground">
        #{row.rowIndex + 1}
      </td>
      <td className="py-1 px-2 text-xs font-mono text-muted-foreground truncate max-w-[12rem]">
        {row.externalRef ?? "—"}
      </td>
      <td className="py-1 px-2">
        <StatusBadge status={row.status} />
      </td>
      <td className="py-1 px-2 text-xs text-muted-foreground">
        {row.resultRef ?? row.errorMessage ?? "—"}
      </td>
      <td className="py-1 px-2 text-xs text-muted-foreground">
        {row.retryCount > 0 ? `${row.retryCount}x retry` : ""}
      </td>
    </tr>
  );
}

// ─── Job row ─────────────────────────────────────────────────────────────────

interface JobRowProps {
  job: FinBulkJob;
  expanded: boolean;
  onToggle: () => void;
  rows: FinBulkRow[] | null;
  loadingRows: boolean;
}

function JobRow({ job, expanded, onToggle, rows, loadingRows }: JobRowProps) {
  const skipped = rows?.filter((r) => r.status === "skipped").length ?? 0;

  return (
    <>
      <tr
        className="border-b border-border hover:bg-muted/30 cursor-pointer transition-colors"
        onClick={onToggle}
        aria-expanded={expanded}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onToggle()}
      >
        <td className="py-3 pl-4 pr-2 text-sm text-muted-foreground">
          {expanded ? (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          )}
        </td>
        <td className="py-3 px-2 text-sm font-medium text-foreground">
          {jobTypeLabel(job.jobType)}
        </td>
        <td className="py-3 px-2 text-xs text-muted-foreground">
          {formatDate(job.createdAt)}
        </td>
        <td className="py-3 px-2">
          <StatusBadge status={job.status} />
        </td>
        <td className="py-3 px-2 text-center text-sm text-foreground">
          {job.totalRows}
        </td>
        <td className="py-3 px-2 text-center text-sm text-emerald-600 dark:text-emerald-400 font-medium">
          {job.successRows}
        </td>
        <td className="py-3 px-2 text-center text-sm text-red-600 dark:text-red-400 font-medium">
          {job.failRows}
        </td>
        <td className="py-3 pr-4 text-center text-sm text-blue-600 dark:text-blue-400">
          {skipped}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} className="pb-2">
            {loadingRows ? (
              <div className="px-8 py-4 text-sm text-muted-foreground animate-pulse">
                Se încarcă rândurile…
              </div>
            ) : rows && rows.length > 0 ? (
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                    <th className="pb-1 pl-8 pr-2">Nr</th>
                    <th className="pb-1 px-2">Ref extern</th>
                    <th className="pb-1 px-2">Status</th>
                    <th className="pb-1 px-2">Detalii</th>
                    <th className="pb-1 px-2">Retry</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <RowDetail key={r.id} row={r} />
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="px-8 py-4 text-sm text-muted-foreground">
                Niciun rând înregistrat.
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function FinMassPage() {
  const { data: session } = useSession();
  const [jobs, setJobs] = useState<FinBulkJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includeEinv, setIncludeEinv] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [csvPartyUploading, setCsvPartyUploading] = useState(false);
  const [csvSpendUploading, setCsvSpendUploading] = useState(false);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [jobRows, setJobRows] = useState<Record<string, FinBulkRow[] | null>>(
    {}
  );
  const [loadingRows, setLoadingRows] = useState<Record<string, boolean>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const result = await listBulkJobs({ limit: 20 });
      setJobs(result.jobs);
    } catch {
      setError("Eroare la încărcarea job-urilor. Reîncercați.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Auto-refresh when there are running/pending jobs
  useEffect(() => {
    const hasActiveJob = jobs.some(
      (j) => j.status === "running" || j.status === "pending"
    );
    if (!hasActiveJob) return;

    const timer = setInterval(() => {
      fetchJobs();
    }, 3000);

    return () => clearInterval(timer);
  }, [jobs, fetchJobs]);

  // Expand/collapse job detail
  const toggleJob = useCallback(
    async (jobId: string) => {
      if (expandedJob === jobId) {
        setExpandedJob(null);
        return;
      }
      setExpandedJob(jobId);

      if (!jobRows[jobId]) {
        setLoadingRows((prev) => ({ ...prev, [jobId]: true }));
        try {
          const detail = await getBulkJob(jobId);
          setJobRows((prev) => ({ ...prev, [jobId]: detail.rows }));
        } catch {
          setJobRows((prev) => ({ ...prev, [jobId]: [] }));
        } finally {
          setLoadingRows((prev) => ({ ...prev, [jobId]: false }));
        }
      }
    },
    [expandedJob, jobRows]
  );

  // Upload parties CSV
  const handlePartyCsvUpload = async (file: File) => {
    setCsvPartyUploading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const result = await importPartiesFromCsv(file);
      setSuccessMessage(
        `Import clienți pornit — ${result.totalRows} rând(uri) de procesat. ID job: ${result.jobId}`
      );
      await fetchJobs();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Eroare la importul CSV clienți."
      );
    } finally {
      setCsvPartyUploading(false);
    }
  };

  // Upload spend CSV
  const handleSpendCsvUpload = async (file: File) => {
    setCsvSpendUploading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const result = await importSpendFromCsv(file);
      setSuccessMessage(
        `Import cheltuieli pornit — ${result.totalRows} rând(uri) de procesat. ID job: ${result.jobId}`
      );
      await fetchJobs();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Eroare la importul CSV cheltuieli."
      );
    } finally {
      setCsvSpendUploading(false);
    }
  };

  // Start recurring invoices job
  const handleStartRecurring = async () => {
    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const result = await startRecurringInvoicesJob({ includeEinv });
      setSuccessMessage(
        `Job pornit — ${result.totalRows} contract(e) eligibile identificate. ID: ${result.jobId}`
      );
      // Refresh jobs list
      await fetchJobs();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Eroare la pornirea job-ului. Verificați conexiunea."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!session) return null;

  const hasRunningJob = jobs.some(
    (j) => j.status === "running" || j.status === "pending"
  );

  return (
    <AppShell
      pageTitle="Operații Bulk"
      pageDescription="Generare facturi în masă + import CSV — FinDesk"
    >
      <div className="max-w-5xl mx-auto space-y-8 p-4 sm:p-6">
        {/* ── Generate Recurring Invoices ───────────────────────────────── */}
        <section
          className="rounded-xl border border-border bg-card p-6 space-y-4"
          aria-label="Generare facturi recurente"
        >
          <div className="flex items-center gap-3">
            <FileText
              className="h-6 w-6 text-primary flex-shrink-0"
              aria-hidden="true"
            />
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Generează facturi recurente
              </h2>
              <p className="text-sm text-muted-foreground">
                Identifică contractele active cu servicii scadente și creează
                facturile B2B aferente lunii curente.
              </p>
            </div>
          </div>

          {/* Options */}
          <label className="flex items-center gap-2 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={includeEinv}
              onChange={(e) => setIncludeEinv(e.target.checked)}
              className="rounded border-border h-4 w-4 accent-primary"
              aria-label="Include trimitere e-Factura SFS"
            />
            <span className="text-sm text-foreground">
              Include trimitere e-Factura SFS (opțional)
            </span>
          </label>

          {/* Action */}
          <button
            type="button"
            onClick={handleStartRecurring}
            disabled={submitting || hasRunningJob}
            className={cn(
              "inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-lg",
              "text-sm font-medium transition-colors focus-visible:outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
            aria-label={
              submitting
                ? "Se pornește job-ul…"
                : hasRunningJob
                  ? "Un job este deja în curs"
                  : "Pornește generarea facturilor recurente"
            }
          >
            {submitting ? (
              <RefreshCw
                className="h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Play className="h-4 w-4" aria-hidden="true" />
            )}
            {submitting ? "Se pornește…" : "Generează facturi recurente"}
          </button>

          {hasRunningJob && !submitting && (
            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              Un job este în curs — așteptați finalizarea înainte de a porni unul nou.
            </p>
          )}

          {/* Feedback */}
          {successMessage && (
            <div
              role="status"
              aria-live="polite"
              className="flex items-start gap-2 text-sm text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3"
            >
              <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
              {successMessage}
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-3"
            >
              <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
              {error}
            </div>
          )}
        </section>

        {/* ── Import CSV Clienți ───────────────────────────────────────── */}
        <section
          className="rounded-xl border border-border bg-card p-6 space-y-4"
          aria-label="Import CSV clienți/furnizori"
        >
          <div className="flex items-center gap-3">
            <FileText
              className="h-6 w-6 text-primary flex-shrink-0"
              aria-hidden="true"
            />
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Import CSV Clienți / Furnizori
              </h2>
              <p className="text-sm text-muted-foreground">
                Importă parteneri B2B dintr-un fișier CSV. Rândurile deja
                existente (după IDNO) sunt omise automat.
              </p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 font-mono">
            Antet CSV: kind, name, country, idno, iban, address, city, email, phone
          </div>
          <CsvImportZone
            onUpload={handlePartyCsvUpload}
            label="Trage fișierul CSV clienți sau apasă pentru a selecta"
            disabled={csvPartyUploading || hasRunningJob}
          />
          {csvPartyUploading && (
            <p className="text-xs text-muted-foreground flex items-center gap-1" role="status" aria-live="polite">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Se pornește importul…
            </p>
          )}
        </section>

        {/* ── Import CSV Cheltuieli ─────────────────────────────────────── */}
        <section
          className="rounded-xl border border-border bg-card p-6 space-y-4"
          aria-label="Import CSV cheltuieli"
        >
          <div className="flex items-center gap-3">
            <FileText
              className="h-6 w-6 text-primary flex-shrink-0"
              aria-hidden="true"
            />
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Import CSV Cheltuieli
              </h2>
              <p className="text-sm text-muted-foreground">
                Importă înregistrări de cheltuieli dintr-un fișier CSV.
                Rândurile duplicate (hash SHA-256 identic) sunt omise automat.
              </p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 font-mono">
            Antet CSV: category, amount_cents, currency, vat_deductible, description, vendor_name, expense_date, reference
          </div>
          <CsvImportZone
            onUpload={handleSpendCsvUpload}
            label="Trage fișierul CSV cheltuieli sau apasă pentru a selecta"
            disabled={csvSpendUploading || hasRunningJob}
          />
          {csvSpendUploading && (
            <p className="text-xs text-muted-foreground flex items-center gap-1" role="status" aria-live="polite">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Se pornește importul…
            </p>
          )}
        </section>

        {/* ── Jobs table ───────────────────────────────────────────────── */}
        <section aria-label="Istoric job-uri bulk">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-foreground">
              Job-uri recente
            </h2>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                fetchJobs();
              }}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors min-h-[44px] px-3"
              aria-label="Reîncarcă lista de job-uri"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Reîncarcă
            </button>
          </div>

          {loading ? (
            <div
              className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground"
              aria-label="Se încarcă job-urile"
            >
              <RefreshCw
                className="h-6 w-6 mx-auto mb-2 animate-spin opacity-40"
                aria-hidden="true"
              />
              <p className="text-sm">Se încarcă…</p>
            </div>
          ) : jobs.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
              <SkipForward
                className="h-8 w-8 mx-auto mb-2 opacity-30"
                aria-hidden="true"
              />
              <p className="text-sm">Niciun job creat încă.</p>
              <p className="text-xs mt-1">
                Apăsați „Generează facturi recurente" pentru a crea primul job.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full text-left" aria-label="Lista job-uri bulk">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="py-2.5 pl-4 pr-2 w-8" aria-label="Expandează"></th>
                    <th className="py-2.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Tip
                    </th>
                    <th className="py-2.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Creat la
                    </th>
                    <th className="py-2.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Status
                    </th>
                    <th className="py-2.5 px-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Total
                    </th>
                    <th className="py-2.5 px-2 text-center text-[11px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                      OK
                    </th>
                    <th className="py-2.5 px-2 text-center text-[11px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
                      ERR
                    </th>
                    <th className="py-2.5 pr-4 text-center text-[11px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                      Skip
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <JobRow
                      key={job.id}
                      job={job}
                      expanded={expandedJob === job.id}
                      onToggle={() => toggleJob(job.id)}
                      rows={jobRows[job.id] ?? null}
                      loadingRows={loadingRows[job.id] ?? false}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Auto-refresh indicator */}
          {hasRunningJob && (
            <p
              className="mt-2 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1"
              role="status"
              aria-live="polite"
            >
              <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Actualizare automată la 3s — job în curs…
            </p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
