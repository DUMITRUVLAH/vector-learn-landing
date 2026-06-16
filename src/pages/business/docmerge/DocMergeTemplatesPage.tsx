/**
 * DOCMERGE-001: Document Merge Templates page
 *
 * Anchored at /business/docmerge/*
 * Business Suite chrome via BusinessShell (sidebar Business, not CRM).
 *
 * Features:
 * - List of templates (name + placeholder count + Edit/Delete actions)
 * - "Template nou" button → inline editor (name + bodyHtml textarea)
 * - Live placeholder detection (chips) on typing (debounced)
 * - Preview panel (iframe srcdoc) with sampleContext data
 * - Vector 365 semantic tokens, dark mode, a11y
 */
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus,
  FileText,
  Pencil,
  Trash2,
  Eye,
  X,
  Loader2,
  Tag,
  AlertCircle,
  FileSpreadsheet,
} from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  previewTemplate,
  type DocmergeTemplate,
  type DocmergeTemplateFull,
} from "@/lib/api/docmerge";
import { cn } from "@/lib/utils";

// ─── Extract placeholders in client (same regex as server) ───────────────────

function clientExtractPlaceholders(body: string): string[] {
  const matches = body.match(/\{\{(\w+)\}\}/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

// ─── Debounce hook ────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewState = "list" | "edit" | "new";

// ─── Component ────────────────────────────────────────────────────────────────

export function DocMergeTemplatesPage() {
  const [view, setView] = useState<ViewState>("list");
  const [templates, setTemplates] = useState<DocmergeTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editor state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Preview
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live placeholders (client-side, no server round-trip needed)
  const debouncedBody = useDebounce(bodyHtml, 350);
  const livePlaceholders = clientExtractPlaceholders(debouncedBody);

  // ── Load list ───────────────────────────────────────────────────────────────

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listTemplates();
      setTemplates(list);
    } catch {
      setError("Eroare la încărcarea template-urilor. Încearcă din nou.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  // ── Preview update (debounced, only in edit/new views) ─────────────────────

  useEffect(() => {
    if (view === "list") return;
    if (!editingId) return; // new template has no saved id yet — skip server preview
    if (!debouncedBody) return;

    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const res = await previewTemplate(editingId);
        setPreviewHtml(res.html);
      } catch {
        // non-critical — preview is optional
      } finally {
        setPreviewLoading(false);
      }
    }, 600);

    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
  }, [debouncedBody, editingId, view]);

  // ── Actions ────────────────────────────────────────────────────────────────

  function openNew() {
    setEditingId(null);
    setName("");
    setBodyHtml("");
    setSaveError(null);
    setPreviewHtml(null);
    setView("new");
  }

  async function openEdit(id: string) {
    setSaveError(null);
    setPreviewHtml(null);
    setEditingId(id);
    setView("edit");
    // Load full body
    try {
      const full = await (async (): Promise<DocmergeTemplateFull> => {
        const { getTemplate } = await import("@/lib/api/docmerge");
        return getTemplate(id);
      })();
      setName(full.name);
      setBodyHtml(full.bodyHtml);
    } catch {
      setSaveError("Nu s-a putut încărca template-ul.");
    }
  }

  function cancelEdit() {
    setView("list");
    setEditingId(null);
    setName("");
    setBodyHtml("");
    setSaveError(null);
    setPreviewHtml(null);
  }

  async function handleSave() {
    if (!name.trim() || !bodyHtml.trim()) {
      setSaveError("Denumirea și corpul template-ului sunt obligatorii.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      if (view === "new") {
        await createTemplate({ name: name.trim(), bodyHtml });
      } else if (editingId) {
        await updateTemplate(editingId, { name: name.trim(), bodyHtml });
      }
      await loadTemplates();
      cancelEdit();
    } catch {
      setSaveError("Eroare la salvare. Încearcă din nou.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, tplName: string) {
    if (!confirm(`Ștergi template-ul „${tplName}"?`)) return;
    try {
      await deleteTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch {
      setError("Eroare la ștergere.");
    }
  }

  async function handlePreviewLatest() {
    if (!editingId) return;
    setPreviewLoading(true);
    try {
      const res = await previewTemplate(editingId);
      setPreviewHtml(res.html);
    } catch {
      // ignore
    } finally {
      setPreviewLoading(false);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <BusinessShell
      pageTitle="Document Merge — Templates"
      pageDescription="Creează și gestionează template-uri cu placeholdere {{tag}} pentru generare masivă de PDF-uri."
      actions={
        view === "list" ? (
          <div className="flex items-center gap-2">
            <a
              href="#/business/docmerge/job"
              className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors min-h-[44px]"
            >
              <FileSpreadsheet className="h-4 w-4 shrink-0" aria-hidden="true" />
              Generează din Excel
            </a>
            <button
              type="button"
              onClick={openNew}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors min-h-[44px]"
            >
              <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
              Template nou
            </button>
          </div>
        ) : undefined
      }
    >
      {view === "list" && (
        <TemplateList
          templates={templates}
          loading={loading}
          error={error}
          onEdit={openEdit}
          onDelete={handleDelete}
          onNew={openNew}
        />
      )}

      {(view === "new" || view === "edit") && (
        <TemplateEditor
          view={view}
          name={name}
          bodyHtml={bodyHtml}
          livePlaceholders={livePlaceholders}
          previewHtml={previewHtml}
          previewLoading={previewLoading}
          saving={saving}
          saveError={saveError}
          onNameChange={setName}
          onBodyChange={setBodyHtml}
          onSave={handleSave}
          onCancel={cancelEdit}
          onPreview={handlePreviewLatest}
          hasId={Boolean(editingId)}
        />
      )}
    </BusinessShell>
  );
}

// ─── TemplateList subcomponent ────────────────────────────────────────────────

interface TemplateListProps {
  templates: DocmergeTemplate[];
  loading: boolean;
  error: string | null;
  onEdit: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  onNew: () => void;
}

function TemplateList({
  templates,
  loading,
  error,
  onEdit,
  onDelete,
  onNew,
}: TemplateListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se încarcă..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive">
        <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (!templates.length) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <FileText className="h-12 w-12 text-muted-foreground/40" aria-hidden="true" />
        <div>
          <p className="font-semibold text-foreground">Niciun template încă</p>
          <p className="text-sm text-muted-foreground mt-1">
            Creează primul template cu placeholdere pentru a genera PDF-uri în masă.
          </p>
        </div>
        <button
          type="button"
          onClick={onNew}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors min-h-[44px]"
        >
          <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
          Creează primul template
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {templates.map((tpl) => (
        <div
          key={tpl.id}
          className="rounded-lg border border-border bg-card p-4 flex items-center gap-4"
        >
          <FileText className="h-8 w-8 text-primary/60 shrink-0" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground truncate">{tpl.name}</p>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {tpl.placeholders.length === 0 ? (
                <span className="text-xs text-muted-foreground">Niciun placeholder detectat</span>
              ) : (
                tpl.placeholders.slice(0, 6).map((ph) => (
                  <span
                    key={ph}
                    className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-mono text-primary"
                  >
                    <Tag className="h-2.5 w-2.5" aria-hidden="true" />
                    {ph}
                  </span>
                ))
              )}
              {tpl.placeholders.length > 6 && (
                <span className="text-xs text-muted-foreground">
                  +{tpl.placeholders.length - 6} mai multe
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onEdit(tpl.id)}
              aria-label={`Editează template-ul ${tpl.name}`}
              className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors min-h-[44px] min-w-[44px]"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(tpl.id, tpl.name)}
              aria-label={`Șterge template-ul ${tpl.name}`}
              className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors min-h-[44px] min-w-[44px]"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── TemplateEditor subcomponent ──────────────────────────────────────────────

interface TemplateEditorProps {
  view: "new" | "edit";
  name: string;
  bodyHtml: string;
  livePlaceholders: string[];
  previewHtml: string | null;
  previewLoading: boolean;
  saving: boolean;
  saveError: string | null;
  hasId: boolean;
  onNameChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onPreview: () => void;
}

function TemplateEditor({
  view,
  name,
  bodyHtml,
  livePlaceholders,
  previewHtml,
  previewLoading,
  saving,
  saveError,
  hasId,
  onNameChange,
  onBodyChange,
  onSave,
  onCancel,
  onPreview,
}: TemplateEditorProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Editor panel */}
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground">
              {view === "new" ? "Template nou" : "Editează template"}
            </h2>
            <button
              type="button"
              onClick={onCancel}
              aria-label="Anulează și revino la listă"
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* Name field */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tpl-name" className="text-sm font-medium text-foreground">
              Denumire <span className="text-destructive" aria-hidden="true">*</span>
            </label>
            <input
              id="tpl-name"
              type="text"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="ex: Contract prestare servicii 2026"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
            />
          </div>

          {/* Body textarea */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tpl-body" className="text-sm font-medium text-foreground">
              Corpul template-ului (HTML cu <code className="font-mono text-primary">{"{{placeholdere}}"}</code>)
              <span className="text-destructive" aria-hidden="true"> *</span>
            </label>
            <textarea
              id="tpl-body"
              value={bodyHtml}
              onChange={(e) => onBodyChange(e.target.value)}
              rows={12}
              placeholder={"<h1>Contract nr. {{numar}}</h1>\n<p>Încheiat cu {{nume}}, în data de {{data}}.</p>\n<p>Suma datorată: <strong>{{suma}}</strong> MDL.</p>"}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y min-h-[200px]"
            />
            <p className="text-xs text-muted-foreground">
              Folosește <code className="font-mono">{"{{câmp}}"}</code> pentru valorile care vor fi completate din Excel.
            </p>
          </div>

          {/* Live placeholder chips */}
          {livePlaceholders.length > 0 && (
            <div className="rounded-md border border-border bg-muted/40 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Placeholdere detectate ({livePlaceholders.length}):
              </p>
              <div className="flex flex-wrap gap-1.5">
                {livePlaceholders.map((ph) => (
                  <span
                    key={ph}
                    className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-1 text-xs font-mono text-primary"
                  >
                    <Tag className="h-3 w-3" aria-hidden="true" />
                    {`{{${ph}}}`}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {saveError && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <p className="text-sm">{saveError}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors min-h-[44px]",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                saving && "opacity-60 cursor-not-allowed"
              )}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {saving ? "Se salvează…" : "Salvează"}
            </button>
            {hasId && (
              <button
                type="button"
                onClick={onPreview}
                disabled={previewLoading}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors min-h-[44px]",
                  previewLoading && "opacity-60 cursor-not-allowed"
                )}
              >
                <Eye className="h-4 w-4" aria-hidden="true" />
                Preview
              </button>
            )}
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors min-h-[44px]"
            >
              Anulează
            </button>
          </div>
        </div>
      </div>

      {/* Preview panel */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground flex items-center gap-2">
          <Eye className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Preview (date demo)
          {previewLoading && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Se actualizează preview-ul..." />
          )}
        </p>
        <div
          className="rounded-lg border border-border bg-card min-h-[300px] overflow-hidden"
          aria-label="Preview document cu date demo"
        >
          {previewHtml ? (
            <iframe
              srcDoc={previewHtml}
              title="Preview template cu date demo"
              className="w-full min-h-[400px] border-0"
              sandbox="allow-same-origin"
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
              <Eye className="h-8 w-8 opacity-30" aria-hidden="true" />
              <p className="text-sm">
                {hasId
                  ? "Salvează template-ul și apasă \"Preview\" pentru a vedea randarea cu date demo."
                  : "Salvează template-ul pentru a vizualiza preview-ul."}
              </p>
            </div>
          )}
        </div>
        {!hasId && livePlaceholders.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Preview-ul va fi disponibil după prima salvare.
          </p>
        )}
      </div>
    </div>
  );
}
