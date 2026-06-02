/**
 * HEALTH-001 — Super-admin dashboard
 *
 * Accessible at /app/admin — only for admin users (email = ADMIN_EMAIL or @vectorlearn.ro).
 * Shows: tenant list with stats, DB health, migration info.
 *
 * This page is NOT linked from the main NavBar for non-admin users.
 * Admins see it via the "Admin" link in AppShell if they have the right email.
 */
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

interface TenantStats {
  id: string;
  name: string;
  slug: string;
  plan: string;
  createdAt: string;
  stats: {
    users: number;
    students: number;
    lessons: number;
  };
}

interface AdminHealth {
  dbOk: boolean;
  migrationCount: number;
  tenantCount: number;
  lastMigration: string | null;
}

function useIsAdmin(): boolean {
  const { data } = useSession();
  if (!data?.user?.email) return false;
  const email = data.user.email.toLowerCase();
  return email.endsWith("@vectorlearn.ro") || email === (import.meta.env.VITE_ADMIN_EMAIL ?? "admin@vectorlearn.ro").toLowerCase();
}

export function AdminPage() {
  const { data: session, status } = useSession();
  const { navigate } = useRouter();
  const isAdmin = useIsAdmin();

  const [tenants, setTenants] = useState<TenantStats[] | null>(null);
  const [health, setHealth] = useState<AdminHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      navigate("/app/login");
      return;
    }
    if (status !== "authenticated") return;
    if (!isAdmin) {
      setError("Acces interzis. Această pagină este disponibilă doar pentru administratori Vector Learn.");
      setLoading(false);
      return;
    }

    Promise.all([
      fetch("/api/admin/tenants", { credentials: "include" }).then((r) => {
        if (r.status === 403) throw new Error("403");
        return r.json() as Promise<TenantStats[]>;
      }),
      fetch("/api/admin/health", { credentials: "include" }).then((r) =>
        r.json() as Promise<AdminHealth>
      ),
    ])
      .then(([tenantsData, healthData]) => {
        setTenants(tenantsData);
        setHealth(healthData);
        setLoading(false);
      })
      .catch((err) => {
        if (err.message === "403") {
          setError("Acces interzis — email-ul contului nu are permisiuni de admin.");
        } else {
          setError("Eroare la încărcarea datelor admin.");
        }
        setLoading(false);
      });
  }, [status, isAdmin, navigate]);

  if (status === "loading" || loading) {
    return (
      <AppShell pageTitle="Admin" pageDescription="Super-admin dashboard">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell pageTitle="Admin" pageDescription="Super-admin dashboard">
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell pageTitle="Admin" pageDescription="Panoul super-administratorului Vector Learn">
      {/* DB Health */}
      <section aria-label="Database health" className="mb-6">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Starea DB
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-3">
            {health?.dbOk ? (
              <CheckCircle className="h-5 w-5 text-green-500 shrink-0" aria-hidden="true" />
            ) : (
              <XCircle className="h-5 w-5 text-destructive shrink-0" aria-hidden="true" />
            )}
            <div>
              <p className="text-xs text-muted-foreground">Status DB</p>
              <p className="text-sm font-semibold">
                {health?.dbOk ? "Online" : "Offline"}
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Migrări aplicate</p>
            <p className="text-2xl font-bold tabular-nums">
              {health?.migrationCount ?? "–"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Tenanți total</p>
            <p className="text-2xl font-bold tabular-nums">
              {health?.tenantCount ?? tenants?.length ?? "–"}
            </p>
          </div>
        </div>
        {health?.lastMigration && (
          <p className="mt-2 text-xs text-muted-foreground">
            Ultima migrare: <code className="font-mono">{health.lastMigration}</code>
          </p>
        )}
      </section>

      {/* Tenant table */}
      <section aria-label="Tenant list">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Tenanți ({tenants?.length ?? 0})
        </h2>
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tenant</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Plan</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Elevi</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Utilizatori</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Lecții</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Creat la</th>
                </tr>
              </thead>
              <tbody>
                {tenants?.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      Nu există tenanți.
                    </td>
                  </tr>
                ) : (
                  tenants?.map((tenant) => (
                    <tr
                      key={tenant.id}
                      className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium">{tenant.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{tenant.slug}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-bold uppercase">
                          {tenant.plan}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {tenant.stats.students}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {tenant.stats.users}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {tenant.stats.lessons}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {new Date(tenant.createdAt).toLocaleDateString("ro-RO", {
                          year: "numeric", month: "short", day: "numeric",
                        })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
