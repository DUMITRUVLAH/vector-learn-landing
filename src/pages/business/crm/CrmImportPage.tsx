/**
 * CRM — importul de lead-uri dintr-un fișier.
 *
 * Trei pași, în ordinea în care gândește omul: aduc fișierul → confirm ce
 * înseamnă coloanele → văd ce se va întâmpla și abia apoi apăs.
 *
 * Regula pe care se sprijină tot ecranul: NIMIC nu se scrie până la ultimul
 * buton, iar ce scrie butonul e exact numărul pe care omul tocmai l-a citit.
 * Previzualizarea vine de la server, din aceeași funcție care face și importul,
 * deci nu poate „promite" altceva decât se scrie.
 *
 * Fișierul se citește local doar ca text și se trimite ca text — nu parsăm în
 * browser, ca să nu existe două păreri despre același fișier.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, Loader2, History, Save, Trash2 } from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { CaptureSourcesPanel } from "@/components/crm/CaptureSourcesPanel";
import { listCrmPipelines, type CrmPipeline } from "@/lib/api/crm";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Input,
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
  previewCrmImport,
  runCrmImport,
  listCrmImportJobs,
  listCrmImportMappings,
  saveCrmImportMapping,
  deleteCrmImportMapping,
  IMPORT_TARGET_FIELDS,
  IMPORT_TARGET_LABELS,
  COMPANY_SCOPED_FIELDS,
  DUPLICATE_LABELS,
  type FieldMapping,
  type ImportTargetField,
  type ImportPreviewResponse,
  type ImportRunResponse,
  type CrmImportJob,
  type CrmImportMapping,
} from "@/lib/api/crmImport";

/** Plafonul serverului, repetat aici ca omul să afle ÎNAINTE de a aștepta un upload inutil. */
const MAX_TEXT_BYTES = 2_000_000;

type Step = "sursa" | "mapare" | "verificare";

