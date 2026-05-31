/**
 * HR-404 — Audit log HR
 * Pagina /app/hr/audit — tabel cu acțiuni + filtru + export CSV
 */
import { useEffect, useState, useCallback } from "react";
import { Loader2, Download, AlertTriangle } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import { listAuditLog, type AuditLogEntry } from "@/lib/api/auditLog";

// ─── Action type labels ───────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  "teacher.rate_changed": "Modificare tarif",
  "payroll.status_changed": "Actualizare status payroll",
};

function actionLabel(type: string): string {
  return ACTION_LABELS[type] ?? type;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AuditLogPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState("");

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listAuditLog({
        action_type: actionFilter || undefined,
        limit: 200,
      });
      setEntries(res.items);
    } catch {
      setError("Nu pot încărca audit log-ul.");
    } finally {
      setLoading(false);
    }
  }, [actionFilter]);

  useEffect(() => { void fetchEntries(); }, [fetchEntries]);

  const handleExport = () => {
    // Trigger CSV download via browser
    const url = `/api/hr/audit-log/export`;
    window.open(url, "_blank");
  };

  return (
    <AppShell
      pageTitle="Audit Log"
      pageDescription="Istoricul schimbărilor HR: tarife, salarizare, roluri"
      actions={
        <button
          type="button"
          onClick={handleExport}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted min-h-[44px]"
          aria-label="Export CSV audit log"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Export CSV
        </button>
      }
    >
      {/* Filter */}
      <div className="flex items-center gap-3 mb-4">
        <label htmlFor="action-filter" className="text-sm font-semibold text-muted-foreground shrink-0">
          Tip acțiune:
        </label>
        <select
          id="action-filter"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm max-w-xs"
          aria-label="Filtrare tip acțiune"
        >
          <option value="">Toate acțiunile</option>
          <option value="teacher.rate_changed">Modificare tarif</option>
          <option value="payroll.status_changed">Status payroll</option>
        </select>
        <span className="text-xs text-muted-foreground ml-auto">
          {entries.length} înregistrări
        </span>
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive mb-4">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Se încarcă…
        </div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Nicio înregistrare în audit log.
        </p>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden" data-testid="audit-log-table">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Acțiune</th>
                  <th className="text-left px-4 py-3 font-semibold hidden sm:table-cell">Tip resursă</th>
                  <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Actor</th>
                  <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">Valoare nouă</th>
                  <th className="text-right px-4 py-3 font-semibold">Data</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono bg-muted/50 px-1.5 py-0.5 rounded">
                        {actionLabel(entry.actionType)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell text-xs">
                      {entry.targetType}
                      {entry.targetId && (
                        <span className="ml-1 text-[10px] font-mono opacity-50">{entry.targetId.slice(0, 8)}…</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                      {entry.actorName ?? "sistem"}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {entry.newValue ? (
                        <code className="text-[10px] bg-muted/40 px-1.5 py-0.5 rounded">
                          {JSON.stringify(entry.newValue).slice(0, 60)}
                        </code>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(entry.occurredAt).toLocaleString("ro-RO")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppShell>
  );
}
