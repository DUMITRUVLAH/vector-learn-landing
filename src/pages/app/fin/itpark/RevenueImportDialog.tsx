/**
 * ITPARK-202: Dialog import linii Anexa 3 (clipboard/CSV/din facturi)
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §2
 *
 * Moduri:
 *  - paste: lipire tab/;/, → preview + confirmare
 *  - csv:   upload fișier CSV → preview + confirmare
 *  - invoices: import din facturile existente (cu avertisment CAEM lipsă)
 *
 * Design-system: Vector 365 tokens, dark mode, a11y (role=dialog, focus trap).
 */
import { useState, useRef, useCallback } from "react";
import {
  importFromPaste,
  importFromCsv,
  importFromInvoices,
  type ImportResult,
} from "../../../../lib/api/itparkImport";

// ─── Types ─────────────────────────────────────────────────────────────────

type ImportMode = "paste" | "csv" | "invoices";

interface RevenueImportDialogProps {
  engagementId: string;
  onImported: (count: number) => void;
  onClose: () => void;
}

// ─── Preview columns ──────────────────────────────────────────────────────

interface PreviewRow {
  client: string;
  docRefs: string;
  service: string;
  caem: string;
  amount: string;
  month: string;
}

function textToPreview(text: string): PreviewRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];
  // Simple split for preview (tab or ; or ,)
  const delim = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";
  return lines.slice(0, 5).map((line) => {
    const cells = line.split(delim);
    return {
      client:  cells[0]?.trim() ?? "",
      docRefs: cells[1]?.trim() ?? "",
      service: cells[2]?.trim() ?? "",
      caem:    cells[3]?.trim() ?? "",
      amount:  cells[4]?.trim() ?? "",
      month:   cells[5]?.trim() ?? "",
    };
  });
}

// ─── Tab styles ────────────────────────────────────────────────────────────

const tabBase =
  "px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors focus:outline-none focus:ring-2 focus:ring-primary min-h-[36px]";
const tabActive =
  "border-primary text-primary bg-card";
const tabInactive =
  "border-transparent text-muted-foreground hover:text-foreground hover:border-border";

// ─── Main component ────────────────────────────────────────────────────────

