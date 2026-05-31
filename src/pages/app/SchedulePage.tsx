import { useEffect, useState, useMemo, useCallback, Fragment } from "react";
import { Loader2, Plus, X, ChevronLeft, ChevronRight, AlertTriangle, Trash2, RefreshCw, Users, Lock } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import { ApiError } from "@/lib/api";
import {
  listLessons,
  listTeachers,
  listCourses,
  createLesson,
  cancelLesson,
  getLessonStudents,
  markAttendance,
  type Lesson,
  type Teacher,
  type Course,
  type LessonStudent,
  type AttendanceStatus,
} from "@/lib/api/lessons";
import { listRooms, type Room } from "@/lib/api/rooms";
import { createRecurringLessons } from "@/lib/api/recurring";
import { cn } from "@/lib/utils";

const DAYS = ["Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă", "Duminică"];
const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const COURSE_COLORS = [
  "bg-primary text-primary-foreground",
  "pastel-mint text-foreground",
  "pastel-lavender text-foreground",
  "pastel-peach text-foreground",
  "pastel-sky text-foreground",
  "pastel-rose text-foreground",
];

function courseColor(courseId: string): string {
  let h = 0;
  for (let i = 0; i < courseId.length; i++) h = (h * 31 + courseId.charCodeAt(i)) | 0;
  return COURSE_COLORS[Math.abs(h) % COURSE_COLORS.length];
}

