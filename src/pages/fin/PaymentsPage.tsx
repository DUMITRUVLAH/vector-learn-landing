/**
 * CASH-004: /app/fin/payments
 *
 * Pagina registru plăți cu:
 * - Tabel plăți: Data, Client (party_id), Sumă, Alocat, Nealocat, Acțiuni
 * - Filtrare după perioadă, cont bancar, status alocare
 * - Widget donut (alocat vs. nealocat)
 * - Tab „Nepotrivite" — coada unmatched cu butoane Creează plată + Ignoră
 * - Modal alocare plată↔factură (AllocationModal)
 *
 * Design: Vector 365 tokens, light + dark, WCAG AA, touch targets ≥ 44px.
 */
import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  AlertCircle,
  Loader2,
  CheckCircle2,
  DollarSign,
  Clock,
  Upload,
} from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { useRouter } from "@/router/HashRouter";
import {
  getPayments,
  ignoreTransaction,
  createPaymentFromTx,
  type FinPayment,
} from "@/lib/api/finCashAllocations";
import { getUnmatched, type FinBankTransaction } from "@/lib/api/finCash";
import { PaymentsDonut } from "@/components/fin/PaymentsDonut";
import { AllocationModal } from "@/components/fin/AllocationModal";
import { cn } from "@/lib/utils";

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmt(cents: number | null | undefined, currency = "MDL"): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("ro-MD", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("ro-MD", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ─── Allocation status badge ──────────────────────────────────────────────────

type AllocStatus = "none" | "partial" | "full";

function getAllocStatus(p: FinPayment): AllocStatus {
  if (p.allocatedCents === 0) return "none";
  if (p.allocatedCents >= p.amountCents) return "full";
  return "partial";
}

function AllocBadge({ status }: { status: AllocStatus }) {
  const styles: Record<AllocStatus, string> = {
    none: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    partial: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    full: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  };
  const labels: Record<AllocStatus, string> = {
    none: "Nealocat",
    partial: "Parțial",
    full: "Complet",
  };
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", styles[status])}>
      {labels[status]}
    </span>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", color)}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}

// ─── Tab types ────────────────────────────────────────────────────────────────

type Tab = "payments" | "unmatched";

// ─── Main component ───────────────────────────────────────────────────────────

export default function PaymentsPage() {
  const { navigate } = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("payments");

  // Payments state
  const [payments, setPayments] = useState<FinPayment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [errorPayments, setErrorPayments] = useState<string | null>(null);

  // Unmatched transactions state
  const [unmatched, setUnmatched] = useState<FinBankTransaction[]>([]);
  const [loadingUnmatched, setLoadingUnmatched] = useState(false);
  const [errorUnmatched, setErrorUnmatched] = useState<string | null>(null);

  // Filter state
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterAccount, setFilterAccount] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "partial" | "full">("all");

  // Modal state
  const [selectedPayment, setSelectedPayment] = useState<FinPayment | null>(null);

  // Action loading per tx
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  // ─── Load payments ──────────────────────────────────────────────────────────

  const loadPayments = useCallback(async () => {
    setLoadingPayments(true);
    setErrorPayments(null);
    try {
      const result = await getPayments({
        from: filterFrom || undefined,
        to: filterTo || undefined,
        accountLabel: filterAccount || undefined,
        status: filterStatus === "all" ? undefined : filterStatus,
      });
      setPayments(result.payments);
    } catch (e) {
      setErrorPayments(e instanceof Error ? e.message : "Eroare la încărcare");
    } finally {
      setLoadingPayments(false);
    }
  }, [filterFrom, filterTo, filterAccount, filterStatus]);

  useEffect(() => { loadPayments(); }, [loadPayments]);

  // ─── Load unmatched ─────────────────────────────────────────────────────────

  const loadUnmatched = useCallback(async () => {
    setLoadingUnmatched(true);
    setErrorUnmatched(null);
    try {
      const result = await getUnmatched();
      setUnmatched(result.transactions);
    } catch (e) {
      setErrorUnmatched(e instanceof Error ? e.message : "Eroare la încărcare");
    } finally {
      setLoadingUnmatched(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "unmatched") loadUnmatched();
  }, [activeTab, loadUnmatched]);

  // ─── Computed totals ────────────────────────────────────────────────────────

  const totalAllocated = payments.reduce((s, p) => s + p.allocatedCents, 0);
  const totalUnallocated = payments.reduce((s, p) => s + p.unallocatedCents, 0);
  const totalAmount = payments.reduce((s, p) => s + p.amountCents, 0);

  // ─── Actions ────────────────────────────────────────────────────────────────

  async function handleIgnore(txId: string) {
    setActionLoading((prev) => ({ ...prev, [txId]: true }));
    try {
      await ignoreTransaction(txId);
      setUnmatched((prev) => prev.filter((t) => t.id !== txId));
    } catch (e) {
      // Non-blocking: show inline error would need more state; log and continue
      console.error("ignore failed", e);
    } finally {
      setActionLoading((prev) => ({ ...prev, [txId]: false }));
    }
  }

  async function handleCreatePayment(txId: string) {
    setActionLoading((prev) => ({ ...prev, [txId]: true }));
    try {
      await createPaymentFromTx(txId);
      setUnmatched((prev) => prev.filter((t) => t.id !== txId));
      // Refresh payments list
      loadPayments();
    } catch (e) {
      console.error("create-payment failed", e);
    } finally {
      setActionLoading((prev) => ({ ...prev, [txId]: false }));
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <BusinessShell pageTitle="Plăți (CASH)">
      <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Registru Plăți</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Plăți primite, alocări facturi și credit nealocat per client.
            </p>
          </div>
          <button
            onClick={() => navigate("/app/fin/cash/import")}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            Import extras
          </button>
        </div>

        {/* Stats */}
        {!loadingPayments && (
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              label="Total plăți"
              value={fmt(totalAmount)}
              icon={<DollarSign className="h-5 w-5 text-primary" />}
              color="bg-primary/10"
            />
            <StatCard
              label="Alocat"
              value={fmt(totalAllocated)}
              icon={<CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />}
              color="bg-green-100 dark:bg-green-900/30"
            />
            <StatCard
              label="Nealocat"
              value={fmt(totalUnallocated)}
              icon={<Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />}
              color="bg-amber-100 dark:bg-amber-900/30"
            />
          </div>
        )}

        {/* Donut */}
        {!loadingPayments && (
          <PaymentsDonut
            allocatedCents={totalAllocated}
            unallocatedCents={totalUnallocated}
          />
        )}

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl border border-border bg-muted/40 p-1" role="tablist">
          {(["payments", "unmatched"] as Tab[]).map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex-1 min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                "focus:outline-none focus:ring-2 focus:ring-ring",
                activeTab === tab
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab === "payments" ? "Plăți" : `Nepotrivite${unmatched.length > 0 ? ` (${unmatched.length})` : ""}`}
            </button>
          ))}
        </div>

        {/* ── Tab: Payments ── */}
        {activeTab === "payments" && (
          <>
            {/* Filters */}
            <div className="flex flex-wrap gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="filter-from" className="text-xs text-muted-foreground">De la</label>
                <input
                  id="filter-from"
                  type="date"
                  value={filterFrom}
                  onChange={(e) => setFilterFrom(e.target.value)}
                  className="min-h-[44px] rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="filter-to" className="text-xs text-muted-foreground">Până la</label>
                <input
                  id="filter-to"
                  type="date"
                  value={filterTo}
                  onChange={(e) => setFilterTo(e.target.value)}
                  className="min-h-[44px] rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="filter-account" className="text-xs text-muted-foreground">Cont bancar</label>
                <input
                  id="filter-account"
                  type="text"
                  value={filterAccount}
                  onChange={(e) => setFilterAccount(e.target.value)}
                  placeholder="MAIB MDL..."
                  className="min-h-[44px] rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="filter-status" className="text-xs text-muted-foreground">Status alocare</label>
                <select
                  id="filter-status"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
                  className="min-h-[44px] rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="all">Toate</option>
                  <option value="partial">Parțial</option>
                  <option value="full">Complet</option>
                </select>
              </div>
            </div>

            {/* Error */}
            {errorPayments && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-destructive" role="alert">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span className="text-sm">{errorPayments}</span>
              </div>
            )}

            {/* Loading */}
            {loadingPayments && (
              <div className="flex min-h-[200px] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Se încarcă" />
              </div>
            )}

            {/* Empty state */}
            {!loadingPayments && !errorPayments && payments.length === 0 && (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-12 text-center">
                <DollarSign className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm font-medium text-foreground">Nicio plată înregistrată</p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Importați un extras bancar sau înregistrați o plată manuală.
                </p>
              </div>
            )}

            {/* Table */}
            {!loadingPayments && payments.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-border" role="region" aria-label="Tabel plăți">
                <table className="w-full text-sm" role="table">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      {["Data", "Client", "Sumă", "Alocat", "Nealocat", "Status", "Acțiuni"].map((h) => (
                        <th
                          key={h}
                          scope="col"
                          className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {payments.map((p) => {
                      const allocStatus = getAllocStatus(p);
                      return (
                        <tr key={p.id} className="bg-card hover:bg-muted/40 transition-colors">
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                            {fmtDate(p.receivedDate)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="max-w-[120px] truncate text-foreground text-xs">
                              {p.partyId ?? <span className="text-muted-foreground italic">Necunoscut</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                            {fmt(p.amountCents, p.currency)}
                          </td>
                          <td className="px-4 py-3 text-green-700 dark:text-green-400 whitespace-nowrap">
                            {fmt(p.allocatedCents, p.currency)}
                          </td>
                          <td className="px-4 py-3 text-amber-700 dark:text-amber-400 whitespace-nowrap">
                            {fmt(p.unallocatedCents, p.currency)}
                          </td>
                          <td className="px-4 py-3">
                            <AllocBadge status={allocStatus} />
                          </td>
                          <td className="px-4 py-3">
                            {allocStatus !== "full" && (
                              <button
                                onClick={() => setSelectedPayment(p)}
                                className="min-h-[44px] rounded-lg border border-border bg-background px-3 py-1 text-xs font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
                                aria-label={`Alocă plata din ${fmtDate(p.receivedDate)}`}
                              >
                                Alocă
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── Tab: Unmatched ── */}
        {activeTab === "unmatched" && (
          <>
            {errorUnmatched && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-destructive" role="alert">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span className="text-sm">{errorUnmatched}</span>
              </div>
            )}

            {loadingUnmatched && (
              <div className="flex min-h-[200px] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Se încarcă" />
              </div>
            )}

            {!loadingUnmatched && !errorUnmatched && unmatched.length === 0 && (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-12 text-center">
                <CheckCircle2 className="h-10 w-10 text-green-500" aria-hidden="true" />
                <p className="text-sm font-medium text-foreground">Coada este goală!</p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Toate tranzacțiile importate au fost reconciliate sau ignorate.
                </p>
              </div>
            )}

            {!loadingUnmatched && unmatched.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-border" role="region" aria-label="Tranzacții nepotrivite">
                <table className="w-full text-sm" role="table">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      {["Data", "Contrapartea", "Referință", "Sumă", "Acțiuni"].map((h) => (
                        <th
                          key={h}
                          scope="col"
                          className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {unmatched.map((tx) => {
                      const busy = actionLoading[tx.id];
                      return (
                        <tr key={tx.id} className="bg-card hover:bg-muted/40 transition-colors">
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                            {fmtDate(tx.txDate)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="max-w-[160px] truncate text-foreground">
                              {tx.counterparty ?? "—"}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="max-w-[140px] truncate text-muted-foreground text-xs">
                              {tx.reference ?? "—"}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                            {fmt(tx.amountCents, tx.currency)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              {tx.direction === "in" && (
                                <button
                                  onClick={() => handleCreatePayment(tx.id)}
                                  disabled={busy}
                                  className={cn(
                                    "min-h-[44px] rounded-lg px-3 py-1 text-xs font-medium",
                                    "focus:outline-none focus:ring-2 focus:ring-ring",
                                    busy
                                      ? "cursor-not-allowed bg-muted text-muted-foreground"
                                      : "bg-primary text-primary-foreground hover:bg-primary/90"
                                  )}
                                  aria-label="Creează plată din această tranzacție"
                                >
                                  {busy ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    "Creează plată"
                                  )}
                                </button>
                              )}
                              <button
                                onClick={() => handleIgnore(tx.id)}
                                disabled={busy}
                                className={cn(
                                  "min-h-[44px] rounded-lg border border-border px-3 py-1 text-xs font-medium",
                                  "focus:outline-none focus:ring-2 focus:ring-ring",
                                  busy
                                    ? "cursor-not-allowed text-muted-foreground"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                )}
                                aria-label="Ignoră această tranzacție"
                              >
                                Ignoră
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
          </>
        )}
      </div>

      {/* Allocation modal */}
      {selectedPayment && (
        <AllocationModal
          payment={selectedPayment}
          onClose={() => setSelectedPayment(null)}
          onAllocated={(updated) => {
            setPayments((prev) =>
              prev.map((p) => (p.id === updated.id ? updated : p))
            );
          }}
        />
      )}
    </BusinessShell>
  );
}
