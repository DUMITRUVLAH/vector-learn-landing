/**
 * DG-104 — biblioteca de șabloane de acte, cu editor propriu.
 *
 * Valoarea: juristul organizației își scrie formulările singur, în aplicație, fără să ceară
 * ajutor și fără să vadă HTML. Șabloanele stau în ACELAȘI depozit cu cele de generare în masă
 * (docmerge_templates) — o singură bibliotecă, două moduri de folosire.
 */
import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { FileText, Plus, Loader2, AlertCircle, ArrowLeft, Save, Copy } from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { getTemplate, createTemplate, updateTemplate } from "@/lib/api/docmerge";
import {
  listDocTemplates,
  cloneDocTemplate,
  DOC_KIND_LABELS,
  type DocTemplateListItem,
} from "@/lib/api/docs";
/**
 * Editorul (TipTap/ProseMirror) e cea mai grea bucată din tot modulul — ~108 KB gzip. Lista de
 * șabloane nu are nevoie de el, deci se încarcă abia când chiar deschizi un șablon. Așa pagina
 * rămâne ușoară pentru cei care doar caută un șablon, iar bugetul se plătește o singură dată,
 * de cine chiar editează.
 */
const DocTemplateEditor = lazy(() =>
  import("./DocTemplateEditor").then((m) => ({ default: m.DocTemplateEditor }))
);

const EMPTY_BODY =
  "<h1>ACT DE PRIMIRE-PREDARE</h1><p>Încheiat astăzi, {{document.data}}, între:</p>";

export function DocTemplatesPage() {
  const [templates, setTemplates] = useState<DocTemplateListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  /** Un șablon standard se deschide ca să-l vezi, nu ca să-l strici — se salvează doar copia. */
  const [isSystem, setIsSystem] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("act_primire_predare");
  const [body, setBody] = useState(EMPTY_BODY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTemplates(await listDocTemplates());
    } catch {
      setError("Nu am putut încărca șabloanele.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startNew = useCallback(() => {
    setEditingId(null);
    setName("");
    setKind("act_primire_predare");
    setBody(EMPTY_BODY);
    setIsSystem(false);
    setEditing(true);
  }, []);

  const startEdit = useCallback(async (id: string) => {
    setError(null);
    try {
      const tpl = await getTemplate(id);
      setEditingId(tpl.id);
      setName(tpl.name);
      setKind(tpl.kind ?? "act_primire_predare");
      setBody(tpl.bodyHtml);
      setIsSystem(templates.find((t) => t.id === id)?.isSystem ?? false);
      setEditing(true);
    } catch {
      setError("Nu am putut deschide șablonul.");
    }
  }, []);

  /** Clonarea e singurul drum de la un șablon standard la unul al organizației. */
  const clone = useCallback(
    async (id: string) => {
      setError(null);
      try {
        const copy = await cloneDocTemplate(id);
        await load();
        await startEdit(copy.id);
        setIsSystem(false);
      } catch {
        setError("Șablonul nu a putut fi clonat.");
      }
    },
    [load, startEdit]
  );

  const save = useCallback(async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await updateTemplate(editingId, { name: name.trim(), bodyHtml: body, kind });
      } else {
        await createTemplate({ name: name.trim(), bodyHtml: body, kind });
      }
      setEditing(false);
      await load();
    } catch {
      setError("Șablonul nu a putut fi salvat.");
    } finally {
      setSaving(false);
    }
  }, [editingId, name, body, kind, load]);

  return (
    <BusinessShell
      pageTitle="Șabloane de acte"
      pageDescription="Formulările organizației, editate aici — câmpurile se completează din registrul de furnizori când generezi actul."
      actions={
        !editing ? (
          <button
            type="button"
            onClick={startNew}
            className="touch-target inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Șablon nou
          </button>
        ) : undefined
      }
    >
      <div className="p-4 sm:p-6 space-y-6">
        {error && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            {error}
          </div>
        )}

        {editing ? (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="touch-target inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Înapoi la listă
            </button>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="tpl-name" className="block text-sm font-medium text-foreground">
                  Denumirea șablonului
                </label>
                <input
                  id="tpl-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Act de primire-predare — bunuri"
                  className="touch-target mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </div>
              <div>
                <label htmlFor="tpl-kind" className="block text-sm font-medium text-foreground">
                  Tipul actului
                </label>
                <select
                  id="tpl-kind"
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                  className="touch-target mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  {Object.entries(DOC_KIND_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Suspense
              fallback={
                <div className="flex items-center gap-2 rounded-lg border border-border p-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Se încarcă editorul…
                </div>
              }
            >
              <DocTemplateEditor value={body} onChange={setBody} />
            </Suspense>

            {isSystem && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  Șablon standard, livrat cu produsul — se poate folosi și clona, dar nu se editează.
                </p>
                <button
                  type="button"
                  onClick={() => editingId && void clone(editingId)}
                  className="touch-target inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-muted"
                >
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  Clonează ca șablon propriu
                </button>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                disabled={saving || !name.trim() || isSystem}
                onClick={() => void save()}
                className="touch-target inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="h-4 w-4" aria-hidden="true" />
                )}
                Salvează șablonul
              </button>
            </div>
          </div>
        ) : loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Se încarcă șabloanele…
          </div>
        ) : templates.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-10 text-center">
            <FileText className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-foreground">Niciun șablon încă</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Scrie formularea o dată — apoi fiecare act se completează singur din registru.
            </p>
            <button
              type="button"
              onClick={startNew}
              className="touch-target mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Creează primul șablon
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center gap-2 p-2">
                <button
                  type="button"
                  onClick={() => void startEdit(t.id)}
                  className="flex flex-1 items-center justify-between gap-4 rounded-md p-2 text-left hover:bg-muted/40"
                >
                  <span>
                    <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                      {t.name}
                      {t.isSystem && (
                        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                          Standard
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {DOC_KIND_LABELS[t.kind ?? "other"] ?? "Alt document"} ·{" "}
                      {t.placeholders.length} câmpuri
                    </span>
                  </span>
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={`Clonează ${t.name}`}
                  title="Clonează"
                  onClick={() => void clone(t.id)}
                  className="touch-target rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Copy className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </BusinessShell>
  );
}
