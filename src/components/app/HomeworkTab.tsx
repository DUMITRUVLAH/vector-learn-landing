/**
 * GAP-015: HomeworkTab — shared component for displaying homework
 * Used in SchedulePage (lesson view) and student detail view.
 *
 * Props:
 *   mode="lesson"  — shows lesson's homework list + add button (teacher/manager)
 *   mode="student" — shows student's homework across all lessons with status
 */
import { useEffect, useState } from "react";
import { Plus, Loader2, CheckCircle2, Clock, Trash2, BookOpen } from "lucide-react";
import {
  listLessonHomework,
  createHomework,
  deleteHomework,
  listStudentHomework,
  submitHomework,
  type Homework,
  type StudentHomework,
} from "@/lib/api/homework";
import { cn } from "@/lib/utils";

// ---- Lesson mode (teacher view) ----

interface LessonHomeworkTabProps {
  mode: "lesson";
  lessonId: string;
  /** If provided, enables submit button per item */
  studentId?: string;
}

// ---- Student mode ----

interface StudentHomeworkTabProps {
  mode: "student";
  studentId: string;
}

type Props = LessonHomeworkTabProps | StudentHomeworkTabProps;

function formatDate(d: string | null | undefined): string {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("ro-RO", { day: "2-digit", month: "short" });
  } catch {
    return d;
  }
}