function money(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

function errText(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function CrmImportPage() {
  /** Pâlniile: formularul poate trimite leadurile într-una anume. */
  const [pipelines, setPipelines] = useState<CrmPipeline[]>([]);
  useEffect(() => {
    listCrmPipelines()
      .then((res) => setPipelines(res.items))
      .catch(() => setPipelines([]));
  }, []);
  const [step, setStep] = useState<Step>("sursa");
  const [text, setText] = useState("");
  /** „text" = CSV sau text lipit; „xlsx" = registru Excel trimis ca base64. */
  const [format, setFormat] = useState<"text" | "xlsx">("text");
  const [fileName, setFileName] = useState<string | null>(null);
  const [mapping, setMapping] = useState<FieldMapping | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ImportRunResponse | null>(null);

  const [jobs, setJobs] = useState<CrmImportJob[]>([]);
  const [savedMappings, setSavedMappings] = useState<CrmImportMapping[]>([]);
  const [mappingName, setMappingName] = useState("");

  const fileInput = useRef<HTMLInputElement>(null);

  const reloadSideData = useCallback(async () => {
    const [j, m] = await Promise.allSettled([listCrmImportJobs(), listCrmImportMappings()]);
    if (j.status === "fulfilled") setJobs(j.value.items);
    if (m.status === "fulfilled") setSavedMappings(m.value.items);
  }, []);

  useEffect(() => {
    void reloadSideData();
  }, [reloadSideData]);

  /** Cere serverului verdictul pentru textul curent. `nextMapping === null` = propune tu. */
  const refreshPreview = useCallback(
    async (nextMapping: FieldMapping | null) => {
      if (!text.trim()) return;
      setLoading(true);
      setError(null);
      try {
        const res = await previewCrmImport({ text, format, mapping: nextMapping });
        setPreview(res);
        setMapping(res.mapping);
      } catch (err) {
        setError(errText(err, "Nu am putut citi fișierul."));
      } finally {
        setLoading(false);
      }
    },
    [text, format]
  );

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_TEXT_BYTES) {
      setError("Fișierul e prea mare pentru un singur import. Împarte-l în bucăți mai mici.");
      return;
    }

    const isWorkbook = /\.xlsx?$/i.test(file.name);
    if (isWorkbook) {
      // Registrul pleacă la server ca base64: browserul NU parsează Excel. O bibliotecă de
      // ~800 KB în bundle, pentru o funcție folosită o dată pe lună, s-ar plăti la fiecare
      // încărcare a aplicației, de toată lumea.
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      // Pe bucăți: `String.fromCharCode(...bytes)` cu un fișier de 1 MB depășește limita de
      // argumente a funcției și aruncă „Maximum call stack size exceeded".
      for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      }
      setFormat("xlsx");
      setText(btoa(binary));
    } else {
      setFormat("text");
      setText(await file.text());
    }
    setFileName(file.name);
    setError(null);
  }

  async function goToMapping() {
    await refreshPreview(null);
    setStep("mapare");
  }

  function changeColumn(index: number, field: ImportTargetField) {
    const next: FieldMapping = { ...(mapping ?? {}), [index]: field };
    setMapping(next);
    void refreshPreview(next);
  }

  async function doImport() {
    setRunning(true);
    setError(null);
    try {
      const res = await runCrmImport({ text, format, mapping, fileName, skipDuplicates });
      setResult(res);
      await reloadSideData();
    } catch (err) {
      setError(errText(err, "Importul nu a reușit."));
    } finally {
      setRunning(false);
    }
  }

  function startOver() {
    setStep("sursa");
    setText("");
    setFileName(null);
    setMapping(null);
    setPreview(null);
    setResult(null);
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function onSaveMapping() {
    if (!mapping || !mappingName.trim()) return;
    try {
      await saveCrmImportMapping({ name: mappingName.trim(), mapping });
      setMappingName("");
      await reloadSideData();
    } catch (err) {
      setError(errText(err, "Nu am putut salva maparea."));
    }
  }

  const counts = preview?.counts;
  /**
   * Câte rânduri chiar se vor scrie. Numărul vine de la SERVER, calculat cu
   * exact filtrul pe care-l aplică importul — nu-l recalculăm aici, fiindcă
   * două formule „echivalente" se pot despărți tăcut, iar butonul ar promite
   * altceva decât se scrie.
   */
  const willImport = useMemo(() => {
    if (!preview) return 0;
    return skipDuplicates ? preview.counts.importableNew : preview.counts.importableAll;
  }, [preview, skipDuplicates]);

  return (
    <BusinessShell
      pageTitle="Import lead-uri"
      pageDescription="Adu o listă din Excel sau din alt CRM. Nimic nu se scrie până nu confirmi ce vezi."
    >
      <div className="space-y-6">
        <ol className="flex flex-wrap items-center gap-2 text-sm" aria-label="Pașii importului">
          {(
            [
              ["sursa", "1. Fișierul"],
              ["mapare", "2. Coloanele"],
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

        {/* ── Pasul 1: fișierul ─────────────────────────────────────────── */}
        {step === "sursa" && (
          <Card className="space-y-4 p-6">
            <div className="space-y-2">
              <Label htmlFor="imp-fisier">Fișier CSV</Label>
              <input
                id="imp-fisier"
                ref={fileInput}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium"
                onChange={(e) => void onPickFile(e.target.files?.[0])}
              />
              <p className="text-xs text-muted-foreground">
                Din Excel: „Salvează ca” → CSV. Merg și fișierele cu punct-și-virgulă, cum le dă Excel-ul în română.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="imp-text">Sau lipește direct tabelul</Label>
              <Textarea
                id="imp-text"
                rows={8}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setFileName(null);
                }}
                placeholder={"Nume,Telefon,Email\nIon Popescu,069391979,ion@exemplu.md"}
              />
            </div>

            <div className="flex items-center gap-3">
              <Button onClick={() => void goToMapping()} disabled={!text.trim() || loading}>
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Upload className="h-4 w-4" aria-hidden="true" />
                )}
                Citește fișierul
              </Button>
              {fileName && (
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                  {fileName}
                </span>
              )}
            </div>
          </Card>
        )}

        {/* ── Pasul 2: coloanele ────────────────────────────────────────── */}
        {step === "mapare" && preview && (
          <Card className="space-y-4 p-6">
            <div>
              <h2 className="text-lg font-semibold">Ce înseamnă fiecare coloană</h2>
              <p className="text-sm text-muted-foreground">
                Am ghicit din antet. Verifică și corectează — restul importului se bazează pe asta.
              </p>
            </div>

            {savedMappings.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">Mapări salvate:</span>
                {savedMappings.map((m) => (
                  <span key={m.id} className="flex items-center gap-1">
                    <Button variant="outline" size="sm" onClick={() => void refreshPreview(m.mapping)}>
                      {m.name}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Șterge maparea ${m.name}`}
                      onClick={async () => {
                        await deleteCrmImportMapping(m.id);
                        await reloadSideData();
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </span>
                ))}
              </div>
            )}

            <div className="overflow-x-auto">
              <Table aria-label="Maparea coloanelor">
                <TableHeader>
                  <TableRow>
                    <TableHead>Coloana din fișier</TableHead>
                    <TableHead>Primul rând</TableHead>
                    <TableHead>Se importă ca</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.headers.map((header, i) => {
                    const chosen = (mapping?.[i] ?? "ignore") as ImportTargetField;
                    const onCompany = COMPANY_SCOPED_FIELDS.includes(chosen);
                    return (
                      <TableRow key={`${header}-${i}`}>
                        <TableCell className="font-medium">{header || `Coloana ${i + 1}`}</TableCell>
                        <TableCell className="max-w-[16rem] truncate text-muted-foreground">
                          {String(preview.rows[0]?.draft?.[chosen] ?? "") || "—"}
                        </TableCell>
                        <TableCell>
                          <Select
                            aria-label={`Câmpul pentru coloana ${header || i + 1}`}
                            value={chosen}
                            onChange={(e) => changeColumn(i, e.target.value as ImportTargetField)}
                          >
                            {IMPORT_TARGET_FIELDS.map((f) => (
                              <option key={f} value={f}>
                                {IMPORT_TARGET_LABELS[f]}
                              </option>
                            ))}
                          </Select>
                          {onCompany && (
                            <p className="mt-1 text-xs text-muted-foreground">Se salvează pe fișa firmei.</p>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="imp-nume-mapare">Salvează maparea pentru data viitoare</Label>
                <Input
                  id="imp-nume-mapare"
                  value={mappingName}
                  onChange={(e) => setMappingName(e.target.value)}
                  placeholder="Export din CRM-ul vechi"
                />
              </div>
              <Button variant="outline" onClick={() => void onSaveMapping()} disabled={!mappingName.trim()}>
                <Save className="h-4 w-4" aria-hidden="true" />
                Salvează
              </Button>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("sursa")}>
                Înapoi
              </Button>
              <Button onClick={() => setStep("verificare")} disabled={loading}>
                Vezi ce se va importa
              </Button>
            </div>
          </Card>
        )}

        {/* ── Pasul 3: verificarea ──────────────────────────────────────── */}
        {step === "verificare" && preview && counts && !result && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card className="p-4">
                <p className="text-sm text-muted-foreground">Rânduri în fișier</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{counts.total}</p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-muted-foreground">Se vor importa</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-600">{willImport}</p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-muted-foreground">Există deja</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{counts.duplicatesInDb + counts.duplicatesInFile}</p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-muted-foreground">Cu probleme</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-amber-600">{counts.errors}</p>
              </Card>
            </div>

            <Checkbox
              checked={skipDuplicates}
              onChange={setSkipDuplicates}
              label="Sari peste cele care există deja (recomandat — altfel baza se dublează)"
            />

            {preview.truncated && (
              <Alert>
                Tabelul de mai jos arată primele {preview.rows.length} rânduri. Numărătorile de sus sunt pe tot fișierul.
              </Alert>
            )}

            <div className="overflow-x-auto">
              <Table aria-label="Ce se va importa">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Nume</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Firmă</TableHead>
                    <TableHead>Etapă</TableHead>
                    <TableHead>Responsabil</TableHead>
                    <TableHead className="text-right">Valoare</TableHead>
                    <TableHead>Stare</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.map((row) => (
                    <TableRow key={row.rowNumber}>
                      <TableCell className="text-muted-foreground tabular-nums">{row.rowNumber}</TableCell>
                      <TableCell className="font-medium">{row.draft.full_name || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.draft.phone || row.draft.email || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{row.resolved.companyName || "—"}</TableCell>
                      <TableCell>{row.resolved.stageLabel}</TableCell>
                      <TableCell className="text-muted-foreground">{row.resolved.assignedToName || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(row.draft.value_cents)}</TableCell>
                      <TableCell>
                        {row.errors.length > 0 ? (
                          <span className="flex items-center gap-1 text-sm text-destructive">
                            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                            {row.errors.join(" ")}
                          </span>
                        ) : (
                          <div className="space-y-1">
                            <Badge variant={row.status === "new" ? "default" : "secondary"}>
                              {DUPLICATE_LABELS[row.status]}
                            </Badge>
                            {row.warnings.map((w) => (
                              <p key={w} className="text-xs text-amber-600">
                                {w}
                              </p>
                            ))}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("mapare")}>
                Înapoi la coloane
              </Button>
              <Button onClick={() => void doImport()} disabled={running || willImport === 0}>
                {running && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Importă {willImport} lead-uri
              </Button>
            </div>
          </div>
        )}

        {/* ── Rezultatul ────────────────────────────────────────────────── */}
        {result && (
          <Card className="space-y-4 p-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              <h2 className="text-lg font-semibold">
                Am importat {result.created} {result.created === 1 ? "lead" : "lead-uri"}
              </h2>
            </div>
            {result.skipped > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{result.skipped} rânduri au fost sărite:</p>
                <ul className="space-y-1 text-sm">
                  {result.details.slice(0, 20).map((d) => (
                    <li key={d.rowNumber} className="text-muted-foreground">
                      Rândul {d.rowNumber}: {d.reason}
                    </li>
                  ))}
                </ul>
                {result.details.length > 20 && (
                  <p className="text-xs text-muted-foreground">…și încă {result.details.length - 20}.</p>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={startOver}>Importă alt fișier</Button>
              <Button variant="outline" onClick={() => (window.location.hash = "#/business/crm/pipeline")}>
                Vezi pâlnia
              </Button>
            </div>
          </Card>
        )}

        {/* ── Istoricul ─────────────────────────────────────────────────── */}
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <History className="h-4 w-4" aria-hidden="true" />
            Importuri anterioare
          </h2>
          {jobs.length === 0 ? (
            <EmptyState
              icon={<History className="h-6 w-6" />}
              title="Niciun import până acum"
              description="Aici apare cine a importat ce fișier și cu ce rezultat."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table aria-label="Istoricul importurilor">
                <TableHeader>
                  <TableRow>
                    <TableHead>Fișier</TableHead>
                    <TableHead>Cine</TableHead>
                    <TableHead className="text-right">Rânduri</TableHead>
                    <TableHead className="text-right">Importate</TableHead>
                    <TableHead className="text-right">Sărite</TableHead>
                    <TableHead>Când</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((j) => (
                    <TableRow key={j.id}>
                      <TableCell className="font-medium">{j.fileName || "(text lipit)"}</TableCell>
                      <TableCell className="text-muted-foreground">{j.createdByName || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{j.totalRows}</TableCell>
                      <TableCell className="text-right tabular-nums">{j.createdCount}</TableCell>
                      <TableCell className="text-right tabular-nums">{j.duplicateCount + j.errorCount}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(j.createdAt).toLocaleString("ro-MD")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        {/* Formularele de pe site stau AICI, nu într-un ecran propriu: cine intră pe „Import" vrea
            să aducă leaduri în sistem. Fișierul e calea manuală, formularul e cea automată. */}
        <section className="border-t border-border pt-6">
          <CaptureSourcesPanel
            pipelines={pipelines}
            onToast={(t) => {
              // Pagina n-are toast propriu; eroarea intră în aceeași bandă ca restul ecranului,
              // iar succesul se vede oricum în listă (formularul apare cu codul deschis).
              if (t.kind === "error") setError(t.message);
            }}
          />
        </section>
      </div>
    </BusinessShell>
  );
}
