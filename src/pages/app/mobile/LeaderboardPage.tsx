/**
 * MOB-105: Class leaderboard
 * Route: /m/leaderboard
 * Opt-in only: shows top 10 students by XP in the tenant.
 * Always shows the current student's rank at the bottom if not in top 10.
 */
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, AlertCircle, Trophy, Medal } from "lucide-react";
import { useRouter } from "@/router/HashRouter";
import { useSession } from "@/hooks/useSession";
import { api } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LeaderboardRow {
  rank: number;
  id: string;
  fullName: string;
  totalXP: number;
}

interface LeaderboardData {
  leaderboard: LeaderboardRow[];
  myRank: LeaderboardRow | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rankMedal(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LeaderboardPage() {
  const { navigate } = useRouter();
  const { status: sessionStatus, data: sessionData } = useSession();

  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      navigate("/app/login");
    }
  }, [sessionStatus, navigate]);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    api<LeaderboardData>("/api/m/leaderboard")
      .then((d) => { setData(d); setLoading(false); })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Eroare la leaderboard");
        setLoading(false);
      });
  }, [sessionStatus]);

  const currentUserId = sessionData?.user?.id ?? "";

  if (sessionStatus === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Se încarcă..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background p-6">
        <AlertCircle className="h-10 w-10 text-destructive" aria-hidden="true" />
        <p className="text-destructive text-sm text-center">{error}</p>
        <button onClick={() => window.location.reload()} className="text-sm text-primary underline">
          Încearcă din nou
        </button>
      </div>
    );
  }

  const board = data?.leaderboard ?? [];
  const myRank = data?.myRank;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 flex items-center gap-3 safe-area-top">
        <button
          onClick={() => navigate("/m/xp")}
          aria-label="Înapoi la XP"
          className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <div>
          <h1 className="text-sm font-semibold">Leaderboard Clasă</h1>
          <p className="text-xs text-muted-foreground">Top 10 studenți (opt-in)</p>
        </div>
      </header>

      <main className="flex-1 px-4 py-5 space-y-4 max-w-lg mx-auto w-full">
        {board.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
            <Trophy className="h-10 w-10 text-muted-foreground mx-auto mb-3" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Niciun student nu a activat leaderboard-ul.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Activați opțiunea din profilul vostru pentru a apărea aici.
            </p>
          </div>
        ) : (
          <ul
            className="space-y-2"
            role="list"
            aria-label="Clasamentul studenților"
          >
            {board.map((row) => {
              const isMe = row.id === currentUserId;
              return (
                <li
                  key={row.id}
                  className={`rounded-xl border p-4 flex items-center gap-4 ${
                    isMe ? "border-primary bg-primary/5" : "border-border bg-card"
                  }`}
                  aria-current={isMe ? "true" : undefined}
                >
                  <span
                    className="text-xl font-black w-9 text-center shrink-0"
                    aria-label={`Locul ${row.rank}`}
                  >
                    {rankMedal(row.rank)}
                  </span>
                  <p
                    className={`flex-1 text-sm font-semibold ${
                      isMe ? "text-primary" : "text-foreground"
                    }`}
                  >
                    {row.fullName}
                    {isMe && (
                      <span className="ml-1.5 text-[10px] font-normal text-primary/70">
                        (tu)
                      </span>
                    )}
                  </p>
                  <p className="text-sm font-bold text-muted-foreground">
                    {row.totalXP} XP
                  </p>
                </li>
              );
            })}
          </ul>
        )}

        {/* Show my rank if not in top 10 */}
        {myRank && !board.some((r) => r.id === currentUserId) && (
          <div className="mt-2">
            <p className="text-[11px] text-muted-foreground text-center mb-2">Locul tău</p>
            <div className="rounded-xl border border-primary bg-primary/5 p-4 flex items-center gap-4">
              <span className="text-xl font-black w-9 text-center shrink-0">
                #{myRank.rank}
              </span>
              <p className="flex-1 text-sm font-semibold text-primary">
                {myRank.fullName}
                <span className="ml-1.5 text-[10px] font-normal text-primary/70">(tu)</span>
              </p>
              <p className="text-sm font-bold text-muted-foreground">{myRank.totalXP} XP</p>
            </div>
          </div>
        )}

        {/* Opt-in note */}
        <p className="text-[11px] text-muted-foreground text-center pt-2">
          Clasamentul afișează numai studenții care au activat opțiunea de participare.
        </p>
      </main>

      <div aria-hidden="true" className="h-safe-area-bottom" />
    </div>
  );
}
