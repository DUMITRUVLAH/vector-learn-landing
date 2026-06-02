/**
 * PAY-006: Payment plans page — /app/payment-plans
 * Lists all active installment plans with progress bars.
 */
import { useEffect, useState } from "react";
import { Loader2, CreditCard, CheckCircle2, XCircle, AlertCircle, ChevronRight, Plus } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  listPaymentPlans,
  cancelPaymentPlan,
  type PaymentPlan,
} from "@/lib/api/paymentPlans";
import { cn } from "@/lib/utils";

function formatCurrency(cents: number, currency = "RON"): string {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

const STATUS_META: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  active: { label: "Activ", icon: AlertCircle, cls: "text-primary bg-primary/10" },
  completed: { label: "Finalizat", icon: CheckCircle2, cls: "text-success bg-success/10" },
  cancelled: { label: "Anulat", icon: XCircle, cls: "text-destructive bg-destructive/10" },
};

export function PaymentPlansPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();
  const [plans, setPlans] = useState<PaymentPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  useEffect(() => {
    (async () => {
      try {
        const res = await listPaymentPlans();
        setPlans(res.items);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Eroare la încărcare");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleCancel(planId: string) {
    setCancelling(planId);
    try {
      await cancelPaymentPlan(planId);
      setPlans((prev) =>
        prev.map((p) => (p.id === planId ? { ...p, status: "cancelled" as const } : p))
      );
    } catch {
      // Silently ignore — show error in a real app
    } finally {
      setCancelling(null);
    }
  }

  return (
    <AppShell
      pageTitle="Planuri de plată în rate"
      pageDescription="Planuri de plată în rate active și finalizate."
    >
      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="size-5 animate-spin mr-2" aria-hidden="true" />
          Se încarcă planurile...
        </div>
      ) : error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {error}
        </div>
      ) : plans.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <CreditCard className="size-10 text-muted-foreground/40 mb-3" aria-hidden="true" />
          <p className="text-muted-foreground text-sm mb-4">
            Niciun plan de plată în rate creat încă.
          </p>
          <p className="text-xs text-muted-foreground">
            Creați un plan din pagina de Plăți sau din profilul unui elev.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {plans.map((plan) => {
            const meta = STATUS_META[plan.status] ?? STATUS_META["active"];
            const Icon = meta.icon;
            const progress = plan.progress;
            const paidCount = progress?.paid ?? 0;
            const totalCount = progress?.total ?? plan.installmentsCount;
            const pct = totalCount > 0 ? Math.round((paidCount / totalCount) * 100) : 0;

            return (
              <div
                key={plan.id}
                className="rounded-xl border border-border bg-card p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-sm">{plan.studentName}</p>
                    {plan.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{plan.description}</p>
                    )}
                  </div>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0",
                      meta.cls
                    )}
                  >
                    <Icon className="size-3" aria-hidden="true" />
                    {meta.label}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold tabular-nums">
                    {formatCurrency(plan.totalAmountCents, plan.currency)}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {paidCount}/{totalCount} rate plătite
                  </span>
                </div>

                {/* Progress bar */}
                <div className="h-2 rounded-full bg-muted overflow-hidden" aria-hidden="true">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      pct === 100 ? "bg-success" : "bg-primary"
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {progress && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      Plătit:{" "}
                      <span className="font-medium text-foreground">
                        {formatCurrency(progress.paidAmount, plan.currency)}
                      </span>
                    </span>
                    <span>
                      Rămas:{" "}
                      <span className="font-medium text-foreground">
                        {formatCurrency(progress.remainingAmount, plan.currency)}
                      </span>
                    </span>
                  </div>
                )}

                {plan.status === "active" && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleCancel(plan.id)}
                      disabled={cancelling === plan.id}
                      className="text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                    >
                      {cancelling === plan.id ? "Se anulează..." : "Anulează plan"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
