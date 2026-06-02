/**
 * AI-A02 — Churn risk widget for the Dashboard
 * Shows top 3 at-risk students with score badges.
 */
import { useEffect, useState } from "react";
import { TrendingDown, ArrowUpRight } from "lucide-react";
import { Link } from "@/router/HashRouter";

interface ChurnScore {
  id: string;
  studentId: string;
  score: number;
  factors: string[];
  trend: "rising" | "stable" | "falling";
  suggestedAction: string | null;
  scoredAt: string;
}

function ScoreBadge({ score }: { score: number }) {
  const cls =
    score >= 70
      ? "bg-destructive/10 text-destructive"
      : score >= 50
      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
      : "bg-muted text-muted-foreground";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}
      aria-label={`Risc ${score}%`}
    >
      {score}%
    </span>
  );
}

interface ChurnWidgetProps {
  /** Fetched externally; widget is purely presentational */
  scores?: ChurnScore[];
}

export function ChurnWidget({ scores }: ChurnWidgetProps) {
  const [data, setData] = useState<ChurnScore[]>(scores ?? []);
  const [loading, setLoading] = useState(!scores);

  useEffect(() => {
    if (scores !== undefined) {
      setData(scores);
      return;
    }
    setLoading(true);
    fetch("/api/ai/churn/scores?minScore=50&limit=3", { credentials: "include" })
      .then((r) => (r.ok ? (r.json() as Promise<ChurnScore[]>) : Promise.reject()))
      .then((rows) => setData(rows))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [scores]);

  if (loading) {
    return (
      <div className="rounded-lg border border-border p-4 animate-pulse">
        <div className="h-4 w-32 bg-muted rounded mb-3" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 bg-muted rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (data.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingDown className="h-4 w-4 text-destructive" aria-hidden="true" />
          <h3 className="text-sm font-semibold">Risc abandonare</h3>
        </div>
        <Link
          to="/app/analytics/churn"
          className="text-xs text-primary hover:underline flex items-center gap-0.5"
          aria-label="Vezi toți elevii la risc"
        >
          Vezi toți
          <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>

      <ul className="space-y-2" aria-label="Elevi la risc de abandon">
        {data.slice(0, 3).map((entry) => (
          <li key={entry.id} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-amber-400 to-rose-500 flex items-center justify-center text-[10px] font-bold text-white"
                aria-hidden="true"
              >
                {entry.studentId.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">
                  {/* studentId as fallback — real name is in ChurnPage */}
                  Elev #{entry.studentId.slice(0, 6)}
                </p>
                {entry.factors[0] && (
                  <p className="text-[10px] text-muted-foreground truncate">
                    {entry.factors[0]}
                  </p>
                )}
              </div>
            </div>
            <ScoreBadge score={entry.score} />
          </li>
        ))}
      </ul>
    </div>
  );
}
