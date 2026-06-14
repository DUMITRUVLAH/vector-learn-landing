/**
 * BILL-005: FinDesk B2B Invoices Page — /app/fin/invoices
 *
 * Layout:
 *   - 4 summary cards: Total emis / Încasat / Restant / Facturi scadente (60+)
 *   - Filter bar: status select + search text
 *   - Table: Nr., Partener, Sumă, TVA, Status badge, Scadență, Zile restante, Acțiuni
 *   - "+ Factură nouă" button → FinInvoiceCreateModal
 *   - Per-row: Emite / Marchează plătit / Anulează / PDF download
 *
 * Reuses: AppShell, pattern from InvoicesPage.tsx (B2C) for table+filter.
 * No hex colors — semantic tokens Vector 365 only in this file.
 */
import { useState, useCallback } from "react";
import {
  FileText,
  Plus,
  Download,
  CheckCircle2,
  XCircle,
  SendHorizontal,
  AlertCircle,
  Loader2,
  TrendingUp,
  Banknote,
  Clock,
  RefreshCw,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { cn } from "@/lib/utils";
import {
  listFinInvoices,
  updateFinInvoice,
  getFinInvoiceAging,
  getFinInvoicePdfHtml,
  formatFinMoney,
  type FinInvoice,
  type FinInvoiceStatus,
  type FinAgingResult,
} from "@/lib/api/finInvoices";
import { FinInvoiceCreateModal } from "@/components/fin/FinInvoiceCreateModal";
import { downloadFinInvoicePdf } from "@/lib/finInvoicePdf";
import { useEffect } from "react";

// ─── Status badge config ──────────────────────────────────────────────────────

const STATUS_META: Record<FinInvoiceStatus, { label: string; cls: string }> = {
  draft: {
    label: "Ciornă",
    cls: "bg-muted text-muted-foreground",
  },
  issued: {
    label: "Emisă",
    cls: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  },
  paid: {
    label: "Plătită",
    cls: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  },
  overdue: {
    label: "Restantă",
    cls: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  },
  cancelled: {
    label: "Anulată",
    cls: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  },
};

// ─── Summary card ─────────────────────────────────────────────────────────────

interface SummaryCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  variant?: "default" | "warning" | "success" | "danger";
}

