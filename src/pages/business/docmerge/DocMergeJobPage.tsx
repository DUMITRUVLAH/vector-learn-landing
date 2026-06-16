/**
 * DOCMERGE-002: Excel Import Wizard
 *
 * 3-step flow anchored at /business/docmerge/job
 * Step 1 — Upload .xlsx
 * Step 2 — Column mapping (placeholder → Excel column)
 * Step 3 — Row preview table (first 200 rows)
 *
 * Business Suite chrome via BusinessShell.
 * No hardcoded hex — Vector 365 tokens only.
 * All interactive elements have aria-labels and min 44px touch targets.
 */
import { useState, useCallback, useEffect } from "react";
import {
  Upload,
  ArrowRight,
  ArrowLeft,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Table2,
  FileSpreadsheet,
} from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import {
  listTemplates,
  parseExcel,
  autoMapColumns,
  type DocmergeTemplate,
  type ParsedExcelResult,
} from "@/lib/api/docmerge";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3;

// ─── Page ─────────────────────────────────────────────────────────────────────

export function DocMergeJobPage() {
  const [step, setStep] = useState<WizardStep>(1);

  // Step 1 state
  const [templates, setTemplates] = useState<DocmergeTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);

  // Step 2 state
  const [parsed, setParsed] = useState<ParsedExcelResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [selectedTemplate, setSelectedTemplate] = useState<DocmergeTemplate | null>(null);

  // Step 3 state — row preview (first 200 rows)

  // Load templates once
  const loadTemplates = useCallback(async () => {
    if (templates.length > 0) return;
    setTemplatesLoading(true);
    try {
      const list = await listTemplates();
      setTemplates(list);
    } catch {
      setUploadError("Eroare la încărcarea template-urilor.");
    } finally {
      setTemplatesLoading(false);
    }
  }, [templates.length]);

  // Eagerly load templates when component mounts
  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  // ── Step 1 handlers ─────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setUploadError(null);
    if (!f) { setExcelFile(null); return; }
    if (!f.name.toLowerCase().endsWith(".xlsx")) {
      setUploadError("Doar fișiere .xlsx sunt acceptate.");
      return;
    }
    setExcelFile(f);
  }

  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    const f = e.dataTransfer.files[0] ?? null;
    setUploadError(null);
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".xlsx")) {
      setUploadError("Doar fișiere .xlsx sunt acceptate.");
      return;
    }
    setExcelFile(f);
  }

  async function handleParse() {
    if (!excelFile) { setUploadError("Alege un fișier .xlsx."); return; }
    if (!selectedTemplateId) { setUploadError("Alege un template."); return; }

    setParsing(true);
    setUploadError(null);
    try {
      const result = await parseExcel(excelFile);
      setParsed(result);

      const tpl = templates.find((t) => t.id === selectedTemplateId) ?? null;
      setSelectedTemplate(tpl);

      // Auto-map columns
      if (tpl && result.headers.length > 0 && tpl.placeholders.length > 0) {
        try {
          const { mapping: auto } = await autoMapColumns(result.headers, tpl.placeholders);
          setMapping(auto);
        } catch {
          // non-critical — user can map manually
          setMapping({});
        }
      } else {
        setMapping({});
      }

      setStep(2);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Eroare la parsarea fișierului.";
      setUploadError(msg);
    } finally {
      setParsing(false);
    }
  }

  // ── Step 2 handlers ─────────────────────────────────────────────────────────

  function updateMapping(placeholder: string, column: string) {
    setMapping((prev) => ({ ...prev, [placeholder]: column }));
  }

  function handleProceedToPreview() {
    setStep(3);
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <BusinessShell
      pageTitle="Document Merge — Import Excel"
      pageDescription="Importă un fișier Excel, mapează coloanele la placeholdere și previzualizează documentele generate."
    >
      {/* Stepper */}
      <nav aria-label="Pași import Excel" className="mb-8">
        <ol className="flex items-center gap-0">
          {(["1. Încarcă Excel", "2. Mapare coloane", "3. Preview rânduri"] as const).map(
            (label, idx) => {
              const n = (idx + 1) as WizardStep;
              const active = step === n;
              const done = step > n;
              return (
                <li key={label} className="flex items-center flex-1">
                  <div className="flex flex-col items-center gap-1 flex-1">
                    <div
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors",
                        done
                          ? "bg-primary text-primary-foreground"
                          : active
                          ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background"
                          : "bg-muted text-muted-foreground"
                      )}
                      aria-current={active ? "step" : undefined}
                    >
                      {done ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : n}
                    </div>
                    <span
                      className={cn(
                        "text-xs font-medium hidden sm:block",
                        active ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {label}
                    </span>
                  </div>
                  {idx < 2 && (
                    <div
                      className={cn(
                        "h-0.5 flex-1 mx-2 rounded",
                        done ? "bg-primary" : "bg-border"
                      )}
                      aria-hidden="true"
                    />
                  )}
                </li>
              );
            }
          )}
        </ol>
      </nav>

      {/* Step 1 — Upload */}
      {step === 1 && (
        <Step1Upload
          templates={templates}
          templatesLoading={templatesLoading}
          selectedTemplateId={selectedTemplateId}
          excelFile={excelFile}
          uploadError={uploadError}
          parsing={parsing}
          onTemplateChange={setSelectedTemplateId}
          onFileChange={handleFileChange}
          onDrop={handleDrop}
          onParse={handleParse}
        />
      )}

      {/* Step 2 — Mapping */}
      {step === 2 && parsed && selectedTemplate && (
        <Step2Mapping
          parsed={parsed}
          template={selectedTemplate}
          mapping={mapping}
          onMappingChange={updateMapping}
          onBack={() => setStep(1)}
          onNext={handleProceedToPreview}
        />
      )}

      {/* Step 3 — Row Preview */}
      {step === 3 && parsed && selectedTemplate && (
        <Step3Preview
          parsed={parsed}
          template={selectedTemplate}
          mapping={mapping}
          onBack={() => setStep(2)}
        />
      )}
    </BusinessShell>
  );
}

