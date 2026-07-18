import { useCallback, useEffect, useState } from "react";
import { Building2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { api } from "@/lib/api";

type ModuleKey = "par" | "findesk";
type Organization = {
  id: string;
  name: string;
  legalName: string | null;
  idno: string | null;
  tenantId: string;
  workspaceName: string | null;
  modules: Record<string, boolean>;
};

export function PlatformAdminPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api<{ organizations: Organization[] }>("/api/platform/organizations");
      setOrganizations(result.organizations);
    } catch {
      setError("Nu ai acces de superadmin sau lista organizațiilor nu poate fi încărcată.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (organization: Organization, module: ModuleKey, enabled: boolean) => {
    const key = `${organization.id}:${module}`;
    setSaving(key);
    setError(null);
    try {
      await api(`/api/platform/organizations/${organization.id}/modules`, {
        method: "PUT",
        body: JSON.stringify({ module, enabled }),
      });
      setOrganizations((items) => items.map((item) => item.id === organization.id
        ? { ...item, modules: { ...item.modules, [module]: enabled } }
        : item));
    } catch {
      setError("Modulul nu a putut fi actualizat.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <AppShell pageTitle="Superadmin platformă">
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" aria-hidden /><h1 className="text-xl font-bold text-foreground">Module per organizație</h1></div>
            <p className="mt-1 text-sm text-muted-foreground">Activează separat PAR și FinDesk pentru fiecare entitate juridică din workspace-uri.</p>
          </div>
          <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-muted"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />Reîncarcă</button>
        </div>
        {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</div>}
        {loading ? <div className="flex items-center gap-2 py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" aria-hidden />Se încarcă organizațiile…</div> : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr><th className="p-3 text-left">Organizație</th><th className="p-3 text-left">Workspace</th><th className="p-3 text-left">IDNO</th><th className="p-3 text-center">PAR</th><th className="p-3 text-center">FinDesk</th></tr></thead>
              <tbody>{organizations.map((organization) => (
                <tr key={organization.id} className="border-t border-border">
                  <td className="p-3"><div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-muted-foreground" aria-hidden /><div><div className="font-medium text-foreground">{organization.name}</div>{organization.legalName && organization.legalName !== organization.name && <div className="text-xs text-muted-foreground">{organization.legalName}</div>}</div></div></td>
                  <td className="p-3 text-muted-foreground">{organization.workspaceName ?? "—"}</td>
                  <td className="p-3 font-mono text-xs text-muted-foreground">{organization.idno ?? "—"}</td>
                  {(["par", "findesk"] as ModuleKey[]).map((module) => {
                    const key = `${organization.id}:${module}`;
                    return <td key={module} className="p-3 text-center"><label className="inline-flex cursor-pointer items-center gap-2"><input type="checkbox" checked={organization.modules[module] === true} disabled={saving === key} onChange={(event) => toggle(organization, module, event.target.checked)} className="h-4 w-4" /><span className="text-xs text-muted-foreground">{organization.modules[module] ? "Activ" : "Inactiv"}</span></label></td>;
                  })}
                </tr>
              ))}{organizations.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Nu există organizații configurate.</td></tr>}</tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default PlatformAdminPage;
