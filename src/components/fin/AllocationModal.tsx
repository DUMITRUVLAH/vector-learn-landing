/**
 * CASH-004: Modal alocare plată↔factură.
 *
 * Afișat la click pe "Alocă" dintr-un rând de plată.
 * Validare client-side: amount ≤ unallocated_cents.
 * Design: Vector 365 tokens, WCAG AA, touch targets ≥ 44px, dark mode.
 */
import { useState, useRef, useEffect } from "react";
import { X, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { allocatePayment, type FinPayment } from "@/lib/api/finCashAllocations";

interface AllocationModalProps {
  payment: FinPayment;
  onClose: () => void;
  onAllocated: (updated: FinPayment) => void;
}

/** Formatează cenți → "1.250,00 MDL" */
function fmt(cents: number, currency = "MDL"): string {
  return new Intl.NumberFormat("ro-MD", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function AllocationModal({ payment, onClose, onAllocated }: AllocationModalProps) {
  const [invoiceId, setInvoiceId] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Focus first input on mount
  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const unallocated = payment.unallocatedCents;
  const amountCents = Math.round(parseFloat(amountStr || "0") * 100);
  const isAmountValid = amountCents > 0 && amountCents <= unallocated;
  const isInvoiceValid = invoiceId.trim().length > 0;
  const canSubmit = isAmountValid && isInvoiceValid && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const result = await allocatePayment(payment.id, {
        invoiceId: invoiceId.trim(),
        amountCents,
      });
      onAllocated(result.payment);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la alocare");
    } finally {
      setLoading(false);
    }
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="allocation-modal-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="allocation-modal-title" className="text-base font-semibold text-foreground">
            Alocă plată la factură
          </h2>
          <button
            onClick={onClose}
            aria-label="Închide modal"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {/* Payment summary */}
          <div className="rounded-lg bg-muted/40 px-4 py-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sumă totală</span>
              <span className="font-medium text-foreground">
                {fmt(payment.amountCents, payment.currency)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Deja alocat</span>
              <span className="font-medium text-foreground">
                {fmt(payment.allocatedCents, payment.currency)}
              </span>
            </div>
            <div className="flex justify-between border-t border-border pt-2 mt-2">
              <span className="text-muted-foreground font-medium">Credit disponibil</span>
              <span className="font-semibold text-primary">
                {fmt(unallocated, payment.currency)}
              </span>
            </div>
          </div>

          {/* Invoice ID input */}
          <div>
            <label
              htmlFor="alloc-invoice-id"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              ID Factură (UUID)
            </label>
            <input
              id="alloc-invoice-id"
              ref={firstInputRef}
              type="text"
              value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className={cn(
                "w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground",
                "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring",
                "min-h-[44px]",
                !isInvoiceValid && invoiceId.length > 0 ? "border-destructive" : "border-input"
              )}
              aria-required="true"
            />
          </div>

          {/* Amount input */}
          <div>
            <label
              htmlFor="alloc-amount"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Sumă de alocat ({payment.currency})
            </label>
            <input
              id="alloc-amount"
              type="number"
              min="0.01"
              step="0.01"
              max={unallocated / 100}
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder={`max ${(unallocated / 100).toFixed(2)}`}
              className={cn(
                "w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground",
                "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring",
                "min-h-[44px]",
                amountStr && !isAmountValid ? "border-destructive" : "border-input"
              )}
              aria-required="true"
              aria-describedby="alloc-amount-hint"
            />
            {amountStr && !isAmountValid && (
              <p id="alloc-amount-hint" className="mt-1 text-xs text-destructive" role="alert">
                {amountCents <= 0
                  ? "Suma trebuie să fie pozitivă."
                  : `Depășește creditul disponibil (max ${(unallocated / 100).toFixed(2)} ${payment.currency}).`}
              </p>
            )}
          </div>

          {/* Server error */}
          {error && (
            <div
              className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-[44px] rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
            >
              Anulează
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              aria-disabled={!canSubmit}
              className={cn(
                "flex-1 min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium",
                "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                canSubmit
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "cursor-not-allowed bg-muted text-muted-foreground"
              )}
            >
              {loading ? (
                <Loader2 className="mx-auto h-4 w-4 animate-spin" aria-label="Se salvează" />
              ) : (
                "Salvează"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
