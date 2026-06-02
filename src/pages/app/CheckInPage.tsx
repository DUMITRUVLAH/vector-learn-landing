/**
 * GAP-018 — /app/lessons/:lessonId/check-in
 * Mobile-optimized attendance check-in page.
 * Teacher taps toggles for each student, then taps "Salvează".
 *
 * Touch-friendly: min 44×44px targets, works at 375px width.
 */
import { useEffect, useState, useCallback } from "react";
import { Loader2, CheckCircle2, XCircle, Clock, ChevronLeft, SaveIcon } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  getLessonStudents,
  batchMarkAttendance,
  type LessonStudent,
  type AttendanceStatus,
  type BatchAttendanceUpdate,
} from "@/lib/api/lessons";
import { cn } from "@/lib/utils";

// Status cycle: present → absent → excused → present
const NEXT_STATUS: Record<string, AttendanceStatus> = {
  pending: "present",
  present: "absent",
  absent: "excused",
  excused: "present",
  late: "present",
};

interface StatusConfig {
  label: string;
  icon: React.ReactNode;
  bg: string;
  text: string;
}

const STATUS_CONFIG: Record<AttendanceStatus, StatusConfig> = {
  present: {
    label: "Prezent",
    icon: <CheckCircle2 size={20} />,
    bg: "bg-success/15 hover:bg-success/25 border-success/30",
    text: "text-success",
  },
  absent: {
    label: "Absent",
    icon: <XCircle size={20} />,
    bg: "bg-destructive/15 hover:bg-destructive/25 border-destructive/30",
    text: "text-destructive",
  },
  excused: {
    label: "Motivat",
    icon: <Clock size={20} />,
    bg: "bg-warning/15 hover:bg-warning/25 border-warning/30",
    text: "text-warning",
  },
  late: {
    label: "Întârziat",
    icon: <Clock size={20} />,
    bg: "bg-muted/60 hover:bg-muted border-border",
    text: "text-muted-foreground",
  },
  pending: {
    label: "Neprecizat",
    icon: <Clock size={20} />,
    bg: "bg-muted/40 hover:bg-muted/60 border-border",
    text: "text-muted-foreground",
  },
};

interface CheckInPageProps {
  lessonId: string;
}

export function CheckInPage({ lessonId }: CheckInPageProps) {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const [students, setStudents] = useState<LessonStudent[]>([]);
  const [localStatus, setLocalStatus] = useState<Record<string, AttendanceStatus>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      navigate("/app/login");
      return;
    }
    if (sessionStatus !== "authenticated") return;

    setLoading(true);
    getLessonStudents(lessonId)
      .then(({ items }) => {
        setStudents(items);
        const initial: Record<string, AttendanceStatus> = {};
        for (const s of items) {
          initial[s.studentId] = s.attendanceStatus;
        }
        setLocalStatus(initial);
      })
      .catch(() => setError("Nu s-au putut încărca elevii lecției"))
      .finally(() => setLoading(false));
  }, [lessonId, sessionStatus, navigate]);

  const toggle = useCallback((studentId: string) => {
    setLocalStatus((prev) => {
      const current = prev[studentId] ?? "pending";
      const next = NEXT_STATUS[current] ?? "present";
      return { ...prev, [studentId]: next };
    });
    setSaved(false);
  }, []);

  const handleSave = async () => {
    if (students.length === 0) return;
    setSaving(true);
    setError(null);

    const updates: BatchAttendanceUpdate[] = students.map((s) => ({
      studentId: s.studentId,
      status: (localStatus[s.studentId] ?? "pending") as Exclude<AttendanceStatus, "pending">,
    })).filter((u) => u.status !== "pending" as string);

    if (updates.length === 0) {
      setSaving(false);
      setSaved(true);
      return;
    }

    try {
      await batchMarkAttendance(lessonId, updates);
      setSaved(true);
    } catch {
      setError("Eroare la salvarea prezenței. Încearcă din nou.");
    } finally {
      setSaving(false);
    }
  };

  const presentCount = Object.values(localStatus).filter((s) => s === "present").length;
  const absentCount = Object.values(localStatus).filter((s) => s === "absent").length;

  if (loading) {
    return (
      <AppShell pageTitle="Check-in rapid">
        <div className="flex justify-center items-center min-h-64">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell pageTitle="Check-in rapid">
      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Back nav */}
        <button
          type="button"
          onClick={() => navigate("/app/schedule")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Înapoi la orar"
        >
          <ChevronLeft size={16} />
          Înapoi la orar
        </button>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Prezență</h1>
            <p className="text-sm text-muted-foreground">
              {students.length} elev{students.length !== 1 ? "i" : ""}
              {" · "}
              <span className="text-success">{presentCount} prezent{presentCount !== 1 ? "i" : ""}</span>
              {" · "}
              <span className="text-destructive">{absentCount} absent{absentCount !== 1 ? "i" : ""}</span>
            </p>
          </div>
          {students.length > 0 && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors",
                "min-h-[44px]",
                saved
                  ? "bg-success/15 text-success border border-success/30"
                  : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              )}
              aria-label="Salvează prezența"
            >
              {saving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : saved ? (
                <CheckCircle2 size={16} />
              ) : (
                <SaveIcon size={16} />
              )}
              {saved ? "Salvat!" : "Salvează"}
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm px-3 py-2">
            {error}
          </div>
        )}

        {/* Student list */}
        {students.length === 0 ? (
          <div className="rounded-xl border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">Niciun elev înscris la această lecție.</p>
          </div>
        ) : (
          <div className="space-y-2" role="list" aria-label="Lista elevi pentru prezență">
            {students.map((s) => {
              const status = localStatus[s.studentId] ?? "pending";
              const cfg = STATUS_CONFIG[status];

              return (
                <div
                  key={s.studentId}
                  className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3"
                  role="listitem"
                >
                  {/* Avatar + name */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm"
                      aria-hidden="true"
                    >
                      {s.fullName
                        .split(" ")
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{s.fullName}</p>
                      {s.email && (
                        <p className="text-[11px] text-muted-foreground truncate">{s.email}</p>
                      )}
                    </div>
                  </div>

                  {/* Toggle button */}
                  <button
                    type="button"
                    onClick={() => toggle(s.studentId)}
                    className={cn(
                      "flex items-center gap-2 shrink-0 rounded-lg border px-3 transition-colors",
                      "min-h-[44px] min-w-[110px] justify-center",
                      cfg.bg
                    )}
                    aria-label={`${s.fullName}: ${cfg.label}. Apasă pentru a schimba statusul`}
                    aria-pressed={status !== "pending"}
                  >
                    <span className={cfg.text}>{cfg.icon}</span>
                    <span className={cn("text-sm font-semibold", cfg.text)}>{cfg.label}</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Floating save button for long lists */}
        {students.length > 6 && (
          <div className="sticky bottom-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || saved}
              className={cn(
                "w-full flex items-center justify-center gap-2 py-3 rounded-xl text-base font-semibold shadow-lg transition-colors",
                "min-h-[52px]",
                saved
                  ? "bg-success text-white"
                  : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              )}
              aria-label="Salvează prezența (jos)"
            >
              {saving ? (
                <Loader2 size={18} className="animate-spin" />
              ) : saved ? (
                <CheckCircle2 size={18} />
              ) : (
                <SaveIcon size={18} />
              )}
              {saved ? "Prezență salvată!" : "Salvează prezența"}
            </button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
