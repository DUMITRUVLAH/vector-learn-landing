/**
 * CASH-002: /app/fin/cash
 *
 * Overview tranzacții bancare: total importate, matched/unmatched, tabel.
 * Design: Vector 365 tokens, light + dark, WCAG AA.
 */
import { useState, useEffect } from "react";
import {
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Upload,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useRouter } from "@/router/HashRouter";
import {
  getTransactions,
  MATCH_STATUS_LABELS,
  DIRECTION_LABELS,
  type FinBankTransaction,
  type FinTxMatchStatus,
} from "@/lib/api/finCash";

/** Formatează cenți → "1.250,00 MDL" */
function formatMDLCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("ro-MD", {
    style: "currency",
    currency: "MDL",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function MatchStatusBadge({ status }: { status: FinTxMatchStatus }) {
  const styles: Record<FinTxMatchStatus, string> = {
    unmatched: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    matched: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    duplicate: "bg-muted text-muted-foreground",
    ignored: "bg-muted text-muted-foreground opacity-60",
  };
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", styles[status])}>
      {MATCH_STATUS_LABELS[status]}
    </span>
  );
}

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

// ─── Main component ───────────────────────────────────────────────────────────

export default function CashPage() {
  const { navigate } = useRouter();
  const [transactions, setTransactions] = useState<FinBankTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTransactions()
      .then((r) => setTransactions(r.transactions))
      .catch((e) => setError(e instanceof Error ? e.message : "Eroare"))
      .finally(() => setLoading(false));
  }, []);

  const matched = transactions.filter((t) => t.matchStatus === "matched").length;
  const unmatched = transactions.filter((t) => t.matchStatus === "unmatched").length;
  const totalInCents = transactions
    .filter((t) => t.direction === "in" && t.matchStatus !== "duplicate")
    .reduce((sum, t) => sum + t.amountCents, 0);

  return (
    <AppShell pageTitle="Încasări (CASH)">
      <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Încasări & Reconciliere</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Tranzacții importate din extrase bancare. Reconciliere automată + manuală.
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
        {!loading && (
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              label="Total importate"
              value={transactions.length}
              icon={<TrendingUp className="h-5 w-5 text-primary" />}
              color="bg-primary/10"
            />
            <StatCard
              label="Reconsiliate"
              value={matched}
              icon={<CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />}
              color="bg-green-100 dark:bg-green-900/30"
            />
            <StatCard
              label="Nereconsil."
              value={unmatched}
              icon={<AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />}
              color="bg-amber-100 dark:bg-amber-900/30"
            />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-destructive" role="alert">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex min-h-[200px] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Se încarcă" />
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && transactions.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-12 text-center">
            <TrendingDown className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">Nicio tranzacție importată</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Importați un extras bancar CSV sau MT940 pentru a începe reconcilierea.
            </p>
            <button
              onClick={() => navigate("/app/fin/cash/import")}
              className="mt-2 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              <Upload className="h-4 w-4" />
              Import extras
            </button>
          </div>
        )}

        {/* Table */}
        {!loading && transactions.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm" role="table">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {["Data", "Contrapartea", "Referință", "Sumă", "Status"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="bg-card hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(tx.txDate).toLocaleDateString("ro-MD", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="max-w-[180px] truncate text-foreground">
                        {tx.counterparty ?? "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="max-w-[160px] truncate text-muted-foreground text-xs">
                        {tx.reference ?? "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {tx.direction === "in" ? (
                          <TrendingUp className="h-3.5 w-3.5 text-green-600" aria-label={DIRECTION_LABELS.in} />
                        ) : (
                          <TrendingDown className="h-3.5 w-3.5 text-destructive" aria-label={DIRECTION_LABELS.out} />
                        )}
                        <span className={cn(
                          "font-medium",
                          tx.direction === "in" ? "text-green-700 dark:text-green-400" : "text-destructive"
                        )}>
                          {formatMDLCents(tx.amountCents)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <MatchStatusBadge status={tx.matchStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Total row */}
        {!loading && transactions.length > 0 && (
          <div className="flex justify-end rounded-lg border border-border bg-muted/40 px-4 py-3">
            <div className="text-sm">
              <span className="text-muted-foreground">Total intrări: </span>
              <span className="font-semibold text-foreground">{formatMDLCents(totalInCents)}</span>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
