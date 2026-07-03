/**
 * AGREEMENT-003: AgreementTable
 * Renders a filterable table of fin_agreements.
 * Design system: Vector 365 tokens only — zero hardcoded hex.
 * Dark mode: bg-card, text-foreground, border-border.
 * WCAG AA: touch targets ≥44px, readable contrast, keyboard-accessible.
 */
import { useState, useCallback } from "react";
import { Search, AlertTriangle, FileText, ChevronRight, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Agreement, AgreementStatus } from "@/lib/api/finAgreements";

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<AgreementStatus, string> = {
  draft: "Ciornă",
  active: "Activ",
  paused: "Pauzat",
  cancelled: "Anulat",
};

/** Semantic-token colour classes per status — zero hex. */
const STATUS_CLS: Record<AgreementStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-success/15 text-success",
  paused: "bg-warning/15 text-warning",
  cancelled: "bg-destructive/15 text-destructive",
};

interface StatusBadgeProps {
  status: AgreementStatus;
}

export function AgreementStatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        STATUS_CLS[status]
      )}
      data-status={status}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

// ─── Expiry alert ─────────────────────────────────────────────────────────────

/** Returns contracts expiring in the next `days` days (inclusive). */
function getExpiringIn(agreements: Agreement[], days: number): Agreement[] {
  const now = new Date();
  const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return agreements.filter((a) => {
    if (!a.endDate || a.status === "cancelled") return false;
    const end = new Date(a.endDate);
    return end >= now && end <= cutoff;
  });
}

// ─── Table ────────────────────────────────────────────────────────────────────

interface AgreementTableProps {
  agreements: Agreement[];
  loading: boolean;
  onSelect: (agreement: Agreement) => void;
}

export function AgreementTable({
  agreements,
  loading,
  onSelect,
}: AgreementTableProps) {
  const [statusFilter, setStatusFilter] = useState<AgreementStatus | "">("");
  const [search, setSearch] = useState("");

  const expiring = getExpiringIn(agreements, 30);

  const filtered = agreements.filter((a) => {
    if (statusFilter && a.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        a.title.toLowerCase().includes(q) ||
        (a.partyName ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleFilterChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setStatusFilter(e.target.value as AgreementStatus | "");
    },
    []
  );

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
    },
    []
  );

  // ─── Expiry banner ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Expiry warning banner */}
      {expiring.length > 0 && (
        <div
          className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning"
          role="alert"
          data-testid="expiry-banner"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {expiring.length === 1
              ? `1 contract expiră în următoarele 30 de zile: "${expiring[0].title}".`
              : `${expiring.length} contracte expiră în următoarele 30 de zile.`}{" "}
            Verificați și reînnoiți la timp.
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            placeholder="Caută titlu sau partener..."
            value={search}
            onChange={handleSearchChange}
            aria-label="Caută contracte"
            className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label htmlFor="status-filter" className="sr-only">
            Filtrează după status
          </label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={handleFilterChange}
            aria-label="Filtrează după status"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Toate statusurile</option>
            <option value="draft">Ciornă</option>
            <option value="active">Activ</option>
            <option value="paused">Pauzat</option>
            <option value="cancelled">Anulat</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card">
        {loading ? (
          <div className="space-y-3 p-4" aria-label="Se încarcă..." role="status">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
            <FileText className="h-8 w-8" aria-hidden />
            <p className="text-sm">Niciun contract găsit</p>
            <p className="text-xs">
              Schimbă filtrele sau creează un contract nou.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                  <th className="px-4 py-3">Titlu contract</th>
                  <th className="px-4 py-3">Partener</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Facturare</th>
                  <th className="px-4 py-3">Valută</th>
                  <th className="px-4 py-3">Data start</th>
                  <th className="px-4 py-3">Data end</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">Acțiuni</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr
                    key={a.id}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => onSelect(a)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") onSelect(a);
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Deschide contract: ${a.title}`}
                  >
                    <td className="px-4 py-3 font-medium text-foreground">
                      {a.title}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {a.partyName ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <AgreementStatusBadge status={a.status} />
                    </td>
                    <td className="px-4 py-3">
                      {a.autoBilling ? (
                        <span
                          title={a.autoBilledAt ? `Ultima rulare automată: ${new Date(a.autoBilledAt).toLocaleString("ro-MD")}` : "Se facturează automat (e-Factura + email)"}
                          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                        >
                          <RefreshCw className="h-3 w-3" aria-hidden />
                          Auto
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Manual</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {a.currency}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {a.startDate
                        ? new Date(a.startDate).toLocaleDateString("ro-MD")
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {a.endDate ? (
                        <span
                          className={cn(
                            getExpiringIn([a], 30).length > 0 &&
                              "font-medium text-warning"
                          )}
                        >
                          {new Date(a.endDate).toLocaleDateString("ro-MD")}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ChevronRight
                        className="h-4 w-4 text-muted-foreground"
                        aria-hidden
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
