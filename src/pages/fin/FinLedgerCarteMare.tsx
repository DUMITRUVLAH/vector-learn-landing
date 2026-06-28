/**
 * LEDGER-004: FinDesk Carte Mare — Account Ledger page
 *
 * Route: /app/fin/ledger/account/:code
 *
 * Displays all debit/credit movements for one account with running balance.
 * Link back to the trial balance (parent page).
 *
 * GAP-ANALYSIS G1: drill-down into individual account history.
 */

import { useEffect, useState } from "react";
import {
  Loader2,
  ArrowLeft,
  BookOpen,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { useSession } from "@/hooks/useSession";
import {
  getAccountLedger,
  formatLedgerAmount,
  type AccountLedgerResponse,
} from "@/lib/api/finLedger";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstDayOfMonth(): string {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

// ─── Component ───────────────────────────────────────────────────────────────

interface FinLedgerCarteMareProps {
  /** Account code extracted from the URL path segment: /app/fin/ledger/account/:code */
  accountCode: string;
}

export function FinLedgerCarteMare({ accountCode }: FinLedgerCarteMareProps) {
  const { status: sessionStatus } = useSession();

  const [data, setData] = useState<AccountLedgerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterFrom, setFilterFrom] = useState(firstDayOfMonth());
  const [filterTo, setFilterTo] = useState(today());

  async function fetchLedger() {
    if (!accountCode) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getAccountLedger(accountCode, {
        from: filterFrom || undefined,
        to: filterTo || undefined,
      });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la incarcarea cartii mari");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    fetchLedger();
  }, [sessionStatus, accountCode]); // eslint-disable-line react-hooks/exhaustive-deps

  if (sessionStatus === "loading") {
    return (
      <BusinessShell pageTitle="Carte Mare — FinDesk">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se incarca" />
        </div>
      </BusinessShell>
    );
  }

  const account = data?.account;

  return (
    <BusinessShell pageTitle={account ? `Cont ${account.code} — Carte Mare` : "Carte Mare — FinDesk"}>
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">

        {/* Breadcrumb */}
        <a
          href="#/app/fin/ledger"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          aria-label="Inapoi la Balanta de verificare"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Balanta de verificare
        </a>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <BookOpen className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              {account
                ? `Cont ${account.code} — ${account.name}`
                : `Carte mare cont ${accountCode}`}
            </h1>
            <p className="text-sm text-muted-foreground">
              Toate miscarile debit/credit cu sold cumulativ
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="rounded-lg border bg-card p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label htmlFor="carte-from" className="text-xs text-muted-foreground">De la</label>
              <input
                id="carte-from"
                type="date"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="carte-to" className="text-xs text-muted-foreground">Pana la</label>
              <input
                id="carte-to"
                type="date"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <button
              onClick={fetchLedger}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              Incarca
            </button>
          </div>
        </div>

        {error && (
          <div role="alert" className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/30 px-4 py-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            {error}
          </div>
        )}

        {/* Summary cards */}
        {data && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border bg-card p-4 space-y-1">
              <p className="text-xs text-muted-foreground">Sold initial</p>
              <p className="text-lg font-semibold tabular-nums text-foreground">
                {formatLedgerAmount(data.openingBalance)} MDL
              </p>
            </div>
            <div className="rounded-lg border bg-card p-4 space-y-1">
              <p className="text-xs text-muted-foreground">Sold final</p>
              <p className={`text-lg font-semibold tabular-nums ${
                data.closingBalance > 0
                  ? "text-success"
                  : data.closingBalance < 0
                  ? "text-destructive"
                  : "text-foreground"
              }`}>
                {formatLedgerAmount(data.closingBalance)} MDL
              </p>
            </div>
            <div className="rounded-lg border bg-card p-4 space-y-1">
              <p className="text-xs text-muted-foreground">Miscari in perioada</p>
              <p className="text-lg font-semibold text-foreground">{data.lines.length}</p>
            </div>
          </div>
        )}

        {/* Account ledger table */}
        <div className="rounded-lg border bg-card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se calculeaza" />
            </div>
          ) : !data || data.lines.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {data ? "Nicio miscare in aceasta perioada." : "Introduceti datele de filtrare si apasati Incarca."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Data</th>
                    <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Descriere</th>
                    <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Ref</th>
                    <th scope="col" className="px-4 py-3 text-center font-medium text-muted-foreground">Sursa</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium text-muted-foreground">Debit</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium text-muted-foreground">Credit</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium text-muted-foreground">Sold curent</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Opening balance row */}
                  <tr className="border-b bg-muted/20">
                    <td className="px-4 py-2 text-xs text-muted-foreground">{data.periodFrom ?? "—"}</td>
                    <td colSpan={3} className="px-4 py-2 text-xs text-muted-foreground italic">Sold initial</td>
                    <td className="px-4 py-2 text-right text-muted-foreground" />
                    <td className="px-4 py-2 text-right text-muted-foreground" />
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-foreground">
                      {formatLedgerAmount(data.openingBalance)}
                    </td>
                  </tr>
                  {data.lines.map((line, idx) => (
                    <tr key={idx} className="border-b last:border-0 hover:bg-muted/10">
                      <td className="px-4 py-2.5 font-mono text-foreground whitespace-nowrap">{line.date}</td>
                      <td className="px-4 py-2.5 text-foreground">{line.description ?? "—"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">
                        {line.reference ? line.reference.slice(0, 12) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary font-medium">
                          {line.sourceType}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {line.debitCents > 0 ? (
                          <span className="flex items-center justify-end gap-1 text-foreground">
                            <TrendingUp className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                            {formatLedgerAmount(line.debitCents)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {line.creditCents > 0 ? (
                          <span className="flex items-center justify-end gap-1 text-foreground">
                            <TrendingDown className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                            {formatLedgerAmount(line.creditCents)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${
                        line.runningBalance > 0
                          ? "text-success"
                          : line.runningBalance < 0
                          ? "text-destructive"
                          : "text-muted-foreground"
                      }`}>
                        {formatLedgerAmount(line.runningBalance)}
                      </td>
                    </tr>
                  ))}
                  {/* Closing balance row */}
                  <tr className="border-t-2 bg-muted/40">
                    <td colSpan={6} className="px-4 py-3 font-semibold text-foreground">Sold final</td>
                    <td className={`px-4 py-3 text-right font-semibold tabular-nums ${
                      data.closingBalance >= 0 ? "text-success" : "text-destructive"
                    }`}>
                      {formatLedgerAmount(data.closingBalance)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </BusinessShell>
  );
}
