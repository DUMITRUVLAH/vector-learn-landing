/**
 * CALENDAR-003: /app/fin/calendar — Calendar Fiscal
 *
 * Afișează obligații fiscale lunare cu navigare, stări vizuale și acțiuni
 * (marchează plătit, generează obligații, blochează perioadă).
 *
 * Design-system tokens Vector 365, light+dark, WCAG AA, fără hex hardcodat.
 * FIN-CORE regula #8: perioadele blocate sunt imutabile.
 */

import { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Lock,
  Unlock,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Clock,
  CalendarDays,
  Loader2,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { cn } from "@/lib/utils";
import {
  listCalendar,
  generateObligationsApi,
  markPaid,
  lockPeriod,
  unlockPeriod,
  type FinObligation,
  type FinPeriodLock,
  OBLIGATION_TYPE_LABELS,
  OBLIGATION_STATUS_LABELS,
  MONTH_NAMES,
} from "@/lib/api/finCalendar";

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatCents(cents: number, currency = "MDL"): string {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("ro-RO", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(iso)
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    paid: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
    overdue: "bg-destructive/10 text-destructive dark:bg-destructive/20",
  };
  const icons: Record<string, typeof CheckCircle> = {
    paid: CheckCircle,
    pending: Clock,
    overdue: AlertCircle,
  };
  const Icon = icons[status] ?? Clock;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
        styles[status] ?? "bg-muted text-muted-foreground"
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {OBLIGATION_STATUS_LABELS[status as keyof typeof OBLIGATION_STATUS_LABELS] ?? status}
    </span>
  );
}

// ─── Obligation row ───────────────────────────────────────────────────────────

interface ObligationRowProps {
  obl: FinObligation;
  isLocked: boolean;
  onMarkPaid: (id: string) => Promise<void>;
  markingId: string | null;
}

function ObligationRow({ obl, isLocked, onMarkPaid, markingId }: ObligationRowProps) {
  const isPending = obl.status === "pending" || obl.status === "overdue";
  const isMarking = markingId === obl.id;

  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
      <td className="py-3 px-4">
        <div className="font-medium text-sm text-foreground">
          {OBLIGATION_TYPE_LABELS[obl.obligationType] ?? obl.obligationType}
        </div>
        {obl.description && (
          <div className="text-xs text-muted-foreground mt-0.5">{obl.description}</div>
        )}
      </td>
      <td className="py-3 px-4 text-sm text-foreground">
        {formatDate(obl.dueDate)}
      </td>
      <td className="py-3 px-4 text-sm font-mono text-foreground">
        {formatCents(obl.amountCents, obl.currency)}
      </td>
      <td className="py-3 px-4">
        <StatusBadge status={obl.status} />
      </td>
      <td className="py-3 px-4">
        {isPending && !isLocked && (
          <button
            onClick={() => void onMarkPaid(obl.id)}
            disabled={isMarking}
            aria-label={`Marchează plătit: ${obl.description ?? obl.obligationType}`}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium",
              "bg-primary text-primary-foreground",
              "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "disabled:opacity-60 disabled:pointer-events-none",
              "touch-target"
            )}
          >
            {isMarking ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            ) : (
              <CheckCircle className="h-3 w-3" aria-hidden="true" />
            )}
            {isMarking ? "Se procesează..." : "Marchează plătit"}
          </button>
        )}
        {isPending && isLocked && (
          <span className="text-xs text-muted-foreground italic">Perioadă blocată</span>
        )}
        {obl.status === "paid" && obl.paidAt && (
          <span className="text-xs text-muted-foreground">{formatDate(obl.paidAt)}</span>
        )}
      </td>
    </tr>
  );
}

// ─── Lock modal ───────────────────────────────────────────────────────────────

interface LockModalProps {
  year: number;
  month: number;
  onConfirm: (notes: string) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
}

