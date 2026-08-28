/**
 * ParUrgentBadge — compact "Urgent" indicator for PAR requests (owner request, 2026-08-28).
 *
 * Sits next to ParStatusChip on every list surface (inbox, finance queue, PAR list,
 * ParFocusDashboard). Renders nothing when the request isn't urgent — callers gate with
 * `r.isUrgent && <ParUrgentBadge .../>` rather than passing an `isUrgent` prop here, mirroring
 * how ParStatusChip takes only what it needs to render.
 */
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ds/Badge";
import { cn } from "@/lib/utils";
import { urgentReasonLabel } from "@/lib/par/urgentReasons";

interface ParUrgentBadgeProps {
  reason: string | null | undefined;
  reasonNote?: string | null;
  dueDate?: string | null;
  className?: string;
}

export function ParUrgentBadge({ reason, reasonNote, dueDate, className }: ParUrgentBadgeProps) {
  // Defensive: callers gate rendering with `r.isUrgent &&`, but a null reason means there is
  // nothing meaningful to show anyway — render nothing rather than a bare "Urgent" chip with no
  // explanation attached.
  if (!reason) return null;
  const label = urgentReasonLabel(reason, reasonNote);
  const dueDateLabel = dueDate
    ? new Date(dueDate).toLocaleDateString("ro-RO", { day: "2-digit", month: "2-digit", year: "numeric" })
    : null;
  const title = [
    label ? `Motiv: ${label}` : null,
    dueDateLabel ? `Termen limită plată: ${dueDateLabel}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Badge
      variant="destructive"
      className={cn("gap-1", className)}
      title={title || undefined}
    >
      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
      Urgent
    </Badge>
  );
}
