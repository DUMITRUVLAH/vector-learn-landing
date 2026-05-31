/**
 * FEEDBACK-601 — /feedback/:token (public no-auth page)
 *
 * Student-facing feedback form. No authentication required.
 * Accessed via the token URL sent by the academy manager.
 */
import { useEffect, useState } from "react";
import { Star, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Logo } from "@/components/Logo";
import {
  getPublicFeedbackForm,
  submitFeedback,
  type PublicFeedbackForm,
  type FeedbackQuestion,
  type FeedbackQuestionType,
} from "@/lib/api/feedback";
import { cn } from "@/lib/utils";

interface FeedbackPublicPageProps {
  token: string;
}

type AnswerMap = Record<string, string>;

export function FeedbackPublicPage({ token }: FeedbackPublicPageProps) {
  const [form, setForm] = useState<PublicFeedbackForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { form: f } = await getPublicFeedbackForm(token);
        if (!cancelled) {
          setForm(f);
          if (f.alreadySubmitted) setSubmitted(true);
        }
      } catch {
        if (!cancelled) setLoadError("Formularul nu a putut fi încărcat. Verificați linkul.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [token]);

  function setAnswer(questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  async function handleSubmit() {
    if (!form) return;
    // Check required questions
    const missing = form.questions.filter(
      (q) => q.required && !answers[q.id]?.trim()
    );
    if (missing.length > 0) {
      setError(`Completați toate câmpurile obligatorii (${missing.length} lipsesc).`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = form.questions.map((q) => ({
        questionId: q.id,
        value: answers[q.id] ?? null,
      }));
      const result = await submitFeedback(token, payload);
      if (!result.ok) {
        setError("Ați completat deja acest formular.");
      } else {
        setSubmitted(true);
      }
    } catch {
      setError("A apărut o eroare. Reîncercați.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card px-4 py-3 flex items-center gap-2">
        <Logo />
      </header>

      <main className="container mx-auto max-w-lg px-4 py-8">
        {loading ? (
          <div className="flex items-center justify-center gap-2 text-muted-foreground py-16">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span>Se încarcă formularul...</span>
          </div>
        ) : loadError ? (
          <div className="text-center py-16">
            <AlertCircle className="h-10 w-10 mx-auto text-destructive mb-3" />
            <p className="text-sm text-muted-foreground">{loadError}</p>
          </div>
        ) : submitted ? (
          <div className="text-center py-16">
            <div className="h-16 w-16 rounded-full bg-success/15 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <h2 className="text-xl font-bold mb-2">Mulțumim pentru feedback!</h2>
            <p className="text-sm text-muted-foreground">
              Răspunsurile tale au fost salvate. Îți apreciem timpul.
            </p>
          </div>
        ) : form ? (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold">{form.title}</h1>
              {form.description && (
                <p className="text-sm text-muted-foreground mt-1">{form.description}</p>
              )}
            </div>

            <div className="space-y-5">
              {form.questions.map((q) => (
                <QuestionField
                  key={q.id}
                  question={q}
                  value={answers[q.id] ?? ""}
                  onChange={(val) => setAnswer(q.id, val)}
                />
              ))}
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Se trimite...</>
              ) : (
                "Trimite feedback"
              )}
            </button>
          </div>
        ) : null}
      </main>
    </div>
  );
}

// ─── Question field components ────────────────────────────────────────────────

interface QuestionFieldProps {
  question: FeedbackQuestion;
  value: string;
  onChange: (value: string) => void;
}

function QuestionField({ question, value, onChange }: QuestionFieldProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-start gap-1">
        <TypeIcon type={question.type} />
        <p className="text-sm font-medium flex-1">
          {question.label}
          {question.required && <span className="text-destructive ml-0.5">*</span>}
        </p>
      </div>
      <AnswerInput question={question} value={value} onChange={onChange} />
    </div>
  );
}

function TypeIcon({ type }: { type: FeedbackQuestionType }) {
  if (type === "rating") return <Star className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />;
  return null;
}

function AnswerInput({ question, value, onChange }: QuestionFieldProps) {
  if (question.type === "rating") {
    return (
      <div className="flex gap-1" role="group" aria-label={`Rating for: ${question.label}`}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(String(star))}
            aria-label={`${star} stele`}
            className="touch-target"
          >
            <Star
              className={cn(
                "h-7 w-7 transition-colors",
                parseInt(value) >= star
                  ? "fill-amber-400 text-amber-400"
                  : "text-muted-foreground hover:text-amber-300"
              )}
            />
          </button>
        ))}
      </div>
    );
  }

  if (question.type === "nps") {
    return (
      <div className="space-y-2">
        <div className="flex gap-1 flex-wrap" role="group" aria-label={`NPS score for: ${question.label}`}>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(String(n))}
              aria-label={`${n} din 10`}
              className={cn(
                "h-9 w-9 rounded-md text-xs font-bold border transition-colors touch-target",
                value === String(n)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:border-primary/50"
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground px-1">
          <span>Deloc probabil</span>
          <span>Foarte probabil</span>
        </div>
      </div>
    );
  }

  if (question.type === "yesno") {
    return (
      <div className="flex gap-3" role="group" aria-label={`Yes/No for: ${question.label}`}>
        {["Da", "Nu"].map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt.toLowerCase())}
            aria-pressed={value === opt.toLowerCase()}
            className={cn(
              "flex-1 rounded-md border py-2 text-sm font-semibold transition-colors",
              value === opt.toLowerCase()
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border hover:border-primary/50"
            )}
          >
            {opt}
          </button>
        ))}
      </div>
    );
  }

  // text type
  return (
    <textarea
      rows={3}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Scrie răspunsul tău..."
      aria-label={question.label}
      className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}
