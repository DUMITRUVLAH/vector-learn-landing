/**
 * BANKLINK-002: /app/fin/banklink/import — wizard import fișier OFX/MT940
 *
 * Flux: selector conexiune → selector format → drag&drop fișier →
 *       previzualizare 5 tranzacții parsate local → confirmare import → rezultat.
 * Design: Vector 365, light+dark, WCAG AA, fără hex.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import {
  Upload,
  FileText,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Loader2,
  AlertCircle,
  List,
} from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { Link, useRouter } from "@/router/HashRouter";
import {
  listConnections,
  importFile,
  type BankConnection,
  type ImportFormat,
  type ImportResult,
} from "@/lib/api/finBankLink";
import { cn } from "@/lib/utils";

// ─── Local OFX preview parser ─────────────────────────────────────────────────
// Parses enough of OFX SGML to preview transactions (not for production accuracy)

interface PreviewRow {
  date: string;
  amount: number;
  description: string;
  reference: string;
}

function previewOFX(text: string): PreviewRow[] {
  const rows: PreviewRow[] = [];
  // Match <STMTTRN>...</STMTTRN> blocks
  const blockRx = /<STMTTRN>([\s\S]*?)<\/STMTTRN>|STMTTRN\s*([\s\S]*?)(?=STMTTRN|\z)/gi;
  const get = (block: string, tag: string): string => {
    const m = new RegExp(`<${tag}>([^<\n\r]*)`, "i").exec(block);
    return m ? m[1].trim() : "";
  };
  let m: RegExpExecArray | null;
  while ((m = blockRx.exec(text)) !== null && rows.length < 5) {
    const block = m[1] ?? m[2] ?? "";
    const dtraw = get(block, "DTPOSTED") || get(block, "DTUSER");
    const date = dtraw ? `${dtraw.slice(0, 4)}-${dtraw.slice(4, 6)}-${dtraw.slice(6, 8)}` : "—";
    const amtRaw = get(block, "TRNAMT");
    const amount = amtRaw ? parseFloat(amtRaw) : 0;
    const description = get(block, "MEMO") || get(block, "NAME") || "—";
    const reference = get(block, "FITID") || get(block, "REFNUM") || "—";
    if (date !== "—" || amount !== 0) {
      rows.push({ date, amount, description, reference });
    }
  }
  return rows;
}

function previewMT940(text: string): PreviewRow[] {
  const rows: PreviewRow[] = [];
  const lines = text.split(/\r?\n/);
  let currentDate = "";
  let i = 0;
  while (i < lines.length && rows.length < 5) {
    const line = lines[i];
    // :60F: or :62F: — opening/closing balance with date
    const balMatch = line.match(/^:6[02][FM]?:[CD](\d{6})/);
    if (balMatch) {
      currentDate = balMatch[1];
    }
    // :61: — statement line
    const txMatch = line.match(/^:61:(\d{6})(\d{4})?([CD])(\d+,\d*)/);
    if (txMatch) {
      const rawDate = txMatch[1];
      const y = `20${rawDate.slice(0, 2)}`;
      const mo = rawDate.slice(2, 4);
      const dy = rawDate.slice(4, 6);
      const date = `${y}-${mo}-${dy}`;
      const sign = txMatch[3] === "C" ? 1 : -1;
      const amount = sign * parseFloat(txMatch[4].replace(",", "."));
      // :86: follows immediately
      const desc = lines[i + 1]?.startsWith(":86:") ? lines[i + 1].replace(/^:86:/, "").trim() : "—";
      rows.push({ date, amount, description: desc, reference: currentDate || "—" });
    }
    i++;
  }
  return rows;
}

function detectFormat(file: File): ImportFormat {
  const name = file.name.toLowerCase();
  if (name.endsWith(".mt940") || name.endsWith(".sta")) return "MT940";
  return "OFX";
}

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat("ro-MD", {
    style: "currency",
    currency,
    signDisplay: "always",
  }).format(amount);
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BankLinkImportPage() {
  const { navigate, path } = useRouter();

  // Pre-select connectionId from URL param
  const searchConnectionId = new URLSearchParams(
    path.includes("?") ? path.split("?")[1] : ""
  ).get("connectionId") ?? "";

  const [connections, setConnections] = useState<BankConnection[]>([]);
  const [loadingConns, setLoadingConns] = useState(true);
  const [selectedConn, setSelectedConn] = useState(searchConnectionId);
  const [format, setFormat] = useState<ImportFormat>("OFX");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listConnections()
      .then(({ connections: data }) => {
        setConnections(data);
        if (!selectedConn && data.length > 0) setSelectedConn(data[0].id);
      })
      .catch(() => {})
      .finally(() => setLoadingConns(false));
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setSelectedFile(file);
      setResult(null);
      setParseError(null);
      const fmt = detectFormat(file);
      setFormat(fmt);

      try {
        const text = await file.text();
        setFileContent(text);
        const rows = fmt === "MT940" ? previewMT940(text) : previewOFX(text);
        setPreview(rows);
        if (rows.length === 0) {
          setParseError(
            "Nicio tranzacție detectată în previzualizare. Verifică formatul fișierului."
          );
        }
      } catch {
        setParseError("Fișierul nu a putut fi citit. Verifică formatul.");
      }
    },
    []
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  async function handleImport() {
    if (!selectedConn || !fileContent) return;
    setUploading(true);
    try {
      const res = await importFile({ connectionId: selectedConn, format, content: fileContent });
      setResult(res);
      setPreview(null);
      setSelectedFile(null);
      setFileContent("");
    } catch {
      setParseError("Eroare la import. Verifică conexiunea și reîncercă.");
    } finally {
      setUploading(false);
    }
  }

  const conn = connections.find((c) => c.id === selectedConn);

  return (
    <BusinessShell pageTitle="Import extras bancar">
      {/* Back */}
      <div className="mb-4">
        <Link
          to="/business/fin/banklink"
          className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Conexiuni bancare
        </Link>
      </div>

      <h1 className="mb-6 text-xl font-semibold text-foreground">Import extras bancar</h1>

      {loadingConns && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Se încarcă conexiunile...
        </div>
      )}

      {!loadingConns && connections.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Nu ai conexiuni active.{" "}
            <Link to="/business/fin/banklink" className="text-primary underline">
              Adaugă una
            </Link>{" "}
            mai întâi.
          </p>
        </div>
      )}

      {!loadingConns && connections.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* ─── Left: config + dropzone ─────────────────────────────── */}
          <div className="space-y-5">
            {/* Selector conexiune */}
            <div>
              <label htmlFor="imp-conn" className="mb-1 block text-sm font-medium text-foreground">
                Conexiune bancară
              </label>
              <select
                id="imp-conn"
                value={selectedConn}
                onChange={(e) => setSelectedConn(e.target.value)}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.bankCode ?? "—"})
                  </option>
                ))}
              </select>
            </div>

            {/* Selector format */}
            <div>
              <label htmlFor="imp-format" className="mb-1 block text-sm font-medium text-foreground">
                Format fișier
              </label>
              <select
                id="imp-format"
                value={format}
                onChange={(e) => setFormat(e.target.value as ImportFormat)}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="OFX">OFX — Open Financial Exchange</option>
                <option value="MT940">MT940 — SWIFT Statement</option>
              </select>
            </div>

            {/* Drop zone */}
            <div>
              <p className="mb-1 text-sm font-medium text-foreground">Fișier extras bancar</p>
              <div
                className={cn(
                  "flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition-colors",
                  dragging
                    ? "border-primary bg-primary/5"
                    : "border-border bg-muted/30 hover:border-primary/50 hover:bg-primary/5"
                )}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                aria-label="Zonă drag&drop fișier extras bancar"
                onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
              >
                <Upload className="h-8 w-8 text-muted-foreground" />
                {selectedFile ? (
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="font-medium text-foreground">{selectedFile.name}</span>
                    <span className="text-muted-foreground">
                      ({(selectedFile.size / 1024).toFixed(1)} KB)
                    </span>
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-medium text-foreground">
                      Trage fișierul aici sau dă click
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Acceptat: .ofx, .mt940, .sta, .txt (max 5 MB)
                    </p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".ofx,.mt940,.sta,.txt"
                className="sr-only"
                aria-label="Selectare fișier extras bancar"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </div>

            {/* Parse error */}
            {parseError && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                {parseError}
              </div>
            )}

            {/* Import button */}
            {preview && preview.length > 0 && !result && (
              <button
                onClick={handleImport}
                disabled={uploading || !selectedConn}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Se importă...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Importă {preview.length} tranzacții (previzualizate)
                  </>
                )}
              </button>
            )}
          </div>

          {/* ─── Right: preview / result ──────────────────────────────── */}
          <div>
            {/* Preview */}
            {preview && preview.length > 0 && !result && (
              <div>
                <p className="mb-2 text-sm font-medium text-foreground">
                  Previzualizare (primele {preview.length} tranzacții)
                </p>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Dată</th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">Sumă</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Descriere</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Ref.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((row, i) => (
                        <tr key={i} className="border-b border-border last:border-0">
                          <td className="whitespace-nowrap px-3 py-2 font-mono text-foreground">
                            {row.date}
                          </td>
                          <td
                            className={cn(
                              "whitespace-nowrap px-3 py-2 text-right font-mono font-medium",
                              row.amount >= 0
                                ? "text-green-600 dark:text-green-400"
                                : "text-destructive"
                            )}
                          >
                            {formatAmount(row.amount, conn?.currency ?? "MDL")}
                          </td>
                          <td className="max-w-[120px] truncate px-3 py-2 text-foreground">
                            {row.description}
                          </td>
                          <td className="max-w-[80px] truncate px-3 py-2 font-mono text-muted-foreground">
                            {row.reference}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Previzualizare locală — fișierul real poate conține mai multe tranzacții.
                </p>
              </div>
            )}

            {/* Result */}
            {result && (
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="mb-4 flex items-center gap-3">
                  <CheckCircle2 className="h-8 w-8 text-green-500" />
                  <div>
                    <p className="font-semibold text-foreground">Import finalizat</p>
                    <p className="text-sm text-muted-foreground">
                      {result.total} rânduri procesate
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 rounded-lg bg-muted/50 p-3 text-center">
                  <div>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {result.imported}
                    </p>
                    <p className="text-xs text-muted-foreground">Importate</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-muted-foreground">{result.duplicates}</p>
                    <p className="text-xs text-muted-foreground">Duplicate</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-destructive">{result.errors.length}</p>
                    <p className="text-xs text-muted-foreground">Erori</p>
                  </div>
                </div>
                {result.errors.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs text-destructive">
                    {result.errors.map((e, i) => (
                      <li key={i} className="flex items-start gap-1">
                        <XCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                        {e}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => setResult(null)}
                    className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-input text-sm hover:bg-muted"
                  >
                    <Upload className="h-4 w-4" />
                    Alt import
                  </button>
                  <Link
                    to={`/app/fin/banklink/transactions?connectionId=${selectedConn}`}
                    className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    <List className="h-4 w-4" />
                    Mergi la tranzacții
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </BusinessShell>
  );
}
