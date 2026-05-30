/**
 * CRM-128 — EmptyCadences component
 * Shown in CadencesPage when there are no cadences.
 */
import { ListChecks } from "lucide-react";

interface EmptyCadencesProps {
  onCreateFirst?: () => void;
}

export function EmptyCadences({ onCreateFirst }: EmptyCadencesProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center py-16 text-center"
    >
      <ListChecks className="h-12 w-12 text-muted-foreground mb-4" aria-hidden="true" />
      <h3 className="text-lg font-semibold mb-1">Nicio cadenţă de follow-up</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Crează prima serie de follow-up automatizat pentru leadurile tale.
      </p>
      {onCreateFirst && (
        <button
          type="button"
          onClick={onCreateFirst}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Crează prima cadenţă
        </button>
      )}
    </div>
  );
}
