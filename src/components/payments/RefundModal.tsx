/**
 * PAY-007: RefundModal — process a partial or full refund on a paid invoice.
 *
 * Validates that refund amount ≤ (amountCents - refundedAmountCents).
 * Shows preview of resulting invoice status.
 */
import { useState } from "react";
import { X, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { processRefund } from "@/lib/api/refunds";
import { ApiError } from "@/lib/api";
import type { Invoice } from "@/lib/api/invoices";

interface RefundModalProps {
  invoice: Invoice;
  onClose: () => void;
  onRefunded: () => void;
  onError: (message: string) => void;
}

function formatCurrency(cents: number, currency: string = "RON"): string {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function RefundModal({ invoice, onClose, onRefunded, onError }: RefundModalProps) {
  const alreadyRefunded = invoice.refundedAmountCents ?? 0;
  const maxRefundable = invoice.amountCents - alreadyRefunded;

  const [amountEur, setAmountEur] = useState<number>(
    Math.round(maxRefundable / 100)
  );
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const amountCents = Math.round(amountEur * 100);
  const isFullRefund = amountCents >= maxRefundable;
  const previewStatus = isFullRefund ? "Refundat complet" : "Refund parțial";
  const previewStatusCls = isFullRefund
    ? "text-destructive bg-destructive/10"
    : "text-warning bg-warning/10";

  const isStripe = !!invoice.stripePaymentIntentId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);

    if (amountCents <= 0) {
      setFieldError("Suma trebuie să fie mai mare de 0.");
      return;
    }
    if (amountCents > maxRefundable) {
      setFieldError(`Suma maximă rambursabilă este ${formatCurrency(maxRefundable, invoice.currency)}.`);
      return;
    }
    if (!reason.trim()) {
      setFieldError("Motivul rambursării este obligatoriu.");
      return;
    }

    setSubmitting(true);
    try {
      await processRefund(invoice.id, {
        amount_cents: amountCents,
        reason: reason.trim(),
      });
      onRefunded();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "refund_exceeds_paid") {
          setFieldError("Suma depășește suma plătită disponibilă pentru rambursare.");
        } else if (err.code === "invoice_not_paid") {
          setFieldError("Factura trebuie să fie plătită pentru a procesa un refund.");
        } else {
          onError(`Eroare procesare refund: ${err.code}`);
          onClose();
        }
      } else {
        onError("Nu se poate procesa rambursarea.");
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="refund-modal-title"
    >
      <div
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 id="refund-modal-title" className="text-base font-bold flex items-center gap-2">
            <RefreshCcw className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Procesează rambursare
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide"
            className="rounded-md p-1 hover:bg-muted"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Invoice info */}
        <div className="px-5 pt-4 pb-0">
          <div className="rounded-lg bg-muted/40 border border-border p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Factură</span>
              <span className="font-semibold">{invoice.invoiceNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Client</span>
              <span className="font-medium">{invoice.studentName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total factură</span>
              <span className="font-semibold tabular-nums">
                {formatCurrency(invoice.amountCents, invoice.currency)}
              </span>
            </div>
            {alreadyRefunded > 0 && (
              <div className="flex justify-between text-destructive/80">
                <span>Deja rambursat</span>
                <span className="tabular-nums">
                  -{formatCurrency(alreadyRefunded, invoice.currency)}
                </span>
              </div>
            )}
            <div className="flex justify-between font-semibold border-t border-border pt-1 mt-1">
              <span>Max rambursabil</span>
              <span className="tabular-nums">{formatCurrency(maxRefundable, invoice.currency)}</span>
            </div>
          </div>

          {isStripe && (
            <p className="mt-2 text-[11px] text-muted-foreground bg-primary/5 border border-primary/20 rounded-md px-3 py-1.5">
              Plată Stripe — rambursarea va fi procesată automat prin Stripe.
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Amount input */}
          <div>
            <label htmlFor="refund-amount" className="block text-sm font-semibold mb-1.5">
              Sumă de rambursat ({invoice.currency})
            </label>
            <input
              id="refund-amount"
              type="number"
              min={0.01}
              max={maxRefundable / 100}
              step={0.01}
              value={amountEur}
              onChange={(e) => setAmountEur(Number(e.target.value))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums"
              required
            />
          </div>

          {/* Reason */}
          <div>
            <label htmlFor="refund-reason" className="block text-sm font-semibold mb-1.5">
              Motiv rambursare <span className="text-destructive" aria-hidden="true">*</span>
            </label>
            <textarea
              id="refund-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="ex: Elev a abandonat cursul la jumătate"
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              required
            />
          </div>

          {/* Preview */}
          <div className="rounded-lg bg-muted/30 border border-border p-3 text-sm">
            <p className="text-muted-foreground mb-1.5 text-xs font-semibold uppercase tracking-wide">
              Preview după rambursare
            </p>
            <div className="flex justify-between">
              <span>Status factură</span>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold",
                  previewStatusCls
                )}
              >
                {previewStatus}
              </span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-muted-foreground">Sumă rambursată total</span>
              <span className="tabular-nums font-semibold">
                {formatCurrency(alreadyRefunded + amountCents, invoice.currency)}
              </span>
            </div>
          </div>

          {/* Field error */}
          {fieldError && (
            <p role="alert" className="text-sm text-destructive">
              {fieldError}
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted"
            >
              Anulează
            </button>
            <button
              type="submit"
              disabled={submitting || amountCents <= 0}
              className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {submitting ? "Se procesează…" : "Confirmă rambursare"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
