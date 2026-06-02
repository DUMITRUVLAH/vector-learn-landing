/**
 * MOB-102: Mobile schedule page (implemented in MOB-102; stub here for routing)
 * Full implementation: day view with swipe between days.
 */
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Calendar, Loader2 } from "lucide-react";
import { Link, useRouter } from "@/router/HashRouter";
import { useSession } from "@/hooks/useSession";
import { api } from "@/lib/api";

interface LessonRow {
  id: string;
  scheduledAt: string;
  durationMinutes: number;
  status: string;
  meetingUrl: string | null;
  courseName: string;
  teacherName: string;
  roomName: string | null;
}

function formatDay(date: Date): string {
  return date.toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "short" });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" });
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function MobileSchedulePage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dayOffset, setDayOffset] = useState(0); // 0=today, 1=tomorrow, etc.

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    api<{ lessons: LessonRow[] }>("/api/m/schedule")
      .then((d) => { setLessons(d.lessons); setLoading(false); })
      .catch(() => setLoading(false));
  }, [sessionStatus]);

  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + dayOffset);

  const dayLessons = lessons.filter((l) => sameDay(new Date(l.scheduledAt), targetDate));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 flex items-center gap-3">
        <Link to="/m/dashboard" className="text-muted-foreground hover:text-foreground" aria-label="Înapoi">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-sm font-semibold flex-1">Orar</h1>
        <Calendar className="h-4 w-4 text-muted-foreground" />
      </header>

      {/* Day switcher */}
      <div className="flex items-center justify-between px-4 py-3 bg-card border-b border-border">
        <button
          onClick={() => setDayOffset((d) => d - 1)}
          aria-label="Ziua anterioară"
          className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium capitalize">{formatDay(targetDate)}</span>
        <button
          onClick={() => setDayOffset((d) => d + 1)}
          aria-label="Ziua următoare"
          className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <main className="flex-1 px-4 py-4 space-y-3 max-w-lg mx-auto w-full">
        {dayLessons.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Calendar className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Nicio lecție în această zi</p>
          </div>
        ) : (
          dayLessons.map((lesson) => (
            <div key={lesson.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-sm">{lesson.courseName}</p>
                  <p className="text-xs text-muted-foreground">{lesson.teacherName}</p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatTime(lesson.scheduledAt)} · {lesson.durationMinutes}min
                </span>
              </div>
              {lesson.roomName && (
                <p className="text-xs text-muted-foreground mt-1">{lesson.roomName}</p>
              )}
              {lesson.meetingUrl && (
                <a
                  href={lesson.meetingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-primary font-medium"
                >
                  Alătură-te online →
                </a>
              )}
            </div>
          ))
        )}
      </main>
    </div>
  );
}
