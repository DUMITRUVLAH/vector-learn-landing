/**
 * VM1-01 (Decizia 9): un utilizator FĂRĂ niciun rol PAR nu vede deloc modulul.
 * BusinessShell deja ascunde nav-ul, dar rutele /business/par/* rămâneau accesibile
 * prin URL direct. Acest guard verifică GET /api/par/me (care include rolul implicit
 * de par_admin pentru admin-ul de tenant) și blochează pagina pentru cei fără rol.
 *
 * Se folosește ÎN INTERIORUL BusinessGuardPage (sesiunea e deja verificată).
 */
import { ReactNode, useEffect, useState } from "react";
import { Loader2, ShieldOff } from "lucide-react";
import { useRouter } from "@/router/HashRouter";
import { getParMe } from "@/lib/api/par";

interface ParGuardPageProps {
  children: ReactNode;
}

export function ParGuardPage({ children }: ParGuardPageProps) {
  const { navigate } = useRouter();
  const [state, setState] = useState<"loading" | "allowed" | "denied">("loading");

  useEffect(() => {
    let alive = true;
    getParMe()
      .then((me) => {
        if (alive) setState((me.roles?.length ?? 0) > 0 ? "allowed" : "denied");
      })
      .catch(() => {
        // /api/par/me e gate-uit — un 403 înseamnă „fără acces PAR".
        if (alive) setState("denied");
      });
    return () => {
      alive = false;
    };
  }, []);

  if (state === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se încarcă..." />
      </div>
    );
  }

  if (state === "denied") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <ShieldOff className="h-10 w-10 text-muted-foreground mx-auto" aria-hidden />
          <h1 className="text-lg font-semibold text-foreground">Nu ai acces la modulul PAR</h1>
          <p className="text-sm text-muted-foreground">
            Contul tău nu are niciun rol PAR (solicitant, aprobator, finanțe sau admin).
            Cere administratorului organizației să îți atribuie un rol.
          </p>
          <button
            type="button"
            onClick={() => navigate("/business")}
            className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 min-h-[44px]"
          >
            Înapoi la Business Suite
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
