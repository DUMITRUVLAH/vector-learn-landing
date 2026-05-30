/**
 * CRM-136: useKanbanDensity — hook for kanban card density preference.
 * Persists in localStorage under key 'crm_density'.
 * Returns [density, setDensity] where density is 'compact' | 'comfortable'.
 */
import { useState, useCallback } from "react";

export type KanbanDensity = "compact" | "comfortable";

const STORAGE_KEY = "crm_density";

function readDensityFromStorage(): KanbanDensity {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "compact" || stored === "comfortable") return stored;
  } catch {
    // localStorage unavailable (SSR, private browsing restrictions)
  }
  return "comfortable";
}

export function useKanbanDensity(): [KanbanDensity, (d: KanbanDensity) => void] {
  const [density, setDensityState] = useState<KanbanDensity>(() => readDensityFromStorage());

  const setDensity = useCallback((newDensity: KanbanDensity) => {
    try {
      localStorage.setItem(STORAGE_KEY, newDensity);
    } catch {
      // ignore
    }
    setDensityState(newDensity);
  }, []);

  return [density, setDensity];
}
