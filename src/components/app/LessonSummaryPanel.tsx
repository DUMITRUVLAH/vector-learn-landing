/**
 * AI-A01 — Lesson Summary Panel
 *
 * Inline panel shown in a lesson context (e.g. SchedulePage lesson detail).
 * Teacher clicks "Generează sumar AI", reviews, edits, and approves.
 * Human-in-the-loop: draft is never sent without teacher approval.
 */
import { useState } from "react";
import { Sparkles, Check, X, Loader2, ShieldCheck } from "lucide-react";

interface LessonSummaryPanelProps {
  lessonId?: string;
  /** Pre-filled teacher notes (from the lesson form) */
  teacherNotes?: string;
  studentName?: string;
}

interface SummaryResponse {
  summary: string;
  auditId: string;
  model: string;
  isStub: boolean;
  pseudonymized: boolean;
}

export function LessonSummaryPanel({
  lessonId,
  teacherNotes,
  studentName,
}: LessonSummaryPanelProps) {
  const [notes, setNotes] = useState(teacherNotes ?? "");
  const [summary, setSummary] = useState("");
  const [auditId, setAuditId] = useState("");
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStub, setIsStub] = useState(false);

  const handleGenerate = async () => {
    if (!notes.trim()) return;
    setLoading(true);
    setError(null);
    setSummary("");
    setApproved(false);

    try {
      const resp = await fetch("/api/ai/lesson-summary", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lessonId,
          teacherNotes: notes,
          studentName,
        }),
      });

      if (!resp.ok) {
        const body = (await resp.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${resp.status}`);
      }

      const data = (await resp.json()) as SummaryResponse;
      setSummary(data.summary);
      setAuditId(data.auditId);
      setIsStub(data.isStub);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare necunoscută");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!auditId) return;
    setApproving(true);
    setError(null);

    try {
      const resp = await fetch(`/api/ai/lesson-summary/${auditId}/approve`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ editedSummary: summary }),
      });

      if (!resp.ok) {
        const body = (await resp.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${resp.status}`);
      }

      setApproved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare necunoscută");
    } finally {
      setApproving(false);
    }
  };

  const handleCancel = () => {
    setSummary("");
    setAuditId("");
    setApproved(false);
    setError(null);
  };

  return (
    <div className="border border-border rounded-lg p-4 space-y-3 bg-card">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
        <h3 className="text-sm font-semibold">Sumar lecție AI</h3>
        {/* GDPR badge */}
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <ShieldCheck className="h-3 w-3 text-emerald-600" aria-hidden="true" />
          Date pseudonimizate
        </span>
      </div>

      {/* Teacher notes input */}
      <div className="space-y-1">
        <label htmlFor="lesson-teacher-notes" className="text-xs font-medium text-muted-foreground">
          Notițele profesorului
        </label>
        <textarea
          id="lesson-teacher-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notele tale despre această lecție..."
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          rows={3}
          aria-label="Notițele profesorului"
        />
      </div>

      {/* Generate button */}
      {!summary && (
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading || !notes.trim()}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="Generează sumar AI din notițe"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          )}
          {loading ? "Se generează..." : "Generează sumar AI"}
        </button>
      )}

      {/* Error display */}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Summary result */}
      {summary && !approved && (
        <div className="space-y-3">
          {isStub && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              AI nu este configurat — sumar demonstrativ. Configurați AI_API_KEY pentru răspunsuri reale.
            </p>
          )}
          <div className="space-y-1">
            <label htmlFor="lesson-summary-text" className="text-xs font-medium text-muted-foreground">
              Sumar generat (editabil)
            </label>
            <textarea
              id="lesson-summary-text"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              rows={5}
              aria-label="Sumar generat de AI"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleApprove}
              disabled={approving}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              aria-label="Aprobă sumarul și creează draft mesaj"
            >
              {approving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="h-4 w-4" aria-hidden="true" />
              )}
              Trimite
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
              aria-label="Anulează sumarul generat"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Anulează
            </button>
          </div>
        </div>
      )}

      {/* Approved state */}
      {approved && (
        <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
          <Check className="h-4 w-4" aria-hidden="true" />
          Sumar aprobat — draft mesaj creat pentru părinte.
        </div>
      )}
    </div>
  );
}
