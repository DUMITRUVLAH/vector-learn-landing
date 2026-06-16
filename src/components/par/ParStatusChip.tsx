/**
 * PAR-106: ParStatusChip — colored status badge for PAR requests
 * Uses only Vector 365 semantic tokens; light + dark aware
 */
import { cn } from "@/lib/utils";
import { PAR_STATUS_COLORS, type ParStatus } from "@/lib/api/par";
import { useT } from "@/lib/i18n";

interface ParStatusChipProps {
  status: ParStatus;
  className?: string;
}

export function ParStatusChip({ status, className }: ParStatusChipProps) {
  const { t } = useT();
  const label = t(`status.${status}`); // VF-304: bilingual status labels
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        PAR_STATUS_COLORS[status],
        className
      )}
      aria-label={`Status: ${label}`}
    >
      {label}
    </span>
  );
}
