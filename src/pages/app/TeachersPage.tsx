import { useEffect, useState, useCallback } from "react";
import { Loader2, Mail, Wallet, Percent, BarChart3 } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import { listTeachers, type Teacher } from "@/lib/api/lessons";

export function TeachersPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();
  const [items, setItems] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listTeachers();
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const totalRate = items.reduce((s, t) => s + t.hourlyRateCents, 0);
  const avgCommission = items.length > 0 ? items.reduce((s, t) => s + t.commissionPct, 0) / items.length : 0;

  return (
    <AppShell
      pageTitle="Profesori"
      pageDescription={`${items.length} profesori activi · comision mediu ${avgCommission.toFixed(0)}%`}
    >
      <div className="grid sm:grid-cols-3 gap-3 mb-6">
        <Stat label="Profesori activi" value={items.length.toString()} icon="👨‍🏫" />
        <Stat
          label="Tarif mediu / oră"
          value={items.length > 0 ? `${(totalRate / items.length / 100).toFixed(0)} €` : "—"}
          icon="💶"
        />
        <Stat label="Comision mediu" value={`${avgCommission.toFixed(0)}%`} icon="📊" />
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Se încarcă profesorii…
          </div>
        ) : error ? (
          <div className="py-16 text-center text-sm text-destructive">{error}</div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            Nu ai profesori încă. Vor putea fi adăugați odată cu fluxul de invitație (în lucru).
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th scope="col" className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5">
                    Profesor
                  </th>
                  <th scope="col" className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5 hidden sm:table-cell">
                    Email
                  </th>
                  <th scope="col" className="text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5">
                    Tarif / oră
                  </th>
                  <th scope="col" className="text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5">
                    Comision
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((t) => (
                  <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-[10px] font-bold text-primary-foreground flex-shrink-0">
                          {t.name
                            .split(" ")
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join("")}
                        </div>
                        <p className="font-medium">{t.name}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                      <a href={`mailto:${t.email}`} className="inline-flex items-center gap-1 hover:text-foreground">
                        <Mail className="h-3 w-3" />
                        {t.email}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Wallet className="h-3 w-3 text-muted-foreground" />
                        {(t.hourlyRateCents / 100).toFixed(0)} €
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Percent className="h-3 w-3 text-muted-foreground" />
                        {t.commissionPct}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => navigate(`/app/hr/teachers/${t.id}/stats`)}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                        aria-label={`Statistici ${t.name}`}
                      >
                        <BarChart3 className="h-3 w-3" aria-hidden="true" />
                        Stats
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="text-2xl mb-2" aria-hidden>{icon}</div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-2xl font-display font-bold tabular-nums mt-1">{value}</p>
    </div>
  );
}
