/**
 * GAP-012 — /app/progress/skills
 * Manager defines skills per course (e.g. "Pronunție", "Vocabular", "Gramatică").
 */
import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, Loader2, BookOpen, AlertCircle, X } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  listSkills,
  createSkill,
  deleteSkill,
  type ProgressSkill,
} from "@/lib/api/progress";
import { listCourses, type Course } from "@/lib/api/lessons";
import { cn } from "@/lib/utils";

interface Toast {
  kind: "success" | "error";
  message: string;
}

function DeleteConfirmModal({
  skill,
  onConfirm,
  onCancel,
}: {
  skill: ProgressSkill;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirmare ștergere skill"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
    >
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h2 className="text-base font-semibold text-foreground">Șterge skill</h2>
        <p className="text-sm text-muted-foreground">
          Ești sigur că vrei să ștergi skill-ul{" "}
          <span className="font-medium text-foreground">&ldquo;{skill.name}&rdquo;</span>? Acțiunea
          este ireversibilă.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
          >
            Anulează
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3 py-1.5 text-sm rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
          >
            Șterge
          </button>
        </div>
      </div>
    </div>
  );
}

interface AddSkillModalProps {
  courses: Course[];
  onAdd: (payload: { courseId: string; name: string; description?: string }) => Promise<void>;
  onClose: () => void;
}

function AddSkillModal({ courses, onAdd, onClose }: AddSkillModalProps) {
  const [courseId, setCourseId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId || !name.trim()) {
      setErr("Curs și nume sunt obligatorii.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await onAdd({ courseId, name: name.trim(), description: description.trim() || undefined });
      onClose();
    } catch {
      setErr("A apărut o eroare. Încearcă din nou.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Adaugă skill"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
    >
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Skill nou</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide"
            className="touch-target rounded-md hover:bg-muted flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="skill-course" className="block text-sm font-medium text-foreground">
              Curs <span aria-hidden="true">*</span>
            </label>
            <select
              id="skill-course"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              required
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">Selectează cursul...</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="skill-name" className="block text-sm font-medium text-foreground">
              Nume skill <span aria-hidden="true">*</span>
            </label>
            <input
              id="skill-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              required
              placeholder="ex. Pronunție, Vocabular, Gramatică..."
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="skill-desc" className="block text-sm font-medium text-foreground">
              Descriere{" "}
              <span className="text-muted-foreground font-normal">(opțional)</span>
            </label>
            <textarea
              id="skill-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Scurtă descriere a skill-ului..."
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
          </div>

          {err && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              {err}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
            >
              Anulează
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Adaugă skill
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ProgressSkillsPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();
  const [skills, setSkills] = useState<ProgressSkill[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterCourseId, setFilterCourseId] = useState<string>("");
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ProgressSkill | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  const showToast = useCallback((t: Toast) => {
    setToast(t);
    setTimeout(() => setToast(null), 4000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sk, co] = await Promise.all([
        listSkills(filterCourseId || undefined),
        listCourses(),
      ]);
      setSkills(sk);
      setCourses(co.items);
    } catch {
      setError("Nu s-au putut încărca skill-urile.");
    } finally {
      setLoading(false);
    }
  }, [filterCourseId]);

  useEffect(() => {
    if (sessionStatus === "authenticated") void load();
  }, [sessionStatus, load]);

  async function handleAdd(payload: { courseId: string; name: string; description?: string }) {
    await createSkill(payload);
    showToast({ kind: "success", message: "Skill adăugat cu succes." });
    void load();
  }

  async function handleDelete(skill: ProgressSkill) {
    try {
      await deleteSkill(skill.id);
      showToast({ kind: "success", message: `Skill "${skill.name}" șters.` });
      void load();
    } catch (err: unknown) {
      const msg =
        err instanceof Error && err.message.includes("skill_has_entries")
          ? "Nu se poate șterge — există evaluări înregistrate pentru acest skill."
          : "A apărut o eroare la ștergere.";
      showToast({ kind: "error", message: msg });
    }
    setConfirmDelete(null);
  }

  const courseMap = Object.fromEntries(courses.map((c) => [c.id, c.name]));

  if (sessionStatus === "loading") {
    return (
      <AppShell pageTitle="Progres elevi">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell pageTitle="Progres elevi">
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "fixed bottom-4 right-4 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm",
            toast.kind === "success"
              ? "bg-success text-success-foreground"
              : "bg-destructive text-destructive-foreground"
          )}
        >
          {toast.message}
        </div>
      )}

      {showAdd && (
        <AddSkillModal
          courses={courses}
          onAdd={handleAdd}
          onClose={() => setShowAdd(false)}
        />
      )}

      {confirmDelete && (
        <DeleteConfirmModal
          skill={confirmDelete}
          onConfirm={() => void handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">Skills de progres</h1>
              <p className="text-xs text-muted-foreground">
                Definește competențele evaluate per curs
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Skill nou
          </button>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <label htmlFor="filter-course" className="sr-only">
            Filtrează după curs
          </label>
          <select
            id="filter-course"
            value={filterCourseId}
            onChange={(e) => setFilterCourseId(e.target.value)}
            className="text-sm border border-border rounded-lg px-3 py-1.5 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 min-w-[180px]"
          >
            <option value="">Toate cursurile</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Content */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && !loading && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />
            <p className="text-sm text-foreground">{error}</p>
          </div>
        )}

        {!loading && !error && skills.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 py-16 text-center">
            <BookOpen className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">
              Nu există skill-uri{filterCourseId ? " pentru acest curs" : " definite"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Adaugă primul skill pentru a putea evalua elevii.
            </p>
          </div>
        )}

        {!loading && !error && skills.length > 0 && (
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th
                    scope="col"
                    className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5"
                  >
                    Skill
                  </th>
                  <th
                    scope="col"
                    className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5 hidden sm:table-cell"
                  >
                    Curs
                  </th>
                  <th scope="col" className="w-10 px-4 py-2.5">
                    <span className="sr-only">Acțiuni</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {skills.map((skill) => (
                  <tr key={skill.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{skill.name}</p>
                      {skill.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {skill.description}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="text-xs text-muted-foreground">
                        {courseMap[skill.courseId] ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(skill)}
                        aria-label={`Șterge skill ${skill.name}`}
                        className="touch-target rounded-md hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors flex items-center justify-center"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {skills.length} skill{skills.length !== 1 ? "-uri" : ""} afișate
        </p>
      </div>
    </AppShell>
  );
}
