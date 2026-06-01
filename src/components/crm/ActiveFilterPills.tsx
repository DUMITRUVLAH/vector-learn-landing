/**
 * CRM-149: Active filter pills row.
 *
 * Shows one pill per active filter with an accessible "×" to clear that
 * specific filter.  Renders nothing when no filter is active.
 *
 * Design-system tokens only — no hardcoded colours.
 */
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ActiveFilters {
  source?: string;        // truthy when not "all"
  assignedTo?: string;    // truthy when not "all"
  searchQuery?: string;   // truthy when non-empty
  filterNoTask?: boolean;
  filterOverdue?: boolean;
}

export interface ActiveFilterPillsProps {
  filters: ActiveFilters;
  sourceLabel: (key: string) => string;
  assignedLabel: (id: string) => string;
  onClearSource: () => void;
  onClearAssigned: () => void;
  onClearSearch: () => void;
  onClearNoTask: () => void;
  onClearOverdue: () => void;
  className?: string;
}

interface PillProps {
  label: string;
  onRemove: () => void;
}

function Pill({ label, onRemove }: PillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border",
        "bg-muted/60 px-2.5 py-1 text-xs font-medium text-foreground",
      )}
    >
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Elimină filtrul "${label}"`}
        className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
    </span>
  );
}

/**
 * CRM-149: Pills row for active CRM filters.
 * Returns null when nothing is active — no empty wrapper rendered.
 */
export function ActiveFilterPills({
  filters,
  sourceLabel,
  assignedLabel,
  onClearSource,
  onClearAssigned,
  onClearSearch,
  onClearNoTask,
  onClearOverdue,
  className,
}: ActiveFilterPillsProps) {
  const pills: React.ReactNode[] = [];

  if (filters.source) {
    pills.push(
      <Pill
        key="source"
        label={`Sursă: ${sourceLabel(filters.source)}`}
        onRemove={onClearSource}
      />,
    );
  }

  if (filters.assignedTo) {
    pills.push(
      <Pill
        key="assigned"
        label={`Responsabil: ${assignedLabel(filters.assignedTo)}`}
        onRemove={onClearAssigned}
      />,
    );
  }

  if (filters.searchQuery) {
    pills.push(
      <Pill
        key="search"
        label={`Căutare: "${filters.searchQuery}"`}
        onRemove={onClearSearch}
      />,
    );
  }

  if (filters.filterNoTask) {
    pills.push(
      <Pill key="no-task" label="Fără task" onRemove={onClearNoTask} />,
    );
  }

  if (filters.filterOverdue) {
    pills.push(
      <Pill key="overdue" label="Restanțe" onRemove={onClearOverdue} />,
    );
  }

  if (pills.length === 0) return null;

  return (
    <div
      className={cn("flex flex-wrap gap-1.5", className)}
      role="list"
      aria-label="Filtre active"
    >
      {pills.map((p) => (
        <div key={(p as React.ReactElement).key} role="listitem">
          {p}
        </div>
      ))}
    </div>
  );
}
