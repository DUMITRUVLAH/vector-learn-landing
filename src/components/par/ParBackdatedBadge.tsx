/**
 * ParBackdatedBadge — semnul „cerere cu dată din trecut" (owner, 2026-08-29).
 *
 * Aceeași logică de afișare ca [ParUrgentBadge]: primește datele, nu un boolean, și nu randează
 * nimic dacă nu e cazul — apelantul nu trebuie să știe cum se calculează decalajul.
 *
 * Îl văd exact cei care decid: aprobatorul (inbox + detaliu) și finanțele (coadă + detaliu). O
 * cerere datată în urmă poate fi o regularizare corectă sau o cheltuială împinsă într-o perioadă
 * bugetară închisă — diferența o face omul care semnează, dar numai dacă vede decalajul.
 */
import { CalendarClock } from "lucide-react";
import { Badge } from "@/components/ds/Badge";
import { cn } from "@/lib/utils";
import { backdatedDays, backdatedLabel } from "@/lib/par/backdated";

interface ParBackdatedBadgeProps {
  dateOfRequest: string | null | undefined;
  /** Ziua depunerii. Lipsă (ciornă) → se compară cu ziua curentă. */
  submittedAt?: string | null;
  className?: string;
}

export function ParBackdatedBadge({ dateOfRequest, submittedAt, className }: ParBackdatedBadgeProps) {
  const days = backdatedDays(dateOfRequest, submittedAt);
  if (days <= 0) return null;
  const requested = dateOfRequest ? new Date(dateOfRequest).toLocaleDateString("ro-RO", { day: "2-digit", month: "2-digit", year: "numeric" }) : null;
  return (
    <Badge
      variant="warning"
      className={cn("gap-1", className)}
      title={requested ? `Cererea e întocmită cu data de ${requested}, anterioară zilei în care a fost depusă.` : undefined}
    >
      <CalendarClock className="h-3 w-3" aria-hidden="true" />
      {backdatedLabel(days)}
    </Badge>
  );
}