// ─── Step 1: Upload ────────────────────────────────────────────────────────────

interface Step1Props {
  templates: DocmergeTemplate[];
  templatesLoading: boolean;
  selectedTemplateId: string;
  excelFile: File | null;
  uploadError: string | null;
  parsing: boolean;
  onTemplateChange: (id: string) => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: React.DragEvent<HTMLLabelElement>) => void;
  onParse: () => void;
}

function Step1Upload({
  templates,
  templatesLoading,
  selectedTemplateId,
  excelFile,
  uploadError,
  parsing,
  onTemplateChange,
  onFileChange,
  onDrop,
  onParse,
}: Step1Props) {
  return (
    <div className="max-w-xl mx-auto flex flex-col gap-6">
      {/* Template selector */}
      <div className="flex flex-col gap-2">
        <label htmlFor="template-select" className="text-sm font-medium text-foreground">
          Template de utilizat <span className="text-destructive" aria-hidden="true">*</span>
        </label>
        {templatesLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Se încarcă template-urile...
          </div>
        ) : (
          <select
            id="template-select"
            value={selectedTemplateId}
            onChange={(e) => onTemplateChange(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
          >
            <option value="">-- Alege un template --</option>
            {templates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name} ({tpl.placeholders.length} placeholdere)
              </option>
            ))}
          </select>
        )}
        {templates.length === 0 && !templatesLoading && (
          <p className="text-xs text-muted-foreground">
            Nu există template-uri. Creează unul în{" "}
            <a href="#/business/docmerge" className="text-primary underline">
              Document Merge → Templates
            </a>
            .
          </p>
        )}
      </div>

      {/* File dropzone */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">
          Fișier Excel (.xlsx) <span className="text-destructive" aria-hidden="true">*</span>
        </span>
        <label
          htmlFor="excel-upload"
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          className={cn(
            "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition-colors",
            excelFile
              ? "border-primary/60 bg-primary/5"
              : "border-border hover:border-primary/40 hover:bg-muted/30"
          )}
        >
          {excelFile ? (
            <>
              <FileSpreadsheet className="h-10 w-10 text-primary" aria-hidden="true" />
              <div>
                <p className="font-medium text-foreground text-sm">{excelFile.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {(excelFile.size / 1024).toFixed(1)} KB — apasă pentru a înlocui
                </p>
              </div>
            </>
          ) : (
            <>
              <Upload className="h-10 w-10 text-muted-foreground/60" aria-hidden="true" />
              <div>
                <p className="font-medium text-foreground text-sm">
                  Trage fișierul .xlsx aici sau apasă
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Maxim 5 000 rânduri de date
                </p>
              </div>
            </>
          )}
          <input
            id="excel-upload"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={onFileChange}
          />
        </label>
      </div>

      {uploadError && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {uploadError}
        </div>
      )}

      <button
        type="button"
        onClick={onParse}
        disabled={parsing || !excelFile || !selectedTemplateId}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-md px-6 py-3 text-sm font-semibold transition-colors min-h-[44px]",
          "bg-primary text-primary-foreground hover:bg-primary/90",
          (parsing || !excelFile || !selectedTemplateId) && "opacity-50 cursor-not-allowed"
        )}
      >
        {parsing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Se parsează...
          </>
        ) : (
          <>
            Continuă
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </>
        )}
      </button>
    </div>
  );
}

// ─── Step 2: Column Mapping ────────────────────────────────────────────────────

interface Step2Props {
  parsed: ParsedExcelResult;
  template: DocmergeTemplate;
  mapping: Record<string, string>;
  onMappingChange: (placeholder: string, column: string) => void;
  onBack: () => void;
  onNext: () => void;
}