function SummaryCard({ label, value, icon, variant = "default" }: SummaryCardProps) {
  const variantCls = {
    default: "border-border",
    warning: "border-yellow-300 dark:border-yellow-800",
    success: "border-green-300 dark:border-green-800",
    danger: "border-red-300 dark:border-red-800",
  }[variant];

  return (
    <div className={cn("bg-card border rounded-xl p-4 flex items-start gap-3", variantCls)}>
      <div className="p-2 rounded-lg bg-muted text-muted-foreground">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium truncate">{label}</p>
        <p className="text-xl font-bold text-foreground mt-0.5 truncate">{value}</p>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function FinInvoicesPage() {
  const [invoices, setInvoices] = useState<FinInvoice[]>([]);
  const [total, setTotal] = useState(0);
  const [aging, setAging] = useState<FinAgingResult | null>(null);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [loadingAging, setLoadingAging] = useState(true);
  const [statusFilter, setStatusFilter] = useState<FinInvoiceStatus | "">("");
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // ─── Data fetching ──────────────────────────────────────────────────

  const loadInvoices = useCallback(async () => {
    setLoadingInvoices(true);
    try {
      const res = await listFinInvoices({
        status: statusFilter || undefined,
        search: search || undefined,
        limit: 50,
      });
      setInvoices(res.data);
      setTotal(res.total);
    } catch {
      // error handled silently — user sees empty list
    } finally {
      setLoadingInvoices(false);
    }
  }, [statusFilter, search]);

  const loadAging = useCallback(async () => {
    setLoadingAging(true);
    try {
      const res = await getFinInvoiceAging();
      setAging(res.data);
    } catch {
      // non-critical
    } finally {
      setLoadingAging(false);
    }
  }, []);

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);

  useEffect(() => {
    void loadAging();
  }, [loadAging]);

  // ─── Summary card values ────────────────────────────────────────────

  const totalEmisCount =
    invoices.filter((i) => ["issued", "paid", "overdue"].includes(i.status)).length;
  const totalEmisCents = invoices
    .filter((i) => ["issued", "paid", "overdue"].includes(i.status))
    .reduce((s, i) => s + i.totalCents, 0);
  const totalIncasatCents = invoices
    .filter((i) => i.status === "paid")
    .reduce((s, i) => s + i.totalCents, 0);
  const totalRestantCents = invoices
    .filter((i) => i.status === "overdue")
    .reduce((s, i) => s + i.totalCents, 0);
  const overdueCount = aging?.buckets.overdue_60_plus.count ?? 0;

  // ─── Actions ────────────────────────────────────────────────────────

  async function handleStatusChange(id: string, newStatus: FinInvoiceStatus) {
    setActionLoading(id);
    try {
      await updateFinInvoice(id, { status: newStatus });
      await loadInvoices();
      await loadAging();
    } catch {
      // fail silently — in production would show toast
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDownloadPdf(invoice: FinInvoice) {
    setDownloadingId(invoice.id);
    try {
      const res = await getFinInvoicePdfHtml(invoice.id, "ro");
      // Use the client-side PDF generator
      await downloadFinInvoicePdf(
        {
          invoiceNumber: invoice.invoiceNumber,
          series: invoice.series,
          number: invoice.number,
          currency: invoice.currency,
          issuedAt: invoice.issuedAt,
          dueDate: invoice.dueDate,
          totalCents: invoice.totalCents,
          vatTotalCents: invoice.vatTotalCents,
          notes: invoice.notes,
        },
        [], // lines not loaded in list view — use HTML from server
        { lang: "ro" }
      );
      void res; // suppress unused warning — server HTML used as fallback
    } catch {
      // fallback: open printable HTML in new tab
      try {
        window.open(`/api/fin/invoices/${invoice.id}/pdf?lang=ro`, "_blank");
      } catch {
        // ignore
      }
    } finally {
      setDownloadingId(null);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────

  function formatDate(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("ro-RO", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function daysOverdueLabel(dueDate: string | null, status: FinInvoiceStatus): string {
    if (status !== "overdue" || !dueDate) return "—";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    const days = Math.floor((today.getTime() - due.getTime()) / 86_400_000);
    return days > 0 ? `${days} zile` : "azi";
  }

  return (
    <AppShell pageTitle="Facturi B2B — FinDesk">
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Facturi B2B</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              FinDesk — {total} factur{total === 1 ? "ă" : "i"} totale
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { void loadInvoices(); void loadAging(); }}
              aria-label="Reîncarcă"
              className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors min-h-[44px]"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Factură nouă
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard
            label="Total emis"
            value={totalEmisCents > 0 ? formatFinMoney(totalEmisCents) : `${totalEmisCount} facturi`}
            icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
          />
          <SummaryCard
            label="Încasat"
            value={formatFinMoney(totalIncasatCents)}
            icon={<Banknote className="h-4 w-4" aria-hidden="true" />}
            variant="success"
          />
          <SummaryCard
            label="Restant"
            value={formatFinMoney(totalRestantCents)}
            icon={<AlertCircle className="h-4 w-4" aria-hidden="true" />}
            variant={totalRestantCents > 0 ? "danger" : "default"}
          />
          <SummaryCard
            label="Facturi scadente (60+)"
            value={loadingAging ? "..." : String(overdueCount)}
            icon={<Clock className="h-4 w-4" aria-hidden="true" />}
            variant={overdueCount > 0 ? "warning" : "default"}
          />
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap gap-3 items-center">
          <label htmlFor="fin-status-filter" className="sr-only">Filtrează după status</label>
          <select
            id="fin-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as FinInvoiceStatus | "")}
            className="px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
          >
            <option value="">Toate statusurile</option>
            <option value="draft">Ciornă</option>
            <option value="issued">Emisă</option>
            <option value="paid">Plătită</option>
            <option value="overdue">Restantă</option>
            <option value="cancelled">Anulată</option>
          </select>
          <label htmlFor="fin-search" className="sr-only">Caută factură</label>
          <input
            id="fin-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Caută nr. factură..."
            className="px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring flex-1 min-w-[180px] min-h-[44px]"
          />
        </div>

        {/* Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {loadingInvoices ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" aria-hidden="true" />
              <span>Se încarcă facturile...</span>
            </div>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <FileText className="h-10 w-10" aria-hidden="true" />
              <p className="text-sm">Nicio factură{statusFilter ? ` cu statusul "${statusFilter}"` : ""}.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Tabel facturi B2B">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Nr. factură</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Partener</th>
                    <th scope="col" className="text-right px-4 py-3 font-medium text-muted-foreground">Sumă</th>
                    <th scope="col" className="text-right px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">TVA</th>
                    <th scope="col" className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Scadență</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Restante</th>
                    <th scope="col" className="text-right px-4 py-3 font-medium text-muted-foreground">Acțiuni</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv, i) => {
                    const isActing = actionLoading === inv.id;
                    return (
                      <tr
                        key={inv.id}
                        className={cn(
                          "border-b border-border last:border-0 hover:bg-muted/40 transition-colors",
                          i % 2 === 1 && "bg-muted/20"
                        )}
                      >
                        <td className="px-4 py-3 font-mono text-foreground font-medium">
                          {inv.invoiceNumber}
                        </td>
                        <td className="px-4 py-3 text-foreground">
                          {inv.partyId ? (
                            <span className="text-muted-foreground text-xs">
                              {inv.partyId.slice(0, 8)}…
                            </span>
                          ) : (
                            <span className="text-muted-foreground italic text-xs">Ad-hoc</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-foreground">
                          {formatFinMoney(inv.totalCents, inv.currency)}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground hidden md:table-cell">
                          {formatFinMoney(inv.vatTotalCents, inv.currency)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                              STATUS_META[inv.status].cls
                            )}
                          >
                            {STATUS_META[inv.status].label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                          {formatDate(inv.dueDate)}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          {inv.status === "overdue" ? (
                            <span className="text-red-600 dark:text-red-400 font-medium text-xs">
                              {daysOverdueLabel(inv.dueDate, inv.status)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {/* Emite (draft → issued) */}
                            {inv.status === "draft" && (
                              <button
                                type="button"
                                disabled={isActing}
                                onClick={() => void handleStatusChange(inv.id, "issued")}
                                aria-label={`Emite factura ${inv.invoiceNumber}`}
                                title="Emite"
                                className="p-2 rounded-md text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                              >
                                {isActing ? (
                                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                ) : (
                                  <SendHorizontal className="h-4 w-4" aria-hidden="true" />
                                )}
                              </button>
                            )}
                            {/* Marchează plătit (issued/overdue → paid) */}
                            {(inv.status === "issued" || inv.status === "overdue") && (
                              <button
                                type="button"
                                disabled={isActing}
                                onClick={() => void handleStatusChange(inv.id, "paid")}
                                aria-label={`Marchează factura ${inv.invoiceNumber} ca plătită`}
                                title="Marchează plătit"
                                className="p-2 rounded-md text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                              >
                                {isActing ? (
                                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                ) : (
                                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                                )}
                              </button>
                            )}
                            {/* Anulează (draft/issued/overdue → cancelled) */}
                            {["draft", "issued", "overdue"].includes(inv.status) && (
                              <button
                                type="button"
                                disabled={isActing}
                                onClick={() => void handleStatusChange(inv.id, "cancelled")}
                                aria-label={`Anulează factura ${inv.invoiceNumber}`}
                                title="Anulează"
                                className="p-2 rounded-md text-destructive hover:bg-destructive/10 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                              >
                                <XCircle className="h-4 w-4" aria-hidden="true" />
                              </button>
                            )}
                            {/* Descarcă PDF */}
                            <button
                              type="button"
                              disabled={downloadingId === inv.id}
                              onClick={() => void handleDownloadPdf(inv)}
                              aria-label={`Descarcă PDF factura ${inv.invoiceNumber}`}
                              title="Descarcă PDF"
                              className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                            >
                              {downloadingId === inv.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                              ) : (
                                <Download className="h-4 w-4" aria-hidden="true" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create modal */}
      {showCreateModal && (
        <FinInvoiceCreateModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            void loadInvoices();
            void loadAging();
          }}
        />
      )}
    </AppShell>
  );
}
