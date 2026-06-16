/**
 * BANKLINK-003: /app/fin/banklink/queue — coadă reconciliere tranzacții nereconciliate
 *
 * Lista tranzacțiilor unmatched cu candidații sugerați de motor.
 * Butoane: Auto-match (rulează motorul pe toate), Potrivește (manual), Ignoră.
 * Design: Vector 365, light+dark, WCAG AA, fără hex.
 */
import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  RefreshCw,
  GitMerge,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Zap,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { Link } from "@/router/HashRouter";
import {
  getQueue,
  autoMatch,
  matchTransaction,
  type QueueItem,
  type AutoMatchResult,
} from "@/lib/api/finBankLink";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAmount(cents: number): string {
  return new Intl.NumberFormat("ro-MD", {
    style: "currency",
    currency: "MDL",
    signDisplay: "always",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("ro-MD", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ─── Score badge ──────────────────────────────────────────────────────────────

function ScoreBadge({ scoreBp }: { scoreBp: number }) {
  const pct = Math.round(scoreBp / 100);
  const colorClass =
    pct >= 85
      ? "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400"
      : pct >= 60
      ? "border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-400"
      : "border-border bg-muted text-muted-foreground";

  return (
    <span className={cn("rounded-full border px-1.5 py-0.5 text-xs font-medium", colorClass)}>
      {pct}%
    </span>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BankLinkQueuePage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoMatchLoading, setAutoMatchLoading] = useState(false);
  const [autoMatchResult, setAutoMatchResult] = useState<AutoMatchResult | null>(null);
  const [matchingId, setMatchingId] = useState<string | null>(null);

  const LIMIT = 20;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const load = useCallback(async (pg: number) => {
    setLoading(true);
    setError(null);
    try {
      const { data, total: t } = await getQueue({ page: pg, limit: LIMIT });
      setItems(data);
      setTotal(t);
    } catch {
      setError("Nu s-a putut încărca coada de reconciliere.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(1);
  }, [load]);

  async function handleAutoMatch() {
    setAutoMatchLoading(true);
    setAutoMatchResult(null);
    try {
      const result = await autoMatch();
      setAutoMatchResult(result);
      await load(page); // refresh queue
    } catch {
      setError("Eroare la auto-match. Reîncercă.");
    } finally {
      setAutoMatchLoading(false);
    }
  }

  async function handleIgnore(id: string) {
    setMatchingId(id);
    try {
      await matchTransaction(id, { action: "ignore" });
      await load(page);
    } catch {
      // Silently ignore errors — let user retry
    } finally {
      setMatchingId(null);
    }
  }

  async function handleMatchWithCandidate(txId: string, candidateType: "invoice" | "payment", candidateId: string) {
    setMatchingId(txId);
    try {
      await matchTransaction(txId, {
        action: "match",
        sourceType: candidateType,
        sourceId: candidateId,
      });
      await load(page);
    } catch {
      // Silently ignore — user can retry
    } finally {
      setMatchingId(null);
    }
  }

  return (
    <AppShell pageTitle="Coadă reconciliere">
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

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Coadă reconciliere</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? "Se încarcă..." : `${total} tranzacție${total !== 1 ? "i" : ""} nereconciliat${total !== 1 ? "e" : "ă"}`}
          </p>
        </div>
        <button
          onClick={handleAutoMatch}
          disabled={autoMatchLoading || loading}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {autoMatchLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Zap className="h-4 w-4" />
          )}
          Auto-match
        </button>
      </div>

      {/* Auto-match result banner */}
      {autoMatchResult && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 dark:border-green-800 dark:bg-green-950">
          <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-600 dark:text-green-400" />
          <p className="text-sm text-green-800 dark:text-green-300">
            Auto-match completat: <strong>{autoMatchResult.matched}</strong> potrivite,{" "}
            <strong>{autoMatchResult.unmatched}</strong> nepotrivite,{" "}
            <strong>{autoMatchResult.skipped}</strong> sărite.
          </p>
          <button
            onClick={() => setAutoMatchResult(null)}
            className="ml-auto text-green-600 hover:text-green-800 dark:text-green-400"
            aria-label="Închide"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error */}
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

      {/* Empty state */}
      {!loading && !error && items.length === 0 && (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-500" />
          <div>
            <p className="font-medium text-foreground">Toate tranzacțiile au fost reconciliate</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Nu există tranzacții nereconciliate în coadă.
            </p>
          </div>
          <Link
            to="/app/fin/banklink/transactions"
            className="flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-sm hover:bg-muted"
          >
            <GitMerge className="h-4 w-4" />
            Mergi la tranzacții
          </Link>
        </div>
      )}

      {/* Queue list */}
      {!loading && !error && items.length > 0 && (
        <>
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "rounded-xl border border-border bg-card p-4 shadow-sm",
                  matchingId === item.id && "opacity-60"
                )}
              >
                {/* Transaction row */}
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {formatDate(item.transactionDate)}
                      </span>
                      <span
                        className={cn(
                          "font-mono text-sm font-semibold",
                          item.amountCents >= 0
                            ? "text-green-600 dark:text-green-400"
                            : "text-destructive"
                        )}
                      >
                        {formatAmount(item.amountCents)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-foreground">
                      {item.description ?? "—"}
                    </p>
                    {item.counterpartyName && (
                      <p className="text-xs text-muted-foreground">{item.counterpartyName}</p>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleIgnore(item.id)}
                      disabled={matchingId === item.id}
                      className="flex h-7 items-center gap-1 rounded-md border border-input px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
                      aria-label="Ignoră tranzacția"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Ignoră
                    </button>
                  </div>
                </div>

                {/* Candidates */}
                {item.candidates.length > 0 ? (
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                      Candidați sugerați:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {item.candidates.map((cand) => (
                        <button
                          key={cand.id}
                          onClick={() =>
                            handleMatchWithCandidate(item.id, cand.type, cand.id)
                          }
                          disabled={matchingId === item.id}
                          className="flex items-center gap-1.5 rounded-lg border border-input bg-muted/40 px-2.5 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-60"
                          aria-label={`Potrivește cu ${cand.description}`}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                          <span className="text-foreground">{cand.description}</span>
                          <span className="text-muted-foreground">
                            {formatAmount(cand.amountCents)}
                          </span>
                          <ScoreBadge scoreBp={cand.scoreBp} />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Niciun candidat detectat automat.{" "}
                    <Link
                      to="/app/fin/banklink/transactions"
                      className="text-primary underline"
                    >
                      Caută manual
                    </Link>
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Paginare */}
          <div className="mt-4 flex items-center justify-between text-sm">
            <p className="text-muted-foreground">
              {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} din {total}
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
    </AppShell>
  );
}
