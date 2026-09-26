// Marcajul „se repetă", cu rezumatul citibil al regulii.
//
// O SINGURĂ piesă pentru toate suprafețele (kanban, listă, calendar, detaliu):
// până acum regula se salva, dar niciun ecran nu spunea că taskul e recurent,
// iar ocurențele viitoare nu există ca rânduri — se nasc abia la finalizarea
// celei curente. Deci marcajul e singurul semn că seria continuă.

import { Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTasksT } from "@/lib/tasks/useTasksT";
import { parseRecurrence } from "@/lib/tasks/recurrence";

/** Rezumatul regulii, gata de pus în `title` sau lângă iconiță. */
export function useRecurrenceLabel(rule: string | null | undefined): string {
  const { t } = useTasksT();
  const parsed = parseRecurrence(rule);
  const frecventa = t(`board.recurrence.${parsed.frequency}`).toLowerCase();
  const baza =
    parsed.interval === 1
      ? t("board.recurrence.summary.simple", { frequency: frecventa })
      : t("board.recurrence.summary.every", { count: parsed.interval, frequency: frecventa });
  if (parsed.frequency !== "weekly" || parsed.days.length === 0) return baza;
  const zile = parsed.days.map((day) => t(`board.recurrence.days.${day}`)).join(", ");
  return `${baza} · ${zile}`;
}

interface RecurrenceBadgeProps {
  rule: string | null | undefined;
  className?: string;
  withText?: boolean;
}

export function RecurrenceBadge({ rule, className, withText = false }: RecurrenceBadgeProps) {
  const label = useRecurrenceLabel(rule);
  return (
    // `title` nativ, nu Tooltip: pe un board sunt sute de carduri, iar
    // fiecare Tooltip e o rădăcină cu context și portal.
    <span className={cn("inline-flex items-center gap-1 text-[10px] text-muted-foreground", className)} title={label}>
      <Repeat className="h-2.5 w-2.5 shrink-0" />
      {withText && <span className="truncate">{label}</span>}
    </span>
  );
}
