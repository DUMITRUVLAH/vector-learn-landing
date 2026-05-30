/**
 * CRM-132 — TimelineFilters
 * Row of filter buttons above the activity timeline.
 * Filters are client-side (no extra API calls).
 */
import { cn } from "@/lib/utils";

export type TimelineFilter = "all" | "note" | "call" | "commChannel" | "stage_change";

export interface TimelineFilterCounts {
  all: number;
  note: number;
  call: number;
  commChannel: number;
  stage_change: number;
}

interface TimelineFiltersProps {
  active: TimelineFilter;
  counts: TimelineFilterCounts;
  onChange: (filter: TimelineFilter) => void;
}

const FILTER_LABELS: Record<TimelineFilter, string> = {
  all: "Toate",
  note: "Note",
  call: "Apeluri",
  commChannel: "Email+WA+SMS",
  stage_change: "Stadiu",
};

export function TimelineFilters({ active, counts, onChange }: TimelineFiltersProps) {
  const filters: TimelineFilter[] = ["all", "note", "call", "commChannel", "stage_change"];

  return (
    <div
      role="group"
      aria-label="Filtrează activitate după tip"
      className="flex flex-wrap gap-1.5 mb-4"
    >
      {filters.map((filter) => {
        const isActive = active === filter;
        const count = counts[filter];

        return (
          <button
            key={filter}
            type="button"
            onClick={() => onChange(filter)}
            aria-pressed={isActive}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border transition-colors",
              isActive
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {FILTER_LABELS[filter]}
            {count > 0 && (
              <span
                className={cn(
                  "inline-flex items-center justify-center rounded-full text-[10px] font-bold min-w-[18px] h-[18px] px-1",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
                aria-label={`${count} intrări`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Helper: compute filter counts from the full interactions list.
 */
import type { LeadInteraction } from "@/lib/api/leads";

export function computeFilterCounts(
  interactions: LeadInteraction[]
): TimelineFilterCounts {
  const counts: TimelineFilterCounts = {
    all: interactions.length,
    note: 0,
    call: 0,
    commChannel: 0,
    stage_change: 0,
  };

  for (const item of interactions) {
    if (item.type === "note") counts.note++;
    else if (item.type === "call") counts.call++;
    else if (item.type === "email" || item.type === "whatsapp" || item.type === "sms") counts.commChannel++;
    else if (item.type === "stage_change") counts.stage_change++;
  }

  return counts;
}

/**
 * Helper: filter interactions based on the active filter.
 * Optimistic entries always pass through.
 */
export function applyTimelineFilter(
  interactions: LeadInteraction[],
  filter: TimelineFilter
): LeadInteraction[] {
  if (filter === "all") return interactions;
  return interactions.filter((item) => {
    // Optimistic entries always visible
    if (item.optimistic) return true;
    switch (filter) {
      case "note": return item.type === "note";
      case "call": return item.type === "call";
      case "commChannel": return item.type === "email" || item.type === "whatsapp" || item.type === "sms";
      case "stage_change": return item.type === "stage_change";
      default: return true;
    }
  });
}
