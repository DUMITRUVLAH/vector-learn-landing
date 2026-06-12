/**
 * PAR-106: ParStatusChip — colored status badge for PAR requests
 * Uses only Vector 365 semantic tokens; light + dark aware
 */
import { cn } from "@/lib/utils";
import { PAR_STATUS_COLORS, PAR_STATUS_LABELS, type ParStatus } from "@/lib/api/par";

interface ParStatusChipProps {
  status: ParStatus;
  className?: string;
}

export function ParStatusChip({ status, className }: ParStatusChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        PAR_STATUS_COLORS[status],
        className
      )}
      aria-label={`Status: ${PAR_STATUS_LABELS[status]}`}
    >
      {PAR_STATUS_LABELS[status]}
    </span>
  );
}
