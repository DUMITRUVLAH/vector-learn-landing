/**
 * FEEDBACK-601 — /app/feedback
 *
 * Manager dashboard: list forms with avg score + response rate.
 * Create new form. View responses.
 */
import { useEffect, useState, useCallback } from "react";
import {
  Plus, Star, MessageSquare, Loader2, CheckCircle2,
  BarChart2, Send, ChevronDown, ChevronUp, AlertCircle,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  listFeedbackForms,
  createFeedbackForm,
  getFeedbackForm,
  type FeedbackForm,
  type FeedbackQuestionType,
} from "@/lib/api/feedback";
import { cn } from "@/lib/utils";

// ─── Sub-types ────────────────────────────────────────────────────────────────

interface DraftQuestion {
  type: FeedbackQuestionType;
  label: string;
  required: boolean;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FeedbackPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const [forms, setForms] = useState<FeedbackForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedForm, setExpandedForm] = useState<FeedbackForm | null>(null);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  const loadForms = useCallback(async () => {
    setLoading(true);
    try {
      const { forms: f } = await listFeedbackForms();
      setForms(f);
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

  async function handleExpand(formId: string) {
    if (expandedId === formId) {
      setExpandedId(null);
      setExpandedForm(null);
      return;
    }
    setExpandedId(formId);
    setExpandedLoading(true);
    try {
      const { form } = await getFeedbackForm(formId);
      setExpandedForm(form);
    } catch {
      setToast({ kind: "error", message: "Nu s-au putut încărca detaliile formularului." });
    } finally {
      setExpandedLoading(false);
    }
  }

  function handleFormCreated(form: FeedbackForm) {
    setForms((prev) => [form, ...prev]);
    setShowCreate(false);
    setToast({ kind: "success", message: `Formular "${form.title}" creat cu succes.` });
  }

  const responseRate = (form: FeedbackForm) => {
    if (!form.totalInvitations) return null;
    return Math.round(((form.submittedCount ?? 0) / form.totalInvitations) * 100);
  };

  return (
    <AppShell
      pageTitle="Formulare Feedback"
      pageDescription="Trimite sondaje elevilor și analizează răspunsurile"
      actions={
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Formular nou
        </button>
      }
    >
      {/* Toast */}
      {toast && (
        <div
          role="alert"
          className={cn(
            "fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold shadow-lg",
            toast.kind === "success"
              ? "bg-success text-success-foreground"
              : "bg-destructive text-destructive-foreground"
          )}
        >
          {toast.kind === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}

      {/* Create form modal */}
      {showCreate && (
        <CreateFormModal
          onCreated={handleFormCreated}
          onClose={() => setShowCreate(false)}
        />
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Se încarcă formularele...</span>
        </div>
      ) : forms.length === 0 ? (
        <div className="text-center py-16">
          <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">Niciun formular creat.</p>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Creează primul formular
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {forms.map((form) => {
            const rate = responseRate(form);
            const isExpanded = expandedId === form.id;

            return (
              <div
                key={form.id}
                className="rounded-xl border border-border bg-card overflow-hidden"
              >
                {/* Form header */}
                <button
                  type="button"
                  onClick={() => handleExpand(form.id)}
                  className="w-full flex items-start gap-4 p-4 hover:bg-muted/40 transition-colors text-left"
                  aria-expanded={isExpanded}
                  aria-label={`${isExpanded ? "Collapse" : "Expand"} formular ${form.title}`}
                >
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <BarChart2 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{form.title}</p>
                    {form.description && (
                      <p className="text-xs text-muted-foreground truncate">{form.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1">
                      {form.averageScore != null && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                          <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                          {form.averageScore.toFixed(1)}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {form.submittedCount ?? 0} / {form.totalInvitations ?? 0} răspunsuri
                      </span>
                      {rate != null && (
                        <span className={cn(
                          "text-xs font-semibold",
                          rate >= 70 ? "text-success" : rate >= 40 ? "text-warning" : "text-muted-foreground"
                        )}>
                          {rate}% rată
                        </span>
                      )}
                    </div>
                  </div>
                  {isExpanded
                    ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                    : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  }
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-border p-4 bg-muted/20">
                    {expandedLoading ? (
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Se încarcă detaliile...</span>
                      </div>
                    ) : expandedForm ? (
                      <FormDetails form={expandedForm} />
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

// ─── Form details ─────────────────────────────────────────────────────────────

function FormDetails({ form }: { form: FeedbackForm }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Întrebări
        </p>
        <ul className="space-y-1">
          {(form.questions ?? []).map((q) => (
            <li key={q.id} className="flex items-start gap-2 text-sm">
              <QuestionTypeBadge type={q.type} />
              <span>{q.label}</span>
            </li>
          ))}
        </ul>
      </div>

      {(form.questionStats ?? []).length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Scoruri medii
          </p>
          <div className="space-y-1">
            {(form.questionStats ?? []).map((stat) => {
              const q = form.questions?.find((q) => q.id === stat.questionId);
              return (
                <div key={stat.questionId} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate text-muted-foreground">{q?.label ?? stat.questionId}</span>
                  <span className="font-semibold">
                    {stat.average != null ? stat.average.toFixed(1) : "—"}
                  </span>
                  <span className="text-xs text-muted-foreground">({stat.responseCount} răsp.)</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionTypeBadge({ type }: { type: FeedbackQuestionType }) {
  const map: Record<FeedbackQuestionType, { label: string; cls: string }> = {
    rating: { label: "★ Stele", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
    nps: { label: "NPS", cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
    text: { label: "Text", cls: "bg-muted text-muted-foreground" },
    yesno: { label: "Da/Nu", cls: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  };
  const { label, cls } = map[type];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0", cls)}>
      {label}
    </span>
  );
}

// ─── Create form modal ────────────────────────────────────────────────────────

interface CreateFormModalProps {
  onCreated: (form: FeedbackForm) => void;
  onClose: () => void;
}

function CreateFormModal({ onCreated, onClose }: CreateFormModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<DraftQuestion[]>([
    { type: "rating", label: "Cât de mulțumit ești de curs?", required: true },
    { type: "nps", label: "Cu ce probabilitate recomanzi cursul? (0–10)", required: true },
    { type: "text", label: "Ce îmbunătățiri ai sugera?", required: false },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addQuestion() {
    setQuestions((prev) => [
      ...prev,
      { type: "text", label: "", required: false },
    ]);
  }

  function removeQuestion(i: number) {
    setQuestions((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateQuestion(i: number, updates: Partial<DraftQuestion>) {
    setQuestions((prev) =>
      prev.map((q, idx) => (idx === i ? { ...q, ...updates } : q))
    );
  }

  async function handleSave() {
    if (!title.trim()) { setError("Titlul este obligatoriu."); return; }
    if (questions.some((q) => !q.label.trim())) { setError("Toate întrebările trebuie să aibă un text."); return; }
    setSaving(true);
    setError(null);
    try {
      const { form } = await createFeedbackForm({
        title,
        description: description || null,
        questions: questions.map((q, i) => ({ ...q, position: i })),
      });
      onCreated(form);
    } catch {
      setError("Formularul nu a putut fi salvat. Reîncercați.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-xl rounded-2xl border border-border bg-card shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 space-y-4">
          <h2 className="text-base font-semibold">Formular nou de feedback</h2>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="fb-title" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Titlu *
            </label>
            <input
              id="fb-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Feedback final curs Engleză A1"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="fb-desc" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Descriere
            </label>
            <input
              id="fb-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Opțional"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Întrebări ({questions.length})
              </p>
              <button
                type="button"
                onClick={addQuestion}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Plus className="h-3 w-3" />
                Adaugă întrebare
              </button>
            </div>

            {questions.map((q, i) => (
              <div key={i} className="flex items-start gap-2 p-3 rounded-lg border border-border bg-muted/30">
                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    value={q.label}
                    onChange={(e) => updateQuestion(i, { label: e.target.value })}
                    placeholder="Textul întrebării..."
                    aria-label={`Textul întrebării ${i + 1}`}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <div className="flex items-center gap-2">
                    <select
                      value={q.type}
                      onChange={(e) => updateQuestion(i, { type: e.target.value as FeedbackQuestionType })}
                      aria-label={`Tipul întrebării ${i + 1}`}
                      className="rounded-md border border-input bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="rating">Stele (1–5)</option>
                      <option value="nps">NPS (0–10)</option>
                      <option value="text">Text liber</option>
                      <option value="yesno">Da / Nu</option>
                    </select>
                    <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={q.required}
                        onChange={(e) => updateQuestion(i, { required: e.target.checked })}
                        className="rounded"
                      />
                      Obligatoriu
                    </label>
                  </div>
                </div>
                {questions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeQuestion(i)}
                    aria-label={`Șterge întrebarea ${i + 1}`}
                    className="text-muted-foreground hover:text-destructive mt-1"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted"
            >
              Anulează
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Creează formular
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
