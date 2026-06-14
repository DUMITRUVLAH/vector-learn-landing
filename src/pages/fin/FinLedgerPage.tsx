/**
 * LEDGER-002: FinDesk General Ledger — Trial Balance page
 *
 * Route: /app/fin/ledger
 *
 * Displays the trial balance (sum debit vs credit per account) for a selected
 * period. Shows whether the ledger is balanced (green banner) or not (red banner).
 * Admin can post a payment directly to the ledger via a dialog.
 *
 * GAP-ANALYSIS G1: competitors lack a real double-entry ledger — this is the differentiator.
 * FIN-CORE §1 (double-entry accounting layer).
 */

import { useEffect, useState, useCallback } from "react";
import {
  Loader2,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Plus,
  Filter,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import {
  getTrialBalance,
  postPaymentEntry,
  seedLedgerAccounts,
  formatLedgerAmount,
  type TrialBalanceResponse,
} from "@/lib/api/finLedger";

// ─── Constants ───────────────────────────────────────────────────────────────

const ACCOUNT_CLASSES = [
  { value: "", label: "Toate clasele" },
  { value: "A", label: "A — Active" },
  { value: "P", label: "P — Pasive" },
  { value: "V", label: "V — Venituri" },
  { value: "C", label: "C — Cheltuieli" },
  { value: "B", label: "B — Bifuncționale" },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstDayOfMonth(): string {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

// ─── Component ───────────────────────────────────────────────────────────────

export function FinLedgerPage() {
  const { status: sessionStatus } = useSession();

  const [balance, setBalance] = useState<TrialBalanceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterFrom, setFilterFrom] = useState(firstDayOfMonth());
  const [filterTo, setFilterTo] = useState(today());
  const [filterClass, setFilterClass] = useState("");

  // Post payment dialog
  const [showPostDialog, setShowPostDialog] = useState(false);
  const [paymentId, setPaymentId] = useState("");
  const [posting, setPosting] = useState(false);
  const [postResult, setPostResult] = useState<string | null>(null);
  const [postError, setPostError] = useState<string | null>(null);

  // Seed dialog/status
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTrialBalance({
        from: filterFrom || undefined,
        to: filterTo || undefined,
        class: filterClass || undefined,
      });
      setBalance(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la încărcare");
    } finally {
      setLoading(false);
    }
  }, [filterFrom, filterTo, filterClass]);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    fetchBalance();
  }, [sessionStatus, fetchBalance]);

  async function handlePostPayment() {
    if (!paymentId.trim()) return;
    setPosting(true);
    setPostError(null);
    setPostResult(null);
    try {
      const res = await postPaymentEntry(paymentId.trim());
      if (res.existing) {
        setPostResult("Această plată a fost deja postată în jurnal (idempotent).");
      } else {
        setPostResult(`Înregistrare contabilă creată: ${res.entryId.slice(0, 8)}`);
        fetchBalance();
      }
      setShowPostDialog(false);
      setPaymentId("");
    } catch (err) {
      setPostError(err instanceof Error ? err.message : "Eroare la postare");
    } finally {
      setPosting(false);
    }
  }

  async function handleSeed() {
    setSeeding(true);
    setSeedMsg(null);
    try {
      const res = await seedLedgerAccounts();
      setSeedMsg(res.message);
      fetchBalance();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la seeding");
    } finally {
      setSeeding(false);
    }
  }

  if (sessionStatus === "loading") {
    return (
      <AppShell pageTitle="General Ledger — FinDesk">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se încarcă" />
        </div>
      </AppShell>
    );
  }

  const activeAccounts = balance?.accounts.filter(
    (a) => a.debitTotal > 0 || a.creditTotal > 0
  ) ?? [];

  return (
    <AppShell pageTitle="General Ledger — Balanță de Verificare">
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <BookOpen className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">
                General Ledger — Balanță de Verificare
              </h1>
              <p className="text-sm text-muted-foreground">
                Double-entry accounting · GAP-ANALYSIS G1
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleSeed}
              disabled={seeding}
              className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border border-input text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              aria-label="Seed plan de conturi SNC"
            >
              {seeding ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="h-4 w-4" aria-hidden="true" />
              )}
              Seed conturi SNC
            </button>

            <button
              onClick={() => setShowPostDialog(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Postează plată
            </button>
          </div>
        </div>

        {/* Error / seed feedback */}
        {error && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/30 px-4 py-2 text-sm text-destructive"
          >
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            {error}
          </div>
        )}
        {seedMsg && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-md bg-success/10 border border-success/30 px-4 py-2 text-sm text-success"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {seedMsg}
          </div>
        )}
        {postResult && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-md bg-success/10 border border-success/30 px-4 py-2 text-sm text-success"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {postResult}
          </div>
        )}

        {/* Balance status banner */}
        {balance && (
          <div
            role="status"
            className={`flex items-center gap-3 rounded-lg px-5 py-4 border ${
              balance.isBalanced
                ? "bg-success/10 border-success/30 text-success"
                : "bg-destructive/10 border-destructive/30 text-destructive"
            }`}
          >
            {balance.isBalanced ? (
              <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
            ) : (
              <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
            )}
            <div>
              <div className="font-semibold">
                {balance.isBalanced
                  ? "Balanță ECHILIBRATĂ"
                  : `Balanță NEECHILIBRATĂ — diferență: ${formatLedgerAmount(
                      Math.abs(balance.grandDebit - balance.grandCredit)
                    )} MDL`}
              </div>
              <div className="text-sm opacity-80">
                Total Debit: {formatLedgerAmount(balance.grandDebit)} ·
                Total Credit: {formatLedgerAmount(balance.grandCredit)}
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm font-medium text-foreground">Perioadă și filtru</span>
          </div>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label htmlFor="from-date" className="text-xs text-muted-foreground">
                De la
              </label>
              <input
                id="from-date"
                type="date"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="to-date" className="text-xs text-muted-foreground">
                Până la
              </label>
              <input
                id="to-date"
                type="date"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="filter-class" className="text-xs text-muted-foreground">
                Clasă de cont
              </label>
              <select
                id="filter-class"
                value={filterClass}
                onChange={(e) => setFilterClass(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {ACCOUNT_CLASSES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={fetchBalance}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              )}
              Actualizează
            </button>
          </div>
        </div>

        {/* Trial balance table */}
        <div className="rounded-lg border bg-card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2
                className="h-6 w-6 animate-spin text-muted-foreground"
                aria-label="Se calculează balanța"
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Cod
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Denumire cont
                    </th>
                    <th scope="col" className="px-4 py-3 text-center font-medium text-muted-foreground">
                      Clasă
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium text-muted-foreground">
                      Total Debit
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium text-muted-foreground">
                      Total Credit
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium text-muted-foreground">
                      Sold Net
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {!balance || balance.accounts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                        Niciun cont în planul de conturi. Apăsați "Seed conturi SNC" pentru a inițializa.
                      </td>
                    </tr>
                  ) : (
                    balance.accounts
                      .filter((a) => !filterClass || a.class === filterClass)
                      .map((account) => (
                        <tr
                          key={account.code}
                          className={`border-b last:border-0 transition-colors ${
                            account.debitTotal > 0 || account.creditTotal > 0
                              ? "hover:bg-muted/30"
                              : "opacity-40"
                          }`}
                        >
                          <td className="px-4 py-2.5 font-mono text-foreground font-medium">
                            {account.code}
                          </td>
                          <td className="px-4 py-2.5 text-foreground">
                            {account.name}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary font-medium">
                              {account.class}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                            {account.debitTotal > 0 ? (
                              <span className="flex items-center justify-end gap-1">
                                <TrendingUp className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                                {formatLedgerAmount(account.debitTotal)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                            {account.creditTotal > 0 ? (
                              <span className="flex items-center justify-end gap-1">
                                <TrendingDown className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                                {formatLedgerAmount(account.creditTotal)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td
                            className={`px-4 py-2.5 text-right tabular-nums font-medium ${
                              account.netBalance > 0
                                ? "text-success"
                                : account.netBalance < 0
                                ? "text-destructive"
                                : "text-muted-foreground"
                            }`}
                          >
                            {account.netBalance !== 0
                              ? `${account.netBalance > 0 ? "+" : ""}${formatLedgerAmount(account.netBalance)}`
                              : "—"}
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>

                {/* Grand totals footer */}
                {balance && balance.accounts.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 bg-muted/60">
                      <td
                        colSpan={3}
                        className="px-4 py-3 font-semibold text-foreground"
                      >
                        TOTAL GENERAL
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">
                        {formatLedgerAmount(balance.grandDebit)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">
                        {formatLedgerAmount(balance.grandCredit)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-semibold tabular-nums ${
                          balance.isBalanced
                            ? "text-success"
                            : "text-destructive"
                        }`}
                      >
                        {balance.isBalanced
                          ? "Echilibrat"
                          : formatLedgerAmount(Math.abs(balance.grandDebit - balance.grandCredit))}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>

        {/* Summary stats */}
        {balance && activeAccounts.length > 0 && (
          <p className="text-xs text-muted-foreground text-right">
            {activeAccounts.length} din {balance.accounts.length} conturi cu activitate ·
            Perioadă: {balance.periodFrom ?? "—"} → {balance.periodTo ?? "—"}
          </p>
        )}
      </div>

      {/* Post payment dialog */}
      {showPostDialog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="post-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-sm rounded-xl bg-background border shadow-xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-primary/10 shrink-0">
                <BookOpen className="h-5 w-5 text-primary" aria-hidden="true" />
              </div>
              <div>
                <h2 id="post-dialog-title" className="font-semibold text-foreground">
                  Postează plată în jurnal
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Creează înregistrarea double-entry: Debit 531 Numerar / Credit 711 Venituri.
                </p>
              </div>
            </div>

            {postError && (
              <p role="alert" className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                {postError}
              </p>
            )}

            <div className="flex flex-col gap-1">
              <label htmlFor="payment-id-input" className="text-xs text-muted-foreground">
                ID plată (UUID)
              </label>
              <input
                id="payment-id-input"
                type="text"
                value={paymentId}
                onChange={(e) => setPaymentId(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowPostDialog(false); setPostError(null); }}
                disabled={posting}
                className="px-4 py-2 text-sm rounded-md border border-input text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                Anulare
              </button>
              <button
                onClick={handlePostPayment}
                disabled={posting || !paymentId.trim()}
                className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 flex items-center gap-2"
              >
                {posting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Se postează...
                  </>
                ) : (
                  <>
                    <BookOpen className="h-4 w-4" aria-hidden="true" />
                    Postează
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
