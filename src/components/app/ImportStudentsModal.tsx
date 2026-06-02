/**
 * STU-203: ImportStudentsModal — CSV/Excel import for students
 * Step 1: Upload CSV → Step 2: Preview with dedup summary → Step 3: Done
 *
 * No external CSV library — uses browser FileReader + manual parsing.
 * Sends parsed rows to POST /api/students/import/preview then /commit.
 */
import { useState, useCallback, useRef } from "react";
import { Upload, X, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ImportRow {
  fullName: string;
  phone?: string | null;
  email?: string | null;
  parentName?: string | null;
  parentPhone?: string | null;
  parentEmail?: string | null;
  birthDate?: string | null;
  notes?: string | null;
}

interface PreviewRow {
  row: number;
  fullName: string;
  phone: string | null;
  status: "new" | "duplicate" | "error";
  error: string | null;
}

interface PreviewSummary {
  total: number;
  new: number;
  duplicates: number;
  errors: number;
}

// ─── CSV parsing ──────────────────────────────────────────────────────────────

const COLUMN_MAP: Record<string, keyof ImportRow> = {
  "Nume complet": "fullName",
  "Nume": "fullName",
  "Name": "fullName",
  "Telefon": "phone",
  "Phone": "phone",
  "Email": "email",
  "Parinte": "parentName",
  "Parinte Nume": "parentName",
  "Telefon Parinte": "parentPhone",
  "Email Parinte": "parentEmail",
  "Data nasterii": "birthDate",
  "Birthdate": "birthDate",
  "Note": "notes",
  "Notes": "notes",
};

function parseCSV(text: string): ImportRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  // Parse header
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^["']|["']$/g, ""));
  const fieldMap: number[] = headers.map((h) => {
    const mapped = COLUMN_MAP[h];
    return mapped ? Object.keys(ImportRow_FIELDS).indexOf(mapped) : -1;
  });

  const rows: ImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));
    if (cols.every((c) => !c)) continue; // skip empty rows

    const row: ImportRow = { fullName: "" };
    headers.forEach((h, idx) => {
      const field = COLUMN_MAP[h];
      if (field && cols[idx]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (row as any)[field] = cols[idx];
      }
    });

    // Fallback: if no mapping matched but first col has text, use as fullName
    if (!row.fullName && cols[0]) {
      row.fullName = cols[0];
    }

    if (row.fullName) rows.push(row);
  }
  return rows;
}

// Field keys for ImportRow
const ImportRow_FIELDS: Record<keyof ImportRow, true> = {
  fullName: true, phone: true, email: true, parentName: true,
  parentPhone: true, parentEmail: true, birthDate: true, notes: true,
};

// ─── API calls ────────────────────────────────────────────────────────────────

