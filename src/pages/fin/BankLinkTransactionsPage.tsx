/**
 * BANKLINK-002: /app/fin/banklink/transactions — tabel tranzacții importate
 *
 * Filtre: conexiune, status, dată from/to. Paginare 50/pagina.
 * Badge status: unmatched (portocaliu) / matched (verde) / ignored (gri).
 * Design: Vector 365, light+dark, WCAG AA, fără hex.
 */
import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Loader2, AlertCircle, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { Link, useRouter } from "@/router/HashRouter";
import {
  listConnections,
  listTransactions,
  type BankConnection,
  type BankTransaction,
  type TransactionStatus,
} from "@/lib/api/finBankLink";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("ro-MD", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatAmount(cents: number, currency: string): string {
  return new Intl.NumberFormat("ro-MD", {
    style: "currency",
    currency,
    signDisplay: "always",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function StatusBadge({ status }: { status: TransactionStatus }) {
  const configs: Record<TransactionStatus, { label: string; className: string }> = {
    unmatched: {
      label: "Nereconciliată",
      className:
        "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-400",
    },
    matched: {
      label: "Reconciliată",
      className:
        "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400",
    },
    ignored: {
      label: "Ignorată",
      className:
        "border-border bg-muted text-muted-foreground",
    },
  };
  const { label, className } = configs[status];
  return (
    <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", className)}>
      {label}
    </span>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BankLinkTransactionsPage() {
  const { path } = useRouter();
  const searchParams = new URLSearchParams(path.includes("?") ? path.split("?")[1] : "");

  const [connections, setConnections] = useState<BankConnection[]>([]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterConn, setFilterConn] = useState(searchParams.get("connectionId") ?? "");
  const [filterStatus, setFilterStatus] = useState<TransactionStatus | "">("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const LIMIT = 50;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const load = useCallback(async (pg: number) => {
    setLoading(true);
    setError(null);
    try {
      const { data, total: t } = await listTransactions({
        connectionId: filterConn || undefined,
        status: (filterStatus as TransactionStatus) || undefined,
        from: filterFrom || undefined,
        to: filterTo || undefined,
        page: pg,
        limit: LIMIT,
      });
      setTransactions(data);
      setTotal(t);
    } catch {
      setError("Nu s-au putut încărca tranzacțiile.");
    } finally {
      setLoading(false);
    }
  }, [filterConn, filterStatus, filterFrom, filterTo]);

  useEffect(() => {
    listConnections().then(({ connections: data }) => setConnections(data)).catch(() => {});
  }, []);

  useEffect(() => {
    setPage(1);
    load(1);
  }, [load]);

  function connName(id: string): string {
    return connections.find((c) => c.id === id)?.name ?? id.slice(0, 8) + "…";
  }

  function connCurrency(id: string): string {
    return connections.find((c) => c.id === id)?.currency ?? "MDL";
  }

  return (
    <BusinessShell pageTitle="Tranzacții importate">
      {/* Back */}
      <div className="mb-4">
        <Link
          to="/app/fin/banklink"
          className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Conexiuni bancare
        </Link>
      </div>

      <h1 className="mb-4 text-xl font-semibold text-foreground">Tranzacții importate</h1>

      {/* ─── Filtre ──────────────────────────────────────────────────── */}
      <div className="mb-5 flex flex-wrap gap-3">
        {/* Conexiune */}
        <div className="min-w-[180px]">
          <label htmlFor="tx-conn" className="sr-only">Conexiune</label>
          <select
            id="tx-conn"
            value={filterConn}
            onChange={(e) => setFilterConn(e.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Toate conexiunile</option>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Status */}
        <div className="min-w-[160px]">
          <label htmlFor="tx-status" className="sr-only">Status</label>
          <select
            id="tx-status"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as TransactionStatus | "")}
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Toate statusurile</option>
            <option value="unmatched">Nereconciliate</option>
            <option value="matched">Reconciliate</option>
            <option value="ignored">Ignorate</option>
          </select>
        </div>

        {/* Date range */}
        <div className="flex items-center gap-1.5">
          <label htmlFor="tx-from" className="sr-only">De la</label>
          <input
            id="tx-from"
            type="date"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="De la dată"
          />
          <span className="text-muted-foreground">—</span>
          <label htmlFor="tx-to" className="sr-only">Până la</label>
          <input
            id="tx-to"
            type="date"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Până la dată"
          />
        </div>
      </div>

      {/* ─── Loading ─────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* ─── Error ───────────────────────────────────────────────────── */}
      {!loading && error && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <button
            onClick={() => load(page)}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-sm hover:bg-muted"
          >
            <RefreshCw className="h-4 w-4" />
            Reîncarcă
          </button>
        </div>
      )}

      {/* ─── Empty ───────────────────────────────────────────────────── */}
      {!loading && !error && transactions.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Nu există tranzacții importate pentru filtrele selectate.
          </p>
        </div>
      )}

      {/* ─── Table ───────────────────────────────────────────────────── */}
      {!loading && !error && transactions.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Dată</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">Sumă</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Descriere</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Contraparte</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Referință</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Conexiune</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-foreground">
                      {formatDate(tx.transactionDate)}
                    </td>
                    <td
                      className={cn(
                        "whitespace-nowrap px-3 py-2.5 text-right font-mono text-xs font-medium",
                        tx.amountCents >= 0
                          ? "text-green-600 dark:text-green-400"
                          : "text-destructive"
                      )}
                    >
                      {formatAmount(tx.amountCents, connCurrency(tx.bankConnectionId))}
                    </td>
                    <td className="max-w-[200px] px-3 py-2.5">
                      <p className="truncate text-foreground">{tx.description ?? "—"}</p>
                    </td>
                    <td className="max-w-[140px] px-3 py-2.5">
                      <p className="truncate text-foreground">{tx.counterpartyName ?? "—"}</p>
                    </td>
                    <td className="max-w-[100px] px-3 py-2.5 font-mono text-xs">
                      <p className="truncate text-muted-foreground">{tx.reference ?? "—"}</p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <StatusBadge status={tx.status} />
                    </td>
                    <td className="max-w-[120px] px-3 py-2.5">
                      <p className="truncate text-xs text-muted-foreground">
                        {connName(tx.bankConnectionId)}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginare */}
          <div className="mt-4 flex items-center justify-between text-sm">
            <p className="text-muted-foreground">
              {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} din {total} tranzacții
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => { setPage(page - 1); load(page - 1); }}
                disabled={page <= 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-input text-foreground hover:bg-muted disabled:opacity-40"
                aria-label="Pagina anterioară"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="flex h-8 items-center px-2 text-foreground">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => { setPage(page + 1); load(page + 1); }}
                disabled={page >= totalPages}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-input text-foreground hover:bg-muted disabled:opacity-40"
                aria-label="Pagina următoare"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </BusinessShell>
  );
}
