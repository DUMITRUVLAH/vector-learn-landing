/**
 * FinDesk — "Cont de plată" generator page — /app/fin/invoices/document
 *
 * A STANDALONE creation flow (NOT "pick an existing invoice"). You enter the client,
 * services, quantity and price directly — exactly like creating an invoice — and the
 * page renders a print-ready "Cont de plată" PDF with the dedicated emerald/slate design.
 * Nothing is persisted: the document is generated on the fly and sent as a PDF.
 * (e-Factura remains a separate flow — a Cont de plată is its own thing.)
 *
 * Data: client search reuses the state registry (searchRegistry); the document is rendered
 * server-side from the form payload via POST /api/fin/invoices/document.{html,pdf}.
 * No hex colors — semantic Vector 365 tokens only in this file.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { FileDown, Loader2, AlertCircle, RefreshCw, Plus, Trash2, Search, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { cn } from "@/lib/utils";
import {
  postFinInvoiceDocBlob,
  formatFinMoney,
  type AdHocDocInput,
} from "@/lib/api/finInvoices";
import { searchRegistry, type RegistryCompany } from "@/lib/api/paymentAccounts";

type Lang = "ro" | "ru" | "en";
type Currency = "MDL" | "EUR" | "USD";

const LANGS: { value: Lang; label: string }[] = [
  { value: "ro", label: "Română" },
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
];

interface LineInput {
  description: string;
  quantity: number;
  /** Unit price in major units (lei), as a string so decimals type cleanly ("200", "19.99"). */
  unitPriceLei: string;
  unit: string;
  vatPct: number;
}

