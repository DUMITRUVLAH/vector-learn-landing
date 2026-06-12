/**
 * PAR-106 — /app/par
 *
 * Dashboard + lista cererilor PAR:
 *   - Secțiunea „Cererile mele" (toți)
 *   - Secțiunea „Pending my approval" (approver)
 *   - Secțiunea „Awaiting payment" (finance)
 *   - Status chips, filtre, totaluri, buton „Cerere nouă"
 *
 * CORE: backlog/par/PAR-CORE.md §6
 * Design system: Vector 365 tokens only, light + dark, WCAG AA
 */
import { useState, useEffect } from "react";
import { Plus, Search, Filter, Loader2, FileText, AlertCircle } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useRouter } from "@/router/HashRouter";
import { ParStatusChip } from "@/components/par/ParStatusChip";
import {
  listPar,
  formatMDL,
  type ParRequest,
  type ParStatus,
  type ParPurpose,
  PAR_STATUS_LABELS,
} from "@/lib/api/par";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: ParStatus | ""; label: string }[] = [
  { value: "", label: "Toate statusurile" },
  { value: "draft", label: PAR_STATUS_LABELS.draft },
  { value: "pending_approval", label: PAR_STATUS_LABELS.pending_approval },
  { value: "changes_requested", label: PAR_STATUS_LABELS.changes_requested },
  { value: "approved", label: PAR_STATUS_LABELS.approved },
  { value: "in_finance", label: PAR_STATUS_LABELS.in_finance },
  { value: "paid", label: PAR_STATUS_LABELS.paid },
  { value: "rejected", label: PAR_STATUS_LABELS.rejected },
  { value: "cancelled", label: PAR_STATUS_LABELS.cancelled },
];

const PURPOSE_OPTIONS: { value: ParPurpose | ""; label: string }[] = [
  { value: "", label: "Toate scopurile" },
  { value: "execute_payment", label: "Executare plată" },
  { value: "obtain_quotations", label: "Obținere oferte" },
  { value: "provide_estimate", label: "Estimare costuri" },
];

// ─── Main component ───────────────────────────────────────────────────────────

