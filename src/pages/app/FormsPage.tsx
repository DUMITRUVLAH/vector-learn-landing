/**
 * FORMS-002 — /app/forms
 *
 * Lista formularelor tenantului + creare formular nou.
 */
import { useEffect, useState, useCallback } from "react";
import {
  Plus,
  Loader2,
  AlertCircle,
  ClipboardCheck,
  ChevronRight,
  Trash2,
  CheckCircle2,
  FileText,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  listForms,
  createForm,
  deleteForm,
  type Form,
} from "@/lib/api/forms";
import { cn } from "@/lib/utils";

// ─── Helper: slug din titlu ───────────────────────────────────────────────────

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 100);
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Form["status"] }) {
  const map: Record<Form["status"], { label: string; cls: string }> = {
    draft: { label: "Draft", cls: "bg-muted text-muted-foreground" },
    published: { label: "Publicat", cls: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
    closed: { label: "Închis", cls: "bg-destructive/10 text-destructive" },
  };
  const { label, cls } = map[status];
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", cls)}>
      {label}
    </span>
  );
}

// ─── Modal creare formular ────────────────────────────────────────────────────

interface CreateModalProps {
  onClose: () => void;
  onCreated: (form: Form) => void;
}

function CreateFormModal({ onClose, onCreated }: CreateModalProps) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleTitleChange(v: string) {
    setTitle(v);
    if (!slugManual) setSlug(slugify(v));
  }

  function handleSlugChange(v: string) {
    setSlugManual(true);
    setSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 100));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !slug.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { form } = await createForm({ title: title.trim(), slug: slug.trim(), description: description.trim() || null });
      onCreated(form);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Eroare la creare formular.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl w-full max-w-md p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-4">Formular nou</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="form-title">
              Titlu <span className="text-destructive">*</span>
            </label>
            <input
              id="form-title"
              type="text"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="ex: Formular înscriere vară 2025"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              autoFocus
              required
              maxLength={200}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="form-slug">
              Slug (URL) <span className="text-destructive">*</span>
            </label>
            <div className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
              <span>/f/</span>
              <input
                id="form-slug"
                type="text"
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="inscriere-vara-2025"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                required
                maxLength={100}
                pattern="[a-z0-9-]+"
                title="Doar litere mici, cifre și cratime"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="form-desc">
              Descriere (opțional)
            </label>
            <textarea
              id="form-desc"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              placeholder="Descriere scurtă a formularului..."
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors"
            >
              Anulează
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim() || !slug.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Creează formular
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Card formular ────────────────────────────────────────────────────────────

interface FormCardProps {
  form: Form;
  onEdit: (id: string) => void;
  onDeleted: (id: string) => void;
}

function FormCard({ form, onEdit, onDeleted }: FormCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteForm(form.id);
      onDeleted(form.id);
    } catch {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-3 hover:border-primary/40 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="font-semibold text-sm truncate">{form.title}</h3>
            <StatusBadge status={form.status} />
          </div>
          <p className="text-xs text-muted-foreground font-mono">/f/{form.slug}</p>
        </div>
        <FileText className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
      </div>

      {form.description && (
        <p className="text-sm text-muted-foreground line-clamp-2">{form.description}</p>
      )}

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>
          {new Date(form.createdAt).toLocaleDateString("ro-RO", { day: "2-digit", month: "short", year: "numeric" })}
        </span>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => onEdit(form.id)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors min-h-[44px]"
        >
          <span>Editează</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>

        {confirmDelete ? (
          <div className="flex items-center gap-1">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-destructive text-destructive-foreground text-xs font-medium hover:bg-destructive/90 transition-colors min-h-[44px] disabled:opacity-50"
            >
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirmă"}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-3 py-2 rounded-lg border border-border text-xs hover:bg-muted transition-colors min-h-[44px]"
            >
              Anulează
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            aria-label="Șterge formularul"
            className="p-2 rounded-lg border border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Componenta principală ────────────────────────────────────────────────────

export function FormsPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  const loadForms = useCallback(async () => {
    setLoading(true);
    try {
      const { items } = await listForms();
      setForms(items);
    } catch {
      setToast({ kind: "error", message: "Nu s-au putut încărca formularele." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionStatus === "authenticated") loadForms();
  }, [sessionStatus, loadForms]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  function handleCreated(form: Form) {
    setShowCreate(false);
    setToast({ kind: "success", message: `Formularul "${form.title}" a fost creat.` });
    navigate(`/app/forms/${form.id}/edit`);
  }

  function handleDeleted(id: string) {
    setForms((prev) => prev.filter((f) => f.id !== id));
    setToast({ kind: "success", message: "Formularul a fost șters." });
  }

  return (
    <AppShell
      pageTitle="Formulare"
      pageDescription="Creează și gestionează formulare de captare leaduri"
      actions={
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Formular nou</span>
        </button>
      }
    >
      {/* Toast */}
      {toast && (
        <div
          className={cn(
            "fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all",
            toast.kind === "success"
              ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
              : "bg-destructive/10 text-destructive border border-destructive/20"
          )}
        >
          {toast.kind === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          {toast.message}
        </div>
      )}

      <div className="p-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : forms.length === 0 ? (
          /* Stare goală */
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <ClipboardCheck className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-lg font-semibold mb-2">Niciun formular creat</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs">
              Creează primul tău formular de captare leaduri și trimite link-ul public pe WhatsApp, Instagram sau site.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Creează primul formular
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {forms.map((form) => (
              <FormCard
                key={form.id}
                form={form}
                onEdit={(id) => navigate(`/app/forms/${id}/edit`)}
                onDeleted={handleDeleted}
              />
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateFormModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
    </AppShell>
  );
}
