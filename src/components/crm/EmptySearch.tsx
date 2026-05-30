/**
 * CRM-128 — EmptySearch component
 * Shown when a filtered list/search returns no results.
 */
import { SearchX } from "lucide-react";

interface EmptySearchProps {
  onClearFilters?: () => void;
}

export function EmptySearch({ onClearFilters }: EmptySearchProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center py-16 text-center"
    >
      <SearchX className="h-12 w-12 text-muted-foreground mb-4" aria-hidden="true" />
      <h3 className="text-base font-semibold">Niciun rezultat</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Niciun lead nu corespunde filtrelor aplicate.
      </p>
      {onClearFilters && (
        <button
          type="button"
          onClick={onClearFilters}
          className="mt-4 text-sm text-primary hover:underline"
        >
          Şterge filtrele
        </button>
      )}
    </div>
  );
}
