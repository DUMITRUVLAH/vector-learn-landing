import { useEffect, useState, useCallback } from "react";
import { Loader2, Plus, CheckCircle2, X, Wallet, Clock, AlertCircle, ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  listPayments,
  paymentStats,
  createPayment,
  updatePaymentStatus,
  type Payment,
  type PaymentStats,
} from "@/lib/api/payments";
import { listStudents, type Student } from "@/lib/api/students";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
// APPROVAL-002: inline badge + link dialog for large payments
import { PaymentApprovalBadge } from "@/components/fin/PaymentApprovalBadge";
import { LinkParDialog } from "@/components/fin/LinkParDialog";

/** Payments >= this amount require PAR approval before marking "paid" (mirrors server default) */
const APPROVAL_THRESHOLD_MDL = 5000;

const STATUS_META: Record<Payment["status"], { label: string; cls: string }> = {
  pending: { label: "În așteptare", cls: "bg-warning/15 text-warning" },
  paid: { label: "Plătit", cls: "bg-success/15 text-success" },
  overdue: { label: "Restant", cls: "bg-destructive/15 text-destructive" },
  refunded: { label: "Returnat", cls: "bg-muted text-muted-foreground" },
  cancelled: { label: "Anulat", cls: "bg-muted text-muted-foreground" },
};

