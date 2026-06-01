/**
 * SCHOOL-007 — /app/parent/portal
 *
 * Portalul read-only pentru părinți:
 * - Lista copiilor (din familia părintelui)
 * - Tab-uri per copil: Note / Prezență / Taxe
 * - Panou știri/alerte școală
 */
import { useEffect, useState, useCallback } from "react";
import { Loader2, AlertCircle, GraduationCap, ClipboardList, CreditCard, Newspaper } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  listChildren,
  listChildGrades,
  listChildAttendance,
  listChildTuition,
  listParentNews,
  type ChildSummary,
  type ParentGradeEntry,
  type ParentAttendanceEntry,
  type TuitionPlanSummary,
  type TuitionInstallment,
  type NewsPost,
} from "@/lib/api/parentPortal";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  present: "Prezent",
  absent: "Absent",
  late: "Întârziat",
  excused: "Motivat",
};

const STATUS_COLORS: Record<string, string> = {
  present: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  absent: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  late: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  excused: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
};

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("ro-RO");
  } catch {
    return dateStr;
  }
}

function formatCurrency(amountCents: number | null, currency: string | null): string {
  if (amountCents == null) return "—";
  const amount = amountCents / 100;
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: currency ?? "RON",
    minimumFractionDigits: 0,
  }).format(amount);
}

// ─── Tab: Note ────────────────────────────────────────────────────────────────

