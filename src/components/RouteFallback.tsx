/**
 * PERF-003 — ce se vede cât timp se descarcă chunk-ul unei rute.
 *
 * Fallback-ul anterior (`Suspense fallback={null}`) golea ecranul: la o navigare pe rețea lentă,
 * pagina rămânea albă fără niciun semn că se întâmplă ceva. Un spinner apărut instant e la fel
 * de rău în cazul opus — pe rețea rapidă, chunk-ul vine în ~30 ms și spinner-ul apare doar cât
 * să pâlpâie.
 *
 * Compromisul: nu se afișează nimic în primele 300 ms (sub pragul la care omul percepe o
 * întârziere), apoi apare spinner-ul. Navigarea rapidă rămâne curată, cea lentă rămâne explicată.
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

export function RouteFallback() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), 300);
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;

  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-live="polite">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se încarcă pagina…" />
    </div>
  );
}
