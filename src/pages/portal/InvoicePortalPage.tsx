/**
 * PAY-003: Parent-facing invoice portal page
 * Route: /portal/invoice/:invoiceId
 * Public (no auth required) — displays invoice details + EPC QR for payment.
 * Tenant is determined by the invoice's tenantId, not by session.
 */
import { useEffect, useState } from "react";
import { Loader2, QrCode, AlertCircle } from "lucide-react";
import { generateEpcQr } from "@/lib/epcQr";

interface PortalInvoiceData {
  invoiceNumber: string;
  amountCents: number;
  currency: string;
  status: string;
  issueDate: string;
  dueDate: string | null;
  notes: string | null;
  studentName: string;
  tenantName: string;
  iban: string | null;
  bic: string | null;
}

function fmt(cents: number, currency: string): string {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ro-RO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function InvoicePortalPage() {
  // Extract invoiceId from hash URL /portal/invoice/:id
  const hash = window.location.hash.replace(/^#/, "");
  const match = hash.match(/\/portal\/invoice\/([a-f0-9-]+)/);
  const invoiceId = match?.[1] ?? null;

  const [invoice, setInvoice] = useState<PortalInvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!invoiceId) {
      setError("ID factură invalid.");
      setLoading(false);
      return;
    }

    fetch(`/api/portal/invoice/${invoiceId}`)
      .then(async (res) => {
        if (res.status === 403) throw new Error("Acces interzis.");
        if (res.status === 404) throw new Error("Factura nu a fost găsită.");
        if (!res.ok) throw new Error("Eroare la încărcarea facturii.");
        return res.json() as Promise<PortalInvoiceData>;
      })
      .then(async (data) => {
        setInvoice(data);
        // Generate EPC QR if IBAN is present
        if (data.iban) {
          const amountEur = data.currency === "EUR" ? data.amountCents / 100 : 0;
          const qr = await generateEpcQr({
            iban: data.iban,
            bic: data.bic,
            name: data.tenantName,
            amountEur,
            reference: data.invoiceNumber,
          });
          setQrDataUrl(qr);
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Eroare necunoscută.");
      })
      .finally(() => setLoading(false));
  }, [invoiceId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se încarcă…" />
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center max-w-sm">
          <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" aria-hidden="true" />
          <h1 className="text-lg font-semibold mb-1">Factură indisponibilă</h1>
          <p className="text-sm text-muted-foreground">{error ?? "Factura nu a putut fi încărcată."}</p>
        </div>
      </div>
    );
  }

  const isPaid = invoice.status === "paid";

  return (
    <div className="min-h-screen bg-background flex flex-col items-center py-12 px-4">
      <div className="w-full max-w-sm space-y-4">
        {/* Header */}
        <div className="text-center mb-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
            {invoice.tenantName}
          </p>
          <h1 className="text-2xl font-bold">{invoice.invoiceNumber}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Factură pentru {invoice.studentName}
          </p>
        </div>

        {/* Amount card */}
        <div
          className={`rounded-2xl border p-6 text-center ${
            isPaid ? "border-success/40 bg-success/5" : "border-border bg-card"
          }`}
        >
          <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-2">
            {isPaid ? "Plătit" : "De plată"}
          </p>
          <p className="text-4xl font-display font-black tabular-nums">
            {fmt(invoice.amountCents, invoice.currency)}
          </p>
          {invoice.dueDate && !isPaid && (
            <p className="text-sm text-muted-foreground mt-2">
              Scadență: <span className="font-medium text-foreground">{fmtDate(invoice.dueDate)}</span>
            </p>
          )}
          {invoice.notes && (
            <p className="text-xs text-muted-foreground mt-2">{invoice.notes}</p>
          )}
        </div>

        {/* QR Payment */}
        {qrDataUrl && !isPaid && (
          <div className="rounded-2xl border border-border bg-card p-6 text-center">
            <div className="flex items-center justify-center gap-1.5 text-sm font-semibold mb-3">
              <QrCode className="h-4 w-4" aria-hidden="true" />
              Plătește cu aplicația băncii
            </div>
            <img
              src={qrDataUrl}
              alt={`QR plată SEPA pentru ${invoice.invoiceNumber}`}
              className="mx-auto rounded-lg"
              width={150}
              height={150}
            />
            <p className="text-xs text-muted-foreground mt-3">
              Scanați cu BT Pay, Revolut, George, ING Home'Bank sau orice aplicație
              compatibilă SEPA pentru a plăti instant.
            </p>
          </div>
        )}

        {/* Invoice details */}
        <div className="rounded-2xl border border-border bg-card p-4 text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Data emiterii</span>
            <span className="font-medium">{fmtDate(invoice.issueDate)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status</span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                isPaid
                  ? "bg-success/15 text-success"
                  : "bg-warning/15 text-warning"
              }`}
            >
              {isPaid ? "Plătit" : "În așteptare"}
            </span>
          </div>
          {invoice.dueDate && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Scadență</span>
              <span className="font-medium">{fmtDate(invoice.dueDate)}</span>
            </div>
          )}
        </div>

        <p className="text-center text-[11px] text-muted-foreground pb-4">
          Factură generată de {invoice.tenantName} via Vector Learn &bull; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
