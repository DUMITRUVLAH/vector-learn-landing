/**
 * CRM-135: CRM Settings page — /app/settings/crm
 * Contains round-robin auto-assign configuration and other CRM settings.
 */
import { useEffect } from "react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import { RRSettings } from "@/components/crm/RRSettings";

export function CRMSettingsPage() {
  const { status } = useSession();
  const { navigate } = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") navigate("/app/login");
  }, [status, navigate]);

  if (status !== "authenticated") return null;

  return (
    <AppShell
      pageTitle="Setări CRM"
      pageDescription="Configurare pipeline, automatizări și asignare automată"
    >
      <div className="max-w-2xl space-y-6">
        <RRSettings />
      </div>
    </AppShell>
  );
}
