/**
 * FB-003 — PUBLIC student-facing feedback form (no auth). Opened via the
 * invitation link /#/feedback/:token. Renders the questions and submits once.
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, CheckCircle2, Star, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import {
  getPublicForm,
  submitPublicForm,
  type PublicForm,
  type FeedbackQuestionType,
} from "@/lib/api/feedback";

interface FeedbackPublicPageProps {
  token: string;
}

type AnswerValue = { valueNumber?: number | null; valueText?: string | null };

export function FeedbackPublicPage({ token }: FeedbackPublicPageProps) {
  const [data, setData] = useState<PublicForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getPublicForm(token);
      setData(res);
      if (res.alreadySubmitted) setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true);
      else setError("load_failed");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const setAnswer = (qid: string, value: AnswerValue) => {
    setAnswers((prev) => ({ ...prev, [qid]: value }));
  };

  const toggleMulti = (qid: string, option: string) => {
    setAnswers((prev) => {
      const current = (prev[qid]?.valueText ?? "").split("|").map((s) => s.trim()).filter(Boolean);
      const next = current.includes(option)
        ? current.filter((o) => o !== option)
        : [...current, option];
      return { ...prev, [qid]: { valueText: next.join("|") } };
    });
  };

  const missingRequired =
    data?.questions.filter((q) => {
      if (!q.required) return false;
      const a = answers[q.id];
      if (!a) return true;
      if (q.type === "text" || q.type === "single" || q.type === "multi") return !a.valueText;
      return a.valueNumber == null;
    }) ?? [];

  const handleSubmit = async () => {
    if (!data || missingRequired.length > 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = Object.entries(answers).map(([questionId, v]) => ({
        questionId,
        valueNumber: v.valueNumber ?? null,
        valueText: v.valueText ?? null,
      }));
      await submitPublicForm(token, payload);
      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === "already_submitted") setSubmitted(true);
      else setError("submit_failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Centered>
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" aria-label="Se încarcă" />
      </Centered>
    );
  }

  if (notFound) {
    return (
      <Centered>
        <div className="text-center">
          <AlertCircle className="mx-auto mb-3 h-9 w-9 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Link invalid</h1>
          <p className="text-sm text-muted-foreground">Acest formular nu există sau a expirat.</p>
        </div>
      </Centered>
    );
  }

  if (submitted) {
    return (
      <Centered>
        <div className="text-center">
          <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-primary" />
          <h1 className="text-xl font-semibold">Mulțumim pentru feedback!</h1>
          <p className="text-sm text-muted-foreground">Răspunsurile tale ne ajută să ne îmbunătățim.</p>
        </div>
      </Centered>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-background py-10 text-foreground">
      <div className="mx-auto max-w-2xl px-4">
        <header className="mb-8">
          <p className="text-sm font-medium text-primary">{data.form.stageMeta.label}</p>
          <h1 className="mt-1 text-2xl font-bold">{data.form.title}</h1>
          {data.form.description && (
            <p className="mt-1 text-sm text-muted-foreground">{data.form.description}</p>
          )}
          {data.studentName && (
            <p className="mt-2 text-sm text-muted-foreground">Salut, {data.studentName}!</p>
          )}
        </header>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
          className="space-y-6"
        >
          {data.questions.map((q, idx) => (
            <fieldset key={q.id} className="space-y-3 rounded-lg border border-border bg-card p-5">
              <legend className="px-1 text-base font-medium">
                {idx + 1}. {q.label}
                {q.required && <span className="ml-1 text-destructive">*</span>}
              </legend>
              <QuestionInput
                type={q.type}
                qid={q.id}
                options={q.options}
                value={answers[q.id]}
                onNumber={(n) => setAnswer(q.id, { valueNumber: n })}
                onText={(t) => setAnswer(q.id, { valueText: t })}
                onToggleMulti={(opt) => toggleMulti(q.id, opt)}
              />
            </fieldset>
          ))}

          {error && (
            <p className="text-sm text-destructive">Trimiterea a eșuat. Reîncearcă.</p>
          )}

          <button
            type="submit"
            disabled={submitting || missingRequired.length > 0}
            className={cn(
              "inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 touch-target",
              (submitting || missingRequired.length > 0) && "opacity-50"
            )}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Trimite răspunsurile
          </button>
          {missingRequired.length > 0 && (
            <p className="text-center text-xs text-muted-foreground">
              Mai ai {missingRequired.length}{" "}
              {missingRequired.length === 1 ? "întrebare obligatorie" : "întrebări obligatorii"} de
              completat.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}

interface QuestionInputProps {
  type: FeedbackQuestionType;
  qid: string;
  options: string[];
  value: AnswerValue | undefined;
  onNumber: (n: number) => void;
  onText: (t: string) => void;
  onToggleMulti: (option: string) => void;
}

function QuestionInput({ type, qid, options, value, onNumber, onText, onToggleMulti }: QuestionInputProps) {
  if (type === "rating") {
    return (
      <div className="flex gap-2" role="radiogroup" aria-label="Rating 1 la 5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value?.valueNumber === n}
            aria-label={`${n} ${n === 1 ? "stea" : "stele"}`}
            onClick={() => onNumber(n)}
            className="touch-target rounded-md p-1.5 transition-transform hover:scale-110"
          >
            <Star
              className={cn(
                "h-8 w-8",
                value?.valueNumber != null && n <= value.valueNumber
                  ? "fill-primary text-primary"
                  : "text-muted-foreground/40"
              )}
            />
          </button>
        ))}
      </div>
    );
  }

  if (type === "scale") {
    return (
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Scală 0 la 10">
        {Array.from({ length: 11 }, (_, n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value?.valueNumber === n}
            onClick={() => onNumber(n)}
            className={cn(
              "h-10 w-10 touch-target rounded-md border text-sm font-medium",
              value?.valueNumber === n
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input hover:bg-accent"
            )}
          >
            {n}
          </button>
        ))}
      </div>
    );
  }

  if (type === "yesno") {
    return (
      <div className="flex gap-3" role="radiogroup" aria-label="Da sau Nu">
        {[
          { label: "Da", val: 1 },
          { label: "Nu", val: 0 },
        ].map((o) => (
          <button
            key={o.val}
            type="button"
            role="radio"
            aria-checked={value?.valueNumber === o.val}
            onClick={() => onNumber(o.val)}
            className={cn(
              "flex-1 touch-target rounded-md border px-4 py-2.5 text-sm font-medium",
              value?.valueNumber === o.val
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input hover:bg-accent"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    );
  }

  if (type === "single") {
    return (
      <div className="space-y-2" role="radiogroup" aria-label="Alegere unică">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={value?.valueText === opt}
            onClick={() => onText(opt)}
            className={cn(
              "flex w-full items-center gap-3 rounded-md border px-4 py-2.5 text-left text-sm touch-target",
              value?.valueText === opt ? "border-primary bg-accent" : "border-input hover:bg-accent"
            )}
          >
            <span
              className={cn(
                "flex h-4 w-4 items-center justify-center rounded-full border",
                value?.valueText === opt ? "border-primary" : "border-input"
              )}
            >
              {value?.valueText === opt && <span className="h-2 w-2 rounded-full bg-primary" />}
            </span>
            {opt}
          </button>
        ))}
      </div>
    );
  }

  if (type === "multi") {
    const picked = (value?.valueText ?? "").split("|").map((s) => s.trim()).filter(Boolean);
    return (
      <div className="space-y-2">
        {options.map((opt) => {
          const isOn = picked.includes(opt);
          return (
            <label
              key={opt}
              className={cn(
                "flex w-full cursor-pointer items-center gap-3 rounded-md border px-4 py-2.5 text-sm touch-target",
                isOn ? "border-primary bg-accent" : "border-input hover:bg-accent"
              )}
            >
              <input
                type="checkbox"
                checked={isOn}
                onChange={() => onToggleMulti(opt)}
                className="h-4 w-4 rounded border-input"
              />
              {opt}
            </label>
          );
        })}
      </div>
    );
  }

  // text
  return (
    <>
      <label htmlFor={`pub-${qid}`} className="sr-only">
        Răspunsul tău
      </label>
      <textarea
        id={`pub-${qid}`}
        rows={3}
        value={value?.valueText ?? ""}
        onChange={(e) => onText(e.target.value)}
        placeholder="Scrie răspunsul tău…"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
    </>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      {children}
    </div>
  );
}
