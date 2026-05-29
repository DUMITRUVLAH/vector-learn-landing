import { AlertTriangle } from "lucide-react";

interface ConflictBadgeProps {
  message: string;
}

export function ConflictBadge({ message }: ConflictBadgeProps) {
  return (
    <div
      role="alert"
      className="inline-flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive animate-fade-in"
    >
      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
      {message}
    </div>
  );
}

/**
 * Detect duplicate (day, slot) pairs.
 * Returns IDs of events that conflict with at least one other.
 */
export function detectConflicts<T extends { id: string; day: number; slot: number }>(
  events: ReadonlyArray<T>
): Set<string> {
  const grouped = new Map<string, string[]>();
  for (const ev of events) {
    const key = `${ev.day}:${ev.slot}`;
    const arr = grouped.get(key) ?? [];
    arr.push(ev.id);
    grouped.set(key, arr);
  }
  const conflicts = new Set<string>();
  for (const ids of grouped.values()) {
    if (ids.length > 1) {
      for (const id of ids) conflicts.add(id);
    }
  }
  return conflicts;
}
