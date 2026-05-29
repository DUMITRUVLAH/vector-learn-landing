/**
 * CRM-108 — Bibliotecă template-uri /app/settings/crm/templates
 * CRUD template-uri email/WhatsApp/SMS cu variabile și preview
 */
import { useEffect, useState, useCallback } from "react";
import {
  Loader2, Plus, Pencil, Trash2, X, Check, Eye, AlertTriangle, MessageCircle, Mail, Smartphone,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  listTemplates, createTemplate, updateTemplate, deleteTemplate, previewTemplate,
  extractVariables, renderPreview, KNOWN_VARIABLES,
  type MessageTemplate, type TemplateChannel, type TemplatePreview,
} from "@/lib/api/templates";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

const CHANNEL_LABEL: Record<TemplateChannel, string> = {
  email: "Email", whatsapp: "WhatsApp", sms: "SMS",
};

const CHANNEL_ICON: Record<TemplateChannel, React.ComponentType<{ className?: string }>> = {
  email: Mail,
  whatsapp: MessageCircle,
  sms: Smartphone,
};

interface TemplateFormProps {
  initial?: Partial<MessageTemplate>;
  onSave: (data: Pick<MessageTemplate, "name" | "channel" | "subject" | "body">) => void | Promise<void>;
  onCancel: () => void;
  saving: boolean;
}

