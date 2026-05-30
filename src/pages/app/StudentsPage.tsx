import { useEffect, useState, useMemo, useCallback } from "react";
import { Plus, Search, Loader2, MoreVertical, Pencil, Archive, X } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { StudentForm } from "@/components/app/StudentForm";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import { useBranch } from "@/contexts/BranchContext";
import {
  listStudents,
  archiveStudent,
  type Student,
  type ListStudentsParams,
} from "@/lib/api/students";
import { cn } from "@/lib/utils";

const STATUS_BADGE: Record<Student["status"], { label: string; cls: string }> = {
  active: { label: "Activ", cls: "bg-success/15 text-success" },
  trial: { label: "Trial", cls: "bg-primary/15 text-primary" },
  paused: { label: "Pauză", cls: "bg-warning/15 text-warning" },
  archived: { label: "Arhivat", cls: "bg-muted text-muted-foreground" },
};

const STATUS_FILTERS: Array<{ value: ListStudentsParams["status"]; label: string }> = [
  { value: "all", label: "Toate" },
  { value: "active", label: "Activ" },
  { value: "trial", label: "Trial" },
  { value: "paused", label: "Pauză" },
  { value: "archived", label: "Arhivat" },
];

export function StudentsPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();
  // BRANCH-702: get active branch filter from context
  const { activeBranch } = useBranch();
  const [items, setItems] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ListStudentsParams["status"]>("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<Student | null>(null);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // BRANCH-702: pass branch_id when a specific branch is active
      const params: ListStudentsParams = { search: debouncedSearch, status: statusFilter, limit: 100 };
      if (activeBranch !== "all") params.branch_id = activeBranch;
      const res = await listStudents(params);
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la încărcare");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter, activeBranch]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const openAdd = () => {
    setEditing(null);
    setDrawerOpen(true);
  };
  const openEdit = (s: Student) => {
    setEditing(s);
    setDrawerOpen(true);
  };
  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditing(null);
  };

  const handleSaved = (s: Student) => {
    closeDrawer();
    setToast({ kind: "success", message: editing ? `Modificările pentru ${s.fullName} salvate` : `Elev "${s.fullName}" adăugat` });
    void fetchList();
  };

  const handleArchive = async (s: Student) => {
    try {
      await archiveStudent(s.id);
      setToast({ kind: "success", message: `Elev "${s.fullName}" arhivat` });
      void fetchList();
    } catch {
      setToast({ kind: "error", message: "Nu am putut arhiva. Încearcă din nou." });
    } finally {
      setConfirmArchive(null);
    }
  };

  const activeCount = useMemo(() => items.filter((i) => i.status === "active").length, [items]);

  return (
    <AppShell
      pageTitle="Elevi"
      pageDescription={`${total} ${total === 1 ? "elev" : "elevi"} în baza ta de date · ${activeCount} activi în vizualizarea curentă`}
      actions={
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Adaugă elev
        </button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Caută după nume, email sau telefon…"
              aria-label="Caută elevi"
              className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div role="tablist" aria-label="Filtrare status" className="flex flex-wrap items-center gap-1.5">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                role="tab"
                aria-selected={statusFilter === f.value}
                onClick={() => setStatusFilter(f.value)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-semibold transition-all",
                  statusFilter === f.value
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:bg-muted/70"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Se încarcă elevii…
            </div>
          ) : error ? (
            <div className="py-16 text-center text-sm text-destructive">{error}</div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-muted-foreground mb-4">
                Niciun elev găsit pentru filtrele curente.
              </p>
              <button
                type="button"
                onClick={openAdd}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" />
                Adaugă primul elev
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th scope="col" className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5">
                      Nume
                    </th>
                    <th scope="col" className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5 hidden sm:table-cell">
                      Contact
                    </th>
                    <th scope="col" className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5 hidden md:table-cell">
                      Părinte
                    </th>
                    <th scope="col" className="text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5">
                      Status
                    </th>
                    <th scope="col" className="text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5">
                      Acțiuni
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((s) => {
                    const badge = STATUS_BADGE[s.status];
                    return (
                      <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-[10px] font-bold text-primary-foreground flex-shrink-0">
                              {s.fullName
                                .split(" ")
                                .map((n) => n[0])
                                .slice(0, 2)
                                .join("")}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium truncate">{s.fullName}</p>
                              <p className="text-[10px] text-muted-foreground sm:hidden">{s.phone}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <p className="text-xs">{s.email ?? <span className="text-muted-foreground">—</span>}</p>
                          <p className="text-[10px] text-muted-foreground">{s.phone ?? "—"}</p>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <p className="text-xs">{s.parentEmail ?? <span className="text-muted-foreground">—</span>}</p>
                          <p className="text-[10px] text-muted-foreground">{s.parentPhone ?? "—"}</p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex flex-col items-end gap-1">
                            <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold", badge.cls)}>
                              {badge.label}
                            </span>
                            {/* FIN-602: Show debt badge when student has outstanding debt */}
                            {(s.debtCents ?? 0) > 0 && (
                              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-destructive/15 text-destructive">
                                Datorie: {new Intl.NumberFormat("ro-RO", { style: "currency", currency: "RON", maximumFractionDigits: 0 }).format((s.debtCents ?? 0) / 100)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex gap-1">
                            <button
                              type="button"
                              onClick={() => openEdit(s)}
                              aria-label={`Editează ${s.fullName}`}
                              className="touch-target rounded-md hover:bg-muted flex items-center justify-center"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            {s.status !== "archived" && (
                              <button
                                type="button"
                                onClick={() => setConfirmArchive(s)}
                                aria-label={`Arhivează ${s.fullName}`}
                                className="touch-target rounded-md hover:bg-destructive/10 hover:text-destructive flex items-center justify-center"
                              >
                                <Archive className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-end"
          role="dialog"
          aria-modal="true"
          aria-labelledby="drawer-title"
        >
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={closeDrawer} />
          <div className="relative h-full w-full sm:max-w-md bg-background border-l border-border shadow-xl overflow-y-auto animate-slide-in">
            <div className="border-b border-border px-5 py-4 flex items-center justify-between">
              <h2 id="drawer-title" className="text-base font-bold">
                {editing ? `Editează ${editing.fullName}` : "Adaugă elev"}
              </h2>
              <button
                type="button"
                onClick={closeDrawer}
                aria-label="Închide"
                className="rounded-md hover:bg-muted p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5">
              <StudentForm initial={editing} onSuccess={handleSaved} onCancel={closeDrawer} />
            </div>
          </div>
        </div>
      )}

      {confirmArchive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setConfirmArchive(null)} />
          <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl">
            <h3 className="text-base font-bold mb-1">Arhivează elev</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Confirmi arhivarea elevului <strong className="text-foreground">{confirmArchive.fullName}</strong>?
              Datele rămân, dar nu mai apare în filtrele active. Poți restaura oricând.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmArchive(null)}
                className="rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted"
              >
                Renunță
              </button>
              <button
                type="button"
                onClick={() => handleArchive(confirmArchive)}
                className="rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90"
              >
                Arhivează
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          role="status"
          className={cn(
            "fixed bottom-4 right-4 z-50 rounded-lg border shadow-lg px-4 py-3 text-sm font-medium animate-fade-in max-w-sm",
            toast.kind === "success"
              ? "bg-success/10 border-success/30 text-success"
              : "bg-destructive/10 border-destructive/30 text-destructive"
          )}
        >
          {toast.message}
        </div>
      )}
    </AppShell>
  );
}
