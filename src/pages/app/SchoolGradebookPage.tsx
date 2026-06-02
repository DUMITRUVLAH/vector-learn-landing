/**
 * SCHOOL-002 — /app/school/gradebook
 *
 * Catalog de note: selector clasă + termen → grilă elevi × materii cu medii colorate.
 * Buton „Adaugă notă" → modal rapid.
 */
import { useEffect, useState, useCallback } from "react";
import { Loader2, AlertCircle, Plus, BookMarked, Download, X } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  listAcademicYears,
  listAcademicTerms,
  listSchoolClasses,
  type AcademicYear,
  type AcademicTerm,
  type SchoolClass,
} from "@/lib/api/school";
import {
  listSubjects,
  listGrades,
  createGrade,
  type SchoolSubject,
  type GradeEntry,
  type GradeType,
} from "@/lib/api/gradebook";
import { listStudents, type Student } from "@/lib/api/students";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(avg: number | null): string {
  if (avg === null) return "text-muted-foreground";
  if (avg >= 8) return "text-emerald-600 dark:text-emerald-400 font-semibold";
  if (avg >= 5) return "text-amber-600 dark:text-amber-400 font-semibold";
  return "text-destructive font-semibold";
}

function avgBg(avg: number | null): string {
  if (avg === null) return "";
  if (avg >= 8) return "bg-emerald-50 dark:bg-emerald-950/30";
  if (avg >= 5) return "bg-amber-50 dark:bg-amber-950/30";
  return "bg-red-50 dark:bg-red-950/30";
}

function computeAvg(
  grades: GradeEntry[],
  studentId: string,
  subjectId: string
): number | null {
  const relevant = grades.filter(
    (g) => g.studentId === studentId && g.subjectId === subjectId
  );
  if (relevant.length === 0) return null;
  let totalWeight = 0;
  let weightedSum = 0;
  for (const g of relevant) {
    const v = parseFloat(g.value);
    const w = parseFloat(g.weight);
    if (!isNaN(v) && !isNaN(w)) {
      weightedSum += v * w;
      totalWeight += w;
    }
  }
  if (totalWeight === 0) return null;
  return Math.round((weightedSum / totalWeight) * 100) / 100;
}

// ─── Modal adaugă notă ────────────────────────────────────────────────────────

interface AddGradeModalProps {
  classId: string;
  termId: string;
  students: Student[];
  subjects: SchoolSubject[];
  onSave: (payload: {
    classId: string;
    studentId: string;
    subjectId: string;
    termId: string;
    value: number;
    weight: number;
    type: GradeType;
    title: string | null;
    gradedAt: string;
  }) => Promise<void>;
  onClose: () => void;
}

