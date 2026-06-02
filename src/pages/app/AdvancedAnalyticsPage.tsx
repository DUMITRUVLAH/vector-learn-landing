/**
 * GAP-016 — /app/analytics
 * Advanced analytics: retention by course, revenue by teacher, churn risk top students.
 */
import { useEffect, useState } from "react";
import { Loader2, TrendingUp, TrendingDown, Minus, AlertTriangle, BarChart2, Users } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  getRetentionByCourse,
  getRevenueByTeacher,
  getChurnRisk,
  type RetentionByCourse,
  type RevenueByTeacher,
  type ChurnRiskStudent,
} from "@/lib/api/advancedAnalytics";
import { cn } from "@/lib/utils";

// ─── Retention panel ──────────────────────────────────────────────────────────

function RetentionPanel() {
  const [items, setItems] = useState<RetentionByCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRetentionByCourse()
      .then(setItems)
      .catch(() => setError("Nu s-au putut încărca datele de retenție"))
      .finally(() => setLoading(false));
  }, []);

  const TrendIcon = ({ trend }: { trend: string }) => {
    if (trend === "up") return <TrendingUp size={14} className="text-success" />;
    if (trend === "down") return <TrendingDown size={14} className="text-destructive" />;
    return <Minus size={14} className="text-muted-foreground" />;
  };

  const sorted = [...items].sort((a, b) => (b.retentionPct ?? 0) - (a.retentionPct ?? 0));

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <BarChart2 size={16} className="text-primary" />
        <h2 className="text-sm font-bold">Retenție per curs (30 zile)</h2>
      </div>
      {loading && (
        <div className="flex justify-center py-6">
          <Loader2 size={18} className="animate-spin text-muted-foreground" />
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!loading && !error && sorted.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center">Fără date de retenție disponibile.</p>
      )}
      {!loading && !error && sorted.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-[11px] text-muted-foreground uppercase tracking-wide">
                <th className="text-left py-2 pr-3">Curs</th>
                <th className="text-right py-2 pr-3">Activi acum</th>
                <th className="text-right py-2 pr-3">Activi acum 30z</th>
                <th className="text-right py-2">Retenție</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <tr key={c.courseId} className="border-b border-border/50 hover:bg-muted/40 transition-colors">
                  <td className="py-2 pr-3 font-medium truncate max-w-[180px]">{c.courseName}</td>
                  <td className="py-2 pr-3 text-right">{c.activeNow}</td>
                  <td className="py-2 pr-3 text-right text-muted-foreground">{c.activePrev}</td>
                  <td className="py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <TrendIcon trend={c.trend} />
                      <span
                        className={cn(
                          "font-semibold",
                          c.retentionPct === null
                            ? "text-muted-foreground"
                            : c.retentionPct >= 80
                            ? "text-success"
                            : c.retentionPct >= 60
                            ? "text-warning"
                            : "text-destructive"
                        )}
                      >
                        {c.retentionPct !== null ? `${c.retentionPct}%` : "N/A"}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ─── Revenue by teacher panel ─────────────────────────────────────────────────

function RevenueByTeacherPanel() {
  const [items, setItems] = useState<RevenueByTeacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRevenueByTeacher()
      .then(setItems)
      .catch(() => setError("Nu s-au putut încărca veniturile per profesor"))
      .finally(() => setLoading(false));
  }, []);

  const sorted = [...items].sort((a, b) => b.revenueRon - a.revenueRon);
  const maxRev = sorted[0]?.revenueRon ?? 1;

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Users size={16} className="text-primary" />
        <h2 className="text-sm font-bold">Venituri per profesor (30 zile)</h2>
      </div>
      {loading && (
        <div className="flex justify-center py-6">
          <Loader2 size={18} className="animate-spin text-muted-foreground" />
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!loading && !error && sorted.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center">Fără date disponibile.</p>
      )}
      {!loading && !error && sorted.length > 0 && (
        <div className="space-y-2">
          {sorted.map((t) => (
            <div key={t.teacherId} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium truncate max-w-[200px]">{t.teacherName}</span>
                <span className="text-muted-foreground shrink-0 ml-2">
                  {t.revenueRon.toLocaleString("ro-RO")} RON · {t.lessonCount} lecții
                </span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${maxRev > 0 ? Math.round((t.revenueRon / maxRev) * 100) : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Churn risk panel ─────────────────────────────────────────────────────────

const RISK_COLOR = (score: number) => {
  if (score >= 70) return "text-destructive";
  if (score >= 40) return "text-warning";
  return "text-muted-foreground";
};

function ChurnRiskPanel() {
  const [items, setItems] = useState<ChurnRiskStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getChurnRisk()
      .then(setItems)
      .catch(() => setError("Nu s-au putut încărca datele de risc churn"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={16} className="text-warning" />
        <h2 className="text-sm font-bold">Risc churn — top studenți</h2>
      </div>
      {loading && (
        <div className="flex justify-center py-6">
          <Loader2 size={18} className="animate-spin text-muted-foreground" />
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!loading && !error && items.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center">Niciun student cu risc ridicat. Excelent!</p>
      )}
      {!loading && !error && items.length > 0 && (
        <div className="space-y-2">
          {items.map((s) => (
            <div key={s.studentId} className="flex items-start justify-between gap-3 p-2.5 rounded-lg border border-border/60 bg-background">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{s.name}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {s.reasons.map((r) => (
                    <span key={r} className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {r}
                    </span>
                  ))}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <span className={cn("text-base font-bold tabular-nums", RISK_COLOR(s.riskScore))}>
                  {s.riskScore}
                </span>
                <p className="text-[10px] text-muted-foreground">/ 100</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AdvancedAnalyticsPage() {
  const { status } = useSession();
  const { navigate } = useRouter();

  if (status === "unauthenticated") {
    navigate("/app/login");
    return null;
  }

  return (
    <AppShell pageTitle="Analytics avansat">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold">Analytics avansat</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Retenție, venituri per profesor și risc churn — date din ultimele 30 zile.
          </p>
        </div>
        <RetentionPanel />
        <RevenueByTeacherPanel />
        <ChurnRiskPanel />
      </div>
    </AppShell>
  );
}
