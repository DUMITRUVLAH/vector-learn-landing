/**
 * STMT-002 + STMT-003: Statement Review & Invoice Matching + e-Factura Export
 * Route: /business/fin/statement/:captureId
 *
 * Shows all transactions from an uploaded statement.
 * - Edit inline any field (PATCH /api/fin/statement/:captureId/lines/:lineId)
 * - Run matching (POST /api/fin/statement/:captureId/match)
 * - Select lines + submit to e-Factura SFS (POST /api/fin/statement/:captureId/submit-efactura-batch)
 *
 * Design system: Vector 365 tokens only. Zero hardcoded hex.
 */
import { useState, useEffect, useCallback } from "react";
import { FinLayout } from "./FinLayout";
import { useRouter } from "@/router/HashRouter";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StatementLine {
  id: string;
  captureId: string;
  txDate: string | null;
  description: string;
  counterparty: string | null;
  amountCents: number;
  direction: string;
  reportable: string;
  reportableReason: string | null;
  matchStatus: string;
  matchedCaptureId: string | null;
  linkedFinInvoiceId: string | null;
  sfsStatus?: string | null;
}

interface Summary {
  totalLines: number;
  matchedLines: number;
  reportableLines: number;
  totalOutCents: number;
}

interface StatementReviewPageProps {
  captureId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMDL(cents: number): string {
  return new Intl.NumberFormat("ro-MD", { style: "currency", currency: "MDL", minimumFractionDigits: 2 }).format(cents / 100);
}

async function apiFetch(url: string, opts?: RequestInit) {
  return fetch(url, {
    ...opts,
    credentials: "include",
    headers: {
      ...(opts?.headers ?? {}),
      "Content-Type": "application/json",
    },
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function StatementReviewPage({ captureId }: StatementReviewPageProps) {
  const { navigate } = useRouter();

  const [lines, setLines] = useState<StatementLine[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const [matchResult, setMatchResult] = useState<{ matched: number; unmatched: number; total: number } | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<StatementLine>>({});

  // Selection for e-Factura batch submit
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ submitted: number; errors: unknown[] } | null>(null);

  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadLines = useCallback(async (off: number = 0) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/fin/statement/${captureId}/lines?limit=${LIMIT}&offset=${off}`);
      if (!res.ok) throw new Error("lines_fetch_failed");
      const data = await res.json() as { lines: StatementLine[]; total: number };
      setLines(data.lines);
      setTotal(data.total);
    } catch {
      showToast("Eroare la încărcarea tranzacțiilor.", "err");
    } finally {
      setLoading(false);
    }
  }, [captureId]);

  const loadSummary = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/fin/statement/${captureId}/summary`);
      if (res.ok) setSummary(await res.json() as Summary);
    } catch {
      // non-critical
    }
  }, [captureId]);

  useEffect(() => {
    loadLines(0);
    loadSummary();
  }, [loadLines, loadSummary]);

  const handleRunMatch = async () => {
    setMatching(true);
    setMatchResult(null);
    try {
      const res = await apiFetch(`/api/fin/statement/${captureId}/match`, { method: "POST", body: "{}" });
      if (!res.ok) throw new Error("match_failed");
      const data = await res.json() as { matched: number; unmatched: number; total: number };
      setMatchResult(data);
      showToast(`Matching complet: ${data.matched}/${data.total} linii matchate.`);
      await loadLines(offset);
      await loadSummary();
    } catch {
      showToast("Eroare la matching. Încearcă din nou.", "err");
    } finally {
      setMatching(false);
    }
  };

  const handlePatch = async (lineId: string, patch: Partial<StatementLine>) => {
    const res = await apiFetch(`/api/fin/statement/${captureId}/lines/${lineId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      showToast("Eroare la salvare. Verifică valorile introduse.", "err");
      return;
    }
    const data = await res.json() as { line: StatementLine };
    setLines((prev) => prev.map((l) => (l.id === lineId ? data.line : l)));
    setExpandedId(null);
    showToast("Linie actualizată.");
  };

  const handleSelectAll = () => {
    const reportableIds = lines.filter((l) => l.reportable === "yes" && !l.linkedFinInvoiceId).map((l) => l.id);
    setSelected(new Set(reportableIds));
  };

  const handleSubmitEfactura = async () => {
    setSubmitting(true);
    setShowConfirm(false);
    try {
      const res = await apiFetch(`/api/fin/statement/${captureId}/submit-efactura-batch`, {
        method: "POST",
        body: JSON.stringify({ lineIds: Array.from(selected) }),
      });
      if (!res.ok) throw new Error("batch_failed");
      const data = await res.json() as { submitted: number; errors: unknown[]; results: Array<{ lineId: string; ok: boolean; sfsStatus?: string }> };
      setSubmitResult({ submitted: data.submitted, errors: data.errors });
      setSelected(new Set());
      // Update local lines with new sfsStatus
      for (const r of data.results) {
        if (r.ok && r.sfsStatus) {
          setLines((prev) => prev.map((l) => l.id === r.lineId ? { ...l, sfsStatus: r.sfsStatus, linkedFinInvoiceId: "submitted" } : l));
        }
      }
      showToast(`${data.submitted} linie(i) trimise la e-Factura SFS.`);
      await loadSummary();
    } catch {
      showToast("Eroare la trimitere. Încearcă din nou.", "err");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setEditValues({});
    } else {
      const line = lines.find((l) => l.id === id);
      if (line) setEditValues({ txDate: line.txDate ?? "", description: line.description, counterparty: line.counterparty ?? "", amountCents: line.amountCents, direction: line.direction as "in" | "out", reportable: line.reportable as "yes" | "no" | "review" });
      setExpandedId(id);
    }
  };

  const matchBadge = (status: string) => {
    if (status === "matched") return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Matched</span>;
    if (status === "review") return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">Review</span>;
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">Neidentificat</span>;
  };

  const sfsBadge = (status: string | null | undefined) => {
    if (!status) return null;
    const map: Record<string, string> = {
      mock: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
      sent: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
      accepted: "bg-green-600 text-white",
      rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
      pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    };
    const label: Record<string, string> = { mock: "Mock", sent: "Trimis SFS", accepted: "Acceptat", rejected: "Respins", pending: "În așteptare" };
    return (
      <span
        title={status === "mock" ? "SFS neconfigurat — Settings → SFS pentru producție" : undefined}
        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${map[status] ?? ""}`}
      >
        {label[status] ?? status}
      </span>
    );
  };

