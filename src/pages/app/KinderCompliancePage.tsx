/**
 * KINDER-006 — /app/kinder/compliance
 *
 * Licensing/compliance reports:
 * - Tab 1: Ratio history (staff-to-child per day) — exportable CSV
 * - Tab 2: Subsidy attendance summary per student — exportable CSV
 * - Tab 3: Immunization overview (aggregate stats)
 */
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import {
  getRatioHistory,
  getAttendanceSummary,
  getImmunizationOverview,
  type RatioHistoryEntry,
  type StudentAttendance,
  type ImmunizationOverviewResponse,
} from "@/lib/api/kinder";
import {
  ShieldCheck,
  Loader2,
  AlertCircle,
  Download,
  CheckCircle2,
  XCircle,
  Syringe,
  Users,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function thirtyDaysAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function exportCSV(rows: string[][], filename: string) {
  const csv = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type Tab = "ratio" | "attendance" | "immunization";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  {
    id: "ratio",
    label: "Raport personal/copii",
    icon: <ShieldCheck className="w-4 h-4" />,
  },
  {
    id: "attendance",
    label: "Prezență subvenție",
    icon: <Calendar className="w-4 h-4" />,
  },
  {
    id: "immunization",
    label: "Vaccinuri (sumar)",
    icon: <Syringe className="w-4 h-4" />,
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export function KinderCompliancePage() {
  const { data: session } = useSession();

  const [activeTab, setActiveTab] = useState<Tab>("ratio");
  const [from, setFrom] = useState(thirtyDaysAgo());
  const [to, setTo] = useState(todayStr());

  const [ratioHistory, setRatioHistory] = useState<RatioHistoryEntry[]>([]);
  const [attendance, setAttendance] = useState<StudentAttendance[]>([]);
  const [immunization, setImmunization] = useState<ImmunizationOverviewResponse | null>(null);

  const [loadingRatio, setLoadingRatio] = useState(false);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [loadingImmunization, setLoadingImmunization] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    setLoadingRatio(true);
    setLoadingAttendance(true);
    setLoadingImmunization(true);
    setError(null);

    Promise.all([
      getRatioHistory(from, to),
      getAttendanceSummary(from, to),
      getImmunizationOverview(),
    ])
      .then(([ratio, att, imm]) => {
        setRatioHistory(ratio.history);
        setAttendance(att.students);
        setImmunization(imm);
      })
      .catch(() => setError("Nu s-au putut încărca rapoartele de conformitate."))
      .finally(() => {
        setLoadingRatio(false);
        setLoadingAttendance(false);
        setLoadingImmunization(false);
      });
  }, [session, from, to]);

  const ratioOkDays = ratioHistory.filter((r) => r.ratioOk).length;
  const ratioOkPct =
    ratioHistory.length > 0 ? Math.round((ratioOkDays / ratioHistory.length) * 100) : 100;

  const avgAttendance =
    attendance.length > 0
      ? Math.round(
          attendance.reduce((sum, s) => sum + s.attendanceRate, 0) / attendance.length
        )
      : 0;

  function handleExportRatio() {
    const rows = [
      ["Data", "Copii prezenti", "Personal necesar", "Raport limita", "Conformitate"],
      ...ratioHistory.map((r) => [
        r.date,
        String(r.presentChildren),
        String(r.staffNeeded),
        String(r.ratioLimit),
        r.ratioOk ? "DA" : "NU",
      ]),
    ];
    exportCSV(rows, `raport-personal-${from}-${to}.csv`);
  }

  function handleExportAttendance() {
    const rows = [
      ["Elev", "Zile prezent", "Zile interval", "Rata prezenta (%)"],
      ...attendance.map((s) => [
        s.fullName,
        String(s.daysPresent),
        String(s.daysInRange),
        String(s.attendanceRate),
      ]),
    ];
    exportCSV(rows, `prezenta-subventie-${from}-${to}.csv`);
  }

  const loading = loadingRatio || loadingAttendance || loadingImmunization;

  return (
    <AppShell
      pageTitle="Rapoarte conformitate"
      pageDescription="Rapoarte pentru licențiere și inspecție"
    >
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="p-4 rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <p className="text-xs font-medium text-muted-foreground">Personal/copii ok</p>
          </div>
          <p className="text-2xl font-bold text-foreground">{ratioOkPct}%</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {ratioOkDays}/{ratioHistory.length} zile conforme
          </p>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 mb-1">
            <Syringe className="w-4 h-4 text-primary" />
            <p className="text-xs font-medium text-muted-foreground">Vaccinare conformă</p>
          </div>
          <p className="text-2xl font-bold text-foreground">
            {immunization?.complianceRate ?? "—"}%
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {immunization?.fullyVaccinated ?? "—"}/{immunization?.totalStudents ?? "—"} elevi la zi
          </p>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-primary" />
            <p className="text-xs font-medium text-muted-foreground">Prezență medie</p>
          </div>
          <p className="text-2xl font-bold text-foreground">{avgAttendance}%</p>
          <p className="text-xs text-muted-foreground mt-0.5">{attendance.length} elevi activi</p>
        </div>
      </div>

      {/* Date range */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <label htmlFor="from" className="text-sm text-muted-foreground">
            De la
          </label>
          <input
            id="from"
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="px-3 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="to" className="text-sm text-muted-foreground">
            Până la
          </label>
          <input
            id="to"
            type="date"
            value={to}
            min={from}
            max={todayStr()}
            onChange={(e) => setTo(e.target.value)}
            className="px-3 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Se încarcă...</span>
        </div>
      )}

      {error && !loading && (
        <div className="flex items-center gap-2 text-destructive text-sm py-6">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* ── RATIO HISTORY TAB ─────────────────────────────────────── */}
          {activeTab === "ratio" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-muted-foreground">
                  {ratioHistory.length} zile în interval
                </p>
                <button
                  onClick={handleExportRatio}
                  disabled={ratioHistory.length === 0}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  Export CSV
                </button>
              </div>

              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 text-muted-foreground">
                      <th className="text-left px-4 py-3 font-medium">Data</th>
                      <th className="text-left px-4 py-3 font-medium">Copii prezenți</th>
                      <th className="text-left px-4 py-3 font-medium">Personal necesar</th>
                      <th className="text-left px-4 py-3 font-medium">Raport limită</th>
                      <th className="text-left px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ratioHistory.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-sm">
                          Nicio zi în intervalul selectat.
                        </td>
                      </tr>
                    ) : (
                      ratioHistory.map((r) => (
                        <tr
                          key={r.date}
                          className={cn(
                            "border-t border-border hover:bg-muted/20 transition-colors",
                            !r.ratioOk && r.presentChildren > 0 && "bg-destructive/5"
                          )}
                        >
                          <td className="px-4 py-3 font-medium text-foreground">
                            {new Date(r.date).toLocaleDateString("ro-RO")}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{r.presentChildren}</td>
                          <td className="px-4 py-3 text-muted-foreground">{r.staffNeeded}</td>
                          <td className="px-4 py-3 text-muted-foreground">1:{r.ratioLimit}</td>
                          <td className="px-4 py-3">
                            {r.presentChildren === 0 ? (
                              <span className="text-xs text-muted-foreground">Închis / Nicio prezență</span>
                            ) : r.ratioOk ? (
                              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Conform
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-destructive text-xs font-medium">
                                <XCircle className="w-3.5 h-3.5" /> Neconform
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── ATTENDANCE TAB ────────────────────────────────────────── */}
          {activeTab === "attendance" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-muted-foreground">
                  {attendance.length} elevi activi
                </p>
                <button
                  onClick={handleExportAttendance}
                  disabled={attendance.length === 0}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  Export CSV
                </button>
              </div>

              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 text-muted-foreground">
                      <th className="text-left px-4 py-3 font-medium">Elev</th>
                      <th className="text-left px-4 py-3 font-medium">Zile prezent</th>
                      <th className="text-left px-4 py-3 font-medium">Din total</th>
                      <th className="text-left px-4 py-3 font-medium">Rată prezență</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendance.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground text-sm">
                          Niciun elev activ.
                        </td>
                      </tr>
                    ) : (
                      attendance.map((s) => (
                        <tr key={s.studentId} className="border-t border-border hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 font-medium text-foreground">{s.fullName}</td>
                          <td className="px-4 py-3 text-muted-foreground">{s.daysPresent}</td>
                          <td className="px-4 py-3 text-muted-foreground">{s.daysInRange} zile</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-muted rounded-full h-1.5 max-w-24">
                                <div
                                  className={cn(
                                    "h-full rounded-full",
                                    s.attendanceRate >= 80
                                      ? "bg-emerald-500"
                                      : s.attendanceRate >= 60
                                      ? "bg-amber-500"
                                      : "bg-destructive"
                                  )}
                                  style={{ width: `${s.attendanceRate}%` }}
                                />
                              </div>
                              <span className="text-sm font-medium text-foreground">
                                {s.attendanceRate}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── IMMUNIZATION TAB ──────────────────────────────────────── */}
          {activeTab === "immunization" && immunization && (
            <div>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-5 rounded-xl border border-border bg-card text-center">
                  <p className="text-4xl font-bold text-foreground mb-1">
                    {immunization.complianceRate}%
                  </p>
                  <p className="text-sm text-muted-foreground">Rată conformitate vaccinare</p>
                </div>
                <div className="p-5 rounded-xl border border-border bg-card">
                  <ul className="space-y-2">
                    <li className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total elevi</span>
                      <span className="font-medium text-foreground">{immunization.totalStudents}</span>
                    </li>
                    <li className="flex justify-between text-sm">
                      <span className="text-emerald-600 dark:text-emerald-400">Vaccinați la zi</span>
                      <span className="font-medium text-emerald-600 dark:text-emerald-400">{immunization.fullyVaccinated}</span>
                    </li>
                    <li className="flex justify-between text-sm">
                      <span className="text-yellow-600 dark:text-yellow-400">Scadent în 30 zile</span>
                      <span className="font-medium text-yellow-600 dark:text-yellow-400">{immunization.dueSoon}</span>
                    </li>
                    <li className="flex justify-between text-sm">
                      <span className="text-destructive">Expirat</span>
                      <span className="font-medium text-destructive">{immunization.overdue}</span>
                    </li>
                    <li className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Fără evidență</span>
                      <span className="font-medium text-muted-foreground">{immunization.noRecord}</span>
                    </li>
                  </ul>
                </div>
              </div>

              {immunization.overdue > 0 && (
                <div className="flex items-start gap-2 p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <p>
                    <strong>{immunization.overdue} elev{immunization.overdue > 1 ? "i" : ""}</strong>{" "}
                    au vaccinuri expirate. Contactați familiile și actualizați registrul înainte de
                    inspecție.
                  </p>
                </div>
              )}

              {immunization.overdue === 0 && immunization.dueSoon === 0 && immunization.noRecord === 0 && (
                <div className="flex items-center gap-2 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-sm">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <p>Toți copiii au vaccinurile la zi. Grădinița este conformă.</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
