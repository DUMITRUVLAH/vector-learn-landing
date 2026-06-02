import { useEffect, useState, useMemo, useCallback } from "react";
import { Plus, Search, Loader2, MoreVertical, Pencil, Archive, X, FilePlus, MessageSquare, UserPlus, Link2 } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { StudentForm } from "@/components/app/StudentForm";
import { ImportStudentsModal } from "@/components/app/ImportStudentsModal"; // STU-203
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  listStudents,
  archiveStudent,
  type Student,
  type ListStudentsParams,
} from "@/lib/api/students";
import { listFeedbackForms, sendFeedbackToStudent, type FeedbackForm } from "@/lib/api/feedback";
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
  const [items, setItems] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ListStudentsParams["status"]>("active");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<Student | null>(null);
  // STU-203: import CSV modal
  const [importOpen, setImportOpen] = useState(false);
  // FEEDBACK-601: send feedback modal
  const [feedbackTarget, setFeedbackTarget] = useState<Student | null>(null);
  const [feedbackForms, setFeedbackForms] = useState<FeedbackForm[]>([]);
  const [feedbackFormId, setFeedbackFormId] = useState<string>("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackLink, setFeedbackLink] = useState<string | null>(null);

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
      const res = await listStudents({ search: debouncedSearch, status: statusFilter, limit: 100 });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la încărcare");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter]);

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
        <div className="flex gap-2">
          {/* STU-204: Export CSV — sends current filters */}
          <button
            type="button"
            onClick={() => {
              const qs = new URLSearchParams();
              if (statusFilter && statusFilter !== "all") qs.set("status", statusFilter);
              if (debouncedSearch) qs.set("search", debouncedSearch);
              const query = qs.toString();
              window.location.href = `/api/students/export${query ? `?${query}` : ""}`;
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            aria-label="Exportă lista curentă în CSV"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          {/* STU-203: Import CSV */}
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            aria-label="Import studenți din CSV"
          >
            <Upload className="h-4 w-4" />
            Import CSV
          </button>
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Adaugă elev
          </button>
        </div>
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
                              {/* STU-201: link to student detail page */}
                              <button
                                type="button"
                                onClick={() => navigate(`/app/students/${s.id}`)}
                                className="font-medium truncate hover:text-primary hover:underline text-left"
                                aria-label={`Deschide profilul lui ${s.fullName}`}
                              >
                                {s.fullName}
                              </button>
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
                            {/* CONTRACT-501: generate contract from student */}
                            <button
                              type="button"
                              onClick={() => {
                                const params = new URLSearchParams();
                                params.set("name", s.fullName);
                                if (s.email) params.set("email", s.email);
                                if (s.phone) params.set("phone", s.phone);
                                params.set("studentId", s.id);
                                navigate(`/app/contracts?${params.toString()}`);
                              }}
                              aria-label={`Generează contract pentru ${s.fullName}`}
                              className="touch-target rounded-md hover:bg-primary/10 hover:text-primary flex items-center justify-center"
                            >
                              <FilePlus className="h-3.5 w-3.5" />
                            </button>
                            {/* FEEDBACK-601: send feedback */}
                            <button
                              type="button"
                              onClick={() => { setFeedbackTarget(s); setFeedbackLink(null); setFeedbackFormId(""); void listFeedbackForms().then(({ forms }) => setFeedbackForms(forms)); }}
                              aria-label={`Trimite feedback pentru ${s.fullName}`}
                              className="touch-target rounded-md hover:bg-primary/10 hover:text-primary flex items-center justify-center"
                            >
                              <MessageSquare className="h-3.5 w-3.5" />
                            </button>
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
            <div className="p-5 space-y-6">
              <StudentForm initial={editing} onSuccess={handleSaved} onCancel={closeDrawer} />
              {/* MOB-104: Parent account link management */}
              {editing && (
                <ParentLinksPanel studentId={editing.id} studentName={editing.fullName} />
              )}
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

      {/* FEEDBACK-601: Send feedback modal */}
      {feedbackTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => { setFeedbackTarget(null); setFeedbackLink(null); }} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <h2 className="text-sm font-semibold">Trimite feedback — {feedbackTarget.fullName}</h2>

            {feedbackLink ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Link de completat (copiați și trimiteți elevului):</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}/#${feedbackLink}`}
                    aria-label="Link feedback public"
                    className="flex-1 rounded-md border border-input bg-muted px-2 py-1.5 text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/#${feedbackLink}`)}
                    className="rounded-md border border-border bg-card px-2 py-1.5 text-xs font-semibold hover:bg-muted"
                  >
                    Copiază
                  </button>
                </div>
                <button type="button" onClick={() => { setFeedbackTarget(null); setFeedbackLink(null); }} className="w-full rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted">
                  Închide
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="fb-form-select" className="text-xs font-medium text-muted-foreground">Selectează formularul</label>
                  <select
                    id="fb-form-select"
                    value={feedbackFormId}
                    onChange={(e) => setFeedbackFormId(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">— Selectează —</option>
                    {feedbackForms.map((f) => (
                      <option key={f.id} value={f.id}>{f.title}</option>
                    ))}
                  </select>
                  {feedbackForms.length === 0 && (
                    <p className="text-xs text-muted-foreground">Nu există formulare. Creați unul la <a href="#/app/feedback" className="text-primary underline">Feedback</a>.</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setFeedbackTarget(null)} className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted">Anulează</button>
                  <button
                    type="button"
                    disabled={!feedbackFormId || feedbackSending}
                    onClick={async () => {
                      if (!feedbackTarget || !feedbackFormId) return;
                      setFeedbackSending(true);
                      try {
                        const { publicUrl } = await sendFeedbackToStudent(feedbackFormId, feedbackTarget.id);
                        setFeedbackLink(publicUrl);
                      } catch {
                        setToast({ kind: "error", message: "Nu s-a putut genera invitația." });
                        setFeedbackTarget(null);
                      } finally {
                        setFeedbackSending(false);
                      }
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {feedbackSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
                    Trimite
                  </button>
                </div>
              </div>
            )}
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

      {/* STU-203: Import CSV modal */}
      {importOpen && (
        <ImportStudentsModal
          onClose={() => setImportOpen(false)}
          onImported={() => {
            setImportOpen(false);
            void fetchList();
            setToast({ kind: "success", message: "Import finalizat. Lista a fost reîncărcată." });
          }}
        />
      )}
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// MOB-104: Parent-student link management panel (shown in student edit drawer)
// ---------------------------------------------------------------------------

interface LinkRow {
  id: string;
  parentUserId: string;
  createdAt: string;
}

interface ParentLinksPanelProps {
  studentId: string;
  studentName: string;
}

function ParentLinksPanel({ studentId, studentName }: ParentLinksPanelProps) {
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [newParentUserId, setNewParentUserId] = useState("");
  const [adding, setAdding] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/m/parent-links/${studentId}`, { credentials: "include" })
      .then((r) => r.json() as Promise<{ links: LinkRow[] }>)
      .then((d) => setLinks(d.links ?? []))
      .catch(() => setLoadError("Nu s-au putut încărca legăturile"));
  }, [studentId]);

  const handleAdd = async () => {
    const trimmed = newParentUserId.trim();
    if (!trimmed || adding) return;
    setAdding(true);
    try {
      const r = await fetch("/api/m/parent-links", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentUserId: trimmed, studentId }),
      });
      const d = (await r.json()) as { link?: LinkRow; id?: string; alreadyLinked?: boolean };
      if (r.ok) {
        const linkId = d.link?.id ?? d.id ?? "";
        const exists = links.some((l) => l.id === linkId);
        if (!exists && linkId) {
          setLinks((prev) => [...prev, { id: linkId, parentUserId: trimmed, createdAt: new Date().toISOString() }]);
        }
        setNewParentUserId("");
      }
    } catch {
      // silent — user can retry
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="border-t border-border pt-5 space-y-3">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h3 className="text-sm font-semibold">Linkuiește un Cont Părinte</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Asociați ID-ul utilizatorului cu rol <em>parent</em> pentru a-i permite accesul la portalul
        {" "}<strong>{studentName}</strong>.
      </p>

      {loadError && (
        <p className="text-xs text-destructive">{loadError}</p>
      )}

      {links.length > 0 && (
        <ul className="space-y-1" role="list" aria-label="Conturi asociate">
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-2 text-xs rounded-md border border-border bg-muted/30 px-3 py-2">
              <UserPlus className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
              <span className="font-mono truncate flex-1">{l.parentUserId}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <label htmlFor="parent-user-id-input" className="sr-only">ID utilizator părinte</label>
        <input
          id="parent-user-id-input"
          type="text"
          value={newParentUserId}
          onChange={(e) => setNewParentUserId(e.target.value)}
          placeholder="UUID utilizator (rol: parent)"
          className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={!newParentUserId.trim() || adding}
          aria-label="Asociază cont"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
          Asociază
        </button>
      </div>
    </div>
  );
}
