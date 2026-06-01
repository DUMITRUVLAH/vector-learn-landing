/**
 * AI-A02 — Churn prediction page
 * /app/analytics/churn
 */
import { useState, useEffect, useCallback } from "react";
import { TrendingDown, RefreshCw, Trash2, ArrowUp, ArrowDown, Minus, Loader2 } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";

interface ChurnScore {
  id: string;
  studentId: string;
  score: number;
  factors: string[];
  trend: "rising" | "stable" | "falling";
  suggestedAction: string | null;
  scoredAt: string;
}

interface ScoreWithName extends ChurnScore {
  studentName?: string;
}

function TrendIcon({ trend }: { trend: "rising" | "stable" | "falling" }) {
  if (trend === "rising") return <ArrowUp className="h-3 w-3 text-destructive" aria-label="Tendință crescătoare" />;
  if (trend === "falling") return <ArrowDown className="h-3 w-3 text-emerald-600" aria-label="Tendință descrescătoare" />;
  return <Minus className="h-3 w-3 text-muted-foreground" aria-label="Tendință stabilă" />;
}

function ScoreBadge({ score }: { score: number }) {
  const cls =
    score >= 70
      ? "bg-destructive/10 text-destructive"
      : score >= 50
      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
      : "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {score}%
    </span>
  );
}

const MIN_SCORES = [0, 50, 70, 90] as const;

export function ChurnPage() {
  const { status, data: session } = useSession();
  const { navigate } = useRouter();
  const [scores, setScores] = useState<ScoreWithName[]>([]);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [minScore, setMinScore] = useState(50);
  const [error, setError] = useState<string | null>(null);

  const fetchScores = useCallback(async (min: number) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/ai/churn/scores?minScore=${min}&limit=50`, {
        credentials: "include",
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const rows = (await resp.json()) as ChurnScore[];
      setScores(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") navigate("/app/login");
  }, [status, navigate]);

  useEffect(() => {
    if (status === "authenticated") fetchScores(minScore);
  }, [status, minScore, fetchScores]);

  const handleRecalculate = async () => {
    setComputing(true);
    setError(null);
    try {
      const resp = await fetch("/api/ai/churn", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      await fetchScores(minScore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la recalculare");
    } finally {
      setComputing(false);
    }
  };

  const handleResolve = async (studentId: string) => {
    try {
      await fetch(`/api/ai/churn/scores/${studentId}`, {
        method: "DELETE",
        credentials: "include",
      });
      setScores((prev) => prev.filter((s) => s.studentId !== studentId));
    } catch {
      // ignore
    }
  };

  return (
    <AppShell
      pageTitle="Predicție risc abandon"
      pageDescription="Elevii cu risc ridicat de a opri cursurile în următoarele 30 de zile"
      actions={
        <button
          type="button"
          onClick={handleRecalculate}
          disabled={computing}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          aria-label="Recalculează scorurile de risc pentru toți elevii"
        >
          {computing ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          )}
          Recalculează
        </button>
      }
    >
      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-6" role="group" aria-label="Filtre scor risc">
        <span className="text-sm text-muted-foreground">Scor minim:</span>
        {MIN_SCORES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setMinScore(s)}
            className={[
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              minScore === s
                ? "bg-primary text-primary-foreground"
                : "border border-border hover:bg-muted",
            ].join(" ")}
            aria-pressed={minScore === s}
          >
            {s === 0 ? "Toți" : `≥ ${s}%`}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive mb-4">{error}</p>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : scores.length === 0 ? (
        <div className="rounded-lg border border-border p-8 text-center space-y-2">
          <TrendingDown className="h-10 w-10 mx-auto text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium">Niciun elev la risc</p>
          <p className="text-xs text-muted-foreground">
            {minScore > 0
              ? `Nu există elevi cu scor ≥ ${minScore}%. Reduceți filtrul sau recalculați.`
              : "Recalculați pentru a analiza toți elevii activi."}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm" aria-label="Tabel elevi la risc">
            <thead>
              <tr className="bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Elev</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground w-20">Scor</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Factori</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground w-16">Trend</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">Acțiune sugerată</th>
                <th className="px-4 py-3 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {scores.map((entry) => (
                <tr key={entry.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium">
                    {entry.studentName ?? entry.studentId.slice(0, 8) + "..."}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ScoreBadge score={entry.score} />
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {entry.factors.map((f, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center rounded-sm bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <TrendIcon trend={entry.trend} />
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground max-w-xs truncate">
                    {entry.suggestedAction ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleResolve(entry.studentId)}
                      className="rounded-md p-1.5 hover:bg-muted transition-colors"
                      aria-label={`Marchează elevul ca rezolvat`}
                      title="Marchează ca rezolvat"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
