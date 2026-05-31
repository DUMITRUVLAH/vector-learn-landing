/**
 * FB-002 — Form builder. Edit a feedback form's title/description and its
 * ordered questions (add/remove/reorder, per-type options).
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2, ChevronUp, ChevronDown, Save } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { BackToFeedback } from "@/pages/app/FeedbackPage";
import { cn } from "@/lib/utils";
import {
  getForm,
  updateForm,
  STAGE_META,
  QUESTION_TYPE_LABEL,
  DEFAULT_QUESTIONS,
  type FeedbackStage,
  type FeedbackQuestionType,
  type QuestionInput,
} from "@/lib/api/feedback";

const QUESTION_TYPES: FeedbackQuestionType[] = [
  "rating",
  "scale",
  "single",
  "multi",
  "text",
  "yesno",
];

const NEEDS_OPTIONS: FeedbackQuestionType[] = ["single", "multi"];

interface FeedbackFormBuilderProps {
  stage: FeedbackStage;
  formId?: string;
  onClose: () => void;
}

export function FeedbackFormBuilder({ stage, formId, onClose }: FeedbackFormBuilderProps) {
  const [title, setTitle] = useState(STAGE_META[stage].label);
  const [description, setDescription] = useState(STAGE_META[stage].description);
  const [questions, setQuestions] = useState<QuestionInput[]>(DEFAULT_QUESTIONS[stage]);
  const [loading, setLoading] = useState(Boolean(formId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!formId) return;
    setLoading(true);
    try {
      const form = await getForm(formId);
      setTitle(form.title);
      setDescription(form.description ?? "");
      setQuestions(
        form.questions.map((q) => ({
          type: q.type,
          label: q.label,
          options: q.options,
          required: q.required,
        }))
      );
    } catch {
      setError("load_failed");
    } finally {
      setLoading(false);
    }
  }, [formId]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateQuestion = (idx: number, patch: Partial<QuestionInput>) => {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  };

  const addQuestion = () => {
    setQuestions((prev) => [...prev, { type: "rating", label: "", options: [], required: true }]);
  };

  const removeQuestion = (idx: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const move = (idx: number, dir: -1 | 1) => {
    setQuestions((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const canSave =
    formId != null &&
    title.trim().length > 0 &&
    questions.length > 0 &&
    questions.every(
      (q) => q.label.trim().length > 0 && (!NEEDS_OPTIONS.includes(q.type) || q.options.length >= 2)
    );

  const handleSave = async () => {
    if (!formId || !canSave) return;
    setSaving(true);
    setError(null);
    try {
      await updateForm(formId, {
        title: title.trim(),
        description: description.trim() || null,
        questions: questions.map((q) => ({
          type: q.type,
          label: q.label.trim(),
          options: NEEDS_OPTIONS.includes(q.type) ? q.options : [],
          required: q.required,
        })),
      });
      onClose();
    } catch {
      setError("save_failed");
      setSaving(false);
    }
  };

  return (
    <AppShell pageTitle="Editează formular" pageDescription={STAGE_META[stage].label}>
      <BackToFeedback onClick={onClose} />

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" aria-label="Se încarcă" />
        </div>
      ) : (
        <div className="max-w-3xl space-y-6">
          <div className="space-y-4 rounded-lg border border-border bg-card p-5">
            <div>
              <label htmlFor="f-title" className="mb-1 block text-sm font-semibold">
                Titlu formular *
              </label>
              <input
                id="f-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="f-desc" className="mb-1 block text-sm font-semibold">
                Descriere
              </label>
              <input
                id="f-desc"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Întrebări</h3>
            {questions.map((q, idx) => (
              <div key={idx} className="space-y-3 rounded-lg border border-border bg-card p-4">
                <div className="flex items-start gap-2">
                  <span className="mt-2 text-sm font-semibold text-muted-foreground">{idx + 1}.</span>
                  <div className="flex-1">
                    <label htmlFor={`q-label-${idx}`} className="sr-only">
                      Text întrebare {idx + 1}
                    </label>
                    <input
                      id={`q-label-${idx}`}
                      type="text"
                      value={q.label}
                      placeholder="Scrie întrebarea…"
                      onChange={(e) => updateQuestion(idx, { label: e.target.value })}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      aria-label="Mută în sus"
                      onClick={() => move(idx, -1)}
                      disabled={idx === 0}
                      className="inline-flex h-6 w-6 items-center justify-center rounded border border-border hover:bg-accent disabled:opacity-30"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Mută în jos"
                      onClick={() => move(idx, 1)}
                      disabled={idx === questions.length - 1}
                      className="inline-flex h-6 w-6 items-center justify-center rounded border border-border hover:bg-accent disabled:opacity-30"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    aria-label={`Șterge întrebarea ${idx + 1}`}
                    onClick={() => removeQuestion(idx)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-destructive hover:bg-destructive/10 touch-target"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-3 pl-6">
                  <div>
                    <label htmlFor={`q-type-${idx}`} className="sr-only">
                      Tip întrebare {idx + 1}
                    </label>
                    <select
                      id={`q-type-${idx}`}
                      value={q.type}
                      onChange={(e) =>
                        updateQuestion(idx, { type: e.target.value as FeedbackQuestionType })
                      }
                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    >
                      {QUESTION_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {QUESTION_TYPE_LABEL[t]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={q.required}
                      onChange={(e) => updateQuestion(idx, { required: e.target.checked })}
                      className="h-4 w-4 rounded border-input"
                    />
                    Obligatorie
                  </label>
                </div>

                {NEEDS_OPTIONS.includes(q.type) && (
                  <div className="pl-6">
                    <label htmlFor={`q-opts-${idx}`} className="mb-1 block text-xs font-medium text-muted-foreground">
                      Opțiuni (una pe linie, minim 2)
                    </label>
                    <textarea
                      id={`q-opts-${idx}`}
                      rows={3}
                      value={q.options.join("\n")}
                      onChange={(e) =>
                        updateQuestion(idx, {
                          options: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                        })
                      }
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      placeholder={"Opțiunea 1\nOpțiunea 2"}
                    />
                  </div>
                )}
              </div>
            ))}

            <button
              type="button"
              onClick={addQuestion}
              className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-sm font-medium hover:bg-accent touch-target"
            >
              <Plus className="h-4 w-4" /> Adaugă întrebare
            </button>
          </div>

          {error && (
            <p className="text-sm text-destructive">
              {error === "save_failed" ? "Salvarea a eșuat. Reîncearcă." : "Eroare la încărcare."}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!canSave || saving}
              className={cn(
                "inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 touch-target",
                (!canSave || saving) && "opacity-50"
              )}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvează formularul
            </button>
            {!canSave && !saving && (
              <span className="text-xs text-muted-foreground">
                Completează titlul, fiecare întrebare, și minim 2 opțiuni pentru alegeri.
              </span>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