function GradesTab({ studentId }: { studentId: string }) {
  const [grades, setGrades] = useState<ParentGradeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    listChildGrades(studentId)
      .then((res) => setGrades(res.grades ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "Eroare"))
      .finally(() => setLoading(false));
  }, [studentId]);

  if (loading)
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  if (error)
    return (
      <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm flex gap-2">
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
        {error}
      </div>
    );

  if (grades.length === 0)
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Nicio notă înregistrată.
      </p>
    );

  // Grupare pe materie
  const bySubject = new Map<string, ParentGradeEntry[]>();
  for (const g of grades) {
    const key = g.subjectName ?? g.subjectId;
    if (!bySubject.has(key)) bySubject.set(key, []);
    bySubject.get(key)!.push(g);
  }

  return (
    <div className="space-y-4">
      {[...bySubject.entries()].map(([subjectName, subjectGrades]) => {
        const avg =
          subjectGrades.reduce((sum, g) => sum + Number(g.value) * Number(g.weight), 0) /
          subjectGrades.reduce((sum, g) => sum + Number(g.weight), 0);
        return (
          <div key={subjectName} className="rounded-lg border border-border overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40">
              <span className="font-medium text-sm">{subjectName}</span>
              <span className="text-sm font-semibold text-primary">
                Medie: {isNaN(avg) ? "—" : avg.toFixed(2)}
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">
                    Data
                  </th>
                  <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">
                    Titlu
                  </th>
                  <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">
                    Tip
                  </th>
                  <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">
                    Notă
                  </th>
                </tr>
              </thead>
              <tbody>
                {subjectGrades.map((g) => (
                  <tr key={g.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2 text-muted-foreground">
                      {formatDate(g.gradedAt)}
                    </td>
                    <td className="px-4 py-2">{g.title ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground capitalize">{g.type}</td>
                    <td className="px-4 py-2 text-right font-semibold">
                      {Number(g.value).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

// ─── Tab: Prezență ────────────────────────────────────────────────────────────

function AttendanceTab({ studentId }: { studentId: string }) {
  const [attendance, setAttendance] = useState<ParentAttendanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    listChildAttendance(studentId)
      .then((res) => setAttendance(res.attendance ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "Eroare"))
      .finally(() => setLoading(false));
  }, [studentId]);

  if (loading)
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  if (error)
    return (
      <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm flex gap-2">
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
        {error}
      </div>
    );

  if (attendance.length === 0)
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Nicio înregistrare de prezență.
      </p>
    );

  const total = attendance.length;
  const present = attendance.filter((a) => a.status === "present").length;
  const absent = attendance.filter((a) => a.status === "absent").length;
  const late = attendance.filter((a) => a.status === "late").length;
  const excused = attendance.filter((a) => a.status === "excused").length;

  return (
    <div className="space-y-4">
      {/* Sumar */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Prezent", value: present, pct: Math.round((present / total) * 100) },
          { label: "Absent", value: absent, pct: Math.round((absent / total) * 100) },
          { label: "Întârziat", value: late, pct: Math.round((late / total) * 100) },
          { label: "Motivat", value: excused, pct: Math.round((excused / total) * 100) },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border p-3 text-center">
            <p className="text-lg font-bold">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="text-xs text-muted-foreground">{s.pct}%</p>
          </div>
        ))}
      </div>

      {/* Tabel zile */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">
                Data
              </th>
              <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">
                Status
              </th>
              <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">
                Motiv
              </th>
            </tr>
          </thead>
          <tbody>
            {attendance.map((a) => (
              <tr key={a.id} className="border-b border-border/50 last:border-0">
                <td className="px-4 py-2 text-muted-foreground">{formatDate(a.date)}</td>
                <td className="px-4 py-2">
                  <span
                    className={cn(
                      "inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium",
                      STATUS_COLORS[a.status] ?? "bg-muted text-muted-foreground"
                    )}
                  >
                    {STATUS_LABELS[a.status] ?? a.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-muted-foreground">{a.reason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab: Taxe ────────────────────────────────────────────────────────────────

function TuitionTab({ studentId }: { studentId: string }) {
  const [plan, setPlan] = useState<TuitionPlanSummary | null>(null);
  const [installments, setInstallments] = useState<TuitionInstallment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    listChildTuition(studentId)
      .then((res) => {
        setPlan(res.plan);
        setInstallments(res.installments ?? []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Eroare"))
      .finally(() => setLoading(false));
  }, [studentId]);

  if (loading)
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  if (error)
    return (
      <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm flex gap-2">
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
        {error}
      </div>
    );

  if (!plan)
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Niciun plan de taxe înregistrat.
      </p>
    );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border p-4">
        <p className="font-medium">{plan.planName ?? "Plan taxă"}</p>
        <p className="text-sm text-muted-foreground">
          Total: {formatCurrency(plan.amountCents, plan.currency)} •{" "}
          {plan.billingCycle}
        </p>
        {Number(plan.scholarshipAmountCents) > 0 && (
          <p className="text-sm text-green-600 dark:text-green-400">
            Bursă: -{formatCurrency(plan.scholarshipAmountCents, plan.currency)}
          </p>
        )}
        {Number(plan.scholarshipPercent) > 0 && (
          <p className="text-sm text-green-600 dark:text-green-400">
            Bursă: -{plan.scholarshipPercent}%
          </p>
        )}
      </div>

      {installments.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="px-4 py-2.5 bg-muted/40 text-sm font-medium">Rate</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">
                  Rata
                </th>
                <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">
                  Scadență
                </th>
                <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">
                  Suma
                </th>
              </tr>
            </thead>
            <tbody>
              {installments.map((inst) => (
                <tr key={inst.id} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-2">Rata {inst.orderIndex}</td>
                  <td className="px-4 py-2 text-muted-foreground">{formatDate(inst.dueDate)}</td>
                  <td className="px-4 py-2 text-right font-medium">
                    {formatCurrency(inst.amountCents, plan.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type TabId = "grades" | "attendance" | "tuition";

const TABS: { id: TabId; label: string; icon: typeof GraduationCap }[] = [
  { id: "grades", label: "Note", icon: GraduationCap },
  { id: "attendance", label: "Prezență", icon: ClipboardList },
  { id: "tuition", label: "Taxe", icon: CreditCard },
];

export function ParentPortalPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const [children, setChildren] = useState<ChildSummary[]>([]);
  const [news, setNews] = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedChildId, setSelectedChildId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<TabId>("grades");

  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      navigate("/app/login");
    }
  }, [sessionStatus, navigate]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [childrenRes, newsRes] = await Promise.all([
        listChildren(),
        listParentNews(),
      ]);
      const childrenList = childrenRes.children ?? [];
      setChildren(childrenList);
      setNews(newsRes.news ?? []);
      if (childrenList.length > 0) {
        setSelectedChildId(childrenList[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la încărcare");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionStatus === "authenticated") {
      load();
    }
  }, [sessionStatus, load]);

  const selectedChild = children.find((c) => c.id === selectedChildId);

  return (
    <AppShell pageTitle="Portal Părinți">
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {!loading && !error && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coloana principală */}
          <div className="lg:col-span-2 space-y-4">
            {/* Selector copil */}
            {children.length > 1 && (
              <div className="flex items-center gap-3">
                <label htmlFor="child-select" className="text-sm font-medium text-muted-foreground">
                  Copil:
                </label>
                <select
                  id="child-select"
                  value={selectedChildId}
                  onChange={(e) => setSelectedChildId(e.target.value)}
                  className="px-3 py-1.5 rounded-md border border-input bg-background text-sm"
                >
                  {children.map((child) => (
                    <option key={child.id} value={child.id}>
                      {child.fullName}
                      {child.className ? ` — ${child.className}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {children.length === 0 && (
              <div className="rounded-lg border border-border p-6 text-center text-muted-foreground">
                <p className="text-sm">Niciun copil înregistrat în cont.</p>
              </div>
            )}

            {selectedChild && (
              <div className="rounded-lg border border-border overflow-hidden">
                {/* Header copil */}
                <div className="px-5 py-4 bg-muted/40 border-b border-border">
                  <h2 className="font-semibold text-base">{selectedChild.fullName}</h2>
                  {selectedChild.className && (
                    <p className="text-sm text-muted-foreground">{selectedChild.className}</p>
                  )}
                </div>

                {/* Tab bar */}
                <div className="flex border-b border-border">
                  {TABS.map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                          "flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 transition-colors",
                          activeTab === tab.id
                            ? "border-primary text-primary font-medium"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {/* Tab content */}
                <div className="p-5">
                  {activeTab === "grades" && (
                    <GradesTab studentId={selectedChild.id} />
                  )}
                  {activeTab === "attendance" && (
                    <AttendanceTab studentId={selectedChild.id} />
                  )}
                  {activeTab === "tuition" && (
                    <TuitionTab studentId={selectedChild.id} />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Coloana știri */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Newspaper className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm">Știri & alerte</h3>
            </div>

            {news.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-4 text-center text-muted-foreground">
                <p className="text-xs">Nicio știre recentă.</p>
              </div>
            ) : (
              news.map((post) => (
                <div
                  key={post.id}
                  className="rounded-lg border border-border p-3 space-y-1"
                >
                  <p className="font-medium text-sm">{post.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{post.body}</p>
                  {post.publishedAt && (
                    <p className="text-xs text-muted-foreground">
                      {formatDate(post.publishedAt)}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
