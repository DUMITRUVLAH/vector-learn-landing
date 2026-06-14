/**
 * APPROVAL-002: Payment Approval Queue
 *
 * Lists payments that exceed the PAR approval threshold and don't have an
 * approved PAR linked yet. Lets the user link an approved PAR via LinkParDialog.
 *
 * Route: /app/payments/approval
 * Design: Vector 365 tokens only, no hex. Dark mode: semantic tokens.
 * WCAG AA: focus rings, aria-labels, 44px touch targets.
 */
import { useEffect, useState, useCallback } from "react";
import { Loader2, ShieldAlert, CheckCircle2, Link2 } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import { listPendingApproval, type Payment } from "@/lib/api/payments";
import { PaymentApprovalBadge } from "@/components/fin/PaymentApprovalBadge";
import { LinkParDialog } from "@/components/fin/LinkParDialog";
import { cn } from "@/lib/utils";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: "În așteptare", cls: "bg-warning/15 text-warning" },
  overdue: { label: "Restant", cls: "bg-destructive/15 text-destructive" },
};

function formatMdl(cents: number): string {
  return new Intl.NumberFormat("ro-MD", {
    style: "currency",
    currency: "MDL",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatCurrency(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("ro-MD", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toLocaleString("ro-MD")} ${currency}`;
  }
}

export function PaymentApprovalQueuePage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const [items, setItems] = useState<Payment[]>([]);
  const [thresholdMdl, setThresholdMdl] = useState(5000);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linkTarget, setLinkTarget] = useState<Payment | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { items: data, threshold_mdl } = await listPendingApproval();
      setItems(data);
      setThresholdMdl(threshold_mdl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la încărcare");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchQueue();
  }, [fetchQueue]);

  const handleLinked = () => {
    setLinkTarget(null);
    setToast({ kind: "success", message: "PAR legat cu succes — plata poate fi procesată" });
    void fetchQueue();
  };

  return (
    <AppShell
      pageTitle="Aprobări plăți"
      pageDescription={
        loading
          ? "Se încarcă…"
          : `${items.length} plat${items.length === 1 ? "ă" : "ăți"} necesit${items.length === 1 ? "ă" : "ă"} autorizare PAR (prag: ${thresholdMdl.toLocaleString("ro-MD")} MDL)`
      }
      actions={
        <button
          type="button"
          onClick={() => navigate("/app/payments")}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Toate plățile
        </button>
      }
    >
      {/* Empty state */}
      {!loading && !error && items.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-20 text-center px-6">
          <CheckCircle2 className="h-10 w-10 text-success mb-4" aria-hidden />
          <p className="text-base font-semibold">Toate plățile mari sunt autorizate</p>
          <p className="text-sm text-muted-foreground mt-1">
            Nicio plată de peste {thresholdMdl.toLocaleString("ro-MD")} MDL nu mai necesită
            aprobare PAR.
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" aria-hidden />
          Se încarcă lista de aprobări…
        </div>
      )}

      {/* Table */}
      {!loading && items.length > 0 && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="border-b border-border bg-muted/20 px-5 py-3 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-warning" aria-hidden />
            <span className="text-sm font-semibold">
              Plăți care necesită PAR aprobat înainte de plată
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th
                    scope="col"
                    className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-5 py-2.5"
                  >
                    Elev
                  </th>
                  <th
                    scope="col"
                    className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5 hidden sm:table-cell"
                  >
                    Descriere
                  </th>
                  <th
                    scope="col"
                    className="text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5"
                  >
                    Sumă
                  </th>
                  <th
                    scope="col"
                    className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5 hidden md:table-cell"
                  >
                    Status PAR
                  </th>
                  <th
                    scope="col"
                    className="text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5"
                  >
                    Status
                  </th>
                  <th
                    scope="col"
                    className="text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5"
                  >
                    Acțiuni
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((p) => {
                  const meta = STATUS_META[p.status] ?? {
                    label: p.status,
                    cls: "bg-muted text-muted-foreground",
                  };
                  return (
                    <tr key={p.id} className="hover:bg-muted/30">
                      <td className="px-5 py-3 font-medium">{p.studentName}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                        {p.description ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        {formatCurrency(p.amountCents, p.currency)}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <PaymentApprovalBadge
                          parRequestId={p.parRequestId ?? null}
                          paymentAmountCents={p.amountCents}
                          thresholdMdl={thresholdMdl}
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold",
                            meta.cls
                          )}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setLinkTarget(p)}
                          aria-label={`Leagă PAR pentru plata ${p.studentName} — ${formatMdl(p.amountCents)}`}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold",
                            "bg-primary/10 text-primary hover:bg-primary/20",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            "min-h-[44px] min-w-[44px]"
                          )}
                        >
                          <Link2 className="h-3 w-3" aria-hidden />
                          Leagă PAR
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Link PAR dialog */}
      {linkTarget && (
        <LinkParDialog
          paymentId={linkTarget.id}
          paymentAmountCents={linkTarget.amountCents}
          onLinked={handleLinked}
          onClose={() => setLinkTarget(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "fixed bottom-4 right-4 z-50 rounded-lg border shadow-lg px-4 py-3 text-sm font-medium",
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

export default PaymentApprovalQueuePage;
