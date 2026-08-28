/**
 * PAR-110: ParTimeline component
 *
 * Jurnalul de activitate al unei cereri PAR — scris pentru oameni, nu pentru log.
 * Traducerea evenimentelor tehnice (engleză, id-uri, JSON) în propoziții stă în
 * `src/lib/par/timelineHumanize.ts`; aici doar le așezăm pe fir.
 *
 * Design: Vector 365 semantic tokens; light + dark; WCAG AA.
 */
import { useEffect, useMemo, useState } from "react";
import { getParTimeline, type ParTimelineEvent } from "../../lib/api/par";
import { humanizeEvent, type HumanTimelineEvent } from "../../lib/par/timelineHumanize";

// ─── Grupare ──────────────────────────────────────────────────────────────────

interface TimelineEntry {
  event: ParTimelineEvent;
  human: HumanTimelineEvent;
  /** De câte ori s-a repetat identic, la rând (verificarea unui act se poate relua). */
  count: number;
}

/**
 * Evenimente identice, unul după altul (același tip, același text, același autor),
 * se strâng într-un singur rând cu „de N ori". Altfel jurnalul repetă aceeași
 * frază de trei ori și nu se mai vede ce s-a întâmplat de fapt.
 */
function groupEvents(events: ParTimelineEvent[]): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  for (const event of events) {
    const human = humanizeEvent(event);
    const last = out[out.length - 1];
    if (
      last &&
      last.event.event === event.event &&
      last.event.actor_user_id === event.actor_user_id &&
      last.human.title === human.title &&
      last.human.lines.join("|") === human.lines.join("|")
    ) {
      last.count += 1;
      continue;
    }
    out.push({ event, human, count: 1 });
  }
  return out;
}

// ─── Timeline item ────────────────────────────────────────────────────────────

interface TimelineItemProps {
  entry: TimelineEntry;
  isLast: boolean;
}

function TimelineItem({ entry, isLast }: TimelineItemProps) {
  const { event, human, count } = entry;
  const date = new Date(event.created_at);
  const dateStr = date.toLocaleDateString("ro-RO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const timeStr = date.toLocaleTimeString("ro-RO", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <li className="relative flex gap-3">
      {/* Vertical connector line */}
      {!isLast && (
        <span
          className="absolute left-[17px] top-8 h-full w-px bg-border"
          aria-hidden="true"
        />
      )}

      {/* Icon bubble */}
      <span
        className="flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-muted text-base ring-1 ring-border"
        aria-hidden="true"
      >
        {human.icon}
      </span>

      {/* Content */}
      <div className="flex-1 pb-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{human.title}</span>
          {count > 1 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              de {count} ori
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {dateStr}, ora {timeStr}
          </span>
        </div>

        <p className="mt-0.5 text-xs text-muted-foreground">
          <span className="font-medium">{event.actor_name}</span>
        </p>

        {human.lines.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {human.lines.map((line, i) => (
              <p key={i} className="text-sm text-foreground/80 break-words">
                {line}
              </p>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ParTimelineProps {
  parId: string;
  /** Optional: if true, only renders inline without fetching (pass pre-loaded events) */
  events?: ParTimelineEvent[];
  className?: string;
}

/**
 * Displays the audit timeline for a PAR.
 * If `events` is provided, renders them directly (no fetch).
 * Otherwise fetches from GET /api/par/:id/timeline.
 */
export function ParTimeline({ parId, events: preloadedEvents, className }: ParTimelineProps) {
  const [events, setEvents] = useState<ParTimelineEvent[]>(preloadedEvents ?? []);
  const [loading, setLoading] = useState(!preloadedEvents);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (preloadedEvents) {
      setEvents(preloadedEvents);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getParTimeline(parId)
      .then((res) => {
        if (!cancelled) setEvents(res.timeline);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Nu am putut încărca jurnalul");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [parId, preloadedEvents]);

  const entries = useMemo(() => groupEvents(events), [events]);

  if (loading) {
    return (
      <div className={`space-y-3 ${className ?? ""}`} aria-busy="true">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <div className="h-9 w-9 flex-shrink-0 rounded-full bg-muted animate-pulse" />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
              <div className="h-3 w-2/3 rounded bg-muted animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className={`rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive ${className ?? ""}`}>
        {error}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <p className={`text-sm text-muted-foreground ${className ?? ""}`}>
        Deocamdată nu s-a întâmplat nimic pe cererea asta.
      </p>
    );
  }

  return (
    <section aria-label="Jurnal de activitate" className={className}>
      <ul className="space-y-0" role="list">
        {entries.map((entry, idx) => (
          <TimelineItem
            key={entry.event.id}
            entry={entry}
            isLast={idx === entries.length - 1}
          />
        ))}
      </ul>
    </section>
  );
}

export default ParTimeline;
