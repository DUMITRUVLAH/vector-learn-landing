/**
 * GAP-012 — /progress/:token (public no-auth page)
 *
 * Parent-facing progress report for a student.
 * No authentication required — access via a token link shared by the academy.
 */
import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus, BarChart2, Loader2, AlertCircle } from "lucide-react";
import { Logo } from "@/components/Logo";
import { getPublicProgress, type PublicProgress, type SkillWithProgress } from "@/lib/api/progress";
import { cn } from "@/lib/utils";

interface ProgressPublicPageProps {
  token: string;
}

function TrendIcon({ trend }: { trend: SkillWithProgress["trend"] }) {
  if (trend === "up") return <TrendingUp className="w-4 h-4 text-success" aria-label="Progres" />;
  if (trend === "down") return <TrendingDown className="w-4 h-4 text-destructive" aria-label="Regres" />;
  if (trend === "same") return <Minus className="w-4 h-4 text-muted-foreground" aria-label="Stabil" />;
  return null;
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score);
  return (
    <div className="w-full bg-muted rounded-full h-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div
        className={cn(
          "h-2 rounded-full transition-all",
          pct >= 80 ? "bg-success" : pct >= 50 ? "bg-warning" : "bg-destructive"
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function ProgressPublicPage({ token }: ProgressPublicPageProps) {
  const [data, setData] = useState<PublicProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await getPublicProgress(token);
        if (!cancelled) setData(result);
      } catch {
        if (!cancelled) setError("Linkul nu este valid sau a expirat. Solicitați un nou link academiei.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-4 py-3 flex items-center gap-3">
        <Logo className="h-6" />
        <span className="text-sm text-muted-foreground">Raport de progres</span>
      </header>

      <main className="flex-1 flex items-start justify-center p-4 pt-8">
        <div className="w-full max-w-lg">
          {loading && (
            <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-sm">Se încarcă raportul...</span>
            </div>
          )}

          {error && !loading && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-center">
              <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
              <p className="text-sm text-foreground">{error}</p>
            </div>
          )}

          {data && !loading && (
            <div className="space-y-6">
              {/* Title */}
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-3">
                  <BarChart2 className="w-6 h-6 text-primary" />
                </div>
                <h1 className="text-xl font-semibold text-foreground">Progres elev</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Generat la {new Date(data.generatedAt).toLocaleDateString("ro-RO", {
                    day: "numeric", month: "long", year: "numeric"
                  })}
                </p>
              </div>

              {data.skills.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  Nu există evaluări înregistrate încă.
                </div>
              )}

              {data.skills.map((skill) => (
                <div
                  key={skill.skillId}
                  className="rounded-lg border border-border bg-card p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-foreground">{skill.skillName}</p>
                      {skill.skillDescription && (
                        <p className="text-xs text-muted-foreground mt-0.5">{skill.skillDescription}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <TrendIcon trend={skill.trend} />
                      <span className="text-lg font-bold text-foreground tabular-nums">
                        {skill.latestScore}
                      </span>
                      <span className="text-xs text-muted-foreground">/100</span>
                    </div>
                  </div>

                  <ScoreBar score={skill.latestScore} />

                  {skill.history.length > 0 && skill.history[0].comment && (
                    <p className="text-xs text-muted-foreground italic">
                      &ldquo;{skill.history[0].comment}&rdquo;
                    </p>
                  )}

                  {skill.history.length > 1 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">
                        Istoric ({skill.history.length} evaluări)
                      </summary>
                      <div className="mt-2 space-y-1">
                        {skill.history.slice(0, 5).map((h, i) => (
                          <div key={i} className="flex items-center justify-between text-muted-foreground">
                            <span>
                              {new Date(h.evaluatedAt).toLocaleDateString("ro-RO", {
                                day: "numeric", month: "short"
                              })}
                            </span>
                            <span className="font-medium text-foreground">{h.score}/100</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              ))}

              <p className="text-center text-xs text-muted-foreground pb-4">
                Raport generat de Vector Learn
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