export function SchedulePage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<
    | { kind: "create"; day: number; hour: number }
    | { kind: "view"; lesson: Lesson }
    | { kind: "recurring" }
    | null
  >(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [lr, tr, cr, rr] = await Promise.all([
        listLessons(weekStart.toISOString(), weekEnd.toISOString()),
        listTeachers(),
        listCourses(),
        listRooms(),
      ]);
      setLessons(lr.items);
      setTeachers(tr.items);
      setCourses(cr.items);
      setRooms(rr.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare");
    } finally {
      setLoading(false);
    }
  }, [weekStart, weekEnd]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const lessonsByCell = useMemo(() => {
    const map = new Map<string, Lesson[]>();
    for (const l of lessons) {
      if (l.status === "cancelled") continue;
      const d = new Date(l.scheduledAt);
      const dayIdx = (d.getDay() + 6) % 7;
      const hour = d.getHours();
      const key = `${dayIdx}:${hour}`;
      const arr = map.get(key) ?? [];
      arr.push(l);
      map.set(key, arr);
    }
    return map;
  }, [lessons]);

  const labelForWeek = useMemo(() => {
    const end = addDays(weekStart, 4);
    return `${weekStart.toLocaleDateString("ro-RO", { day: "numeric", month: "short" })} – ${end.toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric" })}`;
  }, [weekStart]);

  return (
    <AppShell
      pageTitle="Orar"
      pageDescription={`${lessons.filter((l) => l.status !== "cancelled").length} lecții programate săptămâna afișată`}
      actions={
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            aria-label="Săptămâna anterioară"
            className="touch-target rounded-md border border-border bg-card hover:bg-muted flex items-center justify-center"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="rounded-md border border-border bg-card px-3 py-2 text-xs font-semibold hover:bg-muted"
          >
            Azi
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            aria-label="Săptămâna următoare"
            className="touch-target rounded-md border border-border bg-card hover:bg-muted flex items-center justify-center"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      }
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">{labelForWeek}</p>
        <button
          type="button"
          onClick={() => setModal({ kind: "recurring" })}
          className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-semibold hover:bg-muted"
          aria-label="Adaugă lecție recurentă"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Repetă
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Se încarcă orarul…
          </div>
        ) : error ? (
          <div className="py-16 text-center text-sm text-destructive">{error}</div>
        ) : (
          <div className="overflow-x-auto">
            <div className="grid grid-cols-[60px_repeat(7,minmax(120px,1fr))]">
              <div className="border-b border-r border-border bg-muted/30 p-2 text-[10px] font-semibold uppercase text-muted-foreground">
                Oră
              </div>
              {DAYS.map((day, i) => {
                const dayDate = addDays(weekStart, i);
                const isToday = dayDate.toDateString() === new Date().toDateString();
                return (
                  <div
                    key={day}
                    className={cn(
                      "border-b border-r border-border bg-muted/30 p-2 text-center",
                      isToday && "bg-primary/10"
                    )}
                  >
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground">{day.slice(0, 3)}</p>
                    <p className={cn("text-sm font-bold", isToday && "text-primary")}>
                      {dayDate.getDate()}
                    </p>
                  </div>
                );
              })}

              {HOURS.map((hour) => (
                <Fragment key={`hour-${hour}`}>
                  <div
                    className="border-b border-r border-border bg-muted/20 p-2 text-xs font-semibold text-muted-foreground"
                  >
                    {String(hour).padStart(2, "0")}:00
                  </div>
                  {DAYS.map((_, dayIdx) => {
                    const cellLessons = lessonsByCell.get(`${dayIdx}:${hour}`) ?? [];
                    return (
                      <div
                        key={`${dayIdx}-${hour}`}
                        className="border-b border-r border-border min-h-[68px] p-1 hover:bg-muted/20 cursor-pointer relative"
                        onClick={() => {
                          if (cellLessons.length === 0) setModal({ kind: "create", day: dayIdx, hour });
                        }}
                      >
                        {cellLessons.map((l) => (
                          <button
                            key={l.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setModal({ kind: "view", lesson: l });
                            }}
                            className={cn(
                              "block w-full text-left rounded-md p-1.5 text-[10px] mb-0.5 hover:shadow-md transition-all",
                              courseColor(l.courseId)
                            )}
                          >
                            <p className="font-bold truncate">{l.courseName}</p>
                            <p className="opacity-80 truncate">{l.teacherName}</p>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>
        )}
      </div>

      {modal?.kind === "create" && (
        <CreateLessonModal
          weekStart={weekStart}
          dayIdx={modal.day}
          hour={modal.hour}
          teachers={teachers}
          courses={courses}
          rooms={rooms}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            setToast({ kind: "success", message: "Lecție programată" });
            void fetchAll();
          }}
          onError={(msg) => setToast({ kind: "error", message: msg })}
        />
      )}

      {modal?.kind === "view" && (
        <ViewLessonModal
          lesson={modal.lesson}
          onClose={() => setModal(null)}
          onCancelled={() => {
            setModal(null);
            setToast({ kind: "success", message: "Lecție anulată" });
            void fetchAll();
          }}
          onError={(msg) => setToast({ kind: "error", message: msg })}
        />
      )}

      {modal?.kind === "recurring" && (
        <RecurringModal
          teachers={teachers}
          courses={courses}
          rooms={rooms}
          onClose={() => setModal(null)}
          onSaved={(count) => {
            setModal(null);
            setToast({ kind: "success", message: `${count} lecții recurente programate` });
            void fetchAll();
          }}
          onError={(msg) => setToast({ kind: "error", message: msg })}
        />
      )}

      {toast && (
        <div
          role="status"
          className={cn(
            "fixed bottom-4 right-4 z-50 rounded-lg border shadow-lg px-4 py-3 text-sm font-medium animate-fade-in",
            toast.kind === "success"
              ? "bg-success/10 border-success/30 text-success"
              : "bg-destructive/10 border-destructive/30 text-destructive"
          )}
        >
          {toast.message}
        </div>
      )}
    </AppShell>
  );
}

function CreateLessonModal({
  weekStart,
  dayIdx,
  hour,
  teachers,
  courses,
  rooms,
  onClose,
  onSaved,
  onError,
}: {
  weekStart: Date;
  dayIdx: number;
  hour: number;
  teachers: Teacher[];
  courses: Course[];
  rooms: Room[];
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const initialDate = useMemo(() => {
    const d = addDays(weekStart, dayIdx);
    d.setHours(hour, 0, 0, 0);
    return d;
  }, [weekStart, dayIdx, hour]);

  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [teacherId, setTeacherId] = useState(teachers[0]?.id ?? "");
  const [roomId, setRoomId] = useState("");
  const [date, setDate] = useState(formatDateInput(initialDate));
  const [time, setTime] = useState(`${String(hour).padStart(2, "0")}:00`);
  const [duration, setDuration] = useState(courses[0]?.durationMinutes ?? 60);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseId || !teacherId) return;
    setSubmitting(true);
    const scheduledAt = new Date(`${date}T${time}:00`).toISOString();
    try {
      await createLesson({ courseId, teacherId, scheduledAt, durationMinutes: duration, roomId: roomId || null });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.code === "teacher_double_booked") {
        onError("Profesorul este deja rezervat la această oră.");
      } else if (err instanceof ApiError && err.code === "room_double_booked") {
        onError("Sala este ocupată la această oră.");
      } else {
        onError("Nu pot salva lecția.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (courses.length === 0 || teachers.length === 0) {
    return (
      <ModalShell title="Programare lecție" onClose={onClose}>
        <div className="rounded-md bg-warning/10 border border-warning/30 p-4 text-sm">
          <AlertTriangle className="h-4 w-4 inline mr-1 text-warning" />
          Nu ai {courses.length === 0 ? "cursuri" : "profesori"} definiți. Mergi în secțiunile dedicate ca să creezi.
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell title="Programare lecție nouă" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label htmlFor="m-course" className="block text-sm font-semibold mb-1.5">Curs</label>
          <select
            id="m-course"
            value={courseId}
            onChange={(e) => {
              setCourseId(e.target.value);
              const c = courses.find((x) => x.id === e.target.value);
              if (c) setDuration(c.durationMinutes);
            }}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.level ? ` (${c.level})` : ""}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="m-teacher" className="block text-sm font-semibold mb-1.5">Profesor</label>
          <select
            id="m-teacher"
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="m-date" className="block text-sm font-semibold mb-1.5">Data</label>
            <input
              id="m-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="m-time" className="block text-sm font-semibold mb-1.5">Ora</label>
            <input
              id="m-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label htmlFor="m-dur" className="block text-sm font-semibold mb-1.5">Durată (min)</label>
          <input
            id="m-dur"
            type="number"
            min={15}
            max={480}
            step={15}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        {rooms.length > 0 && (
          <div>
            <label htmlFor="m-room" className="block text-sm font-semibold mb-1.5">Sală (opțional)</label>
            <select
              id="m-room"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              aria-label="Selectează sală"
            >
              <option value="">— fără sală —</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>{r.name} (cap. {r.capacity})</option>
              ))}
            </select>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted">
            Anulează
          </button>
          <button type="submit" disabled={submitting} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {submitting ? "Se salvează..." : "Programează"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  present: "Prezent",
  absent: "Absent",
  late: "Întârziat",
  excused: "Motivat",
  pending: "Neprecizat",
};

const ATTENDANCE_COLORS: Record<AttendanceStatus, string> = {
  present: "text-success",
  absent: "text-destructive",
  late: "text-warning",
  excused: "text-muted-foreground",
  pending: "text-muted-foreground",
};

function AttendancePanel({ lesson, onError }: { lesson: Lesson; onError: (msg: string) => void }) {
  const [students, setStudents] = useState<LessonStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const lessonDate = new Date(lesson.scheduledAt);
  const now = new Date();
  const hasStarted = lessonDate <= now;
  const isLocked24h = lessonDate < new Date(now.getTime() - 24 * 60 * 60 * 1000);

  useEffect(() => {
    if (!hasStarted) return;
    getLessonStudents(lesson.id)
      .then((r) => setStudents(r.items))
      .catch(() => onError("Nu pot încărca lista de elevi."))
      .finally(() => setLoading(false));
  }, [lesson.id, hasStarted, onError]);

  if (!hasStarted) {
    return (
      <div className="mt-4 pt-4 border-t border-border">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          Prezența se poate marca după ce lecția a început.
        </p>
      </div>
    );
  }

  const handleStatusChange = async (studentId: string, status: string) => {
    if (status === "pending") return;
    setUpdating(studentId);
    try {
      const updated = await markAttendance(
        lesson.id,
        studentId,
        status as Exclude<AttendanceStatus, "pending">
      );
      setStudents((prev) =>
        prev.map((s) =>
          s.studentId === studentId
            ? { ...s, attendanceStatus: updated.attendanceStatus as AttendanceStatus, markedBy: updated.markedBy, markedAt: updated.markedAt }
            : s
        )
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        onError("Prezența este blocată după 24h. Contactați un manager.");
      } else {
        onError("Nu pot salva prezența.");
      }
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          Prezență elevi
        </h3>
        {isLocked24h && (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">
            <Lock className="h-3 w-3" />
            Blocat 24h
          </span>
        )}
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-4 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          <span className="text-xs">Se încarcă…</span>
        </div>
      ) : students.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">Niciun elev înscris la această lecție.</p>
      ) : (
        <div className="space-y-1.5" role="list" aria-label="Lista elevi și prezență">
          {students.map((s) => (
            <div
              key={s.studentId}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2"
              role="listitem"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">{s.fullName}</p>
                {s.email && <p className="text-[10px] text-muted-foreground truncate">{s.email}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {updating === s.studentId && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                <label htmlFor={`att-${s.studentId}`} className="sr-only">
                  Status prezență {s.fullName}
                </label>
                <select
                  id={`att-${s.studentId}`}
                  value={s.attendanceStatus}
                  onChange={(e) => void handleStatusChange(s.studentId, e.target.value)}
                  disabled={updating === s.studentId}
                  className={cn(
                    "rounded border border-input bg-background px-2 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60",
                    ATTENDANCE_COLORS[s.attendanceStatus]
                  )}
                >
                  <option value="pending">{ATTENDANCE_LABELS.pending}</option>
                  <option value="present">{ATTENDANCE_LABELS.present}</option>
                  <option value="absent">{ATTENDANCE_LABELS.absent}</option>
                  <option value="late">{ATTENDANCE_LABELS.late}</option>
                  <option value="excused">{ATTENDANCE_LABELS.excused}</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ViewLessonModal({
  lesson,
  onClose,
  onCancelled,
  onError,
}: {
  lesson: Lesson;
  onClose: () => void;
  onCancelled: () => void;
  onError: (msg: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const date = new Date(lesson.scheduledAt);

  const handleCancel = async () => {
    if (!confirm("Anulezi această lecție? Părinții vor fi notificați (în prod).")) return;
    setSubmitting(true);
    try {
      await cancelLesson(lesson.id);
      onCancelled();
    } catch {
      onError("Nu pot anula lecția.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell title={lesson.courseName} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <Row label="Profesor" value={lesson.teacherName} />
        <Row label="Data și ora" value={date.toLocaleString("ro-RO", { dateStyle: "full", timeStyle: "short" })} />
        <Row label="Durată" value={`${lesson.durationMinutes} minute`} />
        <Row label="Status" value={lesson.status} />
        {lesson.courseLevel && <Row label="Nivel" value={lesson.courseLevel} />}
        {lesson.notes && <Row label="Note" value={lesson.notes} />}
      </div>
      <AttendancePanel lesson={lesson} onError={onError} />
      <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-border">
        <button type="button" onClick={onClose} className="rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted">
          Închide
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={submitting || lesson.status === "cancelled"}
          className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Anulează lecție
        </button>
      </div>
    </ModalShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-border/50">
      <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card shadow-xl">
        <div className="border-b border-border px-5 py-3.5 flex items-center justify-between">
          <h2 className="text-base font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Închide" className="rounded-md hover:bg-muted p-1">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ─── SCHED-502: Recurring lessons modal ───────────────────────────────────────

interface RecurringModalProps {
  teachers: Teacher[];
  courses: Course[];
  rooms: Room[];
  onClose: () => void;
  onSaved: (count: number) => void;
  onError: (msg: string) => void;
}

function RecurringModal({ teachers, courses, rooms, onClose, onSaved, onError }: RecurringModalProps) {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);

  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [teacherId, setTeacherId] = useState(teachers[0]?.id ?? "");
  const [roomId, setRoomId] = useState("");
  const [date, setDate] = useState(formatDateInput(now));
  const [time, setTime] = useState(`${String(now.getHours()).padStart(2, "0")}:00`);
  const [duration, setDuration] = useState(courses[0]?.durationMinutes ?? 60);
  const [count, setCount] = useState(8);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseId || !teacherId) return;
    setSubmitting(true);
    const firstScheduledAt = new Date(`${date}T${time}:00`).toISOString();
    try {
      const result = await createRecurringLessons({
        courseId,
        teacherId,
        firstScheduledAt,
        durationMinutes: duration,
        roomId: roomId || null,
        recurrence: { type: "weekly", count },
      });
      onSaved(result.lessons.length);
    } catch (err) {
      if (err instanceof ApiError && err.code === "conflicts") {
        onError("Conflict de orar: unele sloturi sunt ocupate. Verifică orarul și încearcă din nou.");
      } else {
        onError("Nu pot crea seria de lecții recurente.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (courses.length === 0 || teachers.length === 0) {
    return (
      <ModalShell title="Lecție recurentă" onClose={onClose}>
        <div className="rounded-md bg-warning/10 border border-warning/30 p-4 text-sm">
          <AlertTriangle className="h-4 w-4 inline mr-1 text-warning" />
          Nu ai {courses.length === 0 ? "cursuri" : "profesori"} definiți. Creează-i mai întâi.
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell title="Programare lecție recurentă" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label htmlFor="rc-course" className="block text-sm font-semibold mb-1.5">Curs</label>
          <select
            id="rc-course"
            value={courseId}
            onChange={(e) => {
              setCourseId(e.target.value);
              const c = courses.find((x) => x.id === e.target.value);
              if (c) setDuration(c.durationMinutes);
            }}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.level ? ` (${c.level})` : ""}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="rc-teacher" className="block text-sm font-semibold mb-1.5">Profesor</label>
          <select
            id="rc-teacher"
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="rc-date" className="block text-sm font-semibold mb-1.5">Prima dată</label>
            <input
              id="rc-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="rc-time" className="block text-sm font-semibold mb-1.5">Ora</label>
            <input
              id="rc-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="rc-dur" className="block text-sm font-semibold mb-1.5">Durată (min)</label>
            <input
              id="rc-dur"
              type="number"
              min={15}
              max={480}
              step={15}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="rc-count" className="block text-sm font-semibold mb-1.5">Ocurențe</label>
            <input
              id="rc-count"
              type="number"
              min={1}
              max={52}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
        {rooms.length > 0 && (
          <div>
            <label htmlFor="rc-room" className="block text-sm font-semibold mb-1.5">Sală (opțional)</label>
            <select
              id="rc-room"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              aria-label="Selectează sală pentru seria recurentă"
            >
              <option value="">— fără sală —</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>{r.name} (cap. {r.capacity})</option>
              ))}
            </select>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Se vor crea {count} lecții săptămânale consecutiv.
        </p>
        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <button type="button" onClick={onClose} className="rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted">
            Anulează
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Creează {count} lecții
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
