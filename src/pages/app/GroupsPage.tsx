/**
 * COURSE-102: Groups management page
 * Lists groups with capacity indicators and actions to add/edit/archive.
 */
import { useEffect, useState, useMemo, useCallback } from "react";
import { Plus, Loader2, Pencil, Archive, Users, RotateCcw } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { GroupForm } from "@/components/app/GroupForm";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import { listGroups, archiveGroup, patchGroup, type Group } from "@/lib/api/groups";
import { listCourses, type Course } from "@/lib/api/courses";
import { cn } from "@/lib/utils";

type StatusFilter = "active" | "archived" | "all";

function formatSchedule(g: Group): string {
  if (!g.scheduleTemplate?.days?.length) return "—";
  const days = g.scheduleTemplate.days.join("/");
  return `${days} ${g.scheduleTemplate.startTime}–${g.scheduleTemplate.endTime}`;
}

function CapacityBadge({ group }: { group: Group }) {
  const pct = group.maxStudents > 0 ? group.enrolledCount / group.maxStudents : 0;
  const full = group.spotsRemaining === 0;
  const low = group.spotsRemaining > 0 && group.spotsRemaining <= 3;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        full
          ? "bg-destructive/15 text-destructive"
          : low
          ? "bg-warning/15 text-warning"
          : "bg-success/15 text-success"
      )}
      aria-label={`${group.enrolledCount} din ${group.maxStudents} locuri ocupate`}
    >
      <Users className="h-3 w-3" aria-hidden="true" />
      {full
        ? "Plin"
        : `${group.enrolledCount}/${group.maxStudents}`}
    </span>
  );
}

export function GroupsPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const [items, setItems] = useState<Group[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Group | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<Group | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [groupsRes, coursesRes] = await Promise.all([
        listGroups({ includeArchived: statusFilter !== "active" }),
        listCourses({ includeArchived: false }),
      ]);
      setItems(groupsRes.items);
      setCourses(coursesRes.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la încărcare");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const filtered = useMemo(() => {
    return items.filter((g) => {
      const matchStatus =
        statusFilter === "all" ? true : g.status === statusFilter;
      const matchCourse =
        courseFilter === "all" ? true : g.courseId === courseFilter;
      return matchStatus && matchCourse;
    });
  }, [items, statusFilter, courseFilter]);

  function handleSaved(_group: Group) {
    setDrawerOpen(false);
    setEditing(null);
    setToast({ kind: "success", message: editing ? "Grupă actualizată" : "Grupă creată" });
    void fetchData();
  }

  async function handleArchive(group: Group) {
    try {
      await archiveGroup(group.id);
      setConfirmArchive(null);
      setToast({ kind: "success", message: `„${group.name}" arhivată` });
      void fetchData();
    } catch (err) {
      setToast({ kind: "error", message: err instanceof Error ? err.message : "Eroare" });
    }
  }

  async function handleRestore(group: Group) {
    try {
      await patchGroup(group.id, { status: "active" });
      setToast({ kind: "success", message: `„${group.name}" restaurată` });
      void fetchData();
    } catch (err) {
      setToast({ kind: "error", message: err instanceof Error ? err.message : "Eroare" });
    }
  }

  const courseMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of courses) m[c.id] = c.name;
    return m;
  }, [courses]);

  return (
    <AppShell
      pageTitle="Grupe"
      pageDescription={`${filtered.length} grup${filtered.length !== 1 ? "e" : "ă"}`}
      actions={
        <button
          onClick={() => { setEditing(null); setDrawerOpen(true); }}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring touch-target"
          aria-label="Adaugă grupă nouă"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Grupă nouă
        </button>
      }
    >
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          {/* Status chips */}
          <div className="flex gap-1" role="group" aria-label="Filtru status">
            {(["active", "all", "archived"] as StatusFilter[]).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                aria-pressed={statusFilter === s}
                className={cn(
                  "px-3 py-1.5 rounded-full text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  statusFilter === s
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/70"
                )}
              >
                {s === "active" ? "Active" : s === "all" ? "Toate" : "Arhivate"}
              </button>
            ))}
          </div>
          {/* Course filter */}
          {courses.length > 0 && (
            <select
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              aria-label="Filtru curs"
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">Toate cursurile</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16" role="status" aria-label="Se încarcă...">
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
          </div>
        ) : error ? (
          <div role="alert" className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="h-12 w-12 text-muted-foreground mb-3" aria-hidden="true" />
            <p className="text-muted-foreground text-sm">
              Nu există grupe. Creează prima grupă pentru a înrola elevi.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm" aria-label="Lista grupe">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Grupă</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Curs</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">Program</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Capacitate</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Acțiuni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((group) => (
                  <tr key={group.id} className={cn("hover:bg-muted/30 transition-colors", group.status === "archived" && "opacity-60")}>
                    <td className="px-4 py-3 font-medium text-foreground">{group.name}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                      {courseMap[group.courseId] ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                      {formatSchedule(group)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <CapacityBadge group={group} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          aria-label={`Editează ${group.name}`}
                          onClick={() => { setEditing(group); setDrawerOpen(true); }}
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground touch-target"
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </button>
                        {group.status === "active" ? (
                          <button
                            aria-label={`Arhivează ${group.name}`}
                            onClick={() => setConfirmArchive(group)}
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-warning touch-target"
                          >
                            <Archive className="h-4 w-4" aria-hidden="true" />
                          </button>
                        ) : (
                          <button
                            aria-label={`Restaurează ${group.name}`}
                            onClick={() => void handleRestore(group)}
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-success touch-target"
                          >
                            <RotateCcw className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Slide-over form */}
      <GroupForm
        group={editing}
        courses={courses}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setEditing(null); }}
        onSaved={handleSaved}
      />

      {/* Archive confirm */}
      {confirmArchive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" role="dialog" aria-modal="true" aria-labelledby="confirm-archive-group-title">
          <div className="bg-card rounded-lg border border-border shadow-xl max-w-sm w-full p-6 space-y-4">
            <h3 id="confirm-archive-group-title" className="font-semibold text-foreground">Arhivezi grupa?</h3>
            <p className="text-sm text-muted-foreground">
              „<strong>{confirmArchive.name}</strong>" nu va mai apărea în înrolare, dar elevii existenți rămân înrolați.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmArchive(null)} className="px-4 py-2 rounded-md text-sm font-medium border border-input bg-background hover:bg-muted">Anulează</button>
              <button onClick={() => void handleArchive(confirmArchive)} className="px-4 py-2 rounded-md text-sm font-medium bg-warning text-warning-foreground hover:bg-warning/90">Arhivează</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "fixed bottom-4 right-4 z-50 rounded-md px-4 py-3 text-sm font-medium shadow-lg",
            toast.kind === "success" ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground"
          )}
        >
          {toast.message}
        </div>
      )}
    </AppShell>
  );
}
