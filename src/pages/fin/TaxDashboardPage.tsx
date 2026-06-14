/**
 * FISC-004: Pagina /app/fin/tax/dashboard
 *
 * Dashboard fiscal — calendar termene, alertă scadenţe, istoric declaraţii.
 *
 * Secţiuni:
 *   1. Alerte urgente  — declaraţii nefiled cu termen în <= 7 zile (badge roşu)
 *   2. Declaraţii restante — termen depăşit, nedepuse (badge portocaliu)
 *   3. Termene viitoare — > 7 zile (informationally)
 *   4. Declaraţii depuse recent (ultimele 20)
 *
 * Design: design-system tokens, light+dark, WCAG AA, fără hex hardcodate.
 * Integrare CORE-004 notifications: notificarea de 7 zile se creează server-side
 * (via endpoint /api/fin/tax/dashboard — el apelează notification system la nevoie);
 * UI afişează alertele fără a face un call separat de notificare.
 */

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/app/AppShell";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  FileText,
  RefreshCw,
  Bell,
  CalendarDays,
  ChevronRight,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeadlineItem {
  declarationType: "tva12_md" | "d394_ro" | "d301_ro" | "income_md";
  periodId: string;
  periodLabel: string;
  deadline: string;
  daysUntil: number;
  declarationId: string | null;
  declarationStatus: "draft" | "ready" | "filed" | null;
  filedAt: string | null;
  isOverdue: boolean;
  isUrgent: boolean;
}

interface RecentFiling {
  id: string;
  declarationType: string;
  declarationTypeLabel: string;
  periodId: string;
  periodLabel: string;
  filedAt: string | null;
  notes: string | null;
}

interface DashboardData {
  upcoming_deadlines: DeadlineItem[];
  upcoming_alerts: DeadlineItem[];
  overdue_alerts: DeadlineItem[];
  recent_filings: RecentFiling[];
  generated_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  tva12_md: "TVA12 (MD)",
  d394_ro: "D394 (RO)",
  d301_ro: "D301 (RO)",
  income_md: "Impozit venit (MD)",
};

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("ro-RO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function DaysUntilBadge({ daysUntil, isFiled }: { daysUntil: number; isFiled: boolean }) {
  if (isFiled) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-success/10 text-success border border-success/20">
        <CheckCircle className="h-3 w-3" aria-hidden="true" />
        Depusă
      </span>
    );
  }

  if (daysUntil < 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-destructive/10 text-destructive border border-destructive/20">
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        Depăşită cu {Math.abs(daysUntil)} zile
      </span>
    );
  }

  if (daysUntil <= 7) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-warning/10 text-warning border border-warning/20">
        <Bell className="h-3 w-3" aria-hidden="true" />
        {daysUntil === 0 ? "Azi!" : `${daysUntil} zile`}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground border border-border">
      <Clock className="h-3 w-3" aria-hidden="true" />
      {daysUntil} zile
    </span>
  );
}

