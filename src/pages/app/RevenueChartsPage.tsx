/**
 * REP-302 — Revenue over time + breakdown per disciplină
 * Pagina /app/analytics/revenue cu line chart lunar + bar chart per curs.
 */
import { useEffect, useState, useCallback } from "react";
import { AlertTriangle } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  getRevenueOverTime,
  getRevenueByCourse,
  type RevenueMonth,
  type RevenueCourse,
} from "@/lib/api/analytics";

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatEur(cents: number): string {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function shortEur(cents: number): string {
  const eur = cents / 100;
  if (eur >= 1000) return `€${Math.round(eur / 100) / 10}k`;
  return `€${Math.round(eur)}`;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function RevenueChartsPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const [revenueData, setRevenueData] = useState<RevenueMonth[]>([]);
  const [courseData, setCourseData] = useState<RevenueCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [revRes, courseRes] = await Promise.all([
        getRevenueOverTime(12),
        getRevenueByCourse(),
      ]);
      setRevenueData(revRes.months);
      setCourseData(courseRes.items);
    } catch {
      setError("Nu pot încărca datele de revenue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const chartData = revenueData.map((m) => ({
    name: m.month.slice(5), // show "MM" only
    revenue: m.totalCents / 100,
    students: m.newStudents,
    fullMonth: m.month,
  }));

  const courseChartData = courseData.map((c) => ({
    name: c.courseName.length > 15 ? c.courseName.slice(0, 15) + "…" : c.courseName,
    revenue: c.totalCents / 100,
    students: c.studentCount,
  }));

  return (
    <AppShell
      pageTitle="Revenue"
      pageDescription="Evoluție venituri + breakdown per disciplină — ultimele 12 luni"
    >
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm text-destructive mb-6">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {loading && (
        <div className="space-y-6">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5">
              <div className="h-5 w-40 bg-muted/40 rounded animate-pulse mb-4" />
              <div className="h-48 bg-muted/20 rounded animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {!loading && (
        <div className="space-y-8">
          {/* Line chart: MRR over time */}
          <section className="rounded-xl border border-border bg-card p-5 space-y-4" aria-label="Evoluție revenue lunar">
            <h2 className="text-base font-bold">Revenue lunar (€)</h2>
            {chartData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Nu există date de plăți.</p>
            ) : (
              <div style={{ height: 260 }} data-testid="revenue-line-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tickFormatter={shortEur} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      formatter={(value) => [formatEur(Number(value ?? 0) * 100), "Revenue"]}
                      labelFormatter={(label) => `Luna ${label}`}
                    />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          {/* Bar chart: elevi noi per lună */}
          <section className="rounded-xl border border-border bg-card p-5 space-y-4" aria-label="Elevi noi per lună">
            <h2 className="text-base font-bold">Elevi noi per lună</h2>
            {chartData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Nu există date.</p>
            ) : (
              <div style={{ height: 200 }} data-testid="students-bar-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip formatter={(value) => [Number(value ?? 0), "Elevi noi"]} />
                    <Bar dataKey="students" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          {/* Bar chart: revenue per disciplină */}
          <section className="rounded-xl border border-border bg-card p-5 space-y-4" aria-label="Revenue per disciplină">
            <h2 className="text-base font-bold">Revenue estimat per disciplină (top 10)</h2>
            {courseChartData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Nu există date de cursuri.</p>
            ) : (
              <div style={{ height: 220 }} data-testid="course-bar-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={courseChartData} layout="vertical" margin={{ top: 5, right: 30, bottom: 5, left: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tickFormatter={shortEur} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={60} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip formatter={(value) => [formatEur(Number(value ?? 0) * 100), "Revenue est."]} />
                    <Legend />
                    <Bar dataKey="revenue" name="Revenue (€ est.)" fill="hsl(var(--primary) / 0.7)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
