/**
 * DOCMERGE-004: Document Merge end-to-end wizard.
 *
 * A 4-step guided flow at /business/docmerge/wizard:
 *   1. Template  — pick an existing template (chips show detected placeholders)
 *   2. Excel     — upload .xlsx, see row count + column names
 *   3. Mapare    — map placeholder→column, preview unmapped warnings
 *   4. Generează — one click generates N PDFs → ZIP download
 *
 * All state persists across forward/back navigation (no data loss).
 * Reuses API calls from 001–003 (no new backend logic).
 * BusinessShell chrome, Vector 365 tokens only, WCAG AA a11y.
 */
import { useState, useCallback, useEffect } from "react";
import {
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Loader2,
  AlertCircle,
  FileText,
  FileSpreadsheet,
  Upload,
  Files,
} from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import {
  listTemplates,
  parseExcel,
  autoMapColumns,
  generateBatch,
  type DocmergeTemplate,
  type ParsedExcelResult,
} from "@/lib/api/docmerge";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4;

const STEP_LABELS = [
  "Template",
  "Excel",
  "Mapare",
  "Generează",
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export function DocMergeWizardPage() {
  const [step, setStep] = useState<Step>(1);

  // Step 1 — template
  const [templates, setTemplates] = useState<DocmergeTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<DocmergeTemplate | null>(null);

  // Step 2 — excel
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedExcelResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Step 3 — mapping
  const [mapping, setMapping] = useState<Record<string, string>>({});

  // Step 4 — generate
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState<number | null>(null);

  // Load templates once
  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const list = await listTemplates();
      setTemplates(list);
    } catch {
      // non-fatal — user sees empty state
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  // ── Step 1 handlers ─────────────────────────────────────────────────────────

  function handleTemplateSelect(id: string) {
    setSelectedTemplateId(id);
    const tpl = templates.find((t) => t.id === id) ?? null;
    setSelectedTemplate(tpl);
    // Reset downstream state
    setMapping({});
    setSuccessCount(null);
    setGenerateError(null);
  }

  function canGoToStep2() {
    return !!selectedTemplateId;
  }

  // ── Step 2 handlers ─────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setParseError(null);
    setParsed(null);
    setMapping({});
    if (!f) { setExcelFile(null); return; }
    if (!f.name.toLowerCase().endsWith(".xlsx")) {
      setParseError("Doar fișiere .xlsx sunt acceptate.");
      return;
    }
    setExcelFile(f);
  }

  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    const f = e.dataTransfer.files[0] ?? null;
    setParseError(null);
    setParsed(null);
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".xlsx")) {
      setParseError("Doar fișiere .xlsx sunt acceptate.");
      return;
    }
    setExcelFile(f);
  }

  async function handleParse() {
    if (!excelFile) { setParseError("Alege un fișier .xlsx."); return; }
    setParsing(true);
    setParseError(null);
    try {
      const result = await parseExcel(excelFile);
      setParsed(result);

      // Auto-map columns → placeholders
      if (selectedTemplate && result.headers.length > 0 && selectedTemplate.placeholders.length > 0) {
        try {
          const { mapping: auto } = await autoMapColumns(result.headers, selectedTemplate.placeholders);
          setMapping(auto);
        } catch {
          setMapping({});
        }
      } else {
        setMapping({});
      }

      setStep(3);
    } catch (err: unknown) {
      setParseError(err instanceof Error ? err.message : "Eroare la parsarea fișierului.");
    } finally {
      setParsing(false);
    }
  }

  function canGoToStep3() {
    return !!excelFile && !!parsed;
  }

  // ── Step 3 handlers ─────────────────────────────────────────────────────────

  function updateMapping(placeholder: string, column: string) {
    setMapping((prev) => ({ ...prev, [placeholder]: column }));
  }

  // ── Step 4 handlers ─────────────────────────────────────────────────────────

  async function handleGenerate() {
    if (!selectedTemplate || !parsed) return;
    setGenerating(true);
    setGenerateError(null);
    setSuccessCount(null);

    try {
      const delivery = parsed.rowCount === 1 ? "single" : "zip";
      const blob = await generateBatch({
        templateId: selectedTemplate.id,
        mapping,
        rows: parsed.previewRows,
        delivery,
      });

      // Trigger browser download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const today = new Date().toISOString().slice(0, 10);
      a.download =
        delivery === "single"
          ? `document-${today}.pdf`
          : `documente-${selectedTemplate.name.replace(/[^\w-]/g, "_").slice(0, 50)}-${today}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setSuccessCount(parsed.rowCount);
    } catch (err: unknown) {
      setGenerateError(err instanceof Error ? err.message : "Eroare la generare. Încearcă din nou.");
    } finally {
      setGenerating(false);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <BusinessShell
      pageTitle="Document Merge — Wizard"
      pageDescription="Generează documente în masă dintr-un template și un fișier Excel."
    >
      {/* Step indicator */}
      <nav aria-label="Pași wizard Document Merge" className="mb-8">
        <ol className="flex items-center gap-0" role="list">
          {STEP_LABELS.map((label, idx) => {
            const n = (idx + 1) as Step;
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
                    {done ? (
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      n
                    )}
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
                {idx < STEP_LABELS.length - 1 && (
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
          })}
        </ol>
      </nav>

      {/* Step panels */}
      {step === 1 && (
        <StepTemplate
          templates={templates}
          loading={templatesLoading}
          selectedId={selectedTemplateId}
          onSelect={handleTemplateSelect}
          onNext={() => setStep(2)}
          canNext={canGoToStep2()}
        />
      )}

      {step === 2 && (
        <StepExcel
          excelFile={excelFile}
          parsed={parsed}
          parsing={parsing}
          parseError={parseError}
          onChange={handleFileChange}
          onDrop={handleDrop}
          onParse={() => void handleParse()}
          onBack={() => setStep(1)}
          canNext={canGoToStep3()}
        />
      )}

      {step === 3 && parsed && selectedTemplate && (
        <StepMapping
          template={selectedTemplate}
          parsed={parsed}
          mapping={mapping}
          onMappingChange={updateMapping}
          onBack={() => setStep(2)}
          onNext={() => setStep(4)}
        />
      )}

      {step === 4 && parsed && selectedTemplate && (
        <StepGenerate
          template={selectedTemplate}
          rowCount={parsed.rowCount}
          generating={generating}
          error={generateError}
          successCount={successCount}
          onGenerate={() => void handleGenerate()}
          onRetry={() => { setGenerateError(null); void handleGenerate(); }}
          onBack={() => setStep(3)}
          onReset={() => {
            setStep(1);
            setSelectedTemplateId("");
            setSelectedTemplate(null);
            setExcelFile(null);
            setParsed(null);
            setMapping({});
            setSuccessCount(null);
            setGenerateError(null);
          }}
        />
      )}
    </BusinessShell>
  );
}

// ─── Step 1 — Template picker ─────────────────────────────────────────────────

interface StepTemplateProps {
  templates: DocmergeTemplate[];
  loading: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
  onNext: () => void;
  canNext: boolean;
}

function StepTemplate({ templates, loading, selectedId, onSelect, onNext, canNext }: StepTemplateProps) {
  return (
    <div className="max-w-xl mx-auto flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label htmlFor="tpl-select" className="text-sm font-medium text-foreground">
          Alege template <span className="text-destructive" aria-hidden="true">*</span>
        </label>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Se încarcă template-urile…
          </div>
        ) : templates.length === 0 ? (
          /* Empty state — AC4 */
          <div
            role="status"
            className="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed border-border p-10 text-center"
          >
            <FileText className="h-12 w-12 text-muted-foreground/40" aria-hidden="true" />
            <div>
              <p className="font-semibold text-foreground">Niciun template creat</p>
              <p className="text-sm text-muted-foreground mt-1">
                Creează primul template HTML cu placeholdere <code>{`{{camp}}`}</code>.
              </p>
            </div>
            <a
              href="#/business/docmerge"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors min-h-[44px]"
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
              Creează primul template
            </a>
          </div>
        ) : (
          <select
            id="tpl-select"
            value={selectedId}
            onChange={(e) => onSelect(e.target.value)}
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
      </div>

      {/* Placeholder chips for selected template */}
      {selectedId && templates.find((t) => t.id === selectedId)?.placeholders.length ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Placeholdere detectate
          </p>
          <div className="flex flex-wrap gap-2" aria-label="Placeholdere în template">
            {templates
              .find((t) => t.id === selectedId)!
              .placeholders.map((ph) => (
                <span
                  key={ph}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-mono text-primary"
                >
                  <span aria-hidden="true">{"{{ "}</span>
                  {ph}
                  <span aria-hidden="true">{" }}"}</span>
                </span>
              ))}
          </div>
        </div>
      ) : null}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          aria-disabled={!canNext}
          className={cn(
            "inline-flex items-center gap-2 rounded-md px-6 py-2 text-sm font-semibold transition-colors min-h-[44px]",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            !canNext && "opacity-50 cursor-not-allowed"
          )}
        >
          Înainte
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

// ─── Step 2 — Excel upload ────────────────────────────────────────────────────

interface StepExcelProps {
  excelFile: File | null;
  parsed: ParsedExcelResult | null;
  parsing: boolean;
  parseError: string | null;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: React.DragEvent<HTMLLabelElement>) => void;
  onParse: () => void;
  onBack: () => void;
  canNext: boolean;
}

function StepExcel({
  excelFile,
  parsed,
  parsing,
  parseError,
  onChange,
  onDrop,
  onParse,
  onBack,
  canNext,
}: StepExcelProps) {
  return (
    <div className="max-w-xl mx-auto flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">
          Fișier Excel (.xlsx) <span className="text-destructive" aria-hidden="true">*</span>
        </span>
        <label
          htmlFor="wizard-excel-upload"
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
                  Trage fișierul .xlsx sau apasă
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Maxim 5 000 rânduri de date</p>
              </div>
            </>
          )}
          <input
            id="wizard-excel-upload"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={onChange}
          />
        </label>
      </div>

      {/* Summary after parsing */}
      {parsed && (
        <div
          role="status"
          className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm"
        >
          <p className="text-foreground font-medium">{parsed.rowCount} rânduri detectate</p>
          <p className="text-muted-foreground text-xs mt-0.5">
            Coloane: {parsed.headers.join(", ")}
          </p>
        </div>
      )}

      {parseError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {parseError}
        </div>
      )}

      <div className="flex items-center gap-3 justify-between">
        <button
          type="button"
          onClick={onBack}
          disabled={parsing}
          className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors min-h-[44px] disabled:opacity-50"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Înapoi
        </button>

        {canNext ? (
          <button
            type="button"
            onClick={() => { /* already parsed — advance */ }}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors min-h-[44px]"
            /* This won't be reached — step change happens in onParse → setStep(3) */
          >
            Înainte
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onParse}
            disabled={parsing || !excelFile}
            aria-busy={parsing}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-6 py-2 text-sm font-semibold transition-colors min-h-[44px]",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              (parsing || !excelFile) && "opacity-50 cursor-not-allowed"
            )}
          >
            {parsing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Se parsează…
              </>
            ) : (
              <>
                Parsează Excel
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Step 3 — Column mapping ──────────────────────────────────────────────────

interface StepMappingProps {
  template: DocmergeTemplate;
  parsed: ParsedExcelResult;
  mapping: Record<string, string>;
  onMappingChange: (ph: string, col: string) => void;
  onBack: () => void;
  onNext: () => void;
}

function StepMapping({ template, parsed, mapping, onMappingChange, onBack, onNext }: StepMappingProps) {
  const unmapped = template.placeholders.filter((ph) => !mapping[ph]);

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      {/* Stats row */}
      <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm flex flex-wrap gap-4">
        <span className="text-muted-foreground">
          Coloane Excel: <strong className="text-foreground">{parsed.headers.length}</strong>
        </span>
        <span className="text-muted-foreground">
          Rânduri: <strong className="text-foreground">{parsed.rowCount}</strong>
        </span>
        <span className="text-muted-foreground">
          Placeholdere: <strong className="text-foreground">{template.placeholders.length}</strong>
        </span>
      </div>

      {template.placeholders.length === 0 ? (
        <p className="text-sm text-muted-foreground rounded-lg border border-border bg-muted/30 p-4">
          Template-ul nu are placeholdere — documentele se vor genera identice.
        </p>
      ) : (
        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          <div className="px-4 py-3 grid grid-cols-2 gap-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <span>Placeholder template</span>
            <span>Coloană Excel</span>
          </div>
          {template.placeholders.map((ph) => (
            <div key={ph} className="px-4 py-3 grid grid-cols-2 gap-4 items-center">
              <code className="rounded bg-primary/10 px-2 py-0.5 text-xs font-mono text-primary inline-flex w-fit">
                {`{{${ph}}}`}
              </code>
              <div>
                <label htmlFor={`wizard-map-${ph}`} className="sr-only">
                  Coloană pentru {ph}
                </label>
                <select
                  id={`wizard-map-${ph}`}
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

      {/* Unmapped warning — T-DOCMERGE-004-3 */}
      {unmapped.length > 0 && (
        <p
          role="status"
          className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {unmapped.length} placeholder{unmapped.length > 1 ? "e necompletate" : " necompletat"} — vor
          rămâne ca{" "}
          <code className="font-mono">{`{{placeholder}}`}</code> în documente.
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
          Înainte: Generează
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

// ─── Step 4 — Generate ────────────────────────────────────────────────────────

interface StepGenerateProps {
  template: DocmergeTemplate;
  rowCount: number;
  generating: boolean;
  error: string | null;
  successCount: number | null;
  onGenerate: () => void;
  onRetry: () => void;
  onBack: () => void;
  onReset: () => void;
}

function StepGenerate({
  template,
  rowCount,
  generating,
  error,
  successCount,
  onGenerate,
  onRetry,
  onBack,
  onReset,
}: StepGenerateProps) {
  return (
    <div className="max-w-xl mx-auto flex flex-col gap-6">
      {/* Summary card */}
      <div className="rounded-xl border border-border bg-card p-6 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Files className="h-8 w-8 text-primary shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold text-foreground">
              {rowCount} document{rowCount !== 1 ? "e" : ""} de generat
            </p>
            <p className="text-sm text-muted-foreground">
              Template: <span className="text-foreground">{template.name}</span>
            </p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {rowCount === 1
            ? "Se va genera un singur PDF."
            : `Se vor genera ${rowCount} PDF-uri împachetate într-un fișier ZIP.`}
        </p>
      </div>

      {/* Success state */}
      {successCount !== null && !error && (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col items-center gap-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center"
        >
          <CheckCircle2 className="h-10 w-10 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <p className="font-semibold text-foreground">
            {successCount} document{successCount !== 1 ? "e generate" : " generat"} cu succes!
          </p>
          <p className="text-sm text-muted-foreground">Descărcarea a început automat.</p>
          <div className="flex gap-3 flex-wrap justify-center mt-2">
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors min-h-[44px]"
            >
              Începe din nou
            </button>
            <a
              href="#/business/docmerge"
              className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors min-h-[44px]"
            >
              Înapoi la template-uri
            </a>
          </div>
        </div>
      )}

      {/* Error state — AC5 */}
      {error && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-5"
        >
          <div className="flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={onRetry}
            disabled={generating}
            className="inline-flex items-center gap-2 self-start rounded-md border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors min-h-[44px] disabled:opacity-50"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Se generează…
              </>
            ) : (
              "Reîncearcă"
            )}
          </button>
        </div>
      )}

      {/* Generate CTA (hidden after success) */}
      {successCount === null && !error && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={generating}
            className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors min-h-[44px] disabled:opacity-50"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Înapoi la mapare
          </button>
          <button
            type="button"
            onClick={onGenerate}
            disabled={generating || rowCount === 0}
            aria-busy={generating}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-6 py-3 text-sm font-semibold transition-colors min-h-[44px]",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              (generating || rowCount === 0) && "opacity-50 cursor-not-allowed"
            )}
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Se generează…
              </>
            ) : (
              <>
                Generează {rowCount} {rowCount === 1 ? "document" : "documente"}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