async function previewImport(rows: ImportRow[]): Promise<{ preview: PreviewRow[]; summary: PreviewSummary }> {
  const res = await fetch("/api/students/import/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ rows }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ preview: PreviewRow[]; summary: PreviewSummary }>;
}

async function commitImport(rows: ImportRow[]): Promise<{ imported: number; skipped: number }> {
  const res = await fetch("/api/students/import/commit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ rows }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ imported: number; skipped: number }>;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ImportStudentsModalProps {
  onClose: () => void;
  onImported?: () => void;
}

type Step = "upload" | "preview" | "done";

export function ImportStudentsModal({ onClose, onImported }: ImportStudentsModalProps) {
  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [summary, setSummary] = useState<PreviewSummary | null>(null);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith(".csv") && !file.name.endsWith(".txt")) {
      setError("Acceptă doar fișiere .csv. Pentru Excel, exportă mai întâi ca CSV.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        setError("Fișierul nu conține rânduri valide (sau nu am detectat coloana 'Nume complet').");
        return;
      }
      if (parsed.length > 200) {
        setError(`Fișierul are ${parsed.length} rânduri. Limita la preview este 200. Împarte în fișiere mai mici.`);
        return;
      }
      setRows(parsed);
      setError(null);
      setLoading(true);
      previewImport(parsed)
        .then(({ preview: p, summary: s }) => {
          setPreview(p);
          setSummary(s);
          setStep("preview");
        })
        .catch((err: unknown) => setError(err instanceof Error ? err.message : "Eroare la preview"))
        .finally(() => setLoading(false));
    };
    reader.readAsText(file, "utf-8");
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleCommit = useCallback(() => {
    const newRows = rows.filter((_, i) => preview[i]?.status === "new");
    if (newRows.length === 0) { onClose(); return; }
    setLoading(true);
    commitImport(newRows)
      .then((res) => {
        setResult(res);
        setStep("done");
        onImported?.();
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Eroare la import"))
      .finally(() => setLoading(false));
  }, [rows, preview, onClose, onImported]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Import studenți din CSV"
    >
      <div className="w-full max-w-lg rounded-xl bg-background border border-border shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Import studenți din CSV</h2>
          <button
            onClick={onClose}
            className="h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center"
            aria-label="Închide"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Step 1: Upload */}
          {step === "upload" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Încarcă un fișier CSV cu coloane: <strong>Nume complet</strong>, Telefon, Email, Parinte, Telefon Parinte, Email Parinte.
              </p>
              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors",
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-muted/30"
                )}
                role="button"
                aria-label="Dropzone pentru fișier CSV"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
              >
                {loading ? (
                  <Loader2 className="h-8 w-8 text-primary animate-spin" />
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-foreground font-medium">Trage fișierul CSV aici</p>
                    <p className="text-xs text-muted-foreground mt-1">sau click pentru a selecta</p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                className="sr-only"
                onChange={handleInputChange}
                aria-label="Selectează fișier CSV"
              />
            </div>
          )}

          {/* Step 2: Preview */}
          {step === "preview" && summary && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="rounded-lg bg-muted/30 border border-border p-3 text-sm">
                <span className="text-success font-medium">{summary.new} noi</span>
                {" · "}
                <span className="text-warning font-medium">{summary.duplicates} duplicate (vor fi sărite)</span>
                {summary.errors > 0 && (
                  <>
                    {" · "}
                    <span className="text-destructive font-medium">{summary.errors} erori</span>
                  </>
                )}
              </div>

              {/* Preview table — first 10 rows */}
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="py-1.5 px-3 text-left font-medium text-muted-foreground">Rând</th>
                      <th className="py-1.5 px-3 text-left font-medium text-muted-foreground">Nume</th>
                      <th className="py-1.5 px-3 text-left font-medium text-muted-foreground">Telefon</th>
                      <th className="py-1.5 px-3 text-left font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {preview.slice(0, 10).map((p) => (
                      <tr key={p.row} className="hover:bg-muted/20">
                        <td className="py-1.5 px-3 text-muted-foreground">{p.row}</td>
                        <td className="py-1.5 px-3 text-foreground truncate max-w-[120px]">{p.fullName}</td>
                        <td className="py-1.5 px-3 text-muted-foreground">{p.phone ?? "—"}</td>
                        <td className="py-1.5 px-3">
                          <span className={cn(
                            "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                            p.status === "new" ? "bg-success/15 text-success" :
                            p.status === "duplicate" ? "bg-warning/15 text-warning" :
                            "bg-destructive/15 text-destructive"
                          )}>
                            {p.status === "new" ? "Nou" : p.status === "duplicate" ? "Duplicat" : "Eroare"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.length > 10 && (
                  <p className="py-2 px-3 text-xs text-muted-foreground bg-muted/20">
                    ... și {preview.length - 10} rânduri suplimentare
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setStep("upload"); setPreview([]); setSummary(null); }}
                  className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Înapoi
                </button>
                <button
                  onClick={() => void handleCommit()}
                  disabled={loading || summary.new === 0}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  aria-label={`Importă ${summary.new} studenți noi`}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Importă {summary.new} studenți noi
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Done */}
          {step === "done" && result && (
            <div className="py-4 text-center space-y-3">
              <CheckCircle className="mx-auto h-10 w-10 text-success" />
              <p className="text-base font-semibold text-foreground">
                Import complet
              </p>
              <p className="text-sm text-muted-foreground">
                {result.imported} studenți adăugați
                {result.skipped > 0 && ` · ${result.skipped} săriți (duplicate)`}
              </p>
              <button
                onClick={onClose}
                className="mt-2 px-4 py-2 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Închide
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
