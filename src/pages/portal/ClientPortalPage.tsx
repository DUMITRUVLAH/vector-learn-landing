/**
 * CLIENTPORTAL-001/002/003: Financial client portal
 * Accessible at /portal/client?token=<uuid> — NO admin auth required.
 * Shows the client's invoices, payment status, balance, and document upload.
 */
import { useEffect, useRef, useState } from "react";
import {
  FileText,
  Download,
  Upload,
  Loader2,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  CreditCard,
  Paperclip,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getPortalIdentity,
  getPortalInvoices,
  getPortalDocuments,
  uploadPortalDocument,
  type ClientPortalIdentity,
  type PortalInvoice,
  type PortalDocument,
} from "@/lib/api/finClientPortal";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: currency || "MDL",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ro-RO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function InvoiceStatusBadge({ status }: { status: PortalInvoice["status"] }) {
  const cfg: Record<string, { label: string; cls: string; Icon: typeof CheckCircle }> = {
    draft:     { label: "Ciornă",    cls: "bg-muted text-muted-foreground",                             Icon: Clock        },
    issued:    { label: "Neachitată", cls: "bg-destructive/10 text-destructive",                         Icon: AlertCircle  },
    paid:      { label: "Achitată",  cls: "bg-green-500/10 text-green-700 dark:text-green-400",          Icon: CheckCircle  },
    cancelled: { label: "Anulată",   cls: "bg-muted/60 text-muted-foreground line-through",              Icon: XCircle      },
  };
  const { label, cls, Icon } = cfg[status] ?? cfg.draft;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium", cls)}>
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ClientPortalPage({ token }: { token: string }) {
  const [identity, setIdentity]   = useState<ClientPortalIdentity | null>(null);
  const [invoices, setInvoices]   = useState<PortalInvoice[]>([]);
  const [totalOwed, setTotalOwed] = useState(0);
  const [currency, setCurrency]   = useState("MDL");
  const [documents, setDocuments] = useState<PortalDocument[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) {
      setError("Link invalid sau expirat. Contactați academia pentru un link nou.");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const [id, inv, docs] = await Promise.all([
          getPortalIdentity(token),
          getPortalInvoices(token),
          getPortalDocuments(token),
        ]);
        setIdentity(id);
        setInvoices(inv.invoices);
        setTotalOwed(inv.totalOwedCents);
        if (inv.invoices.length > 0) setCurrency(inv.invoices[0].currency);
        setDocuments(docs.documents);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Eroare necunoscută");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  async function handleUpload(file: File) {
    setUploadError(null);
    setUploadSuccess(null);
    setUploading(true);
    try {
      const doc = await uploadPortalDocument(token, file);
      setDocuments((prev) => [{ ...doc, uploadedAt: doc.uploadedAt }, ...prev]);
      setUploadSuccess(`"${doc.originalName}" a fost încărcat cu succes.`);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Eroare la încărcare");
    } finally {
      setUploading(false);
    }
  }

  // ─── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="Se încarcă..." />
      </div>
    );
  }

  // ─── Error state ──────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-destructive mb-4" aria-hidden />
          <h1 className="text-lg font-semibold text-foreground mb-2">Acces indisponibil</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  const clientName = identity?.contactName ?? identity?.companyName ?? "Client";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-4xl px-4 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              {identity?.tenantName ?? "Portal client"}
            </p>
            <h1 className="text-lg font-semibold text-foreground">{clientName}</h1>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <CreditCard className="h-5 w-5" aria-hidden />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 space-y-8">
        {/* Balance summary */}
        {totalOwed > 0 && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" aria-hidden />
            <div>
              <p className="text-sm font-medium text-destructive">Sold neachitat</p>
              <p className="text-xl font-bold text-foreground">{formatCents(totalOwed, currency)}</p>
            </div>
          </div>
        )}
        {totalOwed === 0 && invoices.length > 0 && (
          <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" aria-hidden />
            <p className="text-sm font-medium text-green-700 dark:text-green-400">Toate facturile sunt achitate.</p>
          </div>
        )}

        {/* Invoices table */}
        <section aria-labelledby="invoices-heading">
          <h2 id="invoices-heading" className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
            Facturi
          </h2>

          {invoices.length === 0 ? (
            <div className="rounded-lg border border-border bg-muted/30 p-8 text-center">
              <FileText className="mx-auto h-8 w-8 text-muted-foreground mb-2" aria-hidden />
              <p className="text-sm text-muted-foreground">Nu există facturi înregistrate pentru acest cont.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm" role="table" aria-label="Lista facturi">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">Nr. factură</th>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">Data</th>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">Scadentă</th>
                      <th className="px-4 py-2 text-right font-medium text-muted-foreground">Sumă</th>
                      <th className="px-4 py-2 text-center font-medium text-muted-foreground">Status</th>
                      <th className="px-4 py-2 text-center font-medium text-muted-foreground">Acțiuni</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {invoices.map((inv) => (
                      <tr key={inv.id} className="bg-card hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-foreground">{inv.invoiceNumber}</td>
                        <td className="px-4 py-3 text-foreground">{formatDate(inv.issueDate)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(inv.dueDate)}</td>
                        <td className="px-4 py-3 text-right font-medium text-foreground">
                          {formatCents(inv.amountCents, inv.currency)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <InvoiceStatusBadge status={inv.status} />
                        </td>
                        <td className="px-4 py-3 text-center">
                          {inv.status === "issued" && inv.stripeSessionId ? (
                            <a
                              href={`https://checkout.stripe.com/pay/${inv.stripeSessionId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                              aria-label={`Plătește factura ${inv.invoiceNumber} online`}
                            >
                              <CreditCard className="h-3 w-3" aria-hidden />
                              Plătește online
                            </a>
                          ) : inv.status === "issued" ? (
                            <span className="text-xs text-muted-foreground">Contactați academia</span>
                          ) : (
                            <button
                              type="button"
                              disabled
                              aria-label={`Descarcă factura ${inv.invoiceNumber}`}
                              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
                            >
                              <Download className="h-3 w-3" aria-hidden />
                              PDF
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* Documents section */}
        <section aria-labelledby="docs-heading">
          <h2 id="docs-heading" className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
            <Paperclip className="h-4 w-4 text-muted-foreground" aria-hidden />
            Documente
          </h2>

          {/* Upload area */}
          <div className="mb-4">
            <label htmlFor="portal-file-upload" className="block text-xs font-medium text-muted-foreground mb-1">
              Încarcă un document (PDF, JPG, PNG — max 10 MB)
            </label>
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                id="portal-file-upload"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="sr-only"
                aria-label="Alege un fișier de încărcat"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    void handleUpload(file);
                    e.target.value = "";
                  }
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50 disabled:opacity-60 transition-colors"
                aria-busy={uploading}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Upload className="h-4 w-4" aria-hidden />
                )}
                {uploading ? "Se încarcă..." : "Alege fișier"}
              </button>
            </div>
            {uploadError && (
              <p role="alert" className="mt-1 text-xs text-destructive">{uploadError}</p>
            )}
            {uploadSuccess && (
              <p role="status" className="mt-1 text-xs text-green-600 dark:text-green-400">{uploadSuccess}</p>
            )}
          </div>

          {/* Documents list */}
          {documents.length === 0 ? (
            <div className="rounded-lg border border-border bg-muted/30 p-6 text-center">
              <Paperclip className="mx-auto h-6 w-6 text-muted-foreground mb-2" aria-hidden />
              <p className="text-sm text-muted-foreground">Nu ați încărcat niciun document.</p>
            </div>
          ) : (
            <ul className="space-y-2" aria-label="Documente încărcate">
              {documents.map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-center gap-3 rounded-md border border-border bg-card p-3"
                >
                  <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" aria-hidden />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{doc.originalName}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(doc.sizeBytes)} · {formatDate(doc.uploadedAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <footer className="mt-12 border-t border-border py-4 text-center text-xs text-muted-foreground">
        {identity?.tenantName} · Portal client financiar
      </footer>
    </div>
  );
}
