/**
 * LEDGER-004: FinDesk General Ledger — full UI
 *
 * Route: /app/fin/ledger
 *
 * Tabs:
 *   1. Balanță — trial balance per account (LEDGER-002 enhanced)
 *   2. Jurnal   — paginated journal entries with expandable lines + CSV export
 *   3. Reconciliere — compare GL vs source tables (LEDGER-003 reconcile endpoint)
 *
 * Drill-down: click on an account in Balanță → /app/fin/ledger/account/:code (carte mare)
 *
 * GAP-ANALYSIS G1: competitors lack a real double-entry ledger.
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
  Download,
  ChevronDown,
  ChevronRight,
  ArrowRight,
} from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { useSession } from "@/hooks/useSession";
import {
  getTrialBalance,
  postPaymentEntry,
  seedLedgerAccounts,
  formatLedgerAmount,
  listJournalEntries,
  reconcileLedger,
  exportJournalCsv,
  type TrialBalanceResponse,
  type JournalEntry,
  type ReconcileResponse,
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

const SOURCE_TYPES = [
  { value: "", label: "Toate sursele" },
  { value: "PAY", label: "PAY — Plăți" },
  { value: "BILL", label: "BILL — Facturi" },
  { value: "SPEND", label: "SPEND — Cheltuieli" },
  { value: "SALARY", label: "SALARY — Salarii" },
  { value: "ASSET", label: "ASSET — Active" },
  { value: "MANUAL", label: "MANUAL" },
];

type ActiveTab = "balanta" | "jurnal" | "reconciliere";

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

  // Shared date filters
  const [filterFrom, setFilterFrom] = useState(firstDayOfMonth());
  const [filterTo, setFilterTo] = useState(today());

  // Active tab
  const [activeTab, setActiveTab] = useState<ActiveTab>("balanta");

  // ── Balanță state ─────────────────────────────────────────────────────────
  const [balance, setBalance] = useState<TrialBalanceResponse | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [filterClass, setFilterClass] = useState("");

  // Post payment dialog
  const [showPostDialog, setShowPostDialog] = useState(false);
  const [paymentId, setPaymentId] = useState("");
  const [posting, setPosting] = useState(false);
  const [postResult, setPostResult] = useState<string | null>(null);
  const [postError, setPostError] = useState<string | null>(null);

  // Seed status
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);

  // ── Jurnal state ──────────────────────────────────────────────────────────
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [journalTotal, setJournalTotal] = useState(0);
  const [journalPage, setJournalPage] = useState(1);
  const [journalLoading, setJournalLoading] = useState(false);
  const [journalError, setJournalError] = useState<string | null>(null);
  const [journalSourceType, setJournalSourceType] = useState("");
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());

  // ── Reconciliere state ────────────────────────────────────────────────────
  const [reconcile, setReconcile] = useState<ReconcileResponse | null>(null);
  const [reconcileLoading, setReconcileLoading] = useState(false);
  const [reconcileError, setReconcileError] = useState<string | null>(null);

  // ── Balanță fetch ─────────────────────────────────────────────────────────
  const fetchBalance = useCallback(async () => {
    setBalanceLoading(true);
    setBalanceError(null);
    try {
      const data = await getTrialBalance({
        from: filterFrom || undefined,
        to: filterTo || undefined,
        class: filterClass || undefined,
      });
      setBalance(data);
    } catch (err) {
      setBalanceError(err instanceof Error ? err.message : "Eroare la încărcare");
    } finally {
      setBalanceLoading(false);
    }
  }, [filterFrom, filterTo, filterClass]);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    fetchBalance();
  }, [sessionStatus, fetchBalance]);

  // ── Jurnal fetch ──────────────────────────────────────────────────────────
  const fetchJournal = useCallback(async () => {
    setJournalLoading(true);
    setJournalError(null);
    try {
      const data = await listJournalEntries({
        page: journalPage,
        limit: 50,
        from: filterFrom || undefined,
        to: filterTo || undefined,
        sourceType: journalSourceType || undefined,
      });
      setJournalEntries(data.data);
      setJournalTotal(data.total);
    } catch (err) {
      setJournalError(err instanceof Error ? err.message : "Eroare la jurnal");
    } finally {
      setJournalLoading(false);
    }
  }, [filterFrom, filterTo, journalSourceType, journalPage]);

  useEffect(() => {
    if (activeTab === "jurnal" && sessionStatus === "authenticated") {
      fetchJournal();
    }
  }, [activeTab, sessionStatus, fetchJournal]);

  // ── Reconciliere fetch ────────────────────────────────────────────────────
  async function runReconcile() {
    setReconcileLoading(true);
    setReconcileError(null);
    try {
      const data = await reconcileLedger({
        from: filterFrom || undefined,
        to: filterTo || undefined,
      });
      setReconcile(data);
    } catch (err) {
      setReconcileError(err instanceof Error ? err.message : "Eroare reconciliere");
    } finally {
      setReconcileLoading(false);
    }
  }

  // ── Handlers ──────────────────────────────────────────────────────────────
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
      setBalanceError(err instanceof Error ? err.message : "Eroare la seeding");
    } finally {
      setSeeding(false);
    }
  }

  function toggleEntry(id: string) {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleExportCsv() {
    exportJournalCsv(journalEntries, filterFrom, filterTo);
  }

  if (sessionStatus === "loading") {
    return (
      <BusinessShell pageTitle="General Ledger — FinDesk">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se incarca" />
        </div>
      </BusinessShell>
    );
  }

  const activeAccounts = balance?.accounts.filter(
    (a) => a.debitTotal > 0 || a.creditTotal > 0
  ) ?? [];

  return (
    <BusinessShell pageTitle="General Ledger — FinDesk">
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <BookOpen className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">
                General Ledger — Registru Contabil
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
              Posteza plata
            </button>
          </div>
        </div>

        {/* Feedback banners */}
        {seedMsg && (
          <div role="status" className="flex items-center gap-2 rounded-md bg-success/10 border border-success/30 px-4 py-2 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {seedMsg}
          </div>
        )}
        {postResult && (
          <div role="status" className="flex items-center gap-2 rounded-md bg-success/10 border border-success/30 px-4 py-2 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {postResult}
          </div>
        )}

        {/* Shared period filters */}
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm font-medium text-foreground">Perioada</span>
          </div>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label htmlFor="from-date" className="text-xs text-muted-foreground">De la</label>
              <input
                id="from-date"
                type="date"
                value={filterFrom}
                onChange={(e) => { setFilterFrom(e.target.value); setJournalPage(1); }}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="to-date" className="text-xs text-muted-foreground">Pana la</label>
              <input
                id="to-date"
                type="date"
                value={filterTo}
                onChange={(e) => { setFilterTo(e.target.value); setJournalPage(1); }}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
        </div>

        {/* Tab navigation */}
        <div
          role="tablist"
          aria-label="Sectiuni General Ledger"
          className="flex gap-1 border-b"
        >
          {(["balanta", "jurnal", "reconciliere"] as ActiveTab[]).map((tab) => {
            const labels: Record<ActiveTab, string> = {
              balanta: "Balanta de verificare",
              jurnal: "Jurnal contabil",
              reconciliere: "Reconciliere GL",
            };
            return (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  activeTab === tab
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {labels[tab]}
              </button>
            );
          })}
        </div>

        {/* ── TAB: Balanță ─────────────────────────────────────────────────── */}
        {activeTab === "balanta" && (
          <div className="space-y-4" role="tabpanel" aria-label="Balanta de verificare">

            {/* Class filter + refresh */}
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex flex-col gap-1">
                <label htmlFor="filter-class" className="text-xs text-muted-foreground">Clasa de cont</label>
                <select
                  id="filter-class"
                  value={filterClass}
                  onChange={(e) => setFilterClass(e.target.value)}
                  className="rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {ACCOUNT_CLASSES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={fetchBalance}
                disabled={balanceLoading}
                className="flex items-center gap-2 px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
              >
                {balanceLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                )}
                Actualizeaza
              </button>
            </div>

            {balanceError && (
              <div role="alert" className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/30 px-4 py-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                {balanceError}
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
                      ? "Balanta ECHILIBRATA"
                      : `Balanta NEECHILIBRATA — diferenta: ${formatLedgerAmount(
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

            {/* Trial balance table */}
            <div className="rounded-lg border bg-card overflow-hidden">
              {balanceLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se calculeaza balanta" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Cod</th>
                        <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Denumire cont</th>
                        <th scope="col" className="px-4 py-3 text-center font-medium text-muted-foreground">Clasa</th>
                        <th scope="col" className="px-4 py-3 text-right font-medium text-muted-foreground">Total Debit</th>
                        <th scope="col" className="px-4 py-3 text-right font-medium text-muted-foreground">Total Credit</th>
                        <th scope="col" className="px-4 py-3 text-right font-medium text-muted-foreground">Sold Net</th>
                        <th scope="col" className="px-4 py-3 text-right font-medium text-muted-foreground">Carte mare</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!balance || balance.accounts.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                            Niciun cont. Apasati "Seed conturi SNC" pentru initializare.
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
                              <td className="px-4 py-2.5 font-mono text-foreground font-medium">{account.code}</td>
                              <td className="px-4 py-2.5 text-foreground">{account.name}</td>
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
                              <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${
                                account.netBalance > 0
                                  ? "text-success"
                                  : account.netBalance < 0
                                  ? "text-destructive"
                                  : "text-muted-foreground"
                              }`}>
                                {account.netBalance !== 0
                                  ? `${account.netBalance > 0 ? "+" : ""}${formatLedgerAmount(account.netBalance)}`
                                  : "—"}
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <a
                                  href={`#/app/fin/ledger/account/${account.code}`}
                                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                                  aria-label={`Carte mare cont ${account.code}`}
                                >
                                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                                  Detalii
                                </a>
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
                    {balance && balance.accounts.length > 0 && (
                      <tfoot>
                        <tr className="border-t-2 bg-muted/60">
                          <td colSpan={3} className="px-4 py-3 font-semibold text-foreground">TOTAL GENERAL</td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">{formatLedgerAmount(balance.grandDebit)}</td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">{formatLedgerAmount(balance.grandCredit)}</td>
                          <td className={`px-4 py-3 text-right font-semibold tabular-nums ${balance.isBalanced ? "text-success" : "text-destructive"}`}>
                            {balance.isBalanced ? "Echilibrat" : formatLedgerAmount(Math.abs(balance.grandDebit - balance.grandCredit))}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </div>

            {balance && activeAccounts.length > 0 && (
              <p className="text-xs text-muted-foreground text-right">
                {activeAccounts.length} din {balance.accounts.length} conturi cu activitate ·
                Perioada: {balance.periodFrom ?? "—"} → {balance.periodTo ?? "—"}
              </p>
            )}
          </div>
        )}

        {/* ── TAB: Jurnal ──────────────────────────────────────────────────── */}
        {activeTab === "jurnal" && (
          <div className="space-y-4" role="tabpanel" aria-label="Jurnal contabil">
            <div className="flex flex-wrap gap-3 items-end justify-between">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex flex-col gap-1">
                  <label htmlFor="journal-source" className="text-xs text-muted-foreground">Sursa</label>
                  <select
                    id="journal-source"
                    value={journalSourceType}
                    onChange={(e) => { setJournalSourceType(e.target.value); setJournalPage(1); }}
                    className="rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {SOURCE_TYPES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={fetchJournal}
                  disabled={journalLoading}
                  className="flex items-center gap-2 px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                >
                  {journalLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  )}
                  Actualizeaza
                </button>
              </div>
              <button
                onClick={handleExportCsv}
                disabled={journalEntries.length === 0}
                className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border border-input text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
                aria-label="Export jurnal CSV"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Export CSV
              </button>
            </div>

            {journalError && (
              <div role="alert" className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/30 px-4 py-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                {journalError}
              </div>
            )}

            <div className="rounded-lg border bg-card overflow-hidden">
              {journalLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se incarca jurnalul" />
                </div>
              ) : journalEntries.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  Nicio inregistrare contabila in aceasta perioada.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground w-8" />
                        <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Data</th>
                        <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Descriere</th>
                        <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Ref</th>
                        <th scope="col" className="px-4 py-3 text-center font-medium text-muted-foreground">Sursa</th>
                        <th scope="col" className="px-4 py-3 text-center font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {journalEntries.map((entry) => {
                        const expanded = expandedEntries.has(entry.id);
                        return (
                          <>
                            <tr
                              key={entry.id}
                              className="border-b hover:bg-muted/20 cursor-pointer"
                              onClick={() => toggleEntry(entry.id)}
                              aria-expanded={expanded}
                            >
                              <td className="px-4 py-2.5 text-muted-foreground">
                                {expanded ? (
                                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                                )}
                              </td>
                              <td className="px-4 py-2.5 font-mono text-foreground whitespace-nowrap">{entry.entryDate}</td>
                              <td className="px-4 py-2.5 text-foreground">{entry.description ?? "—"}</td>
                              <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{entry.reference ? entry.reference.slice(0, 12) : "—"}</td>
                              <td className="px-4 py-2.5 text-center">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary font-medium">
                                  {entry.sourceType}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                  entry.status === "posted"
                                    ? "bg-success/10 text-success"
                                    : "bg-muted text-muted-foreground"
                                }`}>
                                  {entry.status}
                                </span>
                              </td>
                            </tr>
                            {expanded && (
                              <tr key={`${entry.id}-expanded`} className="bg-muted/10">
                                <td colSpan={6} className="px-8 py-3">
                                  <div className="text-xs text-muted-foreground space-y-1">
                                    <div><span className="font-medium text-foreground">ID:</span> {entry.id}</div>
                                    <div><span className="font-medium text-foreground">Creat la:</span> {new Date(entry.createdAt).toLocaleString("ro-RO")}</div>
                                    {entry.sourceId && (
                                      <div><span className="font-medium text-foreground">Sursa ID:</span> {entry.sourceId.slice(0, 8)}...</div>
                                    )}
                                    <p className="text-muted-foreground italic mt-1">
                                      Vezi liniile debit/credit in baza de date (GET /api/fin/ledger/entries/{entry.id}/lines).
                                    </p>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Pagination */}
            {journalTotal > 50 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{journalTotal} inregistrari total</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setJournalPage((p) => Math.max(1, p - 1)); }}
                    disabled={journalPage === 1 || journalLoading}
                    className="px-3 py-1 rounded-md border border-input hover:bg-muted transition-colors disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <span className="px-3 py-1">Pag {journalPage}</span>
                  <button
                    onClick={() => { setJournalPage((p) => p + 1); }}
                    disabled={journalPage * 50 >= journalTotal || journalLoading}
                    className="px-3 py-1 rounded-md border border-input hover:bg-muted transition-colors disabled:opacity-40"
                  >
                    Urmator
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: Reconciliere ─────────────────────────────────────────────── */}
        {activeTab === "reconciliere" && (
          <div className="space-y-4" role="tabpanel" aria-label="Reconciliere GL">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <p className="text-sm text-muted-foreground">
                Compara inregistrarile din jurnal cu sursele financiare (plati, salarii).
                Identifica tranzactiile nepostate in GL.
              </p>
              <button
                onClick={runReconcile}
                disabled={reconcileLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
              >
                {reconcileLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                )}
                Ruleaza reconcilierea
              </button>
            </div>

            {reconcileError && (
              <div role="alert" className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/30 px-4 py-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                {reconcileError}
              </div>
            )}

            {reconcile && (
              <div className="space-y-4">
                {/* Status banner */}
                <div className={`flex items-center gap-3 rounded-lg px-5 py-4 border ${
                  reconcile.ok
                    ? "bg-success/10 border-success/30 text-success"
                    : "bg-destructive/10 border-destructive/30 text-destructive"
                }`}>
                  {reconcile.ok ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
                  )}
                  <div>
                    <div className="font-semibold">
                      {reconcile.ok ? "GL complet — toate tranzactiile sunt postate" : `${reconcile.gaps.length} tranzactii NEPOSTATE in GL`}
                    </div>
                    <div className="text-sm opacity-80">
                      Plati: {reconcile.postedPayments} postate / {reconcile.unpostedPayments} nepostate ·
                      Salarii: {reconcile.postedPayroll} postate / {reconcile.unpostedPayroll} nepostate
                    </div>
                  </div>
                </div>

                {/* Gaps table */}
                {reconcile.gaps.length > 0 && (
                  <div className="rounded-lg border bg-card overflow-hidden">
                    <div className="px-4 py-3 border-b bg-muted/40">
                      <h2 className="text-sm font-medium text-foreground">Tranzactii nepostate</h2>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/20">
                            <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Tip sursa</th>
                            <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">ID sursa</th>
                            <th scope="col" className="px-4 py-3 text-right font-medium text-muted-foreground">Suma</th>
                            <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Data</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reconcile.gaps.map((gap, i) => (
                            <tr key={i} className="border-b last:border-0 hover:bg-muted/10">
                              <td className="px-4 py-2.5">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-destructive/10 text-destructive font-medium">
                                  {gap.sourceType}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{gap.sourceId.slice(0, 16)}...</td>
                              <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{formatLedgerAmount(gap.amountCents)} MDL</td>
                              <td className="px-4 py-2.5 text-muted-foreground">{gap.date ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {!reconcile && !reconcileLoading && (
              <div className="rounded-lg border bg-card/50 py-16 text-center text-sm text-muted-foreground">
                Apasati "Ruleaza reconcilierea" pentru a verifica GL vs sursele financiare.
              </div>
            )}
          </div>
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
                  Posteaza plata in jurnal
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Creeaza inregistrarea double-entry: Debit 531 Numerar / Credit 711 Venituri.
                </p>
              </div>
            </div>

            {postError && (
              <p role="alert" className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                {postError}
              </p>
            )}

            <div className="flex flex-col gap-1">
              <label htmlFor="payment-id-input" className="text-xs text-muted-foreground">ID plata (UUID)</label>
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
                    Se posteaza...
                  </>
                ) : (
                  <>
                    <BookOpen className="h-4 w-4" aria-hidden="true" />
                    Posteaza
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </BusinessShell>
  );
}
