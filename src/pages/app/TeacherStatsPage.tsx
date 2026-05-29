/**
 * HR-402 — Teacher stats: ore predate, rata prezență, venituri
 * Pagina /app/hr/teachers/:id/stats
 */
import { useEffect, useState, useCallback } from "react";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import { getTeacherStats, type TeacherStats, type StatsPeriod } from "@/lib/api/hrTeachers";
import { cn } from "@/lib/utils";

// ─── Period labels ────────────────────────────────────────────────────────────

const PERIODS: { key: StatsPeriod; label: string }[] = [
  { key: "30d", label: "30 zile" },
  { key: "90d", label: "90 zile" },
  { key: "12m", label: "12 luni" },
];

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("text-2xl font-bold", className)}>{value}</p>
    </div>
  );
}

function formatEur(cents: number): string {
  if (cents === 0) return "—";
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

// ─── Main page ────────────────────────────────────────────────────────────────

interface TeacherStatsPageProps {
  teacherId: string;
}

export function TeacherStatsPage({ teacherId }: TeacherStatsPageProps) {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const [stats, setStats] = useState<TeacherStats | null>(null);
  const [period, setPeriod] = useState<StatsPeriod>("30d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getTeacherStats(teacherId, period);
      setStats(res);
    } catch {
      setError("Nu pot încărca statisticile profesorului.");
    } finally {
      setLoading(false);
    }
  }, [teacherId, period]);

  useEffect(() => { void fetchStats(); }, [fetchStats]);

  return (
    <AppShell
      pageTitle={stats?.teacherName ?? "Statistici profesor"}
      pageDescription="Ore predate, prezență, venituri generate"
      actions={
        <button
          type="button"
          onClick={() => navigate("/app/teachers")}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted min-h-[44px]"
          aria-label="Înapoi la profesori"
        >
          <ArrowLeft className="h-4 w-4" />
          Profesori
        </button>
      }
    >
      {/* Period toggle */}
      <div className="flex gap-1.5 mb-6" role="group" aria-label="Selectează perioadă">
        {PERIODS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setPeriod(key)}
            aria-pressed={period === key}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors min-h-[36px]",
              period === key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:bg-muted text-muted-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive mb-6">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {/* Stat cards */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4 h-24 animate-pulse bg-muted/20" />
          ))}
        </div>
      ) : stats && (
        <div className="space-y-6" data-testid="stats-grid">
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Lecții predate"
              value={String(stats.lessonsCompleted)}
            />
            <StatCard
              label="Ore predate"
              value={`${stats.hoursCompleted}h`}
            />
            <StatCard
              label="Prezență elevi"
              value={`${stats.studentAttendanceRate}%`}
              className={stats.studentAttendanceRate >= 85 ? "text-success" : stats.studentAttendanceRate >= 70 ? "text-primary" : "text-destructive"}
            />
            <StatCard
              label="Venituri generate"
              value={formatEur(stats.revenueCents)}
            />
          </div>

          {/* Top courses */}
          {stats.topCourses.length > 0 && (
            <section className="rounded-xl border border-border bg-card p-5" aria-label="Top cursuri predate">
              <h2 className="text-sm font-bold mb-3">Top cursuri ({period})</h2>
              <ul className="space-y-2">
                {stats.topCourses.map((course, i) => (
                  <li key={course.courseName} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                        {i + 1}
                      </span>
                      <span className="text-sm">{course.courseName}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">{course.lessonCount} lecții</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}