function Step2Mapping({
  parsed,
  template,
  mapping,
  onMappingChange,
  onBack,
  onNext,
}: Step2Props) {
  const unmapped = template.placeholders.filter((ph) => !mapping[ph]);

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground mb-1">
          Coloane detectate în Excel: <strong className="text-foreground">{parsed.headers.length}</strong>
        </p>
        <p className="text-sm text-muted-foreground">
          Rânduri de date: <strong className="text-foreground">{parsed.rowCount}</strong>
        </p>
      </div>

      {template.placeholders.length === 0 ? (
        <div className="rounded-lg border border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          Template-ul nu are placeholdere — poate continua direct la preview.
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          <div className="px-4 py-3 flex items-center gap-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <span className="flex-1">Placeholder template</span>
            <span className="flex-1">Coloană Excel</span>
          </div>
          {template.placeholders.map((ph) => (
            <div key={ph} className="px-4 py-3 flex items-center gap-4">
              <div className="flex-1">
                <code className="rounded bg-primary/10 px-2 py-0.5 text-xs font-mono text-primary">
                  {`{{${ph}}}`}
                </code>
              </div>
              <div className="flex-1">
                <label htmlFor={`map-${ph}`} className="sr-only">
                  Coloană pentru placeholder {ph}
                </label>
                <select
                  id={`map-${ph}`}
                  value={mapping[ph] ?? ""}
                  onChange={(e) => onMappingChange(ph, e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
                >
                  <option value="">-- Nemapată --</option>
                  {parsed.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      {unmapped.length > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400" role="status">
          {unmapped.length} placeholder{unmapped.length > 1 ? "e nemapate" : " nemapatată"} — rândurile cu valori lipsă vor afișa{" "}
          <code>{"{{placeholder}}"}</code> în documentul generat.
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors min-h-[44px]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Înapoi
        </button>
        <button
          type="button"
          onClick={onNext}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors min-h-[44px]"
        >
          Preview rânduri
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

// ─── Step 3: Row Preview ───────────────────────────────────────────────────────

interface Step3Props {
  parsed: ParsedExcelResult;
  template: DocmergeTemplate;
  mapping: Record<string, string>;
  onBack: () => void;
}

function Step3Preview({ parsed, template, mapping, onBack }: Step3Props) {
  const mappedPlaceholders = template.placeholders.filter((ph) => mapping[ph]);
  const displayCols = mappedPlaceholders.length > 0 ? mappedPlaceholders : template.placeholders;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
        <Table2 className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-foreground">
            {parsed.rowCount} rânduri de date
          </p>
          <p className="text-xs text-muted-foreground">
            Previzualizare primele {parsed.previewRows.length} rânduri.
            {mappedPlaceholders.length} din {template.placeholders.length} placeholdere mapate.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm" aria-label="Preview primele rânduri din Excel">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th
                scope="col"
                className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground"
              >
                #
              </th>
              {displayCols.map((ph) => (
                <th
                  key={ph}
                  scope="col"
                  className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap"
                >
                  <code className="font-mono text-primary">{`{{${ph}}}`}</code>
                  {mapping[ph] && (
                    <span className="ml-1 text-muted-foreground font-normal">← {mapping[ph]}</span>
                  )}
                </th>
              ))}
              {/* Also show any unmapped original headers */}
              {parsed.headers
                .filter((h) => !Object.values(mapping).includes(h))
                .slice(0, 3)
                .map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground/60 whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {parsed.previewRows.slice(0, 50).map((row, i) => (
              <tr key={i} className="hover:bg-muted/30 transition-colors">
                <td className="px-3 py-2 text-muted-foreground text-xs">{i + 1}</td>
                {displayCols.map((ph) => {
                  const col = mapping[ph];
                  const val = col ? (row[col] ?? "") : "";
                  return (
                    <td
                      key={ph}
                      className={cn(
                        "px-3 py-2 text-foreground max-w-[200px] truncate",
                        !col && "text-muted-foreground italic text-xs"
                      )}
                      title={val}
                    >
                      {col ? val : <span className="opacity-50">{`{{${ph}}}`}</span>}
                    </td>
                  );
                })}
                {parsed.headers
                  .filter((h) => !Object.values(mapping).includes(h))
                  .slice(0, 3)
                  .map((h) => (
                    <td
                      key={h}
                      className="px-3 py-2 text-muted-foreground/60 text-xs max-w-[150px] truncate"
                      title={row[h]}
                    >
                      {row[h]}
                    </td>
                  ))}
              </tr>
            ))}
          </tbody>
        </table>
        {parsed.rowCount > 50 && (
          <p className="px-4 py-2 text-xs text-muted-foreground border-t border-border">
            Afișate primele 50 din {parsed.rowCount} rânduri. La generare se vor procesa toate {parsed.rowCount} rândurile.
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors min-h-[44px]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Înapoi la mapare
        </button>
        {/* Generation CTA — will be wired in DOCMERGE-003 (batch PDF) */}
        <button
          type="button"
          disabled
          aria-disabled="true"
          title="Generarea PDF-urilor va fi disponibilă în DOCMERGE-003"
          className="inline-flex items-center gap-2 rounded-md bg-primary/40 px-6 py-2 text-sm font-semibold text-primary-foreground cursor-not-allowed min-h-[44px]"
        >
          Generează PDF-uri
          <span className="text-xs font-normal opacity-70">(în curând)</span>
        </button>
      </div>
    </div>
  );
}
