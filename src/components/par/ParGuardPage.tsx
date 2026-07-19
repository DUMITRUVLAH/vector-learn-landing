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

type ParRole = "requestor" | "approver" | "finance" | "par_admin";

const ROLE_LABELS: Record<ParRole, string> = {
  requestor: "solicitanți",
  approver: "aprobatori",
  finance: "finanțe",
  par_admin: "administratori",
};

interface ParGuardPageProps {
  children: ReactNode;
  /**
   * When set, only users holding at least one of these PAR roles may see the page; others get a
   * clear "this area isn't for your role" screen instead of the power UI. Omit to allow ANY PAR
   * role (the default — e.g. the requester's own dashboard / new-request form).
   */
  requiredRoles?: ParRole[];
}

export function ParGuardPage({ children, requiredRoles }: ParGuardPageProps) {
  const { navigate } = useRouter();
  const [state, setState] = useState<"loading" | "allowed" | "denied">("loading");
  // Stable dependency: an inline array prop changes reference every render, which would re-fetch.
  const roleKey = (requiredRoles ?? []).join(",");

  useEffect(() => {
    let alive = true;
    const required = roleKey ? (roleKey.split(",") as ParRole[]) : null;
    getParMe()
      .then((me) => {
        if (!alive) return;
        const roles = me.roles ?? [];
        if (roles.length === 0) { setState("denied"); return; }
        // requiredRoles narrows past "has any PAR role": a requestor must not see the
        // approver/finance/admin/onboarding power UI even by direct URL.
        const ok = !required || required.some((r) => roles.includes(r));
        setState(ok ? "allowed" : "denied");
      })
      .catch(() => {
        // /api/par/me e gate-uit — un 403 înseamnă „fără acces PAR".
        if (alive) setState("denied");
      });
    return () => {
      alive = false;
    };
  }, [roleKey]);

  if (state === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se încarcă..." />
      </div>
    );
  }

  if (state === "denied") {
    const roleText = requiredRoles && requiredRoles.length > 0
      ? requiredRoles.map((r) => ROLE_LABELS[r]).join(" / ")
      : null;
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <ShieldOff className="h-10 w-10 text-muted-foreground mx-auto" aria-hidden />
          <h1 className="text-lg font-semibold text-foreground">
            {roleText ? "Secțiune indisponibilă pentru rolul tău" : "Nu ai acces la modulul PAR"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {roleText
              ? `Această secțiune e doar pentru ${roleText}. Rolul tău actual nu o poate deschide — cere administratorului organizației accesul potrivit dacă ai nevoie.`
              : "Contul tău nu are niciun rol PAR (solicitant, aprobator, finanțe sau admin). Cere administratorului organizației să îți atribuie un rol."}
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
