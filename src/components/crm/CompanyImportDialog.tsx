/**
 * Importul de firme din CSV sau Excel, deschis din pagina „Clienți & firme".
 *
 * Trei pași, ca la importul de lead-uri: aduc fișierul → spun ce înseamnă coloanele → văd ce se
 * va întâmpla și abia apoi apăs. Nimic nu se scrie până la ultimul buton, iar numărul de pe buton
 * vine de la server, din aceeași funcție care face importul.
 *
 * Flexibil, fiindcă listele reale de clienți nu seamănă între ele: se alege foaia, rândul cu
 * antetele (exporturile au titluri deasupra), orice coloană poate merge în Notițe, iar pentru
 * firmele care există deja omul alege: sari / completează golurile / rescrie.
 */
import { useCallback, useRef, useState } from "react";
import { CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  Label,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "@/components/ds";
import {
  COMPANY_IMPORT_LABELS,
  COMPANY_IMPORT_TARGETS,
  previewCrmCompanyImport,
  runCrmCompanyImport,
  type CompanyExistingMode,
  type CompanyFieldMapping,
  type CompanyImportPreview,
  type CompanyImportResult,
  type CompanyImportStatus,
  type CompanyImportTarget,
} from "@/lib/api/crmCompanies";

/** Plafonul serverului, repetat aici ca omul să afle ÎNAINTE de un upload inutil. */
const MAX_BYTES = 2_000_000;

type Step = "fisier" | "coloane" | "verificare";

const STATUS_LABELS: Record<CompanyImportStatus, string> = {
  new: "Nouă",
  exists: "Există deja",
  duplicate_in_file: "Repetată în fișier",
  error: "Eroare",
};

const STATUS_VARIANT: Record<CompanyImportStatus, "success" | "secondary" | "warning" | "destructive"> = {
  new: "success",
  exists: "secondary",
  duplicate_in_file: "warning",
  error: "destructive",
};

const EXISTING_MODES: { value: CompanyExistingMode; label: string; hint: string }[] = [
  { value: "fill", label: "Completează doar ce lipsește", hint: "Ce ai scris deja pe fișă rămâne neatins." },
  { value: "skip", label: "Sari peste ele", hint: "Fișele existente nu se schimbă deloc." },
  { value: "overwrite", label: "Rescrie cu datele din fișier", hint: "O celulă goală nu șterge nimic; numele nu se schimbă." },
];

function errText(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/** Registrul pleacă la server ca base64 — browserul nu parsează Excel (≈800 KB de bibliotecă). */
async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  // Pe bucăți: `String.fromCharCode(...bytes)` cu 1 MB depășește limita de argumente.
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

export interface CompanyImportDialogProps {
  onClose: () => void;
  /** După un import reușit — pagina își reîncarcă lista. */
  onImported: () => void | Promise<void>;
}

export function CompanyImportDialog({ onClose, onImported }: CompanyImportDialogProps) {
  const [step, setStep] = useState<Step>("fisier");
  const [text, setText] = useState("");
  const [format, setFormat] = useState<"text" | "xlsx">("text");
  const [fileName, setFileName] = useState<string | null>(null);
  const [sheet, setSheet] = useState(0);
  const [headerRow, setHeaderRow] = useState(1);
  const [mapping, setMapping] = useState<CompanyFieldMapping | null>(null);
  const [existingMode, setExistingMode] = useState<CompanyExistingMode>("fill");
  const [preview, setPreview] = useState<CompanyImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompanyImportResult | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  /** Cere serverului verdictul. `nextMapping === null` = propune tu din antet. */
  const refresh = useCallback(
    async (opts: { mapping: CompanyFieldMapping | null; sheet?: number; headerRow?: number }) => {
      if (!text.trim()) return false;
      setLoading(true);
      setError(null);
      try {
        const res = await previewCrmCompanyImport({
          text,
          format,
          sheet: opts.sheet ?? sheet,
          headerRow: opts.headerRow ?? headerRow,
          mapping: opts.mapping,
        });
        setPreview(res);
        setMapping(res.mapping);
        return true;
      } catch (err) {
        setError(errText(err, "Nu am putut citi fișierul."));
        return false;
      } finally {
        setLoading(false);
      }
    },
    [text, format, sheet, headerRow]
  );

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError("Fișierul e prea mare pentru un singur import (maxim 2 MB). Împarte-l în bucăți mai mici.");
      return;
    }
    if (/\.xlsx?$/i.test(file.name)) {
      setFormat("xlsx");
      setText(await fileToBase64(file));
    } else {
      setFormat("text");
      setText(await file.text());
    }
    setFileName(file.name);
    setSheet(0);
    setHeaderRow(1);
    setError(null);
  }

  async function goToColumns() {
    if (await refresh({ mapping: null })) setStep("coloane");
  }

  function changeColumn(index: number, target: CompanyImportTarget) {
    // Un câmp dedicat primește o singură coloană: alegerea nouă o eliberează pe cea veche,
    // altfel serverul ar lua în tăcere prima coloană și omul n-ar înțelege de ce.
    const next: CompanyFieldMapping = { ...(mapping ?? {}) };
    if (target !== "notes" && target !== "ignore") {
      for (const [k, v] of Object.entries(next)) if (v === target) next[Number(k)] = "ignore";
    }
    next[index] = target;
    setMapping(next);
    void refresh({ mapping: next });
  }

  async function doImport() {
    setRunning(true);
    setError(null);
    try {
      const res = await runCrmCompanyImport({ text, format, sheet, headerRow, mapping, existingMode, fileName });
      setResult(res);
      await onImported();
    } catch (err) {
      setError(errText(err, "Importul nu a reușit."));
    } finally {
      setRunning(false);
    }
  }

  const counts = preview?.counts;
  const hasName = mapping ? Object.values(mapping).includes("name") : false;
  const willCreate = counts?.new ?? 0;
  const willTouch = existingMode === "skip" ? 0 : (counts?.exists ?? 0);

  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      title="Importă firme"
      description="Din Excel (.xlsx), CSV sau un tabel lipit. Nimic nu se scrie până nu confirmi."
    >
      <div className="space-y-5">
        <ol className="flex flex-wrap items-center gap-2 text-sm" aria-label="Pașii importului">
          {(
            [
              ["fisier", "1. Fișierul"],
              ["coloane", "2. Coloanele"],
              ["verificare", "3. Verificare"],
            ] as [Step, string][]
          ).map(([key, label]) => (
            <li
              key={key}
              className={
                step === key
                  ? "rounded-full bg-primary px-3 py-1 font-medium text-primary-foreground"
                  : "rounded-full bg-muted px-3 py-1 text-muted-foreground"
              }
              aria-current={step === key ? "step" : undefined}
            >
              {label}
            </li>
          ))}
        </ol>

        {error && <Alert variant="destructive">{error}</Alert>}

        {result ? (
          <div className="space-y-4">
            <Alert variant="success" icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />} title="Import terminat">
              {result.created} {result.created === 1 ? "firmă nouă" : "firme noi"}
              {result.updated > 0 && `, ${result.updated} completate`}
              {result.unchanged > 0 && `, ${result.unchanged} existente neschimbate`}
              {result.skipped > 0 && `, ${result.skipped} rânduri sărite`}.
            </Alert>
            {result.details.length > 0 && (
              <div className="space-y-1 text-sm">
                <p className="font-medium">Rânduri care n-au intrat:</p>
                <ul className="max-h-40 space-y-0.5 overflow-y-auto text-muted-foreground">
                  {result.details.map((d) => (
                    <li key={d.rowNumber}>
                      Rândul {d.rowNumber}: {d.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end">
              <Button onClick={onClose}>Gata</Button>
            </div>
          </div>
        ) : step === "fisier" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="firme-imp-fisier">Fișier Excel sau CSV</Label>
              <input
                id="firme-imp-fisier"
                ref={fileInput}
                type="file"
                accept=".csv,.xlsx,.xls,.txt,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium"
                onChange={(e) => void onPickFile(e.target.files?.[0])}
              />
              <p className="text-xs text-muted-foreground">
                Merg .xlsx direct, CSV cu virgulă sau punct-și-virgulă (cum le dă Excel-ul în română), maxim 5.000 de rânduri.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="firme-imp-text">Sau lipește tabelul (copiat din Excel sau Google Sheets)</Label>
              <Textarea
                id="firme-imp-text"
                rows={6}
                value={format === "text" ? text : ""}
                disabled={format === "xlsx"}
                onChange={(e) => {
                  setFormat("text");
                  setText(e.target.value);
                  setFileName(null);
                }}
                placeholder={"Denumire\tCod fiscal\tTelefon\nAlfa SRL\t1003600012345\t069123456"}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              {fileName ? (
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                  {fileName}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setText("");
                      setFileName(null);
                      setFormat("text");
                      if (fileInput.current) fileInput.current.value = "";
                    }}
                  >
                    Schimbă
                  </Button>
                </span>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>
                  Renunță
                </Button>
                <Button onClick={() => void goToColumns()} disabled={!text.trim() || loading}>
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Upload className="h-4 w-4" aria-hidden="true" />
                  )}
                  Citește fișierul
                </Button>
              </div>
            </div>
          </div>
        ) : step === "coloane" && preview ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {preview.sheetNames.length > 1 && (
                <div className="space-y-1">
                  <Label htmlFor="firme-imp-foaie">Foaia din registru</Label>
                  <Select
                    id="firme-imp-foaie"
                    value={String(sheet)}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setSheet(next);
                      setHeaderRow(1);
                      void refresh({ mapping: null, sheet: next, headerRow: 1 });
                    }}
                  >
                    {preview.sheetNames.map((name, i) => (
                      <option key={`${name}-${i}`} value={i}>
                        {name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="firme-imp-antet">Rândul cu numele coloanelor</Label>
                <Select
                  id="firme-imp-antet"
                  value={String(headerRow)}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setHeaderRow(next);
                    // Alt antet = alte coloane: maparea veche nu mai înseamnă nimic, o propunem din nou.
                    void refresh({ mapping: null, headerRow: next });
                  }}
                >
                  {preview.topRows.map((row, i) => (
                    <option key={i} value={i + 1}>
                      Rândul {i + 1}: {row.filter(Boolean).slice(0, 4).join(" · ").slice(0, 70) || "(gol)"}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div>
              <h3 className="text-base font-medium">Ce înseamnă fiecare coloană</h3>
              <p className="text-sm text-muted-foreground">
                Am ghicit din antet — corectează unde nu se potrivește. Coloanele fără loc dedicat (administrator,
                contabil, observații) pot merge toate în Notițe, fiecare cu numele ei.
              </p>
            </div>

            <div className="max-h-[50vh] overflow-auto rounded-md border border-border">
              <Table aria-label="Maparea coloanelor">
                <TableHeader>
                  <TableRow>
                    <TableHead>Coloana din fișier</TableHead>
                    <TableHead>Exemple</TableHead>
                    <TableHead className="min-w-56">Se importă ca</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.headers.map((header, i) => {
                    const samples = preview.sampleRows.map((r) => r[i] ?? "").filter(Boolean);
                    return (
                      <TableRow key={`${header}-${i}`}>
                        <TableCell className="font-medium">{header}</TableCell>
                        <TableCell className="max-w-64 truncate text-muted-foreground" title={samples.join(" · ")}>
                          {samples.join(" · ") || "—"}
                        </TableCell>
                        <TableCell>
                          <Select
                            aria-label={`Ce este coloana ${header}`}
                            value={mapping?.[i] ?? "ignore"}
                            onChange={(e) => changeColumn(i, e.target.value as CompanyImportTarget)}
                          >
                            {COMPANY_IMPORT_TARGETS.map((t) => (
                              <option key={t} value={t}>
                                {COMPANY_IMPORT_LABELS[t]}
                              </option>
                            ))}
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {!hasName && (
              <Alert variant="warning">Alege coloana cu denumirea firmei — fără ea nu se poate importa nimic.</Alert>
            )}

            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep("fisier")}>
                Înapoi
              </Button>
              <Button onClick={() => setStep("verificare")} disabled={!hasName || loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Mai departe
              </Button>
            </div>
          </div>
        ) : step === "verificare" && preview && counts ? (
          <div className="space-y-4">
            <p className="text-sm">
              <strong>{counts.total}</strong> rânduri citite: <strong>{counts.new}</strong> firme noi,{" "}
              <strong>{counts.exists}</strong> există deja
              {counts.duplicatesInFile > 0 && (
                <>
                  , <strong>{counts.duplicatesInFile}</strong> repetate în fișier (se ia primul rând)
                </>
              )}
              {counts.errors > 0 && (
                <>
                  , <strong>{counts.errors}</strong> cu erori (se sar)
                </>
              )}
              .
            </p>

            {counts.exists > 0 && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">
                  Ce fac cu cele {counts.exists} firme care există deja (același cod fiscal sau, fără cod, același nume)?
                </legend>
                {EXISTING_MODES.map((m) => (
                  <label key={m.value} className="flex items-start gap-2 rounded-md border border-border p-3 text-sm">
                    <input
                      type="radio"
                      name="firme-existente"
                      className="mt-1"
                      checked={existingMode === m.value}
                      onChange={() => setExistingMode(m.value)}
                    />
                    <span>
                      <span className="font-medium">{m.label}</span>
                      <span className="block text-muted-foreground">{m.hint}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}

            <div className="max-h-[40vh] overflow-auto rounded-md border border-border">
              <Table aria-label="Previzualizarea importului">
                <TableHeader>
                  <TableRow>
                    <TableHead>Rând</TableHead>
                    <TableHead>Firmă</TableHead>
                    <TableHead>Cod fiscal</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Stare</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.map((r) => (
                    <TableRow key={r.draft.rowNumber}>
                      <TableCell className="tabular-nums text-muted-foreground">{r.draft.rowNumber}</TableCell>
                      <TableCell className="font-medium">{r.draft.name || "—"}</TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">{r.draft.idno || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{r.draft.phone || r.draft.email || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABELS[r.status]}</Badge>
                        {[...r.errors, ...r.warnings].length > 0 && (
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {[...r.errors, ...r.warnings].join(" ")}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {preview.truncated && (
              <p className="text-xs text-muted-foreground">
                Arătăm primele {preview.rows.length} rânduri; numerele de mai sus sunt pe tot fișierul.
              </p>
            )}

            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep("coloane")}>
                Înapoi
              </Button>
              <Button onClick={() => void doImport()} disabled={running || willCreate + willTouch === 0}>
                {running && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {willTouch > 0
                  ? `Importă ${willCreate} noi · actualizează ${willTouch}`
                  : `Importă ${willCreate} ${willCreate === 1 ? "firmă" : "firme"}`}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

