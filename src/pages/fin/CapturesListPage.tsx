/**
 * CAPTURE-003 + Team Docs: /business/fin/captures (și /business/fin/captures)
 *
 * Inbox comun de documente: orice echipă (marketing, IT, ops…) încarcă facturi
 * (Facebook Ads, Google Ads etc.), AI extrage câmpurile (sumă, furnizor, categorie,
 * scop), iar contabilul are la sfârșit de lună un raport grupat pe echipe.
 *
 * Design: Vector 365 tokens, light + dark, WCAG AA.
 */
import { useState, useEffect, useCallback } from "react";
import {
  FileText,
  Loader2,
  Upload,
  AlertCircle,
  Sparkles,
  X,
  Link2,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useRouter } from "@/router/HashRouter";
import { apiUpload } from "@/lib/api";
import {
  getCaptures,
  getCapturesSummary,
  matchCaptures,
  deleteCapture,
  formatMDLCents,
  CAPTURE_STATUS_LABELS,
  TEAM_LABELS,
  CATEGORY_LABELS,
  REPORTABLE_LABELS,
  DOCUMENT_CLASS_LABELS,
  type FinCapture,
  type FinCaptureStatus,
  type FinDocTeam,
  type CapturesSummary,
  type ExpenseCategory,
  type ReportableStatus,
  type DocumentClassStatus,
  type MatchResult,
} from "@/lib/api/finCaptures";
import { cn } from "@/lib/utils";

const TEAMS = Object.keys(TEAM_LABELS) as FinDocTeam[];

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: FinCaptureStatus }) {
  const styles: Record<FinCaptureStatus, string> = {
    pending: "bg-muted text-muted-foreground",
    processing: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    extracted: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    confirmed: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    failed: "bg-destructive/10 text-destructive",
  };
  return (
    <span className={cn("rounded px-2 py-0.5 text-xs font-medium", styles[status])}>
      {CAPTURE_STATUS_LABELS[status]}
    </span>
  );
}

// ─── Invoice Reporting verdict badge ────────────────────────────────────────────

function ReportableBadge({ value }: { value: ReportableStatus }) {
  const styles: Record<ReportableStatus, string> = {
    yes: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    no: "bg-muted text-muted-foreground",
    review: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  };
  return (
    <span className={cn("rounded px-2 py-0.5 text-xs font-medium", styles[value])}>
      {REPORTABLE_LABELS[value]}
    </span>
  );
}

// ─── Document-class verdict badge ───────────────────────────────────────────────
// "not_invoice" is styled as a warning so a wrongly-uploaded file jumps out at a glance.

function DocumentClassBadge({ value }: { value: DocumentClassStatus }) {
  const styles: Record<DocumentClassStatus, string> = {
    invoice: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    receipt: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    not_invoice: "bg-destructive/10 text-destructive",
    review: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  };
  return (
    <span className={cn("rounded px-2 py-0.5 text-xs font-medium", styles[value])}>
      {DOCUMENT_CLASS_LABELS[value]}
    </span>
  );
}

// ─── Upload panel (paste invoice text → AI extracts) ────────────────────────────

