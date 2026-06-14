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

export interface UseBusinessDashboardResult {
  data: BusinessDashboardKPI | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useBusinessDashboard(): UseBusinessDashboardResult {
  const [data, setData] = useState<BusinessDashboardKPI | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
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
