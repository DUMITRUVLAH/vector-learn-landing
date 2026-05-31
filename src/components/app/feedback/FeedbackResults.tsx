/**
 * FB-004 — Aggregated analysis of a feedback form's submitted answers:
 * response rate, average ratings/scale, choice tallies, yes/no, free-text list.
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, Star, MessageSquareText } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { BackToFeedback } from "@/pages/app/FeedbackPage";
import { cn } from "@/lib/utils";
import { getResults, type FormResults, type QuestionResult } from "@/lib/api/feedback";

interface FeedbackResultsProps {
  formId: string;
  onBack: () => void;
}

function Bar({ value, max, label, count }: { value: number; max: number; label: string; count: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-28 flex-shrink-0 truncate text-muted-foreground" title={label}>
        {label}
      </span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 flex-shrink-0 text-right tabular-nums text-muted-foreground">{count}</span>
    </div>
  );
}

function QuestionCard({ q }: { q: QuestionResult }) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <p className="font-medium">{q.label}</p>
      <p className="text-xs text-muted-foreground">
        {q.count} {q.count === 1 ? "răspuns" : "răspunsuri"}
      </p>

      {(q.type === "rating" || q.type === "scale") && (
        <div className="space-y-2">
          {q.average != null ? (
            <p className="flex items-center gap-1.5 text-2xl font-bold">
              {q.type === "rating" && <Star className="h-5 w-5 fill-primary text-primary" />}
              {q.average}
              <span className="text-sm font-normal text-muted-foreground">
                / {q.type === "rating" ? 5 : 10} media
              </span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Niciun răspuns încă.</p>
          )}
          {q.distribution &&
            Object.keys(q.distribution).length > 0 &&
            (() => {
              const entries = Object.entries(q.distribution).sort(
                (a, b) => Number(b[0]) - Number(a[0])
              );
              const max = Math.max(...entries.map(([, c]) => c), 1);
              return (
                <div className="space-y-1.5">
                  {entries.map(([val, c]) => (
                    <Bar key={val} label={`${val}`} value={c} max={max} count={c} />
                  ))}
                </div>
              );
            })()}
        </div>
      )}

      {q.type === "yesno" && (
        <div className="space-y-1.5">
          <Bar label="Da" value={q.yes ?? 0} max={Math.max((q.yes ?? 0) + (q.no ?? 0), 1)} count={q.yes ?? 0} />
          <Bar label="Nu" value={q.no ?? 0} max={Math.max((q.yes ?? 0) + (q.no ?? 0), 1)} count={q.no ?? 0} />
        </div>
      )}

      {(q.type === "single" || q.type === "multi") && q.tally && (
        <div className="space-y-1.5">
          {(() => {
            const entries = Object.entries(q.tally);
            const max = Math.max(...entries.map(([, c]) => c), 1);
            return entries.map(([opt, c]) => (
              <Bar key={opt} label={opt} value={c} max={max} count={c} />
            ));
          })()}
        </div>
      )}

      {q.type === "text" && (
        <div className="space-y-2">
          {q.responses && q.responses.length > 0 ? (
            <ul className="space-y-2">
              {q.responses.map((r, i) => (
                <li
                  key={i}
                  className="flex gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm text-foreground"
                >
                  <MessageSquareText className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Niciun răspuns text încă.</p>
          )}
        </div>
      )}
    </div>
  );
}

export function FeedbackResults({ formId, onBack }: FeedbackResultsProps) {
  const [data, setData] = useState<FormResults | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getResults(formId));
    } finally {
      setLoading(false);
    }
  }, [formId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell
      pageTitle="Rezultate feedback"
      pageDescription={data?.form.title ?? "Se încarcă…"}
    >
      <BackToFeedback onClick={onBack} />

      {loading || !data ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" aria-label="Se încarcă" />
        </div>
      ) : (
        <div className="max-w-3xl space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Trimise" value={data.sentCount} />
            <Stat label="Răspunsuri" value={data.submittedCount} />
            <Stat label="Rată răspuns" value={`${data.responseRate}%`} />
          </div>

          {data.submittedCount === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              Niciun răspuns încă. Rezultatele apar pe măsură ce cursanții completează formularul.
            </div>
          ) : (
            <div className="space-y-3">
              {data.questions.map((q) => (
                <QuestionCard key={q.questionId} q={q} />
              ))}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-4")}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
