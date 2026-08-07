/**
 * PAR-106 / HR365: ParStatusChip — status pill for PAR requests.
 *
 * PAR's status vocabulary (9 states) is richer than the DS Badge's 7 generic
 * variants — `pending_approval`, `changes_requested` and `reapproval_required`
 * would all collapse onto "warning" and stop being distinguishable. So the chip
 * keeps its own mapping, but onto the HR365 icon-chip token pairs instead of the
 * hardcoded `bg-yellow-100 dark:bg-yellow-900/30` pairs it used to carry: light
 * and dark now come from the same source as every other tinted surface.
 */
import { cn } from "@/lib/utils";
import { type ParStatus } from "@/lib/api/par";
import { useT } from "@/lib/i18n";

/**
 * Tint strength matches the DS `Badge` (the -100/-700 pair), NOT the icon-chip
 * tokens: the chip tints are pale by design — behind a glyph they read as a
 * tinted square, but behind text on a white row they read as no background at
 * all. Approved and paid stay distinct (teal vs emerald), and the three
 * "needs work" states keep their own orange so they don't all look alike.
 */
const STATUS_CLASS: Record<ParStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground",
  rejected: "bg-destructive/10 text-destructive",
  pending_approval:
    "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  changes_requested:
    "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  reapproval_required:
    "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  approved: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
  in_finance: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
};

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
        // `whitespace-nowrap`: in the finance queue's narrow status column the
        // label was breaking across three lines ("La / finan / țe").
        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold",
        STATUS_CLASS[status],
        className,
      )}
      aria-label={`Status: ${label}`}
    >
      {label}
    </span>
  );
}
