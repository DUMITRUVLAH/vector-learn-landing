/**
 * MOB-101: Student mobile dashboard
 * Route: /m/dashboard
 * Shows next lesson countdown + quick-action buttons.
 * Mobile-first, works as PWA standalone.
 */
import { useEffect, useState } from "react";
import { Calendar, BookOpen, CreditCard, Clock, MapPin, Video, LogOut, ArrowRight, Loader2 } from "lucide-react";
import { Link, useRouter } from "@/router/HashRouter";
import { useSession } from "@/hooks/useSession";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface StudentInfo {
  id: string;
  fullName: string;
  email: string | null;
  status: string;
}

interface NextLesson {
  id: string;
  scheduledAt: string;
  durationMinutes: number;
  meetingUrl: string | null;
  courseName: string;
  teacherName: string;
  roomName: string | null;
}

interface DashboardData {
  student: StudentInfo | null;
  nextLesson: NextLesson | null;
  message?: string;
}

function formatTimeUntil(isoDate: string): string {
  const diff = new Date(isoDate).getTime() - Date.now();
  if (diff <= 0) return "Acum";
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `în ${days} ${days === 1 ? "zi" : "zile"}`;
  }
  if (hours > 0) return `în ${hours}h ${mins}m`;
  return `în ${mins} min`;
}

function formatLessonTime(isoDate: string): string {
  return new Date(isoDate).toLocaleString("ro-RO", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function StudentDashboardPage() {
  const { status: sessionStatus, data: sessionData, logout } = useSession();
  const { navigate } = useRouter();
  const [dashData, setDashData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      navigate("/app/login");
    }
  }, [sessionStatus, navigate]);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    api<DashboardData>("/api/m/dashboard")
      .then((data) => {
        setDashData(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Eroare necunoscută");
        setLoading(false);
      });
  }, [sessionStatus]);

  const handleLogout = async () => {
    await logout();
    navigate("/app/login");
  };

  if (sessionStatus === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background p-6">
        <p className="text-destructive text-sm text-center">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="text-sm text-primary underline"
        >
          Încearcă din nou
        </button>
      </div>
    );
  }

  const student = dashData?.student;
  const nextLesson = dashData?.nextLesson;
  const userName = sessionData?.user?.name ?? student?.fullName ?? "Utilizator";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 flex items-center justify-between safe-area-top">
        <div>
          <p className="text-xs text-muted-foreground">Vector Learn</p>
          <h1 className="text-sm font-semibold leading-tight">
            Bună ziua, {userName.split(" ")[0]}!
          </h1>
        </div>
        <button
          onClick={handleLogout}
          aria-label="Deconectare"
          className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      {/* Main content */}
      <main className="flex-1 px-4 py-5 space-y-5 max-w-lg mx-auto w-full">
        {/* Next lesson card */}
        <section>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Următoarea lecție
          </h2>
          {nextLesson ? (
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-sm">{nextLesson.courseName}</p>
                  <p className="text-xs text-muted-foreground">{nextLesson.teacherName}</p>
                </div>
                <span className="shrink-0 rounded-full bg-primary/10 text-primary text-[11px] font-bold px-2 py-0.5">
                  {formatTimeUntil(nextLesson.scheduledAt)}
                </span>
              </div>

              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {formatLessonTime(nextLesson.scheduledAt)}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {nextLesson.durationMinutes} min
                </span>
                {nextLesson.roomName && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {nextLesson.roomName}
                  </span>
                )}
              </div>

              {nextLesson.meetingUrl && (
                <a
                  href={nextLesson.meetingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-xs text-primary font-medium"
                >
                  <Video className="h-3.5 w-3.5" />
                  Alătură-te online
                  <ArrowRight className="h-3 w-3" />
                </a>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
              <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nicio lecție programată</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Verifică cu profesorul tău
              </p>
            </div>
          )}
        </section>

        {/* Quick actions */}
        <section>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Acces rapid
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <QuickAction
              href="/m/schedule"
              icon={<Calendar className="h-6 w-6" />}
              label="Orar"
              color="bg-blue-500/10 text-blue-500"
            />
            <QuickAction
              href="/m/homework"
              icon={<BookOpen className="h-6 w-6" />}
              label="Teme"
              color="bg-amber-500/10 text-amber-500"
            />
            <QuickAction
              href="/m/invoices"
              icon={<CreditCard className="h-6 w-6" />}
              label="Plăți"
              color="bg-emerald-500/10 text-emerald-500"
            />
          </div>
        </section>

        {/* Gamification teaser if XP/streaks available */}
        <section>
          <Link
            to="/m/xp"
            className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl" role="img" aria-label="trofeu">🏆</span>
              <div>
                <p className="text-sm font-medium">XP & Streak</p>
                <p className="text-xs text-muted-foreground">Progresul tău gamificat</p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        </section>
      </main>

      {/* Bottom safe area padding for iOS */}
      <div className="h-safe-area-bottom" />
    </div>
  );
}

interface QuickActionProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  color: string;
}

function QuickAction({ href, icon, label, color }: QuickActionProps) {
  return (
    <Link
      to={href}
      className={cn(
        "flex flex-col items-center justify-center gap-1.5 rounded-xl p-4 text-center",
        "border border-transparent hover:border-border transition-all",
        color
      )}
    >
      {icon}
      <span className="text-xs font-medium leading-tight">{label}</span>
    </Link>
  );
}