function TemplateForm({ initial, onSave, onCancel, saving }: TemplateFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [channel, setChannel] = useState<TemplateChannel>(initial?.channel ?? "email");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [showPreview, setShowPreview] = useState(false);

  const detectedVars = extractVariables(body);
  const unknownVars = detectedVars.filter((v) => !KNOWN_VARIABLES[v]);
  const previewBody = renderPreview(body);
  const previewSubject = renderPreview(subject);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave({ name: name.trim(), channel, subject: subject.trim() || null, body: body.trim() });
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="t-name" className="block text-sm font-semibold mb-1">Nume template *</label>
          <input
            id="t-name" type="text" required value={name} onChange={(e) => setName(e.target.value)}
            placeholder="ex: Welcome email"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="t-channel" className="block text-sm font-semibold mb-1">Canal *</label>
          <select
            id="t-channel" value={channel} onChange={(e) => setChannel(e.target.value as TemplateChannel)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="email">Email</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="sms">SMS</option>
          </select>
        </div>
      </div>

      {channel === "email" && (
        <div>
          <label htmlFor="t-subject" className="block text-sm font-semibold mb-1">Subiect email</label>
          <input
            id="t-subject" type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
            placeholder="ex: Bun venit la {{center_name}}!"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-1">
          <label htmlFor="t-body" className="block text-sm font-semibold">Corp mesaj *</label>
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Eye className="h-3 w-3" />
            {showPreview ? "Editor" : "Preview"}
          </button>
        </div>
        {!showPreview ? (
          <textarea
            id="t-body"
            rows={6}
            required
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={`Bună ziua {{first_name}},\n\nTe invităm la un trial pentru cursul {{course}} pe {{trial_date}}.`}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-y"
          />
        ) : (
          <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm min-h-[120px] whitespace-pre-wrap">
            {channel === "email" && subject.trim() && (
              <p className="font-semibold mb-2 pb-2 border-b border-border">Subiect: {previewSubject}</p>
            )}
            {previewBody || <span className="text-muted-foreground italic">Corp gol</span>}
          </div>
        )}
        {detectedVars.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {detectedVars.map((v) => (
              <span
                key={v}
                className={cn(
                  "inline-block rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold",
                  unknownVars.includes(v)
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                    : "bg-primary/10 text-primary"
                )}
              >
                {`{{${v}}}`}
              </span>
            ))}
          </div>
        )}
        {unknownVars.length > 0 && (
          <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
            <span>Variabile necunoscute (nu vor fi înlocuite): {unknownVars.map((v) => `{{${v}}}`).join(", ")}</span>
          </div>
        )}
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          Variabile disponibile: {Object.keys(KNOWN_VARIABLES).map((v) => `{{${v}}}`).join(" · ")}
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">
          Anulează
        </button>
        <button type="submit" disabled={saving || !name.trim() || !body.trim()} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvează"}
        </button>
      </div>
    </form>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function TemplatesPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [previewFor, setPreviewFor] = useState<{ id: string; data: TemplatePreview } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listTemplates();
      setTemplates(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  const handleCreate = async (data: Pick<MessageTemplate, "name" | "channel" | "subject" | "body">) => {
    setSaving(true);
    try {
      const created = await createTemplate(data);
      setTemplates((prev) => [created, ...prev]);
      setCreating(false);
      setToast({ kind: "success", message: "Template creat" });
    } catch (err) {
      setToast({ kind: "error", message: err instanceof ApiError ? err.message : "Eroare la creare" });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (id: string, data: Pick<MessageTemplate, "name" | "channel" | "subject" | "body">) => {
    setSaving(true);
    try {
      const updated = await updateTemplate(id, data);
      setTemplates((prev) => prev.map((t) => (t.id === id ? updated : t)));
      setEditingId(null);
      setToast({ kind: "success", message: "Template actualizat" });
    } catch (err) {
      setToast({ kind: "error", message: err instanceof ApiError ? err.message : "Eroare la actualizare" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Ștergi template-ul?")) return;
    setDeletingId(id);
    try {
      await deleteTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      setToast({ kind: "success", message: "Template șters" });
    } catch {
      setToast({ kind: "error", message: "Nu pot șterge template-ul" });
    } finally {
      setDeletingId(null);
    }
  };

  const handlePreview = async (id: string) => {
    setLoadingPreview(id);
    try {
      const data = await previewTemplate(id);
      setPreviewFor({ id, data });
    } catch {
      setToast({ kind: "error", message: "Nu pot genera preview-ul" });
    } finally {
      setLoadingPreview(null);
    }
  };

  const byChannel = (ch: TemplateChannel) => templates.filter((t) => t.channel === ch);

  return (
    <AppShell
      pageTitle="Template-uri mesaje"
      pageDescription="Email · WhatsApp · SMS — variabile și preview"
      actions={
        <button
          type="button"
          onClick={() => { setCreating(true); setEditingId(null); }}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Template nou
        </button>
      }
    >
      {creating && (
        <div className="mb-6 rounded-xl border border-border bg-card p-5">
          <p className="text-base font-bold mb-4">Template nou</p>
          <TemplateForm
            onSave={(d) => void handleCreate(d)}
            onCancel={() => setCreating(false)}
            saving={saving}
          />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Se încarcă…
        </div>
      ) : error ? (
        <div className="py-16 text-center text-sm text-destructive">{error}</div>
      ) : templates.length === 0 && !creating ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          <p>Niciun template. Creează primul!</p>
        </div>
      ) : (
        <div className="space-y-8">
          {(["email", "whatsapp", "sms"] as TemplateChannel[]).map((channel) => {
            const list = byChannel(channel);
            if (list.length === 0) return null;
            const Icon = CHANNEL_ICON[channel];
            return (
              <section key={channel}>
                <div className="flex items-center gap-2 mb-3">
                  <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                  <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                    {CHANNEL_LABEL[channel]}
                  </h2>
                </div>
                <ul className="space-y-3" aria-label={`Template-uri ${CHANNEL_LABEL[channel]}`}>
                  {list.map((tmpl) => (
                    <li key={tmpl.id} className="rounded-xl border border-border bg-card overflow-hidden">
                      {editingId === tmpl.id ? (
                        <div className="p-5">
                          <TemplateForm
                            initial={tmpl}
                            onSave={(d) => void handleUpdate(tmpl.id, d)}
                            onCancel={() => setEditingId(null)}
                            saving={saving}
                          />
                        </div>
                      ) : (
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold truncate">{tmpl.name}</p>
                              {tmpl.subject && (
                                <p className="text-xs text-muted-foreground mt-0.5 truncate">Subiect: {tmpl.subject}</p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{tmpl.body}</p>
                              {tmpl.variables.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {tmpl.variables.map((v) => (
                                    <span key={v} className={cn(
                                      "inline-block rounded px-1 py-0.5 text-[9px] font-mono",
                                      !KNOWN_VARIABLES[v]
                                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                        : "bg-primary/10 text-primary"
                                    )}>
                                      {`{{${v}}}`}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="flex gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => void handlePreview(tmpl.id)}
                                disabled={loadingPreview === tmpl.id}
                                className="rounded-md border border-border p-1.5 hover:bg-muted text-muted-foreground hover:text-primary"
                                aria-label={`Preview ${tmpl.name}`}
                              >
                                {loadingPreview === tmpl.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(tmpl.id)}
                                className="rounded-md border border-border p-1.5 hover:bg-muted"
                                aria-label={`Editează ${tmpl.name}`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDelete(tmpl.id)}
                                disabled={deletingId === tmpl.id}
                                className="rounded-md border border-border p-1.5 hover:bg-muted text-muted-foreground hover:text-destructive"
                                aria-label={`Șterge ${tmpl.name}`}
                              >
                                {deletingId === tmpl.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {/* Preview modal */}
      {previewFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Preview template">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setPreviewFor(null)} />
          <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card shadow-xl">
            <div className="border-b border-border px-5 py-3.5 flex items-center justify-between">
              <h2 className="text-base font-bold">Preview — date exemplu</h2>
              <button type="button" onClick={() => setPreviewFor(null)} aria-label="Închide preview" className="rounded-md hover:bg-muted p-1">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {previewFor.data.subject && (
                <div className="rounded-md bg-muted/40 p-3">
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Subiect</p>
                  <p className="text-sm font-medium">{previewFor.data.subject}</p>
                </div>
              )}
              <div className="rounded-md bg-muted/40 p-3">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Corp</p>
                <p className="text-sm whitespace-pre-wrap">{previewFor.data.body}</p>
              </div>
              {previewFor.data.warnings.length > 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-3">
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-1">Avertismente</p>
                  <ul className="space-y-1">
                    {previewFor.data.warnings.map((w, i) => (
                      <li key={i} className="text-xs flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "fixed bottom-4 right-4 z-50 rounded-lg border shadow-lg px-4 py-3 text-sm font-medium",
            toast.kind === "success"
              ? "bg-success/10 border-success/30 text-success"
              : "bg-destructive/10 border-destructive/30 text-destructive"
          )}
        >
          {toast.message}
        </div>
      )}
    </AppShell>
  );
}