function AddGradeModal({
  classId,
  termId,
  students,
  subjects,
  onSave,
  onClose,
}: AddGradeModalProps) {
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [value, setValue] = useState("10");
  const [weight, setWeight] = useState("1");
  const [type, setType] = useState<GradeType>("test");
  const [title, setTitle] = useState("");
  const [gradedAt, setGradedAt] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const v = parseFloat(value);
    const w = parseFloat(weight);
    if (isNaN(v) || v < 0 || v > 100) {
      setError("Nota trebuie să fie între 0 și 100.");
      return;
    }
    if (isNaN(w) || w <= 0) {
      setError("Ponderea trebuie să fie mai mare decât 0.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        classId,
        studentId,
        subjectId,
        termId,
        value: v,
        weight: w,
        type,
        title: title.trim() || null,
        gradedAt,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la salvare");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Adaugă notă"
    >
      <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Adaugă notă</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Închide"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1" htmlFor="modal-student">
              Elev
            </label>
            <select
              id="modal-student"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.fullName}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1" htmlFor="modal-subject">
              Materie
            </label>
            <select
              id="modal-subject"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1" htmlFor="modal-value">
                Notă (0–10)
              </label>
              <input
                id="modal-value"
                type="number"
                min="0"
                max="10"
                step="0.01"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1" htmlFor="modal-weight">
                Pondere
              </label>
              <input
                id="modal-weight"
                type="number"
                min="0.1"
                max="10"
                step="0.1"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1" htmlFor="modal-type">
                Tip
              </label>
              <select
                id="modal-type"
                value={type}
                onChange={(e) => setType(e.target.value as GradeType)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="test">Lucrare scrisă</option>
                <option value="homework">Temă</option>
                <option value="oral">Oral</option>
                <option value="final">Finală</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1" htmlFor="modal-date">
                Data
              </label>
              <input
                id="modal-date"
                type="date"
                value={gradedAt}
                onChange={(e) => setGradedAt(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1" htmlFor="modal-title">
              Titlu (opțional)
            </label>
            <input
              id="modal-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ex. Lucrare scrisă Semestrul I"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm border border-input hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
          >
            Anulează
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !studentId || !subjectId}
            className="px-4 py-2 rounded-md text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {saving ? <Loader2 className="size-4 animate-spin inline mr-1" /> : null}
            Salvează
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function SchoolGradebookPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const [years, setYears] = useState<AcademicYear[]>([]);
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [subjects, setSubjects] = useState<SchoolSubject[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [grades, setGrades] = useState<GradeEntry[]>([]);

  const [selectedYearId, setSelectedYearId] = useState<string>("");
  const [selectedTermId, setSelectedTermId] = useState<string>("");
  const [selectedClassId, setSelectedClassId] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [gradesLoading, setGradesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddGrade, setShowAddGrade] = useState(false);

  // Load initial data
  useEffect(() => {
    if (sessionStatus !== "authenticated") return;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [{ years: yearsData }, subjectsData, { items: studentsData }] = await Promise.all([
          listAcademicYears(),
          listSubjects(),
          listStudents({ limit: 100 }),
        ]);
        setYears(yearsData);
        setSubjects(subjectsData);
        setStudents(studentsData);

        // Auto-select current year
        const currentYear = yearsData.find((y) => y.isCurrent) ?? yearsData[0];
        if (currentYear) {
          setSelectedYearId(currentYear.id);
          const { terms: termsData } = await listAcademicTerms(currentYear.id);
          setTerms(termsData);
          if (termsData.length > 0) setSelectedTermId(termsData[0].id);

          const { classes: classesData } = await listSchoolClasses(currentYear.id);
          setClasses(classesData);
          if (classesData.length > 0) setSelectedClassId(classesData[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Eroare la încărcare");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [sessionStatus]);

  // Reload grades when selection changes
  useEffect(() => {
    if (!selectedClassId || !selectedTermId) return;

    const loadGrades = async () => {
      setGradesLoading(true);
      try {
        const data = await listGrades({
          classId: selectedClassId,
          termId: selectedTermId,
          limit: 100,
        });
        setGrades(data);
      } catch {
        // non-blocking
      } finally {
        setGradesLoading(false);
      }
    };
    loadGrades();
  }, [selectedClassId, selectedTermId]);

  // When year changes, reload terms+classes
  const handleYearChange = useCallback(async (yearId: string) => {
    setSelectedYearId(yearId);
    setSelectedTermId("");
    setSelectedClassId("");
    setGrades([]);
    try {
      const [{ terms: termsData }, { classes: classesData }] = await Promise.all([
        listAcademicTerms(yearId),
        listSchoolClasses(yearId),
      ]);
      setTerms(termsData);
      setClasses(classesData);
      if (termsData.length > 0) setSelectedTermId(termsData[0].id);
      if (classesData.length > 0) setSelectedClassId(classesData[0].id);
    } catch {
      // non-blocking
    }
  }, []);

  const handleAddGrade = useCallback(
    async (payload: Parameters<typeof createGrade>[0]) => {
      await createGrade(payload);
      const data = await listGrades({
        classId: selectedClassId,
        termId: selectedTermId,
        limit: 100,
      });
      setGrades(data);
    },
    [selectedClassId, selectedTermId]
  );

  const handleExportCSV = useCallback(() => {
    if (grades.length === 0) return;
    const rows = grades.map((g) => [
      g.studentId,
      g.subjectId,
      g.value,
      g.weight,
      g.type,
      g.gradedAt,
    ]);
    const header = "studentId,subjectId,value,weight,type,gradedAt";
    const csv = [header, ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `note-${selectedClassId}-${selectedTermId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [grades, selectedClassId, selectedTermId]);

  if (sessionStatus === "loading") {
    return (
      <AppShell pageTitle="Catalog Note">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  if (sessionStatus === "unauthenticated") {
    navigate("/login");
    return null;
  }

  // All students that have grades in this class+term
  const gradedStudentIds = [...new Set(grades.map((g) => g.studentId))];
  const displayStudents = students.filter((s) => gradedStudentIds.includes(s.id));

  return (
    <AppShell pageTitle="Catalog Note">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <BookMarked className="size-6 text-primary" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-foreground">Catalog Note</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExportCSV}
              disabled={grades.length === 0}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-input text-sm hover:bg-muted disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Descarcă CSV"
            >
              <Download className="size-4" aria-hidden="true" />
              CSV
            </button>
            <button
              onClick={() => setShowAddGrade(true)}
              disabled={!selectedClassId || !selectedTermId || subjects.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <Plus className="size-4" aria-hidden="true" />
              Adaugă notă
            </button>
          </div>
        </div>

        {/* Selectors */}
        <div className="flex flex-wrap gap-3">
          <div className="min-w-[160px]">
            <label className="block text-xs font-medium text-muted-foreground mb-1" htmlFor="year-select">
              An școlar
            </label>
            <select
              id="year-select"
              value={selectedYearId}
              onChange={(e) => handleYearChange(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Selectează an școlar"
            >
              <option value="" disabled>Selectează…</option>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                  {y.isCurrent ? " (curent)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[160px]">
            <label className="block text-xs font-medium text-muted-foreground mb-1" htmlFor="term-select">
              Termen / semestru
            </label>
            <select
              id="term-select"
              value={selectedTermId}
              onChange={(e) => setSelectedTermId(e.target.value)}
              disabled={terms.length === 0}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              aria-label="Selectează termen"
            >
              <option value="" disabled>Selectează…</option>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div className="min-w-[160px]">
            <label className="block text-xs font-medium text-muted-foreground mb-1" htmlFor="class-select">
              Clasă
            </label>
            <select
              id="class-select"
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              disabled={classes.length === 0}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              aria-label="Selectează clasă"
            >
              <option value="" disabled>Selectează…</option>
              {classes.map((cl) => (
                <option key={cl.id} value={cl.id}>{cl.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div
            className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            <AlertCircle className="size-4 flex-shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        {/* Loading */}
        {(loading || gradesLoading) && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-8 animate-spin text-muted-foreground" aria-label="Se încarcă…" />
          </div>
        )}

        {/* Grade grid */}
        {!loading && !gradesLoading && selectedClassId && selectedTermId && (
          <div className="overflow-x-auto rounded-lg border border-border">
            {displayStudents.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                Nicio notă introdusă pentru această clasă și termen.
                <br />
                Apasă „Adaugă notă" pentru a începe.
              </div>
            ) : (
              <table className="w-full text-sm" role="table" aria-label="Catalog note">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">
                      Elev
                    </th>
                    {subjects.map((s) => (
                      <th
                        key={s.id}
                        className="px-3 py-3 text-center font-medium text-muted-foreground whitespace-nowrap"
                        scope="col"
                      >
                        {s.code ?? s.name.slice(0, 5)}
                        <span className="sr-only">{s.name}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayStudents.map((student, idx) => (
                    <tr
                      key={student.id}
                      className={cn(
                        "border-b border-border last:border-0",
                        idx % 2 === 0 ? "bg-background" : "bg-muted/20"
                      )}
                    >
                      <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                        {student.fullName}
                      </td>
                      {subjects.map((s) => {
                        const avg = computeAvg(grades, student.id, s.id);
                        return (
                          <td
                            key={s.id}
                            className={cn(
                              "px-3 py-3 text-center tabular-nums",
                              avgBg(avg)
                            )}
                          >
                            {avg !== null ? (
                              <span className={scoreColor(avg)}>{avg.toFixed(2)}</span>
                            ) : (
                              <span className="text-muted-foreground/40">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Empty state — no class/term selected */}
        {!loading && !selectedClassId && !error && (
          <div className="py-16 text-center text-muted-foreground text-sm">
            Selectează un an, termen și clasă pentru a vedea catalogul de note.
          </div>
        )}
      </div>

      {/* Modal adaugă notă */}
      {showAddGrade && selectedClassId && selectedTermId && (
        <AddGradeModal
          classId={selectedClassId}
          termId={selectedTermId}
          students={students}
          subjects={subjects}
          onSave={handleAddGrade}
          onClose={() => setShowAddGrade(false)}
        />
      )}
    </AppShell>
  );
}
