/**
 * MOB-105: Student XP / Gamification page
 * Route: /m/xp
 * Shows XP bar, level, streak, badges earned.
 * Mobile-first, semantic tokens, dark-mode safe.
 */
import { useEffect, useState } from "react";
import { ArrowLeft, Flame, Star, Trophy, Loader2, AlertCircle, Zap } from "lucide-react";
import { useRouter } from "@/router/HashRouter";
import { useSession } from "@/hooks/useSession";
import { api } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BadgeRow {
  badgeType: string;
  earnedAt: string;
}

interface XpData {
  totalXP: number;
  level: number;
  currentStreak: number;
  longestStreak: number;
  badges: BadgeRow[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BADGE_META: Record<string, { label: string; emoji: string; description: string }> = {
  streak_7:       { label: "7 Zile Consecutiv",  emoji: "🔥", description: "Ai completat 7 activități consecutive" },
  streak_30:      { label: "Lună de Foc",        emoji: "🌟", description: "30 de zile consecutive — extraordinar!" },
  xp_100:         { label: "100 XP",             emoji: "⭐", description: "Primii 100 XP obținuți" },
  xp_500:         { label: "500 XP",             emoji: "🏆", description: "500 XP — student dedicat!" },
  first_homework: { label: "Prima Temă",         emoji: "📝", description: "Prima temă trimisă" },
};

function getBadgeMeta(type: string) {
  return BADGE_META[type] ?? { label: type, emoji: "🎖️", description: "Realizare specială" };
}

function xpToNextLevel(level: number): number {
  return level * 100;
}

function xpInCurrentLevel(totalXP: number): number {
  return totalXP % 100;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function XpPage() {
  const { navigate } = useRouter();
  const { status: sessionStatus } = useSession();

  const [xpData, setXpData] = useState<XpData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      navigate("/app/login");
    }
  }, [sessionStatus, navigate]);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    api<XpData>("/api/m/xp")
      .then((data) => {
        setXpData(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Eroare la încărcarea XP");
        setLoading(false);
      });
  }, [sessionStatus]);

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

  const data = xpData ?? { totalXP: 0, level: 1, currentStreak: 0, longestStreak: 0, badges: [] };
  const progress = xpInCurrentLevel(data.totalXP);
  const progressPct = Math.min(100, (progress / 100) * 100);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 flex items-center gap-3 safe-area-top">
        <button
          onClick={() => navigate("/m/dashboard")}
          aria-label="Înapoi la dashboard"
          className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <div>
          <h1 className="text-sm font-semibold">XP & Realizări</h1>
          <p className="text-xs text-muted-foreground">Progresul tău gamificat</p>
        </div>
      </header>

      <main className="flex-1 px-4 py-5 space-y-5 max-w-lg mx-auto w-full">
        {/* XP + Level card */}
        <section aria-labelledby="xp-heading">
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Nivel curent</p>
                <p className="text-2xl font-black text-primary leading-none">
                  {data.level}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Total XP</p>
                <p className="text-xl font-bold" aria-label={`${data.totalXP} XP total`}>
                  {data.totalXP} XP
                </p>
              </div>
            </div>

            {/* Progress bar */}
            <div>
              <div className="flex justify-between text-[11px] text-muted-foreground mb-1.5">
                <span>{progress} / 100 XP</span>
                <span>Nivel {data.level + 1}</span>
              </div>
              <div
                className="h-3 w-full rounded-full bg-muted overflow-hidden"
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Progres nivel: ${progress} din 100 XP`}
              >
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {/* XP breakdown hint */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-muted/50 py-2">
                <p className="text-xs text-muted-foreground">Prezență</p>
                <p className="text-sm font-bold">+10 XP</p>
              </div>
              <div className="rounded-lg bg-muted/50 py-2">
                <p className="text-xs text-muted-foreground">Temă</p>
                <p className="text-sm font-bold">+20 XP</p>
              </div>
              <div className="rounded-lg bg-muted/50 py-2">
                <p className="text-xs text-muted-foreground">Quiz</p>
                <p className="text-sm font-bold">+15 XP</p>
              </div>
            </div>
          </div>
        </section>

        {/* Streak card */}
        <section aria-labelledby="streak-heading">
          <h2
            id="streak-heading"
            className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3"
          >
            Streak zile consecutive
          </h2>
          <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-orange-500/15 flex items-center justify-center shrink-0">
              <Flame className="h-7 w-7 text-orange-500" aria-hidden="true" />
            </div>
            <div className="flex-1">
              <div className="flex items-end gap-1">
                <p
                  className="text-3xl font-black text-orange-500 leading-none"
                  aria-label={`Streak curent: ${data.currentStreak} zile`}
                >
                  {data.currentStreak}
                </p>
                <p className="text-sm text-muted-foreground pb-0.5">zile</p>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Record: <strong className="text-foreground">{data.longestStreak}</strong> zile
              </p>
            </div>
          </div>
        </section>

        {/* Badges */}
        <section aria-labelledby="badges-heading">
          <h2
            id="badges-heading"
            className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3"
          >
            Insigne obținute
          </h2>
          {data.badges.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
              <Trophy className="h-8 w-8 text-muted-foreground mx-auto mb-2" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">Nicio insignă încă</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Participă la lecții și trimite teme pentru a câștiga insigne!
              </p>
            </div>
          ) : (
            <ul
              className="grid grid-cols-2 gap-3"
              role="list"
              aria-label="Insigne câștigate"
            >
              {data.badges.map((b) => {
                const meta = getBadgeMeta(b.badgeType);
                return (
                  <li
                    key={b.badgeType}
                    className="rounded-xl border border-border bg-card p-3 flex items-center gap-3"
                  >
                    <span
                      className="text-2xl shrink-0"
                      role="img"
                      aria-label={meta.label}
                    >
                      {meta.emoji}
                    </span>
                    <div>
                      <p className="text-xs font-semibold leading-tight">{meta.label}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{meta.description}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Leaderboard link */}
        <button
          onClick={() => navigate("/m/leaderboard")}
          className="w-full flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted/50 transition-colors text-left"
          aria-label="Vezi leaderboard-ul clasei"
        >
          <Star className="h-5 w-5 text-amber-500 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">Leaderboard Clasă</p>
            <p className="text-xs text-muted-foreground">Compară-te cu colegii (opt-in)</p>
          </div>
          <Zap className="ml-auto h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </button>
      </main>

      <div aria-hidden="true" className="h-safe-area-bottom" />
    </div>
  );
}
