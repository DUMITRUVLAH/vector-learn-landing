/**
 * TB-006: Prezentare manager — pagina de sine stătătoare, TOATE produsele.
 * Răspunsul la „eu ca manager să văd cum stăm per produs": grafic stacked +
 * tabel cu valori exacte, întârziate și fără-owner per produs.
 */
import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { getBoardOverview, type ProductOverview } from "@/lib/api/boardOverview";
import { BoardOverview } from "@/components/business/board/BoardOverview";

export function BoardOverviewPage() {
  const [overview, setOverview] = useState<ProductOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getBoardOverview();
      setOverview(res.overview);
    } catch {
      setError("Eroare la încărcarea prezentării. Încearcă din nou.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <BusinessShell
      pageTitle="Task Board — Prezentare"
      pageDescription="Progresul taskurilor per produs: ce e gata, ce e în lucru, ce e blocat și ce a rămas."
    >
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" aria-label="Se încarcă" />
        </div>
      ) : error ? (
        <p className="flex items-center gap-2 py-8 text-sm text-destructive" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : (
        <BoardOverview overview={overview} />
      )}
    </BusinessShell>
  );
}