/** Parse a "lei" string to cents (minor units). "200" → 20000, "19.99" → 1999. */
function leiToCents(s: string): number {
  const n = parseFloat((s || "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
}

export function FinInvoiceDocPage() {
  // ── Document meta ──
  const [docNumber, setDocNumber] = useState<string>("");
  const [currency, setCurrency] = useState<Currency>("MDL");
  const [issuedAt, setIssuedAt] = useState<string>(""); // empty → server uses today
  const [dueDate, setDueDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [lang, setLang] = useState<Lang>("ro");

  // ── Client (beneficiary) — live registry search ──
  const [query, setQuery] = useState<string>("");
  const [results, setResults] = useState<RegistryCompany[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [clientName, setClientName] = useState<string>("");
  const [clientIdno, setClientIdno] = useState<string>("");
  const [clientAddress, setClientAddress] = useState<string>("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Line items ──
  const [lines, setLines] = useState<LineInput[]>([
    { description: "", quantity: 1, unitPriceLei: "", unit: "buc", vatPct: 0 },
  ]);

  // ── Preview / download ──
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewUrlRef = useRef<string>("");

  // ── Client search handlers ──
  function onQueryChange(value: string) {
    setQuery(value);
    setClientName(value); // free-typed name works even without picking a registry hit
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = value.trim();
    if (q.length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await searchRegistry(q);
        setResults(data.slice(0, 8));
        setShowResults(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }

  function pickCompany(co: RegistryCompany) {
    setShowResults(false);
    setQuery(co.name);
    setClientName(co.name);
    setClientIdno(co.idno ?? "");
    setClientAddress([co.address, co.city].filter(Boolean).join(", "));
  }

  // ── Line handlers ──
  function addLine() {
    setLines((prev) => [...prev, { description: "", quantity: 1, unitPriceLei: "", unit: "buc", vatPct: 0 }]);
  }
  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }
  function updateLine<K extends keyof LineInput>(idx: number, key: K, value: LineInput[K]) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [key]: value } : l)));
  }

  // ── Client-side totals (preview) ──
  function computeLineTotal(l: LineInput): number {
    const cents = leiToCents(l.unitPriceLei);
    return Math.round((l.quantity * cents * (100 + l.vatPct)) / 100);
  }
  const grandTotal = lines.reduce((s, l) => s + computeLineTotal(l), 0);
  const vatTotal = lines.reduce(
    (s, l) => s + Math.round((l.quantity * leiToCents(l.unitPriceLei) * l.vatPct) / 100),
    0
  );
  const formatCents = (cents: number) => formatFinMoney(cents, currency);

  // ── Build the payload the server expects. Returns null when the form isn't renderable yet. ──
  const buildInput = useCallback((): AdHocDocInput | null => {
    const name = clientName.trim();
    const validLines = lines
      .filter((l) => l.description.trim() && leiToCents(l.unitPriceLei) > 0)
      .map((l) => ({
        description: l.description.trim(),
        quantity: Math.max(1, l.quantity),
        unitPriceCents: leiToCents(l.unitPriceLei),
        vatPct: l.vatPct,
        unit: l.unit.trim() || null,
      }));
    if (!name || validLines.length === 0) return null;
    return {
      invoiceNumber: docNumber.trim() || undefined,
      currency,
      issuedAt: issuedAt || null,
      dueDate: dueDate || null,
      notes: notes.trim() || null,
      to: { name, idno: clientIdno.trim() || null, address: clientAddress.trim() || null },
      lines: validLines,
    };
  }, [clientName, clientIdno, clientAddress, lines, docNumber, currency, issuedAt, dueDate, notes]);

  const revokePreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = "";
    }
  }, []);

  // ── Live preview: re-render (debounced) whenever the form changes & is renderable. ──
  const input = buildInput();
  const inputKey = input ? JSON.stringify(input) + lang : "";
  useEffect(() => {
    if (!inputKey || !input) {
      revokePreview();
      setPreviewUrl("");
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      setPreviewLoading(true);
      setError(null);
      postFinInvoiceDocBlob(input, "html", lang)
        .then((blob) => {
          if (!alive) return;
          revokePreview();
          const url = URL.createObjectURL(blob);
          previewUrlRef.current = url;
          setPreviewUrl(url);
        })
        .catch((e: unknown) => {
          if (alive) setError(e instanceof Error ? e.message : "Nu am putut genera previzualizarea.");
        })
        .finally(() => alive && setPreviewLoading(false));
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // inputKey captures all the meaningful field changes; lang too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputKey, lang, revokePreview]);

  useEffect(() => revokePreview, [revokePreview]);

  const handleDownload = useCallback(async () => {
    const payload = buildInput();
    if (!payload) {
      setError("Completează clientul și cel puțin o linie cu preț înainte de descărcare.");
      return;
    }
    setDownloading(true);
    setError(null);
    try {
      const blob = await postFinInvoiceDocBlob(payload, "pdf", lang);
      const isPdf = blob.type.includes("pdf");
      const safe = (payload.invoiceNumber ?? "document").replace(/[^a-zA-Z0-9_-]/g, "_");
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Descărcarea documentului a eșuat.");
    } finally {
      setDownloading(false);
    }
  }, [buildInput, lang]);

  const canGenerate = input !== null;

  return (
    <AppShell
      pageTitle="Generator Cont de plată — FinDesk"
      pageDescription="Creează un „Cont de plată” cu client, servicii și prețuri, apoi descarcă-l ca PDF."
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[420px_1fr]">
        {/* ── Form ── */}
        <div className="space-y-5">
          {/* Client */}
          <div className="rounded-lg border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold text-foreground">Client (beneficiar)</h2>
            <div className="relative">
              <label htmlFor="doc-client" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Caută după IDNO sau nume — sau scrie liber
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <input
                  id="doc-client"
                  type="text"
                  value={query}
                  autoComplete="off"
                  onChange={(e) => onQueryChange(e.target.value)}
                  onFocus={() => results.length > 0 && setShowResults(true)}
                  placeholder="Scrie IDNO sau numele firmei…"
                  className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-9 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
              </div>
              {showResults && results.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-card shadow-lg">
                  {results.map((co) => (
                    <li key={`${co.id}-${co.idno}`}>
                      <button
                        type="button"
                        onClick={() => pickCompany(co)}
                        className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted"
                      >
                        <span className="font-medium text-foreground">{co.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {co.idno ? `IDNO ${co.idno}` : "fără IDNO"}
                          {co.city ? ` · ${co.city}` : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {showResults && !searching && results.length === 0 && query.trim().length >= 2 && (
                <p className="mt-1 text-xs text-muted-foreground">Nicio firmă găsită — numele scris se folosește ca atare.</p>
              )}
              {clientName.trim() && (
                <p className="mt-1 flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {clientName}{clientIdno ? ` · IDNO ${clientIdno}` : ""} — apare pe Contul de plată.
                </p>
              )}
            </div>

            {/* Editable client fields (registry hits prefill these; free entry also works) */}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="doc-client-idno" className="mb-1 block text-xs font-medium text-muted-foreground">Cod fiscal / IDNO</label>
                <input
                  id="doc-client-idno"
                  type="text"
                  value={clientIdno}
                  onChange={(e) => setClientIdno(e.target.value)}
                  placeholder="opțional"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label htmlFor="doc-client-addr" className="mb-1 block text-xs font-medium text-muted-foreground">Adresă</label>
                <input
                  id="doc-client-addr"
                  type="text"
                  value={clientAddress}
                  onChange={(e) => setClientAddress(e.target.value)}
                  placeholder="opțional"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </div>

          {/* Line items */}
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Servicii / produse</h2>
              <button
                type="button"
                onClick={addLine}
                className="flex min-h-[32px] items-center gap-1 px-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Adaugă linie
              </button>
            </div>
            <div className="space-y-3">
              {lines.map((line, idx) => (
                <div key={idx} className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                  <div>
                    <label htmlFor={`doc-line-desc-${idx}`} className="sr-only">Descriere linie {idx + 1}</label>
                    <input
                      id={`doc-line-desc-${idx}`}
                      type="text"
                      value={line.description}
                      onChange={(e) => updateLine(idx, "description", e.target.value)}
                      placeholder="Descriere serviciu/produs…"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="grid grid-cols-5 items-end gap-2">
                    <div>
                      <label htmlFor={`doc-line-qty-${idx}`} className="mb-1 block text-xs text-muted-foreground">Cant.</label>
                      <input
                        id={`doc-line-qty-${idx}`}
                        type="number"
                        min={1}
                        value={line.quantity}
                        onChange={(e) => updateLine(idx, "quantity", Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <div>
                      <label htmlFor={`doc-line-unit-${idx}`} className="mb-1 block text-xs text-muted-foreground">Unitate</label>
                      <input
                        id={`doc-line-unit-${idx}`}
                        type="text"
                        value={line.unit}
                        onChange={(e) => updateLine(idx, "unit", e.target.value)}
                        placeholder="buc"
                        className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <div>
                      <label htmlFor={`doc-line-price-${idx}`} className="mb-1 block text-xs text-muted-foreground">Preț</label>
                      <input
                        id={`doc-line-price-${idx}`}
                        type="text"
                        inputMode="decimal"
                        value={line.unitPriceLei}
                        onChange={(e) => updateLine(idx, "unitPriceLei", e.target.value.replace(/[^\d.,]/g, ""))}
                        placeholder="ex: 200"
                        className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <div>
                      <label htmlFor={`doc-line-vat-${idx}`} className="mb-1 block text-xs text-muted-foreground">TVA %</label>
                      <input
                        id={`doc-line-vat-${idx}`}
                        type="number"
                        min={0}
                        max={100}
                        value={line.vatPct}
                        onChange={(e) => updateLine(idx, "vatPct", Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                        className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        disabled={lines.length === 1}
                        aria-label={`Șterge linia ${idx + 1}`}
                        className={cn(
                          "flex min-h-[40px] w-full items-center justify-center rounded-md px-2 py-2 transition-colors",
                          lines.length === 1
                            ? "cursor-not-allowed text-muted-foreground/40"
                            : "text-destructive hover:bg-destructive/10"
                        )}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    Total linie: <span className="font-medium text-foreground">{formatCents(computeLineTotal(line))}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Document meta + actions */}
          <div className="rounded-lg border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold text-foreground">Document</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="doc-number" className="mb-1 block text-xs font-medium text-muted-foreground">Număr document</label>
                <input
                  id="doc-number"
                  type="text"
                  value={docNumber}
                  onChange={(e) => setDocNumber(e.target.value)}
                  placeholder="ex: CP-2026-0001"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label htmlFor="doc-currency" className="mb-1 block text-xs font-medium text-muted-foreground">Valută</label>
                <select
                  id="doc-currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as Currency)}
                  className="touch-target w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="MDL">MDL (Lei)</option>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div>
                <label htmlFor="doc-issued" className="mb-1 block text-xs font-medium text-muted-foreground">Data emiterii</label>
                <input
                  id="doc-issued"
                  type="date"
                  value={issuedAt}
                  onChange={(e) => setIssuedAt(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label htmlFor="doc-due" className="mb-1 block text-xs font-medium text-muted-foreground">Data scadentă</label>
                <input
                  id="doc-due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <label htmlFor="doc-notes" className="mb-1 mt-3 block text-xs font-medium text-muted-foreground">Note (opțional)</label>
            <textarea
              id="doc-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Instrucțiuni de plată, referințe…"
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />

            <label htmlFor="doc-lang" className="mb-1 mt-3 block text-xs font-medium text-muted-foreground">Limbă document</label>
            <select
              id="doc-lang"
              value={lang}
              onChange={(e) => setLang(e.target.value as Lang)}
              className="touch-target w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {LANGS.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>

            {/* Totals summary */}
            <div className="mt-4 rounded-lg border border-border bg-muted/40 p-4">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Subtotal (fără TVA):</span>
                <span className="text-foreground">{formatCents(grandTotal - vatTotal)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm text-muted-foreground">
                <span>Total TVA:</span>
                <span className="text-foreground">{formatCents(vatTotal)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-border pt-2 font-semibold text-foreground">
                <span>TOTAL DE PLATĂ:</span>
                <span className="text-lg text-primary">{formatCents(grandTotal)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleDownload}
              disabled={!canGenerate || downloading}
              className="touch-target mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileDown className="h-4 w-4" aria-hidden="true" />}
              Descarcă PDF
            </button>
          </div>

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
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
            <div className="flex h-[900px] items-center justify-center rounded-md border border-dashed border-border px-6 text-center text-sm text-muted-foreground">
              Completează clientul și cel puțin o linie cu preț pentru a vedea previzualizarea.
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default FinInvoiceDocPage;
