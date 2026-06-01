/**
 * SET-804 — Audit log settings page
 *
 * /app/settings/audit-log — Admin/owner can view, filter, and export aggregated
 * audit logs (HR-404 + CRM-127 sources).
 */
import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/app/AppShell";
import { api } from "@/lib/api";
import {
  Shield,
  Search,
  Download,
  RefreshCw,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditItem {
  id: string;
  actorName: string;
  actionType: string;
  targetType: string;
  targetId: string | null;
  createdAt: string;
  source: "hr" | "crm";
}

interface AuditLogResponse {
  items: AuditItem[];
  total: number;
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportToCsv(items: AuditItem[]) {
  const headers = ["Timp", "Actor", "Acțiune", "Obiect", "ID Obiect", "Sursă"];
  const rows = items.map((item) => [
    item.createdAt,
    item.actorName,
    item.actionType,
    item.targetType,
    item.targetId ?? "",
    item.source.toUpperCase(),
  ]);

  const csv = [headers, ...rows]
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-log-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ro-RO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const SOURCE_BADGE: Record<string, string> = {
  hr: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  crm: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
};

// ─── Main page ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export default function AuditLogPage() {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [actionType, setActionType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      });
      if (actionType) params.set("actionType", actionType);
      if (from) params.set("from", from);
      if (to) params.set("to", to);

      const data = await api<AuditLogResponse>(
        `/api/settings/audit-log?${params.toString()}`
      );
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      if (e && typeof e === "object" && "status" in e) {
        const err = e as { status: number };
        if (err.status === 403) {
          setError("Acces interzis. Numai admin/owner poate vedea audit log-ul.");
        } else {
          setError("Nu am putut încărca audit log-ul.");
        }
      } else {
        setError("Nu am putut încărca audit log-ul.");
      }
    } finally {
      setLoading(false);
    }
  }, [actionType, from, to, page]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  async function handleExport() {
    try {
      const params = new URLSearchParams({ limit: "200", offset: "0" });
      if (actionType) params.set("actionType", actionType);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const data = await api<AuditLogResponse>(
        `/api/settings/audit-log?${params.toString()}`
      );
      exportToCsv(data.items);
    } catch {
      setError("Nu am putut exporta audit log-ul.");
    }
  }

  return (
    <AppShell
      pageTitle="Audit Log"
      pageDescription="Vizualizează acțiunile efectuate în platformă de toți utilizatorii."
    >
      <div className="space-y-6">
        {/* Error */}
        {error && (
          <div
            role="alert"
            className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3">
          {/* Action type search */}
          <div className="flex-1 min-w-40">
            <label
              htmlFor="action-search"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              Tip acțiune
            </label>
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                id="action-search"
                type="text"
                value={actionType}
                onChange={(e) => {
                  setActionType(e.target.value);
                  setPage(0);
                }}
                placeholder="ex: lead.created"
                className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>

          {/* From date */}
          <div>
            <label
              htmlFor="from-date"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              De la
            </label>
            <input
              id="from-date"
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(0);
              }}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {/* To date */}
          <div>
            <label
              htmlFor="to-date"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              Până la
            </label>
            <input
              id="to-date"
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(0);
              }}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {/* Reset */}
          <button
            type="button"
            onClick={() => {
              setActionType("");
              setFrom("");
              setTo("");
              setPage(0);
            }}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Resetează filtrele"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          </button>

          {/* Export */}
          <button
            type="button"
            onClick={() => void handleExport()}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Export CSV
          </button>
        </div>

        {/* Count */}
        <p className="text-xs text-muted-foreground">
          <Shield className="inline h-3.5 w-3.5 mr-1" aria-hidden="true" />
          {total} înregistrări{" "}
          {total > PAGE_SIZE && `· pagina ${page + 1} din ${totalPages}`}
        </p>

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
          <table className="min-w-full text-sm" aria-label="Audit log">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {["Timp", "Actor", "Acțiune", "Obiect", "Sursă"].map(
                  (h) => (
                    <th
                      key={h}
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} aria-hidden="true">
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 animate-pulse rounded bg-muted" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-sm text-muted-foreground"
                  >
                    Nicio înregistrare găsită.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr
                    key={item.id}
                    className="transition-colors hover:bg-muted/50"
                  >
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(item.createdAt)}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {item.actorName}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-foreground">
                      {item.actionType}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <span>{item.targetType}</span>
                      {item.targetId && (
                        <span className="ml-1 font-mono text-foreground/60">
                          {item.targetId.slice(0, 8)}…
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={[
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          SOURCE_BADGE[item.source] ?? "bg-muted text-muted-foreground",
                        ].join(" ")}
                      >
                        {item.source.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              aria-label="Pagina anterioară"
              className="rounded-md border border-border bg-background p-2 text-foreground transition-colors hover:bg-muted disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="text-sm text-muted-foreground">
              {page + 1} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              aria-label="Pagina următoare"
              className="rounded-md border border-border bg-background p-2 text-foreground transition-colors hover:bg-muted disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
