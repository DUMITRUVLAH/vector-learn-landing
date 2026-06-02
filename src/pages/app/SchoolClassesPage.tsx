/**
 * SCHOOL-001 — /app/school/classes
 *
 * Pagina de administrare clase: afișează clasele pentru anul curent,
 * permite adăugarea unei clase noi, și înscrierea elevilor.
 */
import { useEffect, useState, useCallback } from "react";
import { Loader2, AlertCircle, Plus, Users, School, X } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  listAcademicYears,
  listSchoolClasses,
  createSchoolClass,
  enrollStudent,
  withdrawStudent,
  type AcademicYear,
  type SchoolClass,
} from "@/lib/api/school";
import { listStudents, type Student } from "@/lib/api/students";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gradeLabel(gradeLevel: string): string {
  const ROMAN: Record<string, string> = {
    "1": "I", "2": "II", "3": "III", "4": "IV", "5": "V",
    "6": "VI", "7": "VII", "8": "VIII", "9": "IX", "10": "X",
    "11": "XI", "12": "XII",
  };
  const roman = ROMAN[gradeLevel];
  if (!roman) return `clasa ${gradeLevel}`;
  if (["I", "II", "III"].includes(roman)) return `clasa ${roman}`;
  return `a ${roman}-a`;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function SchoolClassesPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedClass, setSelectedClass] = useState<SchoolClass | null>(null);
  const [showAddClass, setShowAddClass] = useState(false);
  const [showEnroll, setShowEnroll] = useState(false);

  // Form state for new class
  const [newClassName, setNewClassName] = useState("");
  const [newGradeLevel, setNewGradeLevel] = useState("");
  const [newSection, setNewSection] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Enroll state
  const [enrollStudentId, setEnrollStudentId] = useState("");
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [enrollSaving, setEnrollSaving] = useState(false);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  const currentYear = years.find((y) => y.isCurrent) ?? years[0] ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ years: ys }, studentsResp] = await Promise.all([
        listAcademicYears(),
        // Server caps limit at 100 (students Zod schema). 500 → 400, would break the enroll picker.
        listStudents({ limit: 100, status: "active" }),
      ]);
      setYears(ys);
      setStudents(studentsResp.items);

      const currentYearId = ys.find((y) => y.isCurrent)?.id ?? ys[0]?.id;
      if (currentYearId) {
        const { classes: cls } = await listSchoolClasses(currentYearId);
        setClasses(cls);
      } else {
        setClasses([]);
      }
    } catch {
      setError("Nu s-au putut încărca datele. Încearcă din nou.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionStatus === "authenticated") load();
  }, [sessionStatus, load]);

  const handleAddClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentYear) return;
    if (!newGradeLevel.trim()) {
      setFormError("Clasa este obligatorie.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const name =
        newClassName.trim() ||
        `${gradeLabel(newGradeLevel.trim())}${newSection.trim() ? " " + newSection.trim() : ""}`;

      await createSchoolClass({
        academicYearId: currentYear.id,
        name,
        gradeLevel: newGradeLevel.trim(),
        section: newSection.trim() || null,
      });
      setShowAddClass(false);
      setNewClassName("");
      setNewGradeLevel("");
      setNewSection("");
      await load();
    } catch {
      setFormError("Eroare la creare. Încearcă din nou.");
    } finally {
      setSaving(false);
    }
  };

  const handleEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClass || !enrollStudentId) return;

    setEnrollSaving(true);
    setEnrollError(null);
    try {
      await enrollStudent(selectedClass.id, enrollStudentId);
      setShowEnroll(false);
      setEnrollStudentId("");
      await load();
      // Actualizăm clasa selectată
      const updated = classes.find((c) => c.id === selectedClass.id);
      if (updated) setSelectedClass({ ...updated, enrollmentCount: updated.enrollmentCount + 1 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Eroare";
      if (msg.includes("already_enrolled")) {
        setEnrollError("Elevul este deja înscris în această clasă.");
      } else if (msg.includes("class_full")) {
        setEnrollError("Clasa este plină. Nu mai sunt locuri disponibile.");
      } else {
        setEnrollError("Eroare la înscriere. Încearcă din nou.");
      }
    } finally {
      setEnrollSaving(false);
    }
  };

  const handleWithdraw = async (classId: string, studentId: string) => {
    try {
      await withdrawStudent(classId, studentId);
      await load();
    } catch {
      // Eroare silențioasă — reîncărcăm oricum
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <AppShell
      pageTitle="Clase"
      pageDescription={currentYear ? `An școlar: ${currentYear.name}` : "Niciun an școlar activ"}
      actions={
        <button
          type="button"
          onClick={() => setShowAddClass(true)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Adaugă clasă
        </button>
      }
    >
      {loading && (
        <div className="flex items-center justify-center py-12" role="status" aria-label="Se încarcă...">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {!loading && !error && !currentYear && (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <School className="mx-auto h-10 w-10 text-muted-foreground mb-3" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">Niciun an școlar configurat</p>
          <p className="text-xs text-muted-foreground mt-1">
            Creează mai întâi un an școlar prin API sau din configurare.
          </p>
        </div>
      )}

      {!loading && !error && currentYear && classes.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Users className="mx-auto h-10 w-10 text-muted-foreground mb-3" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">Nicio clasă în {currentYear.name}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Adaugă prima clasă cu butonul de mai sus.
          </p>
        </div>
      )}

      {!loading && !error && classes.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {classes.map((cls) => (
            <button
              key={cls.id}
              type="button"
              onClick={() => setSelectedClass(cls)}
              className={cn(
                "text-left rounded-lg border p-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selectedClass?.id === cls.id
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card"
              )}
              aria-label={`Clasă ${cls.name}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-sm text-foreground">{cls.name}</p>
                  {cls.homeroomTeacherName && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Dir.: {cls.homeroomTeacherName}
                    </p>
                  )}
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                    cls.capacity != null && cls.enrollmentCount >= cls.capacity
                      ? "bg-destructive/15 text-destructive"
                      : "bg-primary/10 text-primary"
                  )}
                >
                  {cls.enrollmentCount}
                  {cls.capacity != null ? `/${cls.capacity}` : ""} elevi
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Detalii clasă selectată */}
      {selectedClass && (
        <div className="mt-8 rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="font-semibold text-sm">{selectedClass.name} — Elevi înscriși</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowEnroll(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Înscrie elev
              </button>
              <button
                type="button"
                onClick={() => setSelectedClass(null)}
                aria-label="Închide detalii clasă"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <ClassEnrollmentList
            cls={selectedClass}
            students={students}
            onWithdraw={handleWithdraw}
          />
        </div>
      )}

      {/* Modal: Adaugă clasă */}
      {showAddClass && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-class-title"
        >
          <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 id="add-class-title" className="font-semibold text-sm">Adaugă clasă nouă</h2>
              <button
                type="button"
                onClick={() => { setShowAddClass(false); setFormError(null); }}
                aria-label="Închide"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleAddClass} className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="grade-level" className="block text-xs font-medium text-foreground">
                  Clasa <span className="text-destructive" aria-hidden="true">*</span>
                </label>
                <input
                  id="grade-level"
                  type="text"
                  value={newGradeLevel}
                  onChange={(e) => setNewGradeLevel(e.target.value)}
                  placeholder="ex. 5, 9, 12"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                  aria-required="true"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="section" className="block text-xs font-medium text-foreground">
                  Secțiunea (opțional)
                </label>
                <input
                  id="section"
                  type="text"
                  value={newSection}
                  onChange={(e) => setNewSection(e.target.value)}
                  placeholder="ex. A, B"
                  maxLength={10}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="class-name" className="block text-xs font-medium text-foreground">
                  Nume personalizat (opțional)
                </label>
                <input
                  id="class-name"
                  type="text"
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  placeholder="ex. a V-a A"
                  maxLength={100}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {formError && (
                <p className="text-xs text-destructive" role="alert">{formError}</p>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowAddClass(false); setFormError(null); }}
                  className="flex-1 rounded-md border border-border bg-transparent px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  Renunță
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                  Adaugă
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Înscrie elev */}
      {showEnroll && selectedClass && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="enroll-title"
        >
          <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 id="enroll-title" className="font-semibold text-sm">
                Înscrie elev în {selectedClass.name}
              </h2>
              <button
                type="button"
                onClick={() => { setShowEnroll(false); setEnrollError(null); }}
                aria-label="Închide"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleEnroll} className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="student-select" className="block text-xs font-medium text-foreground">
                  Elev <span className="text-destructive" aria-hidden="true">*</span>
                </label>
                <select
                  id="student-select"
                  value={enrollStudentId}
                  onChange={(e) => setEnrollStudentId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                  aria-required="true"
                >
                  <option value="">Selectează elevul…</option>
                  {students
                    .filter((s) => s.status === "active")
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.fullName}
                      </option>
                    ))}
                </select>
              </div>

              {enrollError && (
                <p className="text-xs text-destructive" role="alert">{enrollError}</p>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowEnroll(false); setEnrollError(null); }}
                  className="flex-1 rounded-md border border-border bg-transparent px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  Renunță
                </button>
                <button
                  type="submit"
                  disabled={enrollSaving || !enrollStudentId}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
                >
                  {enrollSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                  Înscrie
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}

// ─── ClassEnrollmentList ──────────────────────────────────────────────────────

interface ClassEnrollmentListProps {
  cls: SchoolClass;
  students: Student[];
  onWithdraw: (classId: string, studentId: string) => void;
}

function ClassEnrollmentList({ cls, students, onWithdraw }: ClassEnrollmentListProps) {
  // Filtrăm elevii înscriși pe baza listei din students (lazy, nu refacem apel API)
  // Notă: pentru o implementare completă ar fi nevoie de GET .../classes/:id/enrollments
  // Deocamdată afișăm contorul + butonul de înscris
  if (cls.enrollmentCount === 0) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-sm text-muted-foreground">Niciun elev înscris în această clasă.</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      <p className="text-sm text-muted-foreground">
        {cls.enrollmentCount} {cls.enrollmentCount === 1 ? "elev înscris" : "elevi înscriși"}
        {cls.capacity != null && ` din ${cls.capacity} locuri`}.
      </p>
      {/* Butoanele de retragere necesită o rută GET pentru lista de înscriuți — SCHOOL-003 */}
    </div>
  );
}
