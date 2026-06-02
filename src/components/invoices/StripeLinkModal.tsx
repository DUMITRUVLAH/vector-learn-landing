/**
 * PAY-004: Modal to create and display a Stripe payment link for an invoice.
 * Allows the user to copy the link or open it.
 */
import { useState } from "react";
import { X, Copy, Check, CreditCard, ExternalLink, Loader2 } from "lucide-react";
import { createStripePaymentLink, type StripeLinkResult } from "@/lib/api/stripe";

interface StripeLinkModalProps {
  invoiceId: string;
  invoiceNumber: string;
  amountFormatted: string;
  onClose: () => void;
}

export function StripeLinkModal({
  invoiceId,
  invoiceNumber,
  amountFormatted,
  onClose,
}: StripeLinkModalProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StripeLinkResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await createStripePaymentLink(invoiceId);
      setResult(res);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Eroare la generarea linkului de plată"
      );
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!result?.url) return;
    await navigator.clipboard.writeText(result.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Link plată Stripe"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-md rounded-xl bg-card text-card-foreground shadow-xl ring-1 ring-border">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2">
            <CreditCard className="size-5 text-primary" aria-hidden="true" />
            <h2 className="text-base font-semibold">Link plată card</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Închide"
            className="rounded-md p-1 hover:bg-muted transition-colors"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Factură <span className="font-medium text-foreground">{invoiceNumber}</span>
            {" — "}
            <span className="font-medium text-foreground">{amountFormatted}</span>
          </p>

          {!result && !error && (
            <button
              onClick={generate}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Se generează...
                </>
              ) : (
                <>
                  <CreditCard className="size-4" aria-hidden="true" />
                  Generează link plată
                </>
              )}
            </button>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive"
            >
              {error === "stripe_not_configured"
                ? "Stripe nu este configurat. Mergi la Setări → Integrări → Stripe."
                : error}
            </div>
          )}

          {result && (
            <div className="space-y-3">
              {result.reused && (
                <p className="text-xs text-muted-foreground">
                  Link existent reutilizat (fără expirare nouă).
                </p>
              )}
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3">
                <span className="flex-1 truncate text-xs font-mono text-muted-foreground">
                  {result.url}
                </span>
                <button
                  onClick={copyLink}
                  aria-label="Copiază linkul"
                  className="shrink-0 rounded p-1 hover:bg-muted transition-colors"
                >
                  {copied ? (
                    <Check className="size-4 text-success" aria-hidden="true" />
                  ) : (
                    <Copy className="size-4" aria-hidden="true" />
                  )}
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={copyLink}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-sm font-medium hover:bg-muted transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="size-4 text-success" aria-hidden="true" />
                      Copiat!
                    </>
                  ) : (
                    <>
                      <Copy className="size-4" aria-hidden="true" />
                      Copiază
                    </>
                  )}
                </button>
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <ExternalLink className="size-4" aria-hidden="true" />
                  Deschide
                </a>
              </div>

              {result.expiresAt && (
                <p className="text-xs text-muted-foreground">
                  Expiră:{" "}
                  {new Date(result.expiresAt).toLocaleString("ro-RO", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