function LockModal({ year, month, onConfirm, onCancel, loading }: LockModalProps) {
  const [notes, setNotes] = useState("");
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lock-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
    >
      <div className="bg-card border border-border rounded-lg shadow-lg p-6 w-full max-w-sm mx-4">
        <h2 id="lock-modal-title" className="text-lg font-semibold text-foreground mb-1">
          Blochează {MONTH_NAMES[month - 1]} {year}
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Odată blocată, nicio obligație din această lună nu mai poate fi modificată (FIN regula #8).
          Deblocarea necesită rol de administrator.
        </p>
        <label className="block text-sm font-medium text-foreground mb-1" htmlFor="lock-notes">
          Note (opțional)
        </label>
        <textarea
          id="lock-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Ex: Reconciliere completă, auditată de Andreea Mitran"
          className={cn(
            "w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
            "placeholder:text-muted-foreground resize-none",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
        />
        <div className="flex gap-2 mt-4 justify-end">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 rounded-md text-sm font-medium text-foreground bg-muted hover:bg-muted/80 disabled:opacity-60"
          >
            Anulează
          </button>
          <button
            onClick={() => void onConfirm(notes)}
            disabled={loading}
            className={cn(
              "px-4 py-2 rounded-md text-sm font-medium",
              "bg-destructive text-destructive-foreground hover:bg-destructive/90",
              "disabled:opacity-60 inline-flex items-center gap-1.5"
            )}
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            {loading ? "Se blochează..." : "Blochează perioada"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function FinCalendarPage() {
  const { data: session } = useSession();
  const userRole = session?.user?.role ?? "";

  // Navigare lună
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-indexed

  // Date
  const [obligations, setObligations] = useState<FinObligation[]>([]);
  const [lockedPeriods, setLockedPeriods] = useState<FinPeriodLock[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Acțiuni
  const [generating, setGenerating] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [lockModalOpen, setLockModalOpen] = useState(false);
  const [lockLoading, setLockLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Verificare perioadă blocată
  const isLocked = lockedPeriods.some(
    (l) => l.periodYear === year && l.periodMonth === month
  );
  const lockInfo = lockedPeriods.find(
    (l) => l.periodYear === year && l.periodMonth === month
  );

  // Fetch date
  const fetchCalendar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listCalendar({ year, month });
      setObligations(result.obligations);
      setLockedPeriods(result.locked_periods);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare la încărcarea calendarului");
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    void fetchCalendar();
  }, [fetchCalendar]);

  // Navigare lună
  function prevMonth() {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else {
      setMonth((m) => m - 1);
    }
  }
  function nextMonth() {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else {
      setMonth((m) => m + 1);
    }
  }

  // Generare obligații
  async function handleGenerate() {
    setGenerating(true);
    setActionError(null);
    try {
      await generateObligationsApi({ year, month });
      await fetchCalendar();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Eroare la generare");
    } finally {
      setGenerating(false);
    }
  }

  // Marchează plătit
  async function handleMarkPaid(id: string) {
    setMarkingId(id);
    setActionError(null);
    try {
      await markPaid(id);
      setObligations((prev) =>
        prev.map((o) =>
          o.id === id ? { ...o, status: "paid", paidAt: new Date().toISOString() } : o
        )
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Eroare";
      if (msg.toLowerCase().includes("blocat")) {
        setActionError("Perioadă blocată — nu se pot modifica date");
      } else {
        setActionError(msg);
      }
    } finally {
      setMarkingId(null);
    }
  }

  // Blochează perioadă
  async function handleLock(notes: string) {
    setLockLoading(true);
    setActionError(null);
    try {
      await lockPeriod({ year, month, notes: notes || undefined });
      setLockModalOpen(false);
      await fetchCalendar();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Eroare la blocare");
    } finally {
      setLockLoading(false);
    }
  }

  // Deblochează perioadă
  async function handleUnlock() {
    setActionError(null);
    try {
      await unlockPeriod(year, month);
      await fetchCalendar();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Eroare la deblocare");
    }
  }

  // Statistici
  const pending = obligations.filter((o) => o.status === "pending" || o.status === "overdue");
  const paid = obligations.filter((o) => o.status === "paid");
  const totalPendingCents = pending.reduce((s, o) => s + o.amountCents, 0);
  const totalPaidCents = paid.reduce((s, o) => s + o.amountCents, 0);

  const canLockUnlock = ["admin", "accountant"].includes(userRole);
  const canUnlockOnly = userRole === "admin";

  return (
    <AppShell
      pageTitle="Calendar Fiscal"
      pageDescription={`${MONTH_NAMES[month - 1]} ${year} — Obligații fiscale`}
    >
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* Header navigare */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={prevMonth}
              aria-label="Luna anterioară"
              className="p-2 rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-target"
            >
              <ChevronLeft className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            </button>
            <h1 className="text-xl font-semibold text-foreground min-w-[160px] text-center">
              {MONTH_NAMES[month - 1]} {year}
            </h1>
            <button
              onClick={nextMonth}
              aria-label="Luna următoare"
              className="p-2 rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-target"
            >
              <ChevronRight className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Badge perioadă blocată */}
            {isLocked && (
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-destructive/10 text-destructive border border-destructive/20"
                title={lockInfo ? `Blocat pe ${formatDate(lockInfo.lockedAt)}` : "Perioadă blocată"}
              >
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                Perioadă blocată
              </span>
            )}

            {/* Generează obligații */}
            <button
              onClick={() => void handleGenerate()}
              disabled={generating || isLocked}
              aria-label="Generează obligații pentru luna selectată"
              className={cn(
                "inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium",
                "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "disabled:opacity-60 disabled:pointer-events-none"
              )}
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              )}
              {generating ? "Se generează..." : "Generează obligații"}
            </button>

            {/* Blochează / deblochează */}
            {canLockUnlock && !isLocked && (
              <button
                onClick={() => setLockModalOpen(true)}
                aria-label={`Blochează ${MONTH_NAMES[month - 1]} ${year}`}
                className={cn(
                  "inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium",
                  "border border-destructive/40 text-destructive hover:bg-destructive/5",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                )}
              >
                <Lock className="h-4 w-4" aria-hidden="true" />
                Blochează perioada
              </button>
            )}
            {canUnlockOnly && isLocked && (
              <button
                onClick={() => void handleUnlock()}
                aria-label={`Deblochează ${MONTH_NAMES[month - 1]} ${year}`}
                className={cn(
                  "inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium",
                  "border border-border text-foreground hover:bg-muted",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                )}
              >
                <Unlock className="h-4 w-4" aria-hidden="true" />
                Deblochează
              </button>
            )}
          </div>
        </div>

        {/* Erori acțiuni */}
        {actionError && (
          <div
            role="alert"
            className="flex items-center gap-2 px-4 py-3 rounded-md bg-destructive/10 text-destructive text-sm"
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            {actionError}
          </div>
        )}

        {/* Sumar lună */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">De plătit</div>
            <div className="text-2xl font-bold text-foreground">
              {formatCents(totalPendingCents, obligations[0]?.currency ?? "MDL")}
            </div>
            <div className="text-sm text-muted-foreground">{pending.length} obligații</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Plătite</div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {formatCents(totalPaidCents, obligations[0]?.currency ?? "MDL")}
            </div>
            <div className="text-sm text-muted-foreground">{paid.length} obligații</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Stare perioadă</div>
            <div className="flex items-center gap-2 mt-1">
              {isLocked ? (
                <>
                  <Lock className="h-5 w-5 text-destructive" aria-hidden="true" />
                  <span className="font-semibold text-destructive">Blocată</span>
                </>
              ) : (
                <>
                  <CalendarDays className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  <span className="font-semibold text-foreground">Deschisă</span>
                </>
              )}
            </div>
            {lockInfo && (
              <div className="text-xs text-muted-foreground mt-1">
                pe {formatDate(lockInfo.lockedAt)}
              </div>
            )}
          </div>
        </div>

        {/* Tabel obligații */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              Obligații — {MONTH_NAMES[month - 1]} {year}
            </h2>
            {loading && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-center gap-2 px-4 py-4 text-sm text-destructive"
            >
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              {error}
            </div>
          )}

          {!loading && !error && obligations.length === 0 && (
            <div className="px-4 py-12 text-center text-muted-foreground">
              <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-40" aria-hidden="true" />
              <p className="text-sm">
                Nicio obligație pentru {MONTH_NAMES[month - 1]} {year}.
              </p>
              <p className="text-xs mt-1">
                Apasă „Generează obligații" pentru a crea automat lista de plăți fiscale.
              </p>
            </div>
          )}

          {!error && obligations.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label={`Obligații fiscale ${MONTH_NAMES[month - 1]} ${year}`}>
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th scope="col" className="py-2.5 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Obligație
                    </th>
                    <th scope="col" className="py-2.5 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Termen
                    </th>
                    <th scope="col" className="py-2.5 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Sumă
                    </th>
                    <th scope="col" className="py-2.5 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Stare
                    </th>
                    <th scope="col" className="py-2.5 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Acțiuni
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {obligations.map((obl) => (
                    <ObligationRow
                      key={obl.id}
                      obl={obl}
                      isLocked={isLocked}
                      onMarkPaid={handleMarkPaid}
                      markingId={markingId}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal blocare */}
      {lockModalOpen && (
        <LockModal
          year={year}
          month={month}
          onConfirm={handleLock}
          onCancel={() => {
            setLockModalOpen(false);
            setActionError(null);
          }}
          loading={lockLoading}
        />
      )}
    </AppShell>
  );
}
