/**
 * COURSE-101: Course management page
 * Lists courses with search, filter (Active/Archived), edit, and archive actions.
 */
import { useEffect, useState, useMemo, useCallback } from "react";
import { Plus, Search, Loader2, Pencil, Archive, BookOpen, RotateCcw } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { CourseForm } from "@/components/app/CourseForm";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  listCourses,
  patchCourse,
  archiveCourse,
  type Course,
} from "@/lib/api/courses";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "active" | "archived";

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Toate" },
  { value: "active", label: "Active" },
  { value: "archived", label: "Arhivate" },
];

const CEFR_BADGE: Record<string, string> = {
  A1: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  A2: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  B1: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  B2: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  C1: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  C2: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
};

function formatPrice(cents: number): string {
  return `${(cents / 100).toLocaleString("ro-RO", { minimumFractionDigits: 0 })} RON`;
}

export function CoursesPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const [items, setItems] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<Course | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  const fetchCourses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listCourses({ includeArchived: statusFilter !== "active" });
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la încărcare");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void fetchCourses();
  }, [fetchCourses]);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Client-side search filter
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return items.filter((c) => {
      const matchSearch = !q
        || c.name.toLowerCase().includes(q)
        || (c.level?.toLowerCase().includes(q) ?? false)
        || (c.cefrLevel?.toLowerCase().includes(q) ?? false);
      const matchStatus = statusFilter === "all"
        ? true
        : c.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [items, search, statusFilter]);

  function handleSaved(_course: Course) {
    setDrawerOpen(false);
    setEditing(null);
    setToast({ kind: "success", message: editing ? "Curs actualizat" : "Curs creat" });
    void fetchCourses();
  }

  async function handleArchive(course: Course) {
    try {
      await archiveCourse(course.id);
      setConfirmArchive(null);
      setToast({ kind: "success", message: `„${course.name}" arhivat` });
      void fetchCourses();
    } catch (err) {
      setToast({ kind: "error", message: err instanceof Error ? err.message : "Eroare" });
    }
  }

  async function handleRestore(course: Course) {
    try {
      await patchCourse(course.id, { status: "active" });
      setToast({ kind: "success", message: `„${course.name}" restaurat` });
      void fetchCourses();
    } catch (err) {
      setToast({ kind: "error", message: err instanceof Error ? err.message : "Eroare" });
    }
  }

  return (
    <AppShell
      pageTitle="Cursuri"
      pageDescription={`${filtered.length} curs${filtered.length !== 1 ? "uri" : ""}`}
      actions={
        <button
          onClick={() => { setEditing(null); setDrawerOpen(true); }}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring touch-target"
          aria-label="Adaugă curs nou"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Curs nou
        </button>
      }
    >
      <div className="space-y-6">
        {/* Search + filter bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
            <input
              type="search"
              placeholder="Caută cursuri..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Caută cursuri"
              className="w-full pl-9 pr-3 py-2 rounded-md border border-input bg-background text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          {/* Status filter chips */}
          <div className="flex gap-1" role="group" aria-label="Filtru status">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                aria-pressed={statusFilter === f.value}
                className={cn(
                  "px-3 py-1.5 rounded-full text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  statusFilter === f.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/70"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16" role="status" aria-label="Se încarcă...">
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
          </div>
        ) : error ? (
          <div role="alert" className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <BookOpen className="h-12 w-12 text-muted-foreground mb-3" aria-hidden="true" />
            <p className="text-muted-foreground text-sm">
              {search ? "Niciun curs nu corespunde căutării." : "Nu există cursuri încă. Adaugă primul curs."}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm" aria-label="Lista cursuri">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Denumire</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Nivel</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden sm:table-cell">CEFR</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground hidden lg:table-cell">Preț</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground hidden lg:table-cell">Durată</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Acțiuni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((course) => (
                  <tr key={course.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {course.name}
                      {course.description && (
                        <p className="text-xs text-muted-foreground truncate max-w-[200px] font-normal mt-0.5">
                          {course.description}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                      {course.level ?? "—"}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {course.cefrLevel ? (
                        <span className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
                          CEFR_BADGE[course.cefrLevel] ?? "bg-muted text-muted-foreground"
                        )}>
                          {course.cefrLevel}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground hidden lg:table-cell">
                      {formatPrice(course.defaultPriceCents)}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground hidden lg:table-cell">
                      {course.durationMinutes} min
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        course.status === "active"
                          ? "bg-success/15 text-success"
                          : "bg-muted text-muted-foreground"
                      )}>
                        {course.status === "active" ? "Activ" : "Arhivat"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          aria-label={`Editează ${course.name}`}
                          onClick={() => { setEditing(course); setDrawerOpen(true); }}
                          className="p-1.5 rounded hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring text-muted-foreground hover:text-foreground transition-colors touch-target"
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </button>
                        {course.status === "active" ? (
                          <button
                            aria-label={`Arhivează ${course.name}`}
                            onClick={() => setConfirmArchive(course)}
                            className="p-1.5 rounded hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring text-muted-foreground hover:text-warning transition-colors touch-target"
                          >
                            <Archive className="h-4 w-4" aria-hidden="true" />
                          </button>
                        ) : (
                          <button
                            aria-label={`Restaurează ${course.name}`}
                            onClick={() => void handleRestore(course)}
                            className="p-1.5 rounded hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring text-muted-foreground hover:text-success transition-colors touch-target"
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
      <CourseForm
        course={editing}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setEditing(null); }}
        onSaved={handleSaved}
      />

      {/* Archive confirm dialog */}
      {confirmArchive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" role="dialog" aria-modal="true" aria-labelledby="confirm-archive-title">
          <div className="bg-card rounded-lg border border-border shadow-xl max-w-sm w-full p-6 space-y-4">
            <h3 id="confirm-archive-title" className="font-semibold text-foreground">Arhivezi cursul?</h3>
            <p className="text-sm text-muted-foreground">
              „<strong>{confirmArchive.name}</strong>" nu va mai apărea în dropdown-uri, dar rămâne în istoricul plăților și elevilor.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmArchive(null)}
                className="px-4 py-2 rounded-md text-sm font-medium border border-input bg-background hover:bg-muted"
              >
                Anulează
              </button>
              <button
                onClick={() => void handleArchive(confirmArchive)}
                className="px-4 py-2 rounded-md text-sm font-medium bg-warning text-warning-foreground hover:bg-warning/90"
              >
                Arhivează
              </button>
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
            toast.kind === "success"
              ? "bg-success text-success-foreground"
              : "bg-destructive text-destructive-foreground"
          )}
        >
          {toast.message}
        </div>
      )}
    </AppShell>
  );
}
