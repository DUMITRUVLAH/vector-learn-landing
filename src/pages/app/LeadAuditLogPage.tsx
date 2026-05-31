/**
 * CRM-127 — Audit log page (/app/audit-log)
 * Shows last 200 CRM actions, filterable by actor and action type.
 */
import { useEffect, useState, useCallback } from "react";
import { Loader2, Shield, ChevronDown, ChevronUp } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import { fetchAuditLog, type AuditEntry } from "@/lib/api/audit";
import { cn } from "@/lib/utils";

const ACTION_OPTIONS = [
  { value: "", label: "Toate acțiunile" },
  { value: "lead.created", label: "Lead creat" },
  { value: "lead.updated", label: "Lead editat" },
  { value: "lead.stage_changed", label: "Stadiu schimbat" },
  { value: "lead.deleted", label: "Lead șters" },
  { value: "lead.restored", label: "Lead restaurat" },
  { value: "bulk.stage_changed", label: "Bulk — stadiu" },
  { value: "bulk.deleted", label: "Bulk — ștergere" },
];

const ACTION_BADGE: Record<string, string> = {
  "lead.created": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  "lead.updated": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  "lead.stage_changed": "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400",
  "lead.deleted": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  "lead.restored": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  "bulk.stage_changed": "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
  "bulk.deleted": "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400",
};

const ACTION_LABEL: Record<string, string> = {
  "lead.created": "Lead creat",
  "lead.updated": "Lead editat",
  "lead.stage_changed": "Stadiu schimbat",
  "lead.deleted": "Lead șters",
  "lead.restored": "Lead restaurat",
  "bulk.stage_changed": "Bulk stadiu",
  "bulk.deleted": "Bulk ștergere",
};

function SnapshotRow({ label, data }: { label: string; data: Record<string, unknown> | null }) {
  const [open, setOpen] = useState(false);
  if (!data) return null;
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        aria-expanded={open}
      >
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {label}
      </button>
      {open && (
        <pre className="mt-1 text-xs bg-muted/50 rounded p-2 overflow-auto max-h-32 text-muted-foreground">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function LeadAuditLogPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [filterAction, setFilterAction] = useState("");

  const LIMIT = 50;

  const load = useCallback(async (newOffset = 0, reset = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAuditLog({
        limit: LIMIT,
        offset: newOffset,
        action: filterAction || undefined,
      });
      if (reset) {
        setEntries(res.entries);
      } else {
        setEntries((prev) => [...prev, ...res.entries]);
      }
      setHasMore(res.entries.length === LIMIT);
      setOffset(newOffset + res.entries.length);
    } catch {
      setError("Nu s-a putut încărca jurnalul de audit.");
    } finally {
      setLoading(false);
    }
  }, [filterAction]);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      navigate("/app/login");
      return;
    }
    if (sessionStatus === "authenticated") {
      setOffset(0);
      void load(0, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, filterAction]);

  const handleLoadMore = () => {
    void load(offset);
  };

  return (
    <AppShell
      pageTitle="Audit Log"
      pageDescription="Jurnal complet al acțiunilor din CRM"
    >
      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-4">
        <label className="text-sm font-medium sr-only" htmlFor="audit-action-filter">
          Filtrează după acțiune
        </label>
        <select
          id="audit-action-filter"
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {ACTION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <p className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive mb-4" role="alert">
          {error}
        </p>
      )}

      {/* Empty state */}
      {!loading && entries.length === 0 && !error && (
        <div
          className="flex flex-col items-center justify-center py-16 text-center"
          role="status"
          aria-live="polite"
        >
          <Shield className="h-12 w-12 text-muted-foreground mb-4" aria-hidden="true" />
          <h3 className="text-lg font-semibold mb-1">Nicio activitate înregistrată încă</h3>
          <p className="text-sm text-muted-foreground">
            Acțiunile din CRM vor apărea automat aici.
          </p>
        </div>
      )}

      {/* Table */}
      {entries.length > 0 && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-3 font-semibold">Timestamp</th>
                <th className="text-left px-4 py-3 font-semibold hidden sm:table-cell">Actor</th>
                <th className="text-left px-4 py-3 font-semibold">Acțiune</th>
                <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Lead</th>
                <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">Detalii</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((entry) => {
                const afterSnap = entry.afterSnapshot as Record<string, unknown> | null;
                const beforeSnap = entry.beforeSnapshot as Record<string, unknown> | null;
                const leadName = (afterSnap?.fullName ?? beforeSnap?.fullName) as string | undefined;
                return (
                  <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(entry.createdAt).toLocaleString("ro-RO", {
                        day: "2-digit", month: "short", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">
                      {entry.actorId ? (
                        <span className="font-mono">{entry.actorId.slice(0, 8)}…</span>
                      ) : (
                        <span className="italic">sistem</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
                          ACTION_BADGE[entry.action] ?? "bg-muted text-muted-foreground"
                        )}
                      >
                        {ACTION_LABEL[entry.action] ?? entry.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {leadName ? (
                        <button
                          type="button"
                          onClick={() => navigate(`/app/leads/${entry.entityId}`)}
                          className="text-sm hover:text-primary hover:underline transition-colors text-left"
                        >
                          {String(leadName)}
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground font-mono">
                          {entry.entityId.slice(0, 8)}…
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <SnapshotRow label="Înainte" data={entry.beforeSnapshot} />
                      <SnapshotRow label="După" data={entry.afterSnapshot} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Load more */}
      {hasMore && !loading && entries.length > 0 && (
        <div className="flex justify-center mt-4">
          <button
            type="button"
            onClick={handleLoadMore}
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted transition-colors"
          >
            Încarcă mai mult
          </button>
        </div>
      )}

      {/* Loading indicator */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
    </AppShell>
  );
}
