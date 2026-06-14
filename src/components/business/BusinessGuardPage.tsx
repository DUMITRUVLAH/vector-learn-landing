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
 */
import { ReactNode, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "@/router/HashRouter";
import { useBusinessSession } from "@/hooks/useBusinessSession";

interface BusinessGuardPageProps {
  children: ReactNode;
}

export function BusinessGuardPage({ children }: BusinessGuardPageProps) {
  const { path, navigate } = useRouter();
  const session = useBusinessSession();

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

  return <>{children}</>;
}