function DeadlineCard({ item }: { item: DeadlineItem }) {
  const isFiled = item.declarationStatus === "filed";
  const rowCn = cn(
    "flex items-center justify-between gap-3 rounded-lg border p-4 transition-colors",
    item.isOverdue && !isFiled
      ? "border-destructive/30 bg-destructive/5"
      : item.isUrgent
        ? "border-warning/30 bg-warning/5"
        : "border-border bg-card"
  );

  return (
    <div className={rowCn} role="listitem">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-semibold text-foreground truncate">
          {TYPE_LABELS[item.declarationType] ?? item.declarationType}
        </span>
        <span className="text-xs text-muted-foreground">
          Perioadă: <strong className="text-foreground">{item.periodLabel}</strong>
          {" · "}
          Termen: <strong className="text-foreground">{formatDate(item.deadline)}</strong>
        </span>
      </div>
      <div className="shrink-0">
        <DaysUntilBadge daysUntil={item.daysUntil} isFiled={isFiled} />
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TaxDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/fin/tax/dashboard", {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as DashboardData;
      setData(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Eroare necunoscută.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const hasAlerts =
    (data?.upcoming_alerts.length ?? 0) > 0 || (data?.overdue_alerts.length ?? 0) > 0;

  return (
    <AppShell pageTitle="Dashboard fiscal">
      <div className="mx-auto max-w-4xl space-y-8 px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard fiscal</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Calendar termene, alerte scadenţe, istoric declaraţii
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Reîncarcă dashboard"
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium",
              "bg-background text-foreground hover:bg-muted transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            <RefreshCw
              className={cn("h-4 w-4", loading && "animate-spin")}
              aria-hidden="true"
            />
            {loading ? "Se încarcă…" : "Reîncarcă"}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !data && (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-20 rounded-lg bg-muted animate-pulse"
                aria-hidden="true"
              />
            ))}
          </div>
        )}

        {/* Content */}
        {data && (
          <>
            {/* Alerte urgente (badge roşu / galben) */}
            {hasAlerts && (
              <section aria-labelledby="alerts-heading">
                <div className="flex items-center gap-2 mb-4">
                  <Bell className="h-5 w-5 text-destructive" aria-hidden="true" />
                  <h2
                    id="alerts-heading"
                    className="text-base font-semibold text-foreground"
                  >
                    Alerte declaraţii
                    <span className="ml-2 inline-flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs font-bold w-5 h-5">
                      {data.upcoming_alerts.length + data.overdue_alerts.length}
                    </span>
                  </h2>
                </div>

                {data.overdue_alerts.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-destructive mb-2">
                      Termen depăşit
                    </p>
                    <div role="list" className="space-y-2">
                      {data.overdue_alerts.map((item) => (
                        <DeadlineCard
                          key={`${item.periodId}-${item.declarationType}`}
                          item={item}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {data.upcoming_alerts.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-warning mb-2">
                      De depus în curând (≤ 7 zile)
                    </p>
                    <div role="list" className="space-y-2">
                      {data.upcoming_alerts.map((item) => (
                        <DeadlineCard
                          key={`${item.periodId}-${item.declarationType}`}
                          item={item}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {!hasAlerts && !loading && (
              <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
                <CheckCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                Nicio alertă fiscală. Toate declaraţiile sunt în termen sau depuse.
              </div>
            )}

            {/* Calendar termene viitoare */}
            {data.upcoming_deadlines.length > 0 && (
              <section aria-labelledby="upcoming-heading">
                <div className="flex items-center gap-2 mb-4">
                  <CalendarDays className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  <h2
                    id="upcoming-heading"
                    className="text-base font-semibold text-foreground"
                  >
                    Termene viitoare
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      ({">"} 7 zile)
                    </span>
                  </h2>
                </div>
                <div role="list" className="space-y-2">
                  {data.upcoming_deadlines.map((item) => (
                    <DeadlineCard
                      key={`${item.periodId}-${item.declarationType}`}
                      item={item}
                    />
                  ))}
                </div>
              </section>
            )}

            {data.upcoming_deadlines.length === 0 &&
              data.upcoming_alerts.length === 0 &&
              data.overdue_alerts.length === 0 && (
                <div className="text-center py-12">
                  <CalendarDays
                    className="h-10 w-10 mx-auto text-muted-foreground mb-3"
                    aria-hidden="true"
                  />
                  <p className="text-muted-foreground text-sm">
                    Nicio perioadă fiscală înregistrată.
                  </p>
                  <a
                    href="#/app/fin/tax"
                    className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    Creează prima perioadă fiscală
                    <ChevronRight className="h-3 w-3" aria-hidden="true" />
                  </a>
                </div>
              )}

            {/* Declaraţii depuse recent */}
            <section aria-labelledby="filings-heading">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                <h2
                  id="filings-heading"
                  className="text-base font-semibold text-foreground"
                >
                  Declaraţii depuse recent
                </h2>
              </div>

              {data.recent_filings.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nicio declaraţie depusă încă.
                </p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 text-left">
                        <th
                          scope="col"
                          className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                        >
                          Tip declaraţie
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                        >
                          Perioadă
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                        >
                          Data depunerii
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                        >
                          Note
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.recent_filings.map((f) => (
                        <tr
                          key={f.id}
                          className="bg-card hover:bg-muted/30 transition-colors"
                        >
                          <td className="px-4 py-3 font-medium text-foreground">
                            {f.declarationTypeLabel}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {f.periodLabel}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {f.filedAt ? formatDate(f.filedAt) : "—"}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground truncate max-w-[200px]">
                            {f.notes ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <p className="text-xs text-muted-foreground text-right">
              Generat la {new Date(data.generated_at).toLocaleString("ro-RO")}
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}