function UploadPanel({
  onClose,
  onUploaded,
}: {
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [team, setTeam] = useState<FinDocTeam>("marketing");
  const [file, setFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState("");
  const [showText, setShowText] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [isStatement, setIsStatement] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isPdf = file?.type === "application/pdf";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!file && !rawText.trim()) {
      setErr("Atașați un fișier (poză, PDF sau CSV) sau lipiți textul.");
      return;
    }
    // PDF/CSV: serverul extrage textul automat. Nu mai blocăm pe text lipit.
    setSubmitting(true);
    try {
      const form = new FormData();
      form.set("team", team);
      if (isStatement) form.set("kind", "statement");
      if (file) form.set("file", file, file.name);
      if (rawText.trim()) form.set("rawText", rawText.trim());
      await apiUpload("/api/fin/captures", form);
      onUploaded();
      onClose();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Eroare la încărcare");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          Document nou — AI citește factura automat
        </h2>
        <button
          onClick={onClose}
          aria-label="Închide"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label htmlFor="doc-team" className="block text-xs font-medium text-muted-foreground mb-1">
            Echipă
          </label>
          <select
            id="doc-team"
            value={team}
            onChange={(e) => setTeam(e.target.value as FinDocTeam)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring sm:max-w-xs"
          >
            {TEAMS.map((t) => (
              <option key={t} value={t}>
                {TEAM_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        {/* Bank statement toggle: extract every transaction as a reviewable line */}
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={isStatement}
            onChange={(e) => setIsStatement(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          Este extras bancar (AI extrage toate tranzacțiile separat)
        </label>

        {/* Drag-drop / file picker */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Document (poză, PDF sau CSV — AI îl citește automat)
          </label>
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) setFile(f);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors",
              dragOver ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
            )}
          >
            <Upload className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            {file ? (
              <span className="text-sm font-medium text-foreground">{file.name}</span>
            ) : (
              <>
                <span className="text-sm text-foreground">Trage fișierul aici sau click pentru a alege</span>
                <span className="text-xs text-muted-foreground">Poză, PDF, CSV / extras de cont (max 8MB)</span>
              </>
            )}
            <input
              type="file"
              accept="image/*,application/pdf,.csv,.mt940,.sta,.txt,text/csv"
              className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {isPdf && (
            <p className="mt-1 text-xs text-muted-foreground">
              PDF: AI extrage textul automat. Dacă e scanat (poză), poți lipi textul mai jos.
            </p>
          )}
        </div>

        {/* Optional text fallback */}
        {!showText ? (
          <button
            type="button"
            onClick={() => setShowText(true)}
            className="text-xs font-medium text-primary hover:underline"
          >
            + Adaugă text (dacă nu ai fișier sau pentru PDF)
          </button>
        ) : (
          <div>
            <label htmlFor="doc-text" className="block text-xs font-medium text-muted-foreground mb-1">
              Textul facturii (opțional / pentru PDF)
            </label>
            <textarea
              id="doc-text"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={4}
              placeholder={"Meta Platforms Ireland\nFacebook Ads - campanie promovare\nTotal: 5.400,00 MDL (TVA 900,00)\nData: 2026-01-31"}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        )}

        {err && (
          <p className="flex items-center gap-1.5 text-xs text-destructive" role="alert">
            <AlertCircle className="h-3.5 w-3.5" /> {err}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          )}
          {submitting ? "AI procesează…" : "Încarcă + extrage cu AI"}
        </button>
      </form>
    </div>
  );
}

// ─── Month-end summary cards (for the accountant) ───────────────────────────────

function SummaryCards({ summary }: { summary: CapturesSummary }) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Documente" value={String(summary.totalDocuments)} />
        <Stat label="Pentru raportare" value={String(summary.reportableCounts?.yes ?? 0)} variant="good" />
        <Stat label="De verificat" value={String(summary.reportableCounts?.review ?? 0)} variant="warning" />
        <Stat label="Total lună" value={formatMDLCents(summary.totalCents)} />
      </div>
      {summary.byTeam.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Breakdown
            title="Pe echipă"
            rows={summary.byTeam.map((t) => ({
              label: TEAM_LABELS[t.team] ?? t.team,
              count: t.count,
              totalCents: t.totalCents,
            }))}
          />
          <Breakdown
            title="Pe categorie"
            rows={summary.byCategory.map((c) => ({
              label: CATEGORY_LABELS[c.category as ExpenseCategory] ?? c.category,
              count: c.count,
              totalCents: c.totalCents,
            }))}
          />
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant?: "warning" | "good";
}) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-lg font-semibold",
          variant === "warning"
            ? "text-amber-600 dark:text-amber-400"
            : variant === "good"
              ? "text-green-600 dark:text-green-400"
              : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Breakdown({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; count: number; totalCents: number }>;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between text-sm">
            <span className="text-foreground">
              {r.label} <span className="text-muted-foreground">· {r.count}</span>
            </span>
            <span className="font-medium text-foreground">{formatMDLCents(r.totalCents)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CapturesListPage() {
  const { navigate } = useRouter();
  const [captures, setCaptures] = useState<FinCapture[]>([]);
  const [summary, setSummary] = useState<CapturesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const [teamFilter, setTeamFilter] = useState<FinDocTeam | "">("");
  const [month, setMonth] = useState(currentMonth());

  const [matching, setMatching] = useState(false);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const removeCapture = async (capture: FinCapture) => {
    const isStatement = capture.kind === "statement";
    const msg = isStatement
      ? `Ștergi extrasul „${capture.fileName}" și toate tranzacțiile lui?`
      : `Ștergi documentul „${capture.fileName}"?`;
    if (!window.confirm(msg)) return;
    setDeletingId(capture.id);
    setError(null);
    try {
      await deleteCapture(capture.id);
      setCaptures((prev) => prev.filter((c) => c.id !== capture.id));
      setMatchResult(null); // counts are now stale
      getCapturesSummary(month).then(setSummary).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare la ștergere");
    } finally {
      setDeletingId(null);
    }
  };

  const runMatch = async () => {
    setMatching(true);
    setMatchResult(null);
    setError(null);
    try {
      setMatchResult(await matchCaptures({ month }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare la potrivire");
    } finally {
      setMatching(false);
    }
  };

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      // hideMatched: keep the main list to statements + still-unmatched documents; invoices/
      // receipts already attributed to a statement appear under that statement, not here.
      getCaptures({ team: teamFilter || undefined, month, hideMatched: true }),
      getCapturesSummary(month),
    ])
      .then(([list, sum]) => {
        setCaptures(list.captures);
        setSummary(sum);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Eroare la încărcare"))
      .finally(() => setLoading(false));
  }, [teamFilter, month]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AppShell pageTitle="Invoice Reporting">
      <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Invoice Reporting</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Încarcă facturi/tranzacții (CSV, PDF, poză). AI le citește și decide dacă fiecare
              este <strong>pentru raportare</strong>; tu confirmi sau respingi verdictul.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={runMatch}
              disabled={matching}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              {matching ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Link2 className="h-4 w-4" aria-hidden="true" />
              )}
              {matching ? "Se potrivește…" : "Potrivește facturi ↔ tranzacții"}
            </button>
            <button
              onClick={() => setShowUpload((v) => !v)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              Document nou
            </button>
          </div>
        </div>

        {showUpload && (
          <UploadPanel onClose={() => setShowUpload(false)} onUploaded={load} />
        )}

        {/* Match result summary (after pressing "Potrivește") */}
        {matchResult && (
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5" role="status">
            <div className="mb-2 flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-foreground">
                Potrivire factură ↔ tranzacții{matchResult.month ? ` · ${matchResult.month}` : ""}
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="Tranzacții" value={String(matchResult.totalLines)} />
              <Stat label="Au factură" value={String(matchResult.matchedCount)} variant="good" />
              <Stat label="Fără factură" value={String(matchResult.missingCount)} variant="warning" />
            </div>
            {matchResult.totalLines === 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Nicio tranzacție de plată găsită. Încarcă un extras bancar (bifează „Este extras bancar")
                ca să ai ce potrivi cu facturile.
              </p>
            )}
          </div>
        )}

        {/* Month-end summary */}
        {summary && <SummaryCards summary={summary} />}

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="f-month" className="block text-xs font-medium text-muted-foreground mb-1">
              Luna
            </label>
            <input
              id="f-month"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label htmlFor="f-team" className="block text-xs font-medium text-muted-foreground mb-1">
              Echipă
            </label>
            <select
              id="f-team"
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value as FinDocTeam | "")}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Toate echipele</option>
              {TEAMS.map((t) => (
                <option key={t} value={t}>
                  {TEAM_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex min-h-[160px] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Se încarcă" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-destructive" role="alert">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && captures.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-12 text-center">
            <FileText className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">Niciun document în această lună</p>
            <p className="text-xs text-muted-foreground">
              Apăsați „Document nou" și lipiți textul facturii — AI extrage automat câmpurile.
            </p>
          </div>
        )}

        {/* Table */}
        {!loading && captures.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm" role="table">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Fișier</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Echipă</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Scop (AI)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Sumă</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Tip document (AI)</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Raportare (AI)</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Acțiune</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {captures.map((capture) => (
                  <tr key={capture.id} className="bg-card hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="max-w-[180px] truncate font-medium text-foreground">
                          {capture.fileName}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                        {TEAM_LABELS[capture.team] ?? capture.team}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-[220px] truncate text-muted-foreground">
                      {capture.extractedFields?.purpose?.value ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-foreground">
                      {formatMDLCents(capture.extractedFields?.amount_cents?.value ?? null)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <DocumentClassBadge value={capture.documentClass} />
                        {capture.documentClassReason && (
                          <span className="max-w-[200px] truncate text-[11px] text-muted-foreground" title={capture.documentClassReason}>
                            {capture.documentClassReason}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <ReportableBadge value={capture.reportable} />
                        {capture.reportableReason && (
                          <span className="max-w-[200px] truncate text-[11px] text-muted-foreground" title={capture.reportableReason}>
                            {capture.reportableReason}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={capture.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {capture.status === "extracted" && (
                          <button
                            onClick={() => navigate(`/business/fin/captures/${capture.id}`)}
                            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                          >
                            {capture.kind === "statement" ? "Vezi tranzacții" : "Confirmă"}
                          </button>
                        )}
                        {capture.status === "confirmed" && (
                          <button
                            onClick={() => navigate(`/business/fin/captures/${capture.id}`)}
                            className="inline-flex min-h-[36px] items-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                          >
                            Detalii
                          </button>
                        )}
                        {(capture.status === "pending" || capture.status === "processing") && (
                          <span className="text-xs text-muted-foreground">Se procesează...</span>
                        )}
                        {capture.status === "failed" && (
                          <button
                            onClick={() => navigate(`/business/fin/captures/${capture.id}`)}
                            className="inline-flex min-h-[36px] items-center rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/5"
                          >
                            Eroare
                          </button>
                        )}
                        <button
                          onClick={() => removeCapture(capture)}
                          disabled={deletingId === capture.id}
                          aria-label={`Șterge ${capture.fileName}`}
                          title="Șterge"
                          className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                        >
                          {deletingId === capture.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          )}
                        </button>
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
