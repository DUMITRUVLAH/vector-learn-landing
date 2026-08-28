/**
 * SPLIT-103: BusinessGuardPage — HOC pentru rute /business/* protejate.
 *
 * Verifică sesiunea Business Suite (GET /api/business/auth/me).
 * - Loading: spinner
 * - Unauthenticated / error: redirect la /business/login
 * - Authenticated: randează children (paginile FinDesk/PAR/ITPark existente cu shell-urile lor)
 *
 * NU învelește în BusinessShell — paginile delegate au propriile shell-uri
 * (FinLayout, AppShell). Guard-ul asigură izolarea sesiunii business.
 *
 * Păzește și MODULUL rutei: PAR îl are orice organizație, restul modulelor se aprind de
 * proprietar din Consola Platformă. Fără verificarea asta, ascunderea din meniu ar fi fost
 * cosmetică — cine scria adresa în bară intra oricum într-un modul pe care nu-l are.
 */
import { ReactNode, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "@/router/HashRouter";
import { useBusinessSession } from "@/hooks/useBusinessSession";
import { moduleForPath, useEnabledModules } from "@/hooks/useEnabledModules";
import { Button } from "@/components/ds";

interface BusinessGuardPageProps {
  children: ReactNode;
}

export function BusinessGuardPage({ children }: BusinessGuardPageProps) {
  const { path, navigate } = useRouter();
  const session = useBusinessSession();
  const modules = useEnabledModules();

  useEffect(() => {
    if (session.status === "unauthenticated" || session.status === "error") {
      navigate("/business/login");
    }
  }, [session.status, navigate, path]);

  if (session.status === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se încarcă..." />
      </div>
    );
  }

  if (session.status !== "authenticated") {
    // Redirect in progress (handled by useEffect above)
    return null;
  }

  // Cât timp lista de module se încarcă lăsăm pagina să se randeze: serverul rămâne
  // autoritatea (403 module_disabled), iar un ecran de blocare care apare și dispare
  // ar fi mai rău decât o jumătate de secundă de conținut.
  const moduleKey = moduleForPath(path);
  if (moduleKey && modules.status === "resolved" && !modules.isEnabled(moduleKey)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md rounded-lg border border-border bg-card p-6 text-center">
          <h1 className="text-lg font-semibold text-foreground">Modul indisponibil</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Acest modul nu este activat pentru organizația ta. Scrie-ne dacă vrei să-l pornim —
            se activează dintr-un singur comutator, fără să pierzi nimic din ce ai deja.
          </p>
          <Button className="mt-5" onClick={() => navigate("/business")}>
            Înapoi la tabloul de bord
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
