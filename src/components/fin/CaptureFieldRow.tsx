/**
 * CAPTURE-003: Rând câmp AI cu badge de încredere + editare inline.
 *
 * Câmpurile cu low_confidence sunt evidențiate (border amber + icon atenție).
 * Editarea inline — utilizatorul modifică valoarea și controlul actualizează state-ul.
 *
 * Props:
 *   label       — denumirea câmpului (ex. "Furnizor")
 *   confidence  — gradul de încredere [0..1] returnat de AI
 *   children    — input-ul de editare (text, number, date, toggle)
 *   required    — marcaj vizual câmp obligatoriu
 */
import { AlertTriangle } from "lucide-react";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { cn } from "@/lib/utils";

export interface CaptureFieldRowProps {
  label: string;
  confidence: number | null | undefined;
  required?: boolean;
  children: React.ReactNode;
  /** Suprascriere manuală față de valoarea AI (câmp editată) */
  edited?: boolean;
}

export function CaptureFieldRow({
  label,
  confidence,
  required,
  children,
  edited,
}: CaptureFieldRowProps) {
  const isLowConfidence =
    confidence != null && confidence < 0.60;

  return (
    <div
      className={cn(
        "grid grid-cols-[180px_1fr_80px] items-center gap-3 rounded-lg border px-4 py-3",
        "bg-card text-card-foreground",
        isLowConfidence && "border-amber-400 dark:border-amber-600",
        !isLowConfidence && "border-border"
      )}
    >
      {/* Label + atentionare */}
      <div className="flex items-center gap-1.5">
        {isLowConfidence && (
          <AlertTriangle
            className="h-3.5 w-3.5 shrink-0 text-amber-500"
            aria-hidden="true"
          />
        )}
        <span className="text-sm font-medium text-foreground">
          {label}
          {required && (
            <span
              className="ml-0.5 text-destructive"
              aria-label="câmp obligatoriu"
            >
              *
            </span>
          )}
        </span>
        {edited && (
          <span className="ml-1 rounded bg-primary/10 px-1 py-px text-[10px] font-medium text-primary">
            editat
          </span>
        )}
      </div>

      {/* Input */}
      <div>{children}</div>

      {/* Badge încredere */}
      <div className="flex justify-end">
        <ConfidenceBadge confidence={confidence} />
      </div>
    </div>
  );
}
