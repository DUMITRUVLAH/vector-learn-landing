/**
 * FinDesk — "Cont de plată" document generator page — /app/fin/invoices/document
 *
 * A standalone tool that turns an existing fin_invoices row into a print-ready
 * "Cont de plată" PDF with a FRESH design (emerald/slate), distinct from the
 * blue fiscal invoice on FinInvoicesPage. Pick an invoice + language → live HTML
 * preview in an iframe → download the PDF.
 *
 * Data source: the existing FinDesk invoices API (no external service).
 * No hex colors — semantic Vector 365 tokens only in this file.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { FileDown, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import {
  listFinInvoices,
  fetchFinInvoiceDocBlob,
  formatFinMoney,
  type FinInvoice,
} from "@/lib/api/finInvoices";

type Lang = "ro" | "ru" | "en";

const LANGS: { value: Lang; label: string }[] = [
  { value: "ro", label: "Română" },
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
];

export function FinInvoiceDocPage() {
  const [invoices, setInvoices] = useState<FinInvoice[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [lang, setLang] = useState<Lang>("ro");

  const [loadingList, setLoadingList] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track the current object URL so we can revoke it on change/unmount.
  const previewUrlRef = useRef<string>("");

  // Load the invoice list once.
  useEffect(() => {
    let alive = true;
    setLoadingList(true);
    listFinInvoices({ limit: 200 })
      .then((res) => {
        if (!alive) return;
        setInvoices(res.data);
        // PAR-FIN-001: honor a ?id=<invoiceId> deep-link (e.g. coming from PAR →
        // "Generează factură"); otherwise default to the most recent invoice.
        const hash = window.location.hash; // "#/business/fin/invoices/document?id=..."
        const qIndex = hash.indexOf("?");
        const wantedId = qIndex >= 0 ? new URLSearchParams(hash.slice(qIndex + 1)).get("id") : null;
        const match = wantedId && res.data.some((i) => i.id === wantedId) ? wantedId : null;
        if (match) setSelectedId(match);
        else if (res.data.length > 0) setSelectedId(res.data[0].id);
      })
      .catch(() => alive && setError("Nu am putut încărca facturile."))
      .finally(() => alive && setLoadingList(false));
    return () => {
      alive = false;
    };
  }, []);

  const revokePreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = "";
    }
  }, []);

  // Refresh the HTML preview whenever the selected invoice or language changes.
  useEffect(() => {
    if (!selectedId) {
      revokePreview();
      setPreviewUrl("");
      return;
    }
    let alive = true;
    setPreviewLoading(true);
    setError(null);
    fetchFinInvoiceDocBlob(selectedId, "html", lang)
      .then((blob) => {
        if (!alive) return;
        revokePreview();
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        setPreviewUrl(url);
      })
      .catch(() => alive && setError("Nu am putut genera previzualizarea."))
      .finally(() => alive && setPreviewLoading(false));
    return () => {
      alive = false;
    };
  }, [selectedId, lang, revokePreview]);

  // Revoke on unmount.
  useEffect(() => revokePreview, [revokePreview]);

  const handleDownload = useCallback(async () => {
    if (!selectedId) return;
    setDownloading(true);
    setError(null);
    try {
      const blob = await fetchFinInvoiceDocBlob(selectedId, "pdf", lang);
      const isPdf = blob.type.includes("pdf");
      const inv = invoices.find((i) => i.id === selectedId);
      const safe = (inv?.invoiceNumber ?? "document").replace(/[^a-zA-Z0-9_-]/g, "_");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cont-plata-${safe}.${isPdf ? "pdf" : "html"}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      if (!isPdf) {
        setError(
          "Serverul nu a putut genera PDF (Chromium indisponibil). Am descărcat HTML-ul gata de print — deschide-l și folosește Print → Save as PDF."
        );
      }
    } catch {
      setError("Descărcarea documentului a eșuat.");
    } finally {
      setDownloading(false);
    }
  }, [selectedId, lang, invoices]);

  const selected = invoices.find((i) => i.id === selectedId);

  return (
    <AppShell
      pageTitle="Generator Cont de plată — FinDesk"
      pageDescription="Generează un PDF „Cont de plată” dintr-o factură existentă, cu design dedicat."
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
        {/* ── Controls ── */}
        <div className="space-y-5">
          <div className="rounded-lg border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold text-foreground">Document</h2>

            {/* Invoice picker */}
            <label htmlFor="fin-doc-invoice" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Factură
            </label>
            {loadingList ? (
              <div className="flex h-10 items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Se încarcă…
              </div>
            ) : invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nu există facturi. Creează una în secțiunea Facturi B2B.
              </p>
            ) : (
              <select
                id="fin-doc-invoice"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="touch-target w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {invoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoiceNumber} · {formatFinMoney(inv.totalCents, inv.currency)}
                    {inv.partyName ? ` · ${inv.partyName}` : ""}
                  </option>
                ))}
              </select>
            )}

            {/* Language picker */}
            <label htmlFor="fin-doc-lang" className="mb-1.5 mt-4 block text-xs font-medium text-muted-foreground">
              Limbă document
            </label>
            <select
              id="fin-doc-lang"
              value={lang}
              onChange={(e) => setLang(e.target.value as Lang)}
              className="touch-target w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {LANGS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>

            {/* Download */}
            <button
              type="button"
              onClick={handleDownload}
              disabled={!selectedId || downloading}
              className="touch-target mt-5 flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <FileDown className="h-4 w-4" aria-hidden="true" />
              )}
              Descarcă PDF
            </button>
          </div>

          {/* Selected invoice summary */}
          {selected && (
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Sumar</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Număr</dt>
                  <dd className="font-medium text-foreground">{selected.invoiceNumber}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Total</dt>
                  <dd className="font-semibold text-foreground">
                    {formatFinMoney(selected.totalCents, selected.currency)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Scadență</dt>
                  <dd className="font-medium text-foreground">{selected.dueDate ?? "—"}</dd>
                </div>
              </dl>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* ── Preview ── */}
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Previzualizare</h2>
            {previewLoading && (
              <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Se actualizează previzualizarea" />
            )}
          </div>
          {previewUrl ? (
            <iframe
              key={previewUrl}
              src={previewUrl}
              title="Previzualizare cont de plată"
              className="h-[900px] w-full rounded-md border border-border bg-white"
            />
          ) : (
            <div className="flex h-[900px] items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
              {loadingList ? "Se încarcă…" : "Selectează o factură pentru previzualizare."}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default FinInvoiceDocPage;
