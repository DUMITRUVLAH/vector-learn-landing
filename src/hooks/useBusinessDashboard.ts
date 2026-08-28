/**
 * SPLIT-204: Hook for Business Dashboard unified KPI.
 *
 * Returns `data`, `loading`, `error` — each KPI section is independently
 * nullable (null = that section failed to load, others still render).
 */
import { useState, useEffect } from "react";
import {
  fetchBusinessDashboardKPI,
  type BusinessDashboardKPI,
} from "@/lib/api/businessDashboard";
import { useKeepAliveState, hasKeepAlive } from "@/hooks/useKeepAliveState";

/** O singură cheie: tabloul de bord e unul singur per sesiune. */
const KEY = "business.dashboard.kpi";

export interface UseBusinessDashboardResult {
  data: BusinessDashboardKPI | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useBusinessDashboard(): UseBusinessDashboardResult {
  // Cifrele rămân pe ecran între navigări și se împrospătează tăcut — altfel tabloul de bord
  // se năștea de fiecare dată din zero, cu toate dalele pe „se încarcă".
  const [data, setData] = useKeepAliveState<BusinessDashboardKPI | null>(KEY, null);
  const [loading, setLoading] = useState(() => !hasKeepAlive(KEY));
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // La prima montare cu date în memorie NU arătăm spinner (ecranul e deja corect), dar la o
    // reîncărcare cerută de om (butonul „Reîncarcă", tick > 0) îl arătăm — altfel butonul pare mort.
    if (!hasKeepAlive(KEY) || tick > 0) setLoading(true);
    setError(null);

    fetchBusinessDashboardKPI()
      .then((kpi) => {
        if (!cancelled) {
          setData(kpi);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Eroare la încărcarea datelor"
          );
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tick]);

  const refetch = () => setTick((t) => t + 1);

  return { data, loading, error, refetch };
}