  const hasMockLines = lines.some((l) => l.sfsStatus === "mock");

  return (
    <FinLayout pageTitle="Review tranzacții">
      {/* ── Toast ────────────────────────────────────────────────────────────── */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={[
            "fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-sm shadow-lg",
            toast.type === "ok" ? "bg-green-600 text-white" : "bg-destructive text-destructive-foreground",
          ].join(" ")}
        >
          {toast.msg}
        </div>
      )}

      <div className="space-y-6">
        {/* ── Back link ──────────────────────────────────────────────────────── */}
        <button
          type="button"
          onClick={() => navigate("/business/fin/statement")}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          aria-label="Înapoi la istoric extrase"
        >
          ← Înapoi la istoric
        </button>

        {/* ── Summary cards ──────────────────────────────────────────────────── */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Total", value: String(summary.totalLines) },
              { label: "Matchate", value: String(summary.matchedLines) },
              { label: "Raportabile", value: String(summary.reportableLines) },
              { label: "Ieșiri", value: formatMDL(summary.totalOutCents) },
            ].map((card) => (
              <div key={card.label} className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">{card.label}</p>
                <p className="text-xl font-bold text-foreground mt-1">{card.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Match result banner ──────────────────────────────────────────── */}
        {matchResult && (
          <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-900/10 dark:border-green-800 px-4 py-3 text-sm text-green-800 dark:text-green-400">
            Matching finalizat: {matchResult.matched} matchate, {matchResult.unmatched} neidentificate din {matchResult.total} linii.
          </div>
        )}

        {/* ── Action bar ──────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            disabled={matching}
            onClick={handleRunMatch}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 min-h-[44px]"
          >
            {matching ? (
              <>
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Se rulează...
              </>
            ) : "Run matching"}
          </button>

          <button
            type="button"
            onClick={handleSelectAll}
            className="inline-flex items-center px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors min-h-[44px]"
          >
            Selectează raportabile
          </button>

          <button
            type="button"
            disabled={selected.size === 0 || submitting}
            onClick={() => setShowConfirm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 text-white text-sm font-medium hover:bg-orange-700 transition-colors disabled:opacity-50 min-h-[44px]"
          >
            {submitting ? "Se trimite..." : `Trimite la e-Factura (${selected.size})`}
          </button>

          {hasMockLines && (
            <a href="#/business/fin/sfs-settings" className="text-primary underline text-sm">
              Configurează SFS
            </a>
          )}
        </div>

        {/* ── Submit confirmation dialog ──────────────────────────────────── */}
        {showConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Confirmare trimitere e-Factura">
            <div className="bg-card border border-border rounded-xl p-6 max-w-sm w-full mx-4 space-y-4">
              <h2 className="text-base font-semibold">Confirmare trimitere e-Factura</h2>
              <p className="text-sm text-muted-foreground">
                Trimiți {selected.size} tranzacție(i) la SFS Moldova. Continui?
              </p>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowConfirm(false)} className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors min-h-[44px]">
                  Anulează
                </button>
                <button type="button" onClick={handleSubmitEfactura} className="px-4 py-2 rounded-lg bg-orange-600 text-white text-sm font-medium hover:bg-orange-700 transition-colors min-h-[44px]">
                  Confirmă
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Submit result banner ────────────────────────────────────────── */}
        {submitResult && (
          <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-900/10 dark:border-green-800 px-4 py-3 text-sm text-green-800 dark:text-green-400">
            {submitResult.submitted} linie(i) trimise la SFS.
            {submitResult.errors.length > 0 && ` ${submitResult.errors.length} eroare(i).`}
          </div>
        )}

        {/* ── Transactions table ──────────────────────────────────────────── */}
        {loading ? (
          <div role="status" aria-label="Se încarcă" className="flex justify-center py-8">
            <svg className="h-8 w-8 animate-spin text-primary" fill="none" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-10">
                      <input
                        type="checkbox"
                        aria-label="Selectează toate raportabilele"
                        checked={selected.size > 0 && selected.size === lines.filter((l) => l.reportable === "yes" && !l.linkedFinInvoiceId).length}
                        onChange={(e) => e.target.checked ? handleSelectAll() : setSelected(new Set())}
                        className="rounded"
                      />
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Data</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Descriere</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Contraparte</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Sumă</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Dir</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Match</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">SFS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.map((line) => (
                    <>
                      <tr
                        key={line.id}
                        onClick={() => toggleExpand(line.id)}
                        className="hover:bg-muted/30 transition-colors cursor-pointer"
                      >
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`Selectează linia ${line.id}`}
                            disabled={!!(line.linkedFinInvoiceId)}
                            checked={selected.has(line.id)}
                            onChange={(e) => {
                              const s = new Set(selected);
                              if (e.target.checked) s.add(line.id);
                              else s.delete(line.id);
                              setSelected(s);
                            }}
                            className="rounded"
                          />
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                          {line.txDate ?? "—"}
                        </td>
                        <td className="px-3 py-2 max-w-[180px] truncate">{line.description}</td>
                        <td className="px-3 py-2 text-muted-foreground max-w-[140px] truncate">{line.counterparty ?? "—"}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs whitespace-nowrap">
                          {formatMDL(line.amountCents)}
                        </td>
                        <td className="px-3 py-2">
                          <span className={[
                            "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium",
                            line.direction === "in"
                              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
                          ].join(" ")}>
                            {line.direction === "in" ? "IN" : "OUT"}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {matchBadge(line.matchStatus)}
                          {line.matchedCaptureId && (
                            <button
                              type="button"
                              className="ml-1 text-primary underline text-xs"
                              onClick={(e) => { e.stopPropagation(); navigate(`/business/fin/captures/${line.matchedCaptureId}`); }}
                              aria-label="Deschide factura matchată"
                            >
                              Vezi factura
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-2">{sfsBadge(line.sfsStatus)}</td>
                      </tr>

                      {/* Inline edit row */}
                      {expandedId === line.id && (
                        <tr key={`${line.id}-edit`} className="bg-muted/20">
                          <td colSpan={8} className="px-4 py-4">
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">Data (YYYY-MM-DD)</label>
                                <input
                                  type="text"
                                  value={editValues.txDate ?? ""}
                                  onChange={(e) => setEditValues((v) => ({ ...v, txDate: e.target.value }))}
                                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                                  placeholder="2026-06-01"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">Descriere</label>
                                <input
                                  type="text"
                                  value={editValues.description ?? ""}
                                  onChange={(e) => setEditValues((v) => ({ ...v, description: e.target.value }))}
                                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">Contraparte</label>
                                <input
                                  type="text"
                                  value={editValues.counterparty ?? ""}
                                  onChange={(e) => setEditValues((v) => ({ ...v, counterparty: e.target.value }))}
                                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">Sumă (cents)</label>
                                <input
                                  type="number"
                                  value={editValues.amountCents ?? 0}
                                  onChange={(e) => setEditValues((v) => ({ ...v, amountCents: parseInt(e.target.value, 10) || 0 }))}
                                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                                  min={0}
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">Direcție</label>
                                <select
                                  value={editValues.direction ?? "out"}
                                  onChange={(e) => setEditValues((v) => ({ ...v, direction: e.target.value as "in" | "out" }))}
                                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                                >
                                  <option value="in">IN</option>
                                  <option value="out">OUT</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">Raportabil</label>
                                <select
                                  value={editValues.reportable ?? "review"}
                                  onChange={(e) => setEditValues((v) => ({ ...v, reportable: e.target.value as "yes" | "no" | "review" }))}
                                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                                >
                                  <option value="yes">Da (raportabil)</option>
                                  <option value="no">Nu</option>
                                  <option value="review">Review</option>
                                </select>
                              </div>
                            </div>
                            <div className="flex gap-2 mt-3">
                              <button
                                type="button"
                                onClick={() => handlePatch(line.id, { txDate: editValues.txDate ?? undefined, description: editValues.description, counterparty: editValues.counterparty, amountCents: editValues.amountCents, direction: editValues.direction as "in" | "out", reportable: editValues.reportable as "yes" | "no" | "review" })}
                                className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors min-h-[36px]"
                              >
                                Salvează
                              </button>
                              <button
                                type="button"
                                onClick={() => { setExpandedId(null); setEditValues({}); }}
                                className="px-4 py-1.5 rounded-md border border-border text-sm hover:bg-muted transition-colors min-h-[36px]"
                              >
                                Anulează
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Pagination ──────────────────────────────────────────────────── */}
        {total > LIMIT && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{offset + 1}–{Math.min(offset + LIMIT, total)} din {total}</span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={offset === 0}
                onClick={() => { const o = Math.max(0, offset - LIMIT); setOffset(o); loadLines(o); }}
                className="px-3 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-50 transition-colors min-h-[36px]"
              >
                ← Prev
              </button>
              <button
                type="button"
                disabled={offset + LIMIT >= total}
                onClick={() => { const o = offset + LIMIT; setOffset(o); loadLines(o); }}
                className="px-3 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-50 transition-colors min-h-[36px]"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </FinLayout>
  );
}