export default function RevenueImportDialog({
  engagementId,
  onImported,
  onClose,
}: RevenueImportDialogProps) {
  const [mode, setMode] = useState<ImportMode>("paste");
  const [pasteText, setPasteText] = useState("");
  const [csvText, setCsvText] = useState("");
  const [csvFileName, setCsvFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewRows = mode === "paste" ? textToPreview(pasteText) : mode === "csv" ? textToPreview(csvText) : [];

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText((ev.target?.result as string) ?? "");
    reader.readAsText(file, "UTF-8");
  }, []);

  async function handleImport() {
    setImportError(null);
    setResult(null);
    setImporting(true);
    try {
      let res: ImportResult;
      if (mode === "paste") {
        if (!pasteText.trim()) {
          setImportError("Introduceți date în câmpul de lipire.");
          setImporting(false);
          return;
        }
        res = await importFromPaste(engagementId, pasteText);
      } else if (mode === "csv") {
        if (!csvText.trim()) {
          setImportError("Selectați un fișier CSV.");
          setImporting(false);
          return;
        }
        res = await importFromCsv(engagementId, csvText);
      } else {
        res = await importFromInvoices(engagementId);
      }
      setResult(res);
      if (res.imported > 0) {
        onImported(res.imported);
      }
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Eroare la import");
    } finally {
      setImporting(false);
    }
  }

  const canImport =
    !importing &&
    !result &&
    (mode === "invoices" ||
      (mode === "paste" && pasteText.trim().length > 0) ||
      (mode === "csv" && csvText.trim().length > 0));

  return (
    /* overlay */
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl bg-card rounded-2xl border border-border shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 id="import-dialog-title" className="text-base font-semibold text-foreground">
            Import linii venit (Anexa 3)
          </h2>
          <button
            onClick={onClose}
            aria-label="Închide dialogul de import"
            className="rounded-full p-1.5 hover:bg-muted text-muted-foreground min-h-[36px] min-w-[36px] flex items-center justify-center"
          >
            <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Tabs */}
          <div className="flex gap-1 border-b border-border -mx-1">
            {(["paste", "csv", "invoices"] as ImportMode[]).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => { setMode(m); setResult(null); setImportError(null); }}
                className={`${tabBase} ${mode === m ? tabActive : tabInactive}`}
              >
                {m === "paste" && "Lipire"}
                {m === "csv" && "Fișier CSV"}
                {m === "invoices" && "Din facturi"}
              </button>
            ))}
          </div>

          {/* Paste mode */}
          {mode === "paste" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Copiați tabelul din Excel/Google Sheets și lipiți-l mai jos (coloane separate prin TAB sau <code>;</code> sau <code>,</code>).
                Ordinea așteptată: <strong>Client · Documente · Serviciu · Cod CAEM · Sumă MDL · Lună</strong>
              </p>
              <textarea
                value={pasteText}
                onChange={(e) => { setPasteText(e.target.value); setResult(null); }}
                rows={8}
                aria-label="Text pentru import (lipire din clipboard)"
                placeholder={"Vector Academy SRL\tFactura 001/01.01.25\tInstruire digitala\t85.59\t50000.00\t1\nBusiness Corp SRL\tFactura 002/05.02.25\tConsultanta IT\t62.02\t98000.00\t2"}
                className="block w-full rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary font-mono resize-y"
                spellCheck={false}
              />
              {/* Preview */}
              {previewRows.length > 0 && (
                <div className="rounded-lg border border-border overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50 text-left border-b border-border">
                        {["Client", "Documente", "Serviciu", "CAEM", "Sumă", "Lună"].map((h) => (
                          <th key={h} className="px-2 py-1.5 font-medium text-muted-foreground">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, i) => (
                        <tr key={i} className="border-b border-border last:border-0">
                          <td className="px-2 py-1.5 font-medium truncate max-w-[120px]">{row.client}</td>
                          <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[100px]">{row.docRefs}</td>
                          <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[120px]">{row.service}</td>
                          <td className="px-2 py-1.5 font-mono">{row.caem}</td>
                          <td className="px-2 py-1.5 font-mono text-right">{row.amount}</td>
                          <td className="px-2 py-1.5">{row.month}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="px-3 py-1.5 text-xs text-muted-foreground border-t border-border">
                    Preview primele {previewRows.length} rânduri (din {pasteText.split(/\r?\n/).filter(Boolean).length})
                  </p>
                </div>
              )}
            </div>
          )}

          {/* CSV mode */}
          {mode === "csv" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Selectați un fișier CSV. Prima linie poate fi header (detectat automat).
                Erori per rând sunt raportate individual — fișierul nu crează rupe importul.
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted min-h-[40px]"
                  aria-label="Selectează fișier CSV"
                >
                  <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  {csvFileName || "Alege fișier CSV"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.tsv,.txt"
                  className="sr-only"
                  aria-hidden="true"
                  onChange={handleFileChange}
                />
                {csvFileName && (
                  <span className="text-xs text-muted-foreground">{csvFileName}</span>
                )}
              </div>
              {/* Preview */}
              {previewRows.length > 0 && (
                <div className="rounded-lg border border-border overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50 text-left border-b border-border">
                        {["Client", "Documente", "Serviciu", "CAEM", "Sumă", "Lună"].map((h) => (
                          <th key={h} className="px-2 py-1.5 font-medium text-muted-foreground">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, i) => (
                        <tr key={i} className="border-b border-border last:border-0">
                          <td className="px-2 py-1.5 font-medium">{row.client}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">{row.docRefs}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">{row.service}</td>
                          <td className="px-2 py-1.5 font-mono">{row.caem}</td>
                          <td className="px-2 py-1.5 font-mono text-right">{row.amount}</td>
                          <td className="px-2 py-1.5">{row.month}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Invoices mode */}
          {mode === "invoices" && (
            <div className="space-y-3">
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 dark:border-yellow-800 dark:bg-yellow-900/20" role="note">
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                  Limitare documentată — facturile existente nu au Cod CAEM
                </p>
                <p className="mt-1 text-xs text-yellow-700 dark:text-yellow-300">
                  Modulul <code>invoices.ts</code> nu stochează câmpul <code>caemCode</code> sau
                  <code>serviceDescription</code> specific ITPARK. Liniile vor fi importate cu cod CAEM gol
                  — veți completa codul CAEM manual pentru fiecare linie pentru a calcula eligibilitatea.
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Apăsați „Importă" pentru a prelua toate facturile emise de tenant și a le adăuga
                ca linii Anexa 3 (fără cod CAEM — de completat ulterior).
              </p>
            </div>
          )}

          {/* Error display */}
          {importError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
              {importError}
            </div>
          )}

          {/* Result display */}
          {result && (
            <div className="space-y-3">
              <div
                className={`rounded-lg border px-4 py-3 text-sm ${
                  result.imported > 0
                    ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200"
                    : "border-border bg-muted text-muted-foreground"
                }`}
                role="status"
              >
                {result.imported > 0
                  ? `${result.imported} ${result.imported === 1 ? "linie importată" : "linii importate"} cu succes.`
                  : "Nicio linie importată."}
              </div>

              {result.warning && (
                <div
                  className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200"
                  role="note"
                >
                  {result.warning}
                </div>
              )}

              {result.errors.length > 0 && (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-destructive">
                    {result.errors.length} {result.errors.length === 1 ? "eroare" : "erori"} per rând:
                  </p>
                  <ul className="rounded-lg border border-destructive/20 divide-y divide-destructive/10 max-h-40 overflow-y-auto" role="list">
                    {result.errors.map((err, i) => (
                      <li key={i} className="px-3 py-1.5 text-xs text-destructive">
                        Rând {err.row}: {err.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted/20">
          {result ? (
            <button
              onClick={onClose}
              className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 min-h-[40px]"
            >
              Gata
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted min-h-[40px]"
              >
                Anulează
              </button>
              <button
                onClick={handleImport}
                disabled={!canImport}
                className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed min-h-[40px]"
                aria-busy={importing}
              >
                {importing ? "Se importă..." : "Importă"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
