/**
 * STMT-004: Statement History Page
 * Route: /business/fin/statement (no suffix)
 *
 * Lists all imported bank statements with aggregate stats.
 * - Filter by month
 * - Export SAGA CSV
 * - Download XML e-Facturi ZIP
 * - Delete statement
 *
 * Design system: Vector 365 tokens only. Zero hardcoded hex.
 */
import { useState, useEffect, useCallback } from "react";
import { FinLayout } from "./FinLayout";
import { useRouter } from "@/router/HashRouter";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StatementRow {
  id: string;
  file_name: string | null;
  created_at: string;
  status: string;
  line_count: number;
  matched_count: number;
  sfs_count: number;
  total_out_cents: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMDL(cents: number): string {
  return new Intl.NumberFormat("ro-MD", { style: "currency", currency: "MDL", minimumFractionDigits: 2 }).format(cents / 100);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ro-MD", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

async function apiFetch(url: string, opts?: RequestInit) {
  return fetch(url, {
    ...opts,
    credentials: "include",
    headers: {
      ...(opts?.headers ?? {}),
    },
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function StatementHistoryPage() {
  const { navigate } = useRouter();

  const [statements, setStatements] = useState<StatementRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(currentMonth());
  const [deleteTarget, setDeleteTarget] = useState<StatementRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // No trailing slash before the query: on Vercel, `/api/fin/statement/?…` 404s (Hono's
      // mounted `.get("/")` matches `/api/fin/statement`, not `/api/fin/statement/`).
      const res = await apiFetch("/api/fin/statement?limit=50&offset=0");
      if (!res.ok) throw new Error("load_failed");
      const data = await res.json() as { statements: StatementRow[]; total: number };
      setStatements(data.statements);
      setTotal(data.total);
    } catch {
      showToast("Eroare la încărcarea extraselor.", "err");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const downloadSagaCsv = async () => {
    try {
      const res = await apiFetch(`/api/fin/statement/export/saga-csv?month=${month}`);
      if (!res.ok) { showToast("Eroare la export CSV.", "err"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `saga-statement-${month}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast("Eroare la descărcare.", "err");
    }
  };

  const downloadXmlZip = async () => {
    try {
      const res = await apiFetch(`/api/fin/statement/export/efactura-xml-zip?month=${month}`);
      if (!res.ok) { showToast("Eroare la export ZIP.", "err"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `efacturi-${month}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast("Eroare la descărcare.", "err");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/fin/statement/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) { showToast("Eroare la ștergere.", "err"); return; }
      showToast("Extras șters.");
      setDeleteTarget(null);
      await load();
    } catch {
      showToast("Eroare la ștergere.", "err");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <FinLayout pageTitle="Extrase de cont">
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
        {/* ── Header row ─────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex flex-wrap gap-2 items-center">
            {/* Month filter */}
            <div>
              <label htmlFor="month-filter" className="sr-only">Lună</label>
              <input
                id="month-filter"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm min-h-[44px]"
                aria-label="Selectează luna pentru export"
              />
            </div>

            <button
              type="button"
              onClick={downloadSagaCsv}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-background text-sm font-medium hover:bg-muted transition-colors min-h-[44px]"
            >
              Export SAGA CSV
            </button>

            <button
              type="button"
              onClick={downloadXmlZip}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-background text-sm font-medium hover:bg-muted transition-colors min-h-[44px]"
            >
              Descarcă XML e-Facturi
            </button>
          </div>

          <button
            type="button"
            onClick={() => navigate("/business/fin/statement/upload")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors min-h-[44px]"
          >
            + Import extras nou
          </button>
        </div>

        {/* ── Statements table ────────────────────────────────────────────────── */}
        {loading ? (
          <div role="status" aria-label="Se încarcă" className="flex justify-center py-8">
            <svg className="h-8 w-8 animate-spin text-primary" fill="none" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : statements.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <p className="text-muted-foreground text-sm">Nu există extrase importate.</p>
            <button
              type="button"
              onClick={() => navigate("/business/fin/statement/upload")}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors min-h-[44px]"
            >
              + Import primul extras
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{total} extras(e) importate</p>
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Fișier</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Data import</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Tranzacții</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Matchate</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Trimise SFS</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Total ieșiri</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Acțiuni</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {statements.map((s) => (
                      <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 max-w-[200px] truncate">
                          {s.file_name ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {formatDate(s.created_at)}
                        </td>
                        <td className="px-4 py-3 text-right">{s.line_count}</td>
                        <td className="px-4 py-3 text-right">{s.matched_count}</td>
                        <td className="px-4 py-3 text-right">{s.sfs_count}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs">{formatMDL(s.total_out_cents)}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => navigate(`/business/fin/statement/${s.id}`)}
                              className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors min-h-[36px]"
                            >
                              Deschide
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(s)}
                              className="px-3 py-1.5 rounded-md border border-destructive text-destructive text-xs font-medium hover:bg-destructive/10 transition-colors min-h-[36px]"
                            >
                              Șterge
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Delete confirmation dialog ────────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Confirmare ștergere extras">
          <div className="bg-card border border-border rounded-xl p-6 max-w-sm w-full mx-4 space-y-4">
            <h2 className="text-base font-semibold text-foreground">Confirmare ștergere</h2>
            <p className="text-sm text-muted-foreground">
              Ștergi extrasul <span className="font-medium text-foreground">&ldquo;{deleteTarget.file_name ?? deleteTarget.id}&rdquo;</span>?
              Toate tranzacțiile vor fi pierdute.
            </p>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setDeleteTarget(null)} className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors min-h-[44px]">
                Anulează
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={confirmDelete}
                className="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 transition-colors disabled:opacity-50 min-h-[44px]"
              >
                {deleting ? "Se șterge..." : "Șterge"}
              </button>
            </div>
          </div>
        </div>
      )}
    </FinLayout>
  );
}
