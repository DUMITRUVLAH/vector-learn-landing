/**
 * SCHOOL-003 — /app/school/attendance
 *
 * Catalog de prezență: selector clasă + dată, tabel elevi cu butoane P/A/Î/X,
 * salvare bulk.
 */
import { useEffect, useState, useCallback } from "react";
import { Loader2, AlertCircle, ClipboardList, Save } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  getAttendance,
  saveAttendanceRecords,
  type AttendanceResponse,
  type RecordInput,
} from "@/lib/api/attendance";
import { listSchoolClasses } from "@/lib/api/school";
import type { SchoolClass } from "@/lib/api/school";
import { listAcademicYears } from "@/lib/api/school";
import { cn } from "@/lib/utils";

type Status = "present" | "absent" | "late" | "excused";

const STATUS_LABELS: Record<Status, string> = {
  present: "P",
  absent: "A",
  late: "Î",
  excused: "X",
};

const STATUS_FULL: Record<Status, string> = {
  present: "Prezent",
  absent: "Absent",
  late: "Întârziat",
  excused: "Motivat",
};

const STATUS_COLORS: Record<Status, string> = {
  present: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",
  absent: "bg-destructive/15 text-destructive border-destructive/30",
  late: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
  excused: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export function SchoolAttendancePage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const today = new Date().toISOString().slice(0, 10);

  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(today);

  const [attendance, setAttendance] = useState<AttendanceResponse | null>(null);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});

  const [loading, setLoading] = useState(false);
  const [classesLoading, setClassesLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  // Încarcă clasele la mount
  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    async function loadClasses() {
      setClassesLoading(true);
      try {
        const { years } = await listAcademicYears();
        const currentYear = years.find((y) => y.isCurrent) ?? years[0];
        if (currentYear) {
          const { classes: cls } = await listSchoolClasses(currentYear.id);
          setClasses(cls);
          if (cls.length > 0 && !selectedClassId) {
            setSelectedClassId(cls[0].id);
          }
        }
      } catch {
        setError("Nu s-au putut încărca clasele.");
      } finally {
        setClassesLoading(false);
      }
    }
    loadClasses();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus]);

  // Încarcă prezența când se schimbă clasa sau data
  const loadAttendance = useCallback(async () => {
    if (!selectedClassId || !selectedDate) return;
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const data = await getAttendance(selectedClassId, selectedDate);
      setAttendance(data);

      // Inițializăm statuses din recordurile existente, default „present" pentru toți
      const init: Record<string, Status> = {};
      for (const enrolled of data.enrolled) {
        if (enrolled.studentId) {
          init[enrolled.studentId] = "present";
        }
      }
      for (const rec of data.records) {
        init[rec.studentId] = rec.status;
      }
      setStatuses(init);
    } catch {
      setError("Nu s-a putut încărca catalogul. Încearcă din nou.");
    } finally {
      setLoading(false);
    }
  }, [selectedClassId, selectedDate]);

  useEffect(() => {
    if (sessionStatus === "authenticated" && selectedClassId) {
      loadAttendance();
    }
  }, [sessionStatus, loadAttendance, selectedClassId, selectedDate]);

  const handleSave = async () => {
    if (!attendance) return;
    setSaving(true);
    setError(null);
    try {
      const records: RecordInput[] = Object.entries(statuses).map(([studentId, status]) => ({
        studentId,
        status,
      }));
      await saveAttendanceRecords(attendance.session.id, records);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Eroare la salvare. Încearcă din nou.");
    } finally {
      setSaving(false);
    }
  };

  const selectedClass = classes.find((c) => c.id === selectedClassId);
  const enrolledCount = attendance?.enrolled.length ?? 0;
  const presentCount = Object.values(statuses).filter(
    (s) => s === "present" || s === "late"
  ).length;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <AppShell
      pageTitle="Prezență"
      pageDescription={
        selectedClass
          ? `${selectedClass.name} — ${formatDate(selectedDate)}`
          : "Catalog de prezență"
      }
      actions={
        attendance && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || enrolledCount === 0}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            {saved ? "Salvat!" : "Salvează"}
          </button>
        )
      }
    >
      {/* Selector clasă + dată */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex-1 space-y-1">
          <label htmlFor="class-select" className="block text-xs font-medium text-foreground">
            Clasa
          </label>
          {classesLoading ? (
            <div className="h-10 rounded-md border border-input bg-muted animate-pulse" />
          ) : (
            <select
              id="class-select"
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {classes.length === 0 && (
                <option value="">Nicio clasă configurată</option>
              )}
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex-1 space-y-1">
          <label htmlFor="date-select" className="block text-xs font-medium text-foreground">
            Data
          </label>
          <input
            id="date-select"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Stats bar */}
      {attendance && enrolledCount > 0 && (
        <div className="flex gap-4 mb-4 text-sm text-muted-foreground">
          <span>
            <span className="font-semibold text-foreground">{presentCount}</span>/{enrolledCount} prezenți
          </span>
          <span>
            <span className="font-semibold text-destructive">
              {Object.values(statuses).filter((s) => s === "absent").length}
            </span>{" "}
            absenți
          </span>
          <span>
            <span className="font-semibold text-yellow-600 dark:text-yellow-400">
              {Object.values(statuses).filter((s) => s === "late").length}
            </span>{" "}
            întârziați
          </span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive mb-4" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12" role="status" aria-label="Se încarcă...">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      )}

      {!loading && !selectedClassId && (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground mb-3" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Selectează o clasă pentru a vedea catalogul.</p>
        </div>
      )}

      {!loading && selectedClassId && attendance && enrolledCount === 0 && (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground mb-3" aria-hidden="true" />
          <p className="text-sm text-foreground font-medium">Niciun elev înscris în această clasă</p>
          <p className="text-xs text-muted-foreground mt-1">
            Înscrie elevi din pagina de clase pentru a putea lua prezența.
          </p>
        </div>
      )}

      {!loading && attendance && enrolledCount > 0 && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm" aria-label="Catalog prezență">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-foreground" scope="col">
                  Elev
                </th>
                {(["present", "absent", "late", "excused"] as Status[]).map((s) => (
                  <th
                    key={s}
                    className="text-center px-3 py-3 font-semibold text-foreground w-14"
                    scope="col"
                    title={STATUS_FULL[s]}
                  >
                    {STATUS_LABELS[s]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {attendance.enrolled.map((enrolled) => {
                const currentStatus = statuses[enrolled.studentId] ?? "present";
                return (
                  <tr key={enrolled.studentId} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-foreground font-medium">
                      {enrolled.studentName ?? "—"}
                    </td>
                    {(["present", "absent", "late", "excused"] as Status[]).map((s) => (
                      <td key={s} className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            setStatuses((prev) => ({
                              ...prev,
                              [enrolled.studentId]: s,
                            }))
                          }
                          aria-label={`${enrolled.studentName ?? "Elev"} — ${STATUS_FULL[s]}`}
                          aria-pressed={currentStatus === s}
                          className={cn(
                            "inline-flex h-8 w-8 items-center justify-center rounded-md border text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            currentStatus === s
                              ? STATUS_COLORS[s]
                              : "border-border text-muted-foreground hover:bg-muted"
                          )}
                        >
                          {STATUS_LABELS[s]}
                        </button>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const parts = iso.split("-").map(Number);
  const yyyy = parts[0] ?? 2026;
  const mm = parts[1] ?? 1;
  const dd = parts[2] ?? 1;
  const MON = ["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "nov", "dec"];
  return `${dd} ${MON[mm - 1]} ${yyyy}`;
}
