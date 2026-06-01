/**
 * GAP-020 — Clasament (leaderboard) + statistici globale insigne
 *
 * Pagina /app/gamification: top-10 elevi după badge count + card statistici
 */
import { useEffect, useState } from "react";
import { RefreshCw, Loader2, Trophy, TrendingUp, TrendingDown, Minus, Medal } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  getLeaderboard,
  getBadgeStats,
  BADGE_LABELS,
  type LeaderboardEntry,
  type BadgeStats,
  type BadgeType,
} from "@/lib/api/badges";
import { cn } from "@/lib/utils";

function TrendBadge({ change }: { change: number }) {
  if (change > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-success text-xs font-medium">
        <TrendingUp className="h-3 w-3" aria-hidden="true" />
        +{change}
      </span>
    );
  }
  if (change < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-destructive text-xs font-medium">
        <TrendingDown className="h-3 w-3" aria-hidden="true" />
        {change}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-muted-foreground text-xs">
      <Minus className="h-3 w-3" aria-hidden="true" />0
    </span>
  );
}

const RANK_MEDALS: Record<number, string> = {
  1: "🥇",
  2: "🥈",
  3: "🥉",
};

export function GamificationPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [stats, setStats] = useState<BadgeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    loadData();
  }, [sessionStatus]);

  async function loadData() {
    setError(null);
    try {
      const [lb, s] = await Promise.all([getLeaderboard(10), getBadgeStats()]);
      setLeaderboard(lb);
      setStats(s);
    } catch {
      setError("Eroare la încărcarea clasamentului.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadData();
  }

  if (sessionStatus === "loading") return null;
  if (sessionStatus === "unauthenticated") {
    navigate("/app/login");
    return null;
  }

  return (
    <AppShell
      pageTitle="Clasament"
      pageDescription="Top elevi după insigne câștigate"
      actions={
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
          aria-label="Reîncarcă clasamentul"
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} aria-hidden="true" />
          Reîncarcă
        </button>
      }
    >
      {error && (
        <p role="alert" className="text-sm text-destructive text-center py-8">
          {error}
        </p>
      )}

      <div className="max-w-4xl mx-auto space-y-6">
        {/* Stats card */}
        {stats && (
          <div
            className="grid grid-cols-1 sm:grid-cols-3 gap-4"
            aria-label="Statistici globale insigne"
          >
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{stats.totalBadges}</p>
              <p className="text-xs text-muted-foreground mt-1">Insigne acordate total</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{stats.studentsWithBadges}</p>
              <p className="text-xs text-muted-foreground mt-1">Elevi cu cel puțin o insignă</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-2xl font-bold text-foreground">
                {stats.topBadgeType
                  ? BADGE_LABELS[stats.topBadgeType as BadgeType]?.emoji ?? "—"
                  : "—"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Insigna cea mai frecventă:{" "}
                {stats.topBadgeType
                  ? BADGE_LABELS[stats.topBadgeType as BadgeType]?.title ?? stats.topBadgeType
                  : "—"}
              </p>
            </div>
          </div>
        )}

        {/* Leaderboard table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
            <Medal className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-foreground">Top 10 Elevi</h2>
          </div>

          {loading ? (
            <div
              className="flex items-center justify-center py-16"
              aria-busy="true"
              aria-label="Se încarcă clasamentul"
            >
              <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Trophy className="h-12 w-12 text-muted-foreground/40" aria-hidden="true" />
              <p className="text-sm text-muted-foreground text-center max-w-xs">
                Nu există încă insigne acordate. Apasă "Actualizează" pe pagina unui elev pentru a
                acorda insigne.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">
                Clasament elevi după numărul de insigne câștigate
              </caption>
              <thead>
                <tr className="border-b border-border">
                  <th
                    scope="col"
                    className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-5 py-2.5 w-12"
                  >
                    Rang
                  </th>
                  <th
                    scope="col"
                    className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5"
                  >
                    Elev
                  </th>
                  <th
                    scope="col"
                    className="text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5 w-24"
                  >
                    Insigne
                  </th>
                  <th
                    scope="col"
                    className="text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-5 py-2.5 w-28 hidden sm:table-cell"
                  >
                    Tendință (30 zile)
                  </th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((entry) => (
                  <tr
                    key={entry.studentId}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => navigate(`/app/students/${entry.studentId}`)}
                    aria-label={`${entry.studentName} — rang ${entry.rank}, ${entry.badgeCount} insigne`}
                  >
                    <td className="px-5 py-3 font-semibold text-foreground">
                      <span aria-hidden="true">
                        {RANK_MEDALS[entry.rank] ?? `#${entry.rank}`}
                      </span>
                      <span className="sr-only">{entry.rank}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/app/students/${entry.studentId}`);
                        }}
                        className="font-medium text-foreground hover:text-primary transition-colors text-left"
                        aria-label={`Deschide profilul lui ${entry.studentName}`}
                      >
                        {entry.studentName}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={cn(
                          "inline-flex items-center justify-center rounded-full min-w-[2rem] px-2 py-0.5 text-xs font-semibold",
                          entry.badgeCount >= 5
                            ? "bg-primary/15 text-primary"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {entry.badgeCount}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right hidden sm:table-cell">
                      <TrendBadge change={entry.changeFromLastMonth} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppShell>
  );
}
