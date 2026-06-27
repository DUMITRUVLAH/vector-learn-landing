/**
 * CASH-002: /app/fin/cash/import
 *
 * Drag&drop upload CSV sau MT940 cu preview primele 5 rânduri înainte de confirmare.
 * Design: Vector 365 tokens, light + dark, WCAG AA.
 */
import { useState, useRef, useCallback } from "react";
import {
  Upload,
  FileText,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { useRouter } from "@/router/HashRouter";
import { importFile, type ImportResult } from "@/lib/api/finCash";
import { cn } from "@/lib/utils";

// ─── CSV preview parser ───────────────────────────────────────────────────────

function previewCsv(content: string): string[][] {
  const delimiter = content.includes(";") ? ";" : ",";
  return content
    .split("\n")
    .slice(0, 6) // header + 5 rows
    .filter((l) => l.trim())
    .map((l) => l.split(delimiter).map((c) => c.replace(/^"|"$/g, "").trim()));
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CashImportPage() {
  const { navigate } = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string[][] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ─── File selection ─────────────────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    setSelectedFile(file);
    setResult(null);
    setError(null);

    // Preview for CSV/text files
    if (
      file.name.endsWith(".csv") ||
      file.type === "text/csv" ||
      file.type === "text/plain"
    ) {
      const text = await file.text();
      setPreview(previewCsv(text));
    } else {
      setPreview(null); // MT940 or PDF — no inline preview
    }
  }, []);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  // ─── Upload ─────────────────────────────────────────────────────────────────

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setError(null);
    try {
      const res = await importFile(selectedFile);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare la import");
    } finally {
      setUploading(false);
    }
  };

  return (
    <BusinessShell pageTitle="Import extras bancar">
      <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
        {/* Header */}
        <div>
          <button
            onClick={() => navigate("/app/fin/cash")}
            className="mb-2 flex min-h-[44px] items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            aria-label="Înapoi la încasări"
          >
            <ArrowLeft className="h-4 w-4" />
            Încasări
          </button>
          <h1 className="text-xl font-semibold text-foreground">Import extras bancar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Suportă fișiere CSV (bancă → export) și MT940 (SWIFT). Maxim 5 MB.
          </p>
        </div>

        {/* Result */}
        {result && (
          <div className="rounded-xl border border-green-300 bg-green-50 p-5 dark:border-green-700 dark:bg-green-900/20">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-7 w-7 shrink-0 text-green-600 dark:text-green-400" />
              <div>
                <p className="font-semibold text-foreground">Import reușit</p>
                <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                  <li>Tranzacții importate: <strong className="text-foreground">{result.imported}</strong></li>
                  <li>Reconsiliate automat: <strong className="text-foreground">{result.matched}</strong></li>
                  {result.duplicates > 0 && (
                    <li>Duplicate ignorate: <strong className="text-foreground">{result.duplicates}</strong></li>
                  )}
                </ul>
                {result.parseErrors.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-amber-600 dark:text-amber-400">
                      {result.parseErrors.length} avertisment(e) la parsare
                    </summary>
                    <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                      {result.parseErrors.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </div>
            <button
              onClick={() => navigate("/app/fin/cash")}
              className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Vezi tranzacțiile
            </button>
          </div>
        )}

        {/* Drop zone */}
        {!result && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Zonă de drag&drop fișier extras bancar"
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
            className={cn(
              "flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-colors",
              dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/60 hover:bg-muted/40"
            )}
          >
            <Upload className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Trageți fișierul CSV sau MT940 aici
              </p>
              <p className="text-xs text-muted-foreground">sau click pentru selectare</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.mt940,.sta,.txt"
              onChange={onInputChange}
              className="sr-only"
              aria-label="Selectați fișierul de import"
            />
          </div>
        )}

        {/* Selected file info */}
        {selectedFile && !result && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
            <FileText className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{selectedFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {(selectedFile.size / 1024).toFixed(1)} KB
              </p>
            </div>
            <button
              onClick={() => { setSelectedFile(null); setPreview(null); }}
              className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
              aria-label="Elimină fișierul selectat"
            >
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* CSV Preview */}
        {preview && preview.length > 0 && !result && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">
              Preview (primele {Math.min(preview.length - 1, 5)} rânduri):
            </p>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs" data-testid="csv-preview">
                <thead>
                  <tr className="bg-muted/40">
                    {(preview[0] ?? []).map((h, i) => (
                      <th
                        key={i}
                        className="px-3 py-2 text-left font-medium text-muted-foreground"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {preview.slice(1).map((row, ri) => (
                    <tr key={ri} className="bg-card">
                      {row.map((cell, ci) => (
                        <td key={ci} className="max-w-[120px] truncate px-3 py-2 text-foreground">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-destructive" role="alert">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Actions */}
        {selectedFile && !result && (
          <div className="flex justify-end gap-3">
            <button
              onClick={() => { setSelectedFile(null); setPreview(null); setError(null); }}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-muted"
            >
              Anulează
            </button>
            <button
              onClick={handleUpload}
              disabled={uploading}
              aria-disabled={uploading}
              className={cn(
                "inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground",
                "hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                "disabled:cursor-not-allowed disabled:opacity-50"
              )}
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Se importă...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Importă
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </BusinessShell>
  );
}