function formatEur(cents: number, currency: "EUR" | "RON" | "USD" = "EUR"): string {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function PaymentsPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();
  const [items, setItems] = useState<Payment[]>([]);
  const [stats, setStats] = useState<PaymentStats | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  // APPROVAL-002: link-PAR dialog target
  const [linkTarget, setLinkTarget] = useState<Payment | null>(null);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pr, sr, st] = await Promise.all([
        listPayments(),
        paymentStats(),
        listStudents({ status: "active", limit: 100 }),
      ]);
      setItems(pr.items);
      setStats(sr);
      setStudents(st.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const handleMarkPaid = async (id: string) => {
    try {
      await updatePaymentStatus(id, "paid");
      setToast({ kind: "success", message: "Marcat ca plătit" });
      void fetchAll();
    } catch (err) {
      // APPROVAL-002: surface approval-required error distinctly
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("approval_required") || msg.includes("approval")) {
        setToast({
          kind: "error",
          message: "Plata necesită un PAR aprobat. Folosește 'Leagă PAR' pentru a autoriza.",
        });
      } else {
        setToast({ kind: "error", message: "Nu pot actualiza" });
      }
    }
  };

  return (
    <AppShell
      pageTitle="Plăți"
      pageDescription={`${items.length} facturi în total`}
      actions={
        <div className="flex items-center gap-2">
          {/* APPROVAL-002: link to approval queue */}
          <button
            type="button"
            onClick={() => navigate("/app/payments/approval")}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ShieldAlert className="h-4 w-4 text-warning" aria-hidden />
            Aprobări
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Adaugă plată
          </button>
        </div>
      }
    >
      {stats && (
        <div className="grid sm:grid-cols-3 gap-3 mb-6">
          <StatCard label="Plătit luna asta" value={formatEur(stats.monthPaidCents)} icon={Wallet} cls="pastel-mint" />
          <StatCard label="În așteptare" value={formatEur(stats.pendingCents)} icon={Clock} cls="pastel-lavender" />
          <StatCard label="Restant" value={formatEur(stats.overdueCents)} icon={AlertCircle} cls="pastel-peach" />
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Se încarcă plățile…
          </div>
        ) : error ? (
          <div className="py-16 text-center text-sm text-destructive">{error}</div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-muted-foreground mb-4">Nicio plată înregistrată încă.</p>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Înregistrează prima plată
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th scope="col" className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5">
                    Elev
                  </th>
                  <th scope="col" className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5 hidden sm:table-cell">
                    Descriere
                  </th>
                  <th scope="col" className="text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5">
                    Sumă
                  </th>
                  <th scope="col" className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5 hidden lg:table-cell">
                    Aprobare
                  </th>
                  <th scope="col" className="text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5">
                    Status
                  </th>
                  <th scope="col" className="text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5">
                    Acțiuni
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((p) => {
                  const meta = STATUS_META[p.status];
                  // APPROVAL-002: check if this payment needs approval
                  const amountMdl = p.amountCents / 100;
                  const needsApproval = amountMdl >= APPROVAL_THRESHOLD_MDL;
                  const hasApprovedPar = needsApproval && !!p.parRequestId;
                  const blockPay = needsApproval && !hasApprovedPar;
                  return (
                    <tr key={p.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{p.studentName}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                        {p.description ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        {formatEur(p.amountCents, p.currency)}
                      </td>
                      {/* APPROVAL-002: inline badge for large payments */}
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <PaymentApprovalBadge
                          parRequestId={p.parRequestId ?? null}
                          paymentAmountCents={p.amountCents}
                          thresholdMdl={APPROVAL_THRESHOLD_MDL}
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold", meta.cls)}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {(p.status === "pending" || p.status === "overdue") && (
                          <div className="inline-flex items-center gap-1">
                            {/* Show "Leagă PAR" when approval needed */}
                            {blockPay && (
                              <button
                                type="button"
                                onClick={() => setLinkTarget(p)}
                                aria-label={`Leagă PAR pentru plata ${p.studentName}`}
                                className="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary px-2 py-1 text-[11px] font-semibold hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <ShieldAlert className="h-3 w-3" aria-hidden />
                                Leagă PAR
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => !blockPay && handleMarkPaid(p.id)}
                              aria-label={`Marchează ${p.studentName} ca plătit`}
                              aria-disabled={blockPay}
                              disabled={blockPay}
                              title={blockPay ? `Necesită PAR aprobat (≥${APPROVAL_THRESHOLD_MDL.toLocaleString("ro-MD")} MDL)` : undefined}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                blockPay
                                  ? "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
                                  : "bg-success/10 text-success hover:bg-success/20"
                              )}
                            >
                              <CheckCircle2 className="h-3 w-3" aria-hidden />
                              Marchează plătit
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <CreatePaymentModal
          students={students}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            setToast({ kind: "success", message: "Plată înregistrată" });
            void fetchAll();
          }}
          onError={(m) => setToast({ kind: "error", message: m })}
        />
      )}

      {/* APPROVAL-002: link PAR dialog */}
      {linkTarget && (
        <LinkParDialog
          paymentId={linkTarget.id}
          paymentAmountCents={linkTarget.amountCents}
          onLinked={() => {
            setLinkTarget(null);
            setToast({ kind: "success", message: "PAR legat — plata poate fi procesată" });
            void fetchAll();
          }}
          onClose={() => setLinkTarget(null)}
        />
      )}

      {toast && (
        <div
          role="status"
          className={cn(
            "fixed bottom-4 right-4 z-50 rounded-lg border shadow-lg px-4 py-3 text-sm font-medium animate-fade-in",
            toast.kind === "success"
              ? "bg-success/10 border-success/30 text-success"
              : "bg-destructive/10 border-destructive/30 text-destructive"
          )}
        >
          {toast.message}
        </div>
      )}
    </AppShell>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  cls,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  cls: string;
}) {
  return (
    <article className={cn("rounded-2xl border border-border p-5", cls)}>
      <Icon className="h-5 w-5 text-foreground/70 mb-2" />
      <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/60">{label}</p>
      <p className="text-2xl font-display font-bold tabular-nums mt-1">{value}</p>
    </article>
  );
}

function CreatePaymentModal({
  students,
  onClose,
  onSaved,
  onError,
}: {
  students: Student[];
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [amount, setAmount] = useState(280);
  const [currency, setCurrency] = useState<"EUR" | "RON" | "USD">("EUR");
  const [status, setStatus] = useState<Payment["status"]>("pending");
  const [description, setDescription] = useState("Abonament lunar");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId) return;
    setSubmitting(true);
    try {
      await createPayment({
        studentId,
        amountCents: Math.round(amount * 100),
        currency,
        status,
        description,
      });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) onError(`Eroare: ${err.code}`);
      else onError("Nu pot salva plata");
    } finally {
      setSubmitting(false);
    }
  };

  if (students.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
        <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl">
          <h2 className="text-base font-bold mb-3">Niciun elev activ</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Adaugă mai întâi un elev cu status "Activ" în secțiunea Elevi.
          </p>
          <button onClick={onClose} className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            OK
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card shadow-xl">
        <div className="border-b border-border px-5 py-3.5 flex items-center justify-between">
          <h2 className="text-base font-bold">Înregistrează plată nouă</h2>
          <button type="button" onClick={onClose} aria-label="Închide" className="rounded-md hover:bg-muted p-1">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <div>
            <label htmlFor="p-student" className="block text-sm font-semibold mb-1.5">Elev</label>
            <select
              id="p-student"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.fullName}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div>
              <label htmlFor="p-amount" className="block text-sm font-semibold mb-1.5">Sumă</label>
              <input
                id="p-amount"
                type="number"
                min={0}
                step={1}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="p-currency" className="block text-sm font-semibold mb-1.5">Monedă</label>
              <select
                id="p-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as "EUR" | "RON" | "USD")}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="EUR">EUR</option>
                <option value="RON">RON</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="p-status" className="block text-sm font-semibold mb-1.5">Status</label>
            <select
              id="p-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as Payment["status"])}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="pending">În așteptare</option>
              <option value="paid">Plătit</option>
              <option value="overdue">Restant</option>
            </select>
          </div>
          <div>
            <label htmlFor="p-desc" className="block text-sm font-semibold mb-1.5">Descriere</label>
            <input
              id="p-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted">
              Anulează
            </button>
            <button type="submit" disabled={submitting} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {submitting ? "Se salvează..." : "Înregistrează"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
