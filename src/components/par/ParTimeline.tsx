/**
 * PAR-110: ParTimeline component
 *
 * Renders the chronological audit trail for a PAR request.
 * Consumed by the PAR detail page (PAR-118) and deliverable standalone.
 *
 * Design: Vector 365 semantic tokens; light + dark; WCAG AA.
 */
import { useEffect, useState } from "react";
import { getParTimeline, type ParTimelineEvent } from "../../lib/api/par";

// ─── Event icon mapping ───────────────────────────────────────────────────────

function eventIcon(event: string): string {
  switch (event) {
    case "created":
      return "➕";
    case "edited":
      return "✏️";
    case "submitted":
      return "📤";
    case "approved":
    case "fully_approved":
    case "fully_approved_to_finance":
      return "✅";
    case "rejected":
      return "❌";
    case "changes_requested":
      return "🔄";
    case "step_unlocked":
      return "🔓";
    case "cancelled":
      return "🚫";
    case "paid":
      return "💰";
    case "integrity_mismatch":
    case "integrity_mismatch_display":
      return "⚠️";
    default:
      return "📋";
  }
}

function eventLabel(event: string): string {
  const labels: Record<string, string> = {
    created: "Created",
    edited: "Edited",
    submitted: "Submitted for approval",
    approved: "Step approved",
    fully_approved: "Fully approved",
    fully_approved_to_finance: "Fully approved → sent to finance",
    rejected: "Rejected",
    changes_requested: "Changes requested",
    step_unlocked: "Next step unlocked",
    cancelled: "Cancelled",
    paid: "Payment executed",
    integrity_mismatch: "Integrity mismatch (during approval)",
    integrity_mismatch_display: "Integrity mismatch (on view)",
  };
  return labels[event] ?? event.replace(/_/g, " ");
}

// ─── Timeline item ────────────────────────────────────────────────────────────

interface TimelineItemProps {
  event: ParTimelineEvent;
  isLast: boolean;
}

function TimelineItem({ event, isLast }: TimelineItemProps) {
  const date = new Date(event.created_at);
  const dateStr = date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const timeStr = date.toLocaleTimeString("en-GB", {
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
        {eventIcon(event.event)}
      </span>

      {/* Content */}
      <div className="flex-1 pb-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            {eventLabel(event.event)}
          </span>
          <span className="text-xs text-muted-foreground">
            {dateStr} · {timeStr}
          </span>
        </div>

        <p className="mt-0.5 text-xs text-muted-foreground">
          <span className="font-medium">{event.actor_name}</span>
        </p>

        {event.detail && (
          <p className="mt-1 text-sm text-foreground/80 break-words whitespace-pre-wrap">
            {event.detail}
          </p>
        )}

        {event.diff && (() => {
          try {
            const parsed = JSON.parse(event.diff) as Record<string, unknown>;
            return (
              <div className="mt-2 rounded-md border border-border bg-muted/50 px-3 py-2">
                <p className="text-xs font-semibold text-muted-foreground mb-1">Changes</p>
                {Object.entries(parsed).map(([field, change]) => (
                  <div key={field} className="text-xs text-foreground/80">
                    <span className="font-medium">{field}:</span>{" "}
                    {JSON.stringify(change)}
                  </div>
                ))}
              </div>
            );
          } catch {
            return (
              <p className="mt-1 text-xs font-mono text-muted-foreground break-all">
                {event.diff}
              </p>
            );
          }
        })()}
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
          setError(err instanceof Error ? err.message : "Failed to load timeline");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [parId, preloadedEvents]);

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

  if (events.length === 0) {
    return (
      <p className={`text-sm text-muted-foreground ${className ?? ""}`}>
        No timeline events yet.
      </p>
    );
  }

  return (
    <section aria-label="PAR activity timeline" className={className}>
      <ul className="space-y-0" role="list">
        {events.map((event, idx) => (
          <TimelineItem
            key={event.id}
            event={event}
            isLast={idx === events.length - 1}
          />
        ))}
      </ul>
    </section>
  );
}

export default ParTimeline;