export function ParDashboard() {
  const { navigate } = useRouter();

  const [requests, setRequests] = useState<(ParRequest & { above_micro_threshold: boolean })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<ParStatus | "">("");
  const [purposeFilter, setPurposeFilter] = useState<ParPurpose | "">("");
  const [searchQ, setSearchQ] = useState("");

  // Load data
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await listPar({
          status: statusFilter || undefined,
          purpose: purposeFilter || undefined,
          q: searchQ || undefined,
        });
        setRequests(res.requests);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Eroare la încărcare");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [statusFilter, purposeFilter, searchQ]);

  // Derived sections
  const myRequests = requests;
  const pendingApproval = requests.filter((r) => r.status === "pending_approval");
  const awaitingPayment = requests.filter((r) => r.status === "in_finance");

  // Summary totals
  const totalActive = requests
    .filter((r) => !["cancelled", "rejected", "paid"].includes(r.status))
    .reduce((sum, r) => sum + r.totalEstimatedCents, 0);

  const totalPaid = requests
    .filter((r) => r.status === "paid")
    .reduce((sum, r) => sum + r.totalEstimatedCents, 0);

  return (
    <AppShell pageTitle="Cereri de plată (PAR)">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <FileText className="h-6 w-6 text-primary flex-shrink-0" aria-hidden />
            <div>
              <h1 className="text-xl font-semibold text-foreground">Cereri de plată (PAR)</h1>
              <p className="text-sm text-muted-foreground">Gestionează cererile de plată ale organizației</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("/app/par/new")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors min-h-[44px]"
            aria-label="Cerere PAR nouă"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Cerere nouă
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <SummaryCard label="Total cereri" value={String(requests.length)} />
          <SummaryCard label="Activ (estimat)" value={formatMDL(totalActive)} highlight />
          <SummaryCard label="Total plătit" value={formatMDL(totalPaid)} />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
              aria-hidden
            />
            <input
              type="search"
              placeholder="Caută după număr..."
              className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              aria-label="Caută cereri PAR după număr"
            />
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden />
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ParStatus | "")}
              aria-label="Filtrează după status"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Purpose filter */}
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
            value={purposeFilter}
            onChange={(e) => setPurposeFilter(e.target.value as ParPurpose | "")}
            aria-label="Filtrează după scop"
          >
            {PURPOSE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm"
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden />
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se încarcă..." />
          </div>
        )}

        {!loading && !error && (
          <div className="space-y-6">
            {/* My Requests */}
            <Section
              title="Cererile mele"
              count={myRequests.length}
              requests={myRequests}
              onRowClick={(id) => navigate(`/app/par/${id}`)}
              emptyMessage="Nu ai cereri de plată încă."
            />

            {/* Pending my approval (only shown if there are any) */}
            {pendingApproval.length > 0 && (
              <Section
                title="În așteptarea aprobării mele"
                count={pendingApproval.length}
                requests={pendingApproval}
                onRowClick={(id) => navigate(`/app/par/${id}`)}
                emptyMessage=""
                highlight
              />
            )}

            {/* Awaiting payment (only shown if there are any) */}
            {awaitingPayment.length > 0 && (
              <Section
                title="La finanțe — în așteptarea plății"
                count={awaitingPayment.length}
                requests={awaitingPayment}
                onRowClick={(id) => navigate(`/app/par/${id}`)}
                emptyMessage=""
                highlight
              />
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

// ─── Section component ────────────────────────────────────────────────────────

interface SectionProps {
  title: string;
  count: number;
  requests: (ParRequest & { above_micro_threshold: boolean })[];
  onRowClick: (id: string) => void;
  emptyMessage: string;
  highlight?: boolean;
}

function Section({ title, count, requests, onRowClick, emptyMessage, highlight }: SectionProps) {
  return (
    <section aria-labelledby={`section-${title}`}>
      <div className="flex items-center gap-2 mb-3">
        <h2
          id={`section-${title}`}
          className="text-sm font-semibold text-foreground"
        >
          {title}
        </h2>
        {count > 0 && (
          <span
            className={cn(
              "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
              highlight
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground"
            )}
          >
            {count}
          </span>
        )}
      </div>

      {requests.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">
          {emptyMessage}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm" role="grid" aria-label={title}>
            <thead className="bg-muted/50">
              <tr>
                <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Nr. cerere</th>
                <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Proiect</th>
                <th scope="col" className="text-right px-4 py-3 font-medium text-muted-foreground">Total (MDL)</th>
                <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {requests.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => onRowClick(r.id)}
                  onKeyDown={(e) => e.key === "Enter" && onRowClick(r.id)}
                  className="cursor-pointer hover:bg-muted/50 transition-colors focus-within:bg-muted/50"
                  tabIndex={0}
                  aria-label={`PAR ${r.requestNo}, ${PAR_STATUS_LABELS[r.status]}, ${formatMDL(r.totalEstimatedCents)}`}
                  role="row"
                >
                  <td className="px-4 py-3 font-medium text-foreground">
                    {r.requestNo}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                    {(r as ParRequest & { projectId: string | null }).projectId
                      ? <span className="text-xs bg-muted px-2 py-0.5 rounded">proj</span>
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    <span className={r.above_micro_threshold ? "text-orange-700 dark:text-orange-300" : "text-foreground"}>
                      {formatMDL(r.totalEstimatedCents)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <ParStatusChip status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs hidden md:table-cell">
                    {new Date(r.createdAt).toLocaleDateString("ro-MD", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ─── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn(
        "text-lg font-semibold",
        highlight ? "text-primary" : "text-foreground"
      )}>
        {value}
      </p>
    </div>
  );
}
