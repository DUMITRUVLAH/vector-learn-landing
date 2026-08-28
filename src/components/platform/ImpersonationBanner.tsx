/**
 * PLATFORM-403 — banda „ești în contul altcuiva".
 *
 * Regula de aur a impersonării: nu trebuie să existe niciun moment în care superadminul crede
 * că e în contul lui. Banda stă lipită sus, pe TOATE ecranele aplicației, spune al cui e contul
 * și oferă ieșirea dintr-un singur click. Pe o sesiune normală componenta nu randează nimic.
 */
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Loader2, LogOut } from "lucide-react";
import { getImpersonationStatus, stopImpersonation, type ImpersonationStatus } from "@/lib/api/impersonation";

function minutesLeft(expiresAt?: string): number | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 60000) : 0;
}

export function ImpersonationBanner() {
  const [status, setStatus] = useState<ImpersonationStatus | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getImpersonationStatus()
      .then((s) => { if (alive) setStatus(s); })
      // Pe sesiune neautentificată sau pe un server mai vechi (fără ruta asta) nu e nimic de arătat.
      .catch(() => { if (alive) setStatus(null); });
    return () => { alive = false; };
  }, []);

  const leave = useCallback(async () => {
    setLeaving(true);
    setError(null);
    try {
      const res = await stopImpersonation();
      // Reîncărcare completă, nu navigare SPA: sesiunea s-a schimbat sub aplicație, deci ORICE
      // stare din memorie (rolurile, modulele, cache-ul de cereri) aparține contului părăsit.
      window.location.hash = res.redirect;
      window.location.reload();
    } catch {
      setError("Ieșirea din cont nu a reușit. Reîncarcă pagina și încearcă din nou.");
      setLeaving(false);
    }
  }, []);

  if (!status?.active) return null;

  const left = minutesLeft(status.expiresAt);
  const who = status.target ? (status.target.name || status.target.email) : "utilizator necunoscut";

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-warning/40 bg-warning/15 px-4 py-2 text-xs text-foreground"
    >
      <AlertCircle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
      <span className="min-w-0">
        <strong className="font-semibold">Sesiune de testare</strong> — vezi aplicația din contul lui{" "}
        <strong className="font-semibold">{who}</strong>
        {status.target?.email && who !== status.target.email && <> ({status.target.email})</>}
        {status.workspace && <> · workspace <strong className="font-semibold">{status.workspace.name}</strong></>}
        {left !== null && <> · expiră în {left} min</>}
      </span>
      <span className="flex-1" />
      {error && <span className="text-destructive">{error}</span>}
      <button
        type="button"
        onClick={leave}
        disabled={leaving}
        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-warning/50 bg-card px-3 py-1 font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
        aria-label="Ieși din contul testat și revino la contul tău"
      >
        {leaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <LogOut className="h-3.5 w-3.5" aria-hidden="true" />}
        Ieși din cont
      </button>
    </div>
  );
}
