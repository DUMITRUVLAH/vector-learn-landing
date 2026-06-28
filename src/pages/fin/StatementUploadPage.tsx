/**
 * STMT-001: Statement Upload Page
 * Route: /business/fin/statement/upload
 *
 * Drag-drop zone for PDF/Excel/CSV/MT940 bank statements.
 * Calls POST /api/fin/statement/upload → shows transaction preview table.
 * Redirects to StatementReviewPage (/business/fin/statement/:captureId) on "Continue".
 *
 * Design system: Vector 365 tokens only. Zero hardcoded hex.
 * a11y: drag zone has role=region + aria-label, file input has visible label.
 */
import { useState, useRef, useCallback } from "react";
import { FinLayout } from "./FinLayout";
import { useRouter } from "@/router/HashRouter";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UploadLine {
  id: string;
  txDate: string | null;
  description: string;
  counterparty: string | null;
  amountCents: number;
  direction: string;
  reportable: string;
}

interface UploadResponse {
  captureId: string;
  lineCount: number;
  lines: UploadLine[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMDL(cents: number): string {
  return new Intl.NumberFormat("ro-MD", { style: "currency", currency: "MDL", minimumFractionDigits: 2 }).format(cents / 100);
}

const ACCEPTED = ".pdf,.csv,.xlsx,.ods,.mt940,.sta,.ofx,.txt";

// ─── Component ────────────────────────────────────────────────────────────────

export default function StatementUploadPage() {
  const { navigate } = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<UploadLine[]>([]);
  const [captureId, setCaptureId] = useState<string | null>(null);
  const [lineCount, setLineCount] = useState<number>(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(async (file: File) => {
    setError(null);
    if (file.size === 0) {
      setError("Fișierul este gol (0 bytes). Selectează un fișier valid.");
      return;
    }

    const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
    const allowed = [".pdf", ".csv", ".xlsx", ".ods", ".mt940", ".sta", ".ofx", ".txt"];
    if (!allowed.includes(ext)) {
      setError("Format nesuportat. Acceptăm: PDF, Excel (.xlsx), CSV, MT940, OFX.");
      return;
    }

    setUploading(true);
    setLines([]);
    setCaptureId(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/fin/statement/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (res.status === 400) {
        const body = await res.json() as { error: string };
        if (body.error === "invalid_file") {
          setError("Format nesuportat. Acceptăm: PDF, Excel (.xlsx), CSV, MT940, OFX.");
        } else {
          setError("Eroare la upload. Încearcă din nou.");
        }
        return;
      }
      if (!res.ok) {
        setError("Eroare la upload. Încearcă din nou.");
        return;
      }

      const data = await res.json() as UploadResponse;
      setCaptureId(data.captureId);
      setLineCount(data.lineCount);
      setLines(data.lines ?? []);
    } catch {
      setError("Eroare de rețea. Verifică conexiunea și încearcă din nou.");
    } finally {
      setUploading(false);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  return (
    <FinLayout pageTitle="Import extras de cont">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* ── Drag-drop zone ─────────────────────────────────────────────── */}
        <div
          role="region"
          aria-label="Zonă upload extras de cont"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={[
            "rounded-xl border-2 border-dashed p-10 flex flex-col items-center gap-4 transition-colors cursor-pointer",
            isDragOver
              ? "border-primary bg-primary/5"
              : "border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50",
          ].join(" ")}
          onClick={() => inputRef.current?.click()}
        >
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <svg className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>

          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              Trage fișierul aici sau{" "}
              <span className="text-primary underline">apasă să selectezi</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              PDF, Excel (.xlsx, .ods), CSV, MT940, OFX — max 8 MB
            </p>
          </div>

          <label className="sr-only" htmlFor="statement-file-input">
            Selectează fișier extras de cont
          </label>
          <input
            id="statement-file-input"
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            className="sr-only"
            onChange={handleFileChange}
            aria-label="Selectează fișier extras de cont"
          />
        </div>

        {/* ── Error banner ───────────────────────────────────────────────── */}
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        {/* ── Uploading spinner ──────────────────────────────────────────── */}
        {uploading && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground"
          >
            <svg className="h-4 w-4 animate-spin text-primary" fill="none" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Extrag tranzacțiile din fișier...
          </div>
        )}

        {/* ── Preview table ──────────────────────────────────────────────── */}
        {lines.length > 0 && captureId && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {lineCount} tranzacție(i) extrase{lines.length < lineCount ? ` — afișate primele ${lines.length}` : ""}
              </p>
            </div>

            <div className="rounded-xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Data</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Descriere</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Contraparte</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Sumă (MDL)</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Dir.</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Raportabil</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {lines.map((line) => (
                      <tr key={line.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground text-xs">
                          {line.txDate ?? "—"}
                        </td>
                        <td className="px-3 py-2 max-w-[200px] truncate">
                          {line.description}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground max-w-[150px] truncate">
                          {line.counterparty ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {formatMDL(line.amountCents)}
                        </td>
                        <td className="px-3 py-2">
                          <span className={[
                            "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium",
                            line.direction === "in"
                              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
                          ].join(" ")}>
                            {line.direction === "in" ? "IN" : "OUT"}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={[
                            "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium",
                            line.reportable === "yes"
                              ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400"
                              : line.reportable === "no"
                              ? "bg-muted text-muted-foreground"
                              : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
                          ].join(" ")}>
                            {line.reportable === "yes" ? "Raportabil" : line.reportable === "no" ? "Nu" : "Review"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate(`/business/fin/statement/${captureId}`)}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors min-h-[44px]"
            >
              Continuă spre review →
            </button>
          </div>
        )}
      </div>
    </FinLayout>
  );
}