// ============================================================
// LESSON mode
// ============================================================
function LessonHomeworkPanel({
  lessonId,
  studentId,
}: {
  lessonId: string;
  studentId?: string;
}) {
  const [items, setItems] = useState<Homework[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    setLoading(true);
    listLessonHomework(lessonId)
      .then(setItems)
      .catch(() => setError("Nu s-au putut încărca temele"))
      .finally(() => setLoading(false));
  }, [lessonId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const hw = await createHomework(lessonId, {
        title: title.trim(),
        description: description.trim() || null,
        dueDate: dueDate || null,
      });
      setItems((prev) => [...prev, { ...hw, submissionCount: 0 }]);
      setTitle("");
      setDescription("");
      setDueDate("");
      setShowForm(false);
      showToast("Temă adăugată");
    } catch {
      showToast("Eroare la adăugare temă");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (hwId: string) => {
    try {
      await deleteHomework(lessonId, hwId);
      setItems((prev) => prev.filter((h) => h.id !== hwId));
      showToast("Temă ștearsă");
    } catch {
      showToast("Nu se poate șterge tema (are submisii)");
    }
  };

  const handleSubmit = async (hwId: string) => {
    if (!studentId) return;
    setSubmitting(hwId);
    try {
      await submitHomework(hwId, studentId);
      showToast("Marcat ca predat");
    } catch {
      showToast("Eroare la marcare");
    } finally {
      setSubmitting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="animate-spin text-muted-foreground" size={20} />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive py-4">{error}</p>;
  }

  return (
    <div className="space-y-3">
      {toast && (
        <div className="rounded-lg bg-success/15 text-success text-sm px-3 py-2">{toast}</div>
      )}

      {items.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground py-4 text-center">
          Nicio temă adăugată pentru această lecție.
        </p>
      )}

      {items.map((hw) => (
        <div
          key={hw.id}
          className="flex items-start justify-between gap-3 p-3 rounded-lg border bg-card"
        >
          <div className="flex items-start gap-2 min-w-0">
            <BookOpen size={16} className="text-primary mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{hw.title}</p>
              {hw.description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {hw.description}
                </p>
              )}
              {hw.dueDate && (
                <p className="text-xs text-muted-foreground mt-1">
                  Termen: {formatDate(hw.dueDate)}
                </p>
              )}
              {typeof hw.submissionCount === "number" && (
                <p className="text-xs text-muted-foreground mt-1">
                  {hw.submissionCount} predăt{hw.submissionCount === 1 ? "" : "e"}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {studentId && (
              <button
                onClick={() => handleSubmit(hw.id)}
                disabled={submitting === hw.id}
                className="text-xs px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors min-h-[32px]"
                aria-label="Marchează ca predat"
              >
                {submitting === hw.id ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  "Predă"
                )}
              </button>
            )}
            <button
              onClick={() => handleDelete(hw.id)}
              className="text-muted-foreground hover:text-destructive transition-colors p-1 min-h-[32px] min-w-[32px] flex items-center justify-center"
              aria-label="Șterge tema"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}

      {showForm ? (
        <form onSubmit={handleAdd} className="space-y-2 p-3 rounded-lg border bg-card">
          <div>
            <label htmlFor="hw-title" className="text-xs font-medium text-muted-foreground sr-only">
              Titlu temă
            </label>
            <input
              id="hw-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titlu temă *"
              className="w-full text-sm border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
              autoFocus
              required
            />
          </div>
          <div>
            <label htmlFor="hw-desc" className="text-xs font-medium text-muted-foreground sr-only">
              Descriere (opțional)
            </label>
            <textarea
              id="hw-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descriere (opțional)"
              rows={2}
              className="w-full text-sm border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
          </div>
          <div>
            <label htmlFor="hw-due" className="text-xs font-medium text-muted-foreground">
              Termen limită (opțional)
            </label>
            <input
              id="hw-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full text-sm border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 mt-1"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="flex items-center gap-1 text-sm px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving && <Loader2 size={12} className="animate-spin" />}
              Adaugă
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setTitle("");
                setDescription("");
                setDueDate("");
              }}
              className="text-sm px-3 py-2 rounded-md border hover:bg-muted transition-colors"
            >
              Anulează
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors py-1"
          aria-label="Adaugă temă"
        >
          <Plus size={16} />
          Adaugă temă
        </button>
      )}
    </div>
  );
}

// ============================================================
// STUDENT mode
// ============================================================
function StudentHomeworkPanel({ studentId }: { studentId: string }) {
  const [items, setItems] = useState<StudentHomework[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    setLoading(true);
    listStudentHomework(studentId)
      .then(setItems)
      .catch(() => setError("Nu s-au putut încărca temele studentului"))
      .finally(() => setLoading(false));
  }, [studentId]);

  const handleSubmit = async (hw: StudentHomework) => {
    setSubmitting(hw.id);
    try {
      await submitHomework(hw.id, studentId);
      setItems((prev) =>
        prev.map((h) =>
          h.id === hw.id
            ? { ...h, status: "submitted", submittedAt: new Date().toISOString() }
            : h
        )
      );
      showToast("Temă marcată ca predată");
    } catch {
      showToast("Eroare la marcare");
    } finally {
      setSubmitting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="animate-spin text-muted-foreground" size={20} />
      </div>
    );
  }

  if (error) return <p className="text-sm text-destructive py-4">{error}</p>;

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Nicio temă atribuită acestui student.
      </p>
    );
  }

  const pending = items.filter((h) => h.status === "pending");
  const submitted = items.filter((h) => h.status === "submitted");

  return (
    <div className="space-y-4">
      {toast && (
        <div className="rounded-lg bg-success/15 text-success text-sm px-3 py-2">{toast}</div>
      )}

      {pending.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            De predat ({pending.length})
          </h3>
          <div className="space-y-2">
            {pending.map((hw) => (
              <div
                key={hw.id}
                className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-card"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Clock size={14} className="text-warning shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{hw.title}</p>
                    {hw.dueDate && (
                      <p className="text-xs text-muted-foreground">
                        Termen: {formatDate(hw.dueDate)}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleSubmit(hw)}
                  disabled={submitting === hw.id}
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground",
                    "hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0",
                    "min-h-[36px] min-w-[72px]"
                  )}
                  aria-label={`Marchează "${hw.title}" ca predată`}
                >
                  {submitting === hw.id ? (
                    <Loader2 size={12} className="animate-spin mx-auto" />
                  ) : (
                    "Predă"
                  )}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {submitted.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Predate ({submitted.length})
          </h3>
          <div className="space-y-2">
            {submitted.map((hw) => (
              <div
                key={hw.id}
                className="flex items-center gap-2 p-3 rounded-lg border bg-muted/40"
              >
                <CheckCircle2 size={14} className="text-success shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate text-muted-foreground">{hw.title}</p>
                  {hw.submittedAt && (
                    <p className="text-xs text-muted-foreground">
                      Predat: {formatDate(hw.submittedAt)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ============================================================
// Main export
// ============================================================
export function HomeworkTab(props: Props) {
  if (props.mode === "lesson") {
    return <LessonHomeworkPanel lessonId={props.lessonId} studentId={props.studentId} />;
  }
  return <StudentHomeworkPanel studentId={props.studentId} />;
}
