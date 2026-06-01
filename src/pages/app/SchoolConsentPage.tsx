/**
 * CONSENT-001 — /app/school/consent
 *
 * Formulare de consimțământ cu e-semnătură.
 * Trei tab-uri: Șabloane | Cereri | Semnare (preview)
 */
import { useEffect, useState, useCallback } from "react";
import {
  Loader2,
  AlertCircle,
  Plus,
  FileCheck,
  X,
  CheckCircle,
  XCircle,
  Clock,
  Pencil,
  Trash2,
  Send,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  listConsentTemplates,
  createConsentTemplate,
  updateConsentTemplate,
  deleteConsentTemplate,
  listConsentRequests,
  createConsentRequests,
  signConsentRequest,
  declineConsentRequest,
  type ConsentTemplate,
  type ConsentRequest,
} from "@/lib/api/consent";
import { listStudents, type Student } from "@/lib/api/students";
import { listGuardians, type StudentGuardian } from "@/lib/api/guardians";
import { cn } from "@/lib/utils";

// ─── Labels & helpers ─────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  photo_video: "Foto/Video",
  field_trip: "Excursie",
  medical: "Medical",
  gdpr: "GDPR",
};

type RequestStatus = "pending" | "signed" | "declined";

const STATUS_LABELS: Record<RequestStatus, string> = {
  pending: "În așteptare",
  signed: "Semnat",
  declined: "Refuzat",
};

const STATUS_COLORS: Record<RequestStatus, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  signed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  declined: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
};

const STATUS_ICONS: Record<RequestStatus, React.ComponentType<{ className?: string }>> = {
  pending: Clock,
  signed: CheckCircle,
  declined: XCircle,
};

function StatusBadge({ status }: { status: string }) {
  const s = status as RequestStatus;
  const Icon = STATUS_ICONS[s] ?? Clock;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        STATUS_COLORS[s] ?? "bg-muted text-muted-foreground"
      )}
    >
      <Icon className="h-3 w-3" />
      {STATUS_LABELS[s] ?? status}
    </span>
  );
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ro-RO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

type Tab = "templates" | "requests" | "sign";

// ─── Component ────────────────────────────────────────────────────────────────

export function SchoolConsentPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();
  const [tab, setTab] = useState<Tab>("templates");

  // Templates state
  const [templates, setTemplates] = useState<ConsentTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  // Requests state
  const [requests, setRequests] = useState<ConsentRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Students (for request modal)
  const [students, setStudents] = useState<Student[]>([]);

  // Modals
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ConsentTemplate | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showSignModal, setShowSignModal] = useState<ConsentRequest | null>(null);

  // Template form
  const [formTitle, setFormTitle] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formSaving, setFormSaving] = useState(false);

  // Request form
  const [reqStudentId, setReqStudentId] = useState("");
  const [reqTemplateId, setReqTemplateId] = useState("");
  const [reqGuardians, setReqGuardians] = useState<StudentGuardian[]>([]);
  const [reqSelectedGuardianIds, setReqSelectedGuardianIds] = useState<Set<string>>(new Set());
  const [reqSending, setReqSending] = useState(false);

  // Sign modal
  const [signName, setSignName] = useState("");
  const [signSaving, setSignSaving] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);

  // Auth guard
  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      navigate("/login");
    }
  }, [sessionStatus, navigate]);

  // Load templates
  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    setTemplatesError(null);
    try {
      const res = await listConsentTemplates();
      setTemplates(res.templates);
    } catch {
      setTemplatesError("Eroare la încărcarea șabloanelor.");
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  // Load requests
  const loadRequests = useCallback(async () => {
    setRequestsLoading(true);
    setRequestsError(null);
    try {
      const filters = statusFilter !== "all" ? { status: statusFilter } : undefined;
      const res = await listConsentRequests(filters);
      setRequests(res.requests);
    } catch {
      setRequestsError("Eroare la încărcarea cererilor.");
    } finally {
      setRequestsLoading(false);
    }
  }, [statusFilter]);

  // Load students for request modal
  const loadStudents = useCallback(async () => {
    try {
      const res = await listStudents({ limit: 100, status: "active" });
      setStudents(res.items ?? []);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    loadTemplates();
    loadStudents();
  }, [sessionStatus, loadTemplates, loadStudents]);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    loadRequests();
  }, [sessionStatus, loadRequests, statusFilter]);

  // Load guardians when student changes in request modal
  useEffect(() => {
    if (!reqStudentId) {
      setReqGuardians([]);
      setReqSelectedGuardianIds(new Set());
      return;
    }
    listGuardians(reqStudentId)
      .then((res) => {
        setReqGuardians(res.guardians);
        setReqSelectedGuardianIds(new Set());
      })
      .catch(() => setReqGuardians([]));
  }, [reqStudentId]);

  // ── Template modal ────────────────────────────────────────────────────────

  function openNewTemplate() {
    setEditingTemplate(null);
    setFormTitle("");
    setFormBody("");
    setFormCategory("");
    setShowTemplateModal(true);
  }

  function openEditTemplate(t: ConsentTemplate) {
    setEditingTemplate(t);
    setFormTitle(t.title);
    setFormBody(t.body);
    setFormCategory(t.category ?? "");
    setShowTemplateModal(true);
  }

  async function saveTemplate() {
    if (!formTitle.trim() || !formBody.trim()) return;
    setFormSaving(true);
    try {
      const payload = {
        title: formTitle.trim(),
        body: formBody.trim(),
        category: formCategory.trim() || null,
      };
      if (editingTemplate) {
        await updateConsentTemplate(editingTemplate.id, payload);
      } else {
        await createConsentTemplate({ ...payload, isActive: true });
      }
      setShowTemplateModal(false);
      loadTemplates();
    } catch {
      // silently ignore, user can retry
    } finally {
      setFormSaving(false);
    }
  }

  async function handleDeleteTemplate(id: string) {
    if (!window.confirm("Ștergi șablonul? Cererile existente nu vor fi afectate.")) return;
    try {
      await deleteConsentTemplate(id);
      loadTemplates();
    } catch {
      // ignore
    }
  }

  // ── Request modal ─────────────────────────────────────────────────────────

  function openRequestModal() {
    setReqStudentId("");
    setReqTemplateId("");
    setReqGuardians([]);
    setReqSelectedGuardianIds(new Set());
    setShowRequestModal(true);
  }

  function toggleGuardian(gId: string) {
    setReqSelectedGuardianIds((prev) => {
      const next = new Set(prev);
      if (next.has(gId)) next.delete(gId);
      else next.add(gId);
      return next;
    });
  }

  async function sendRequests() {
    if (!reqStudentId || !reqTemplateId || reqSelectedGuardianIds.size === 0) return;
    setReqSending(true);
    try {
      await createConsentRequests({
        templateId: reqTemplateId,
        studentId: reqStudentId,
        guardianIds: Array.from(reqSelectedGuardianIds),
      });
      setShowRequestModal(false);
      loadRequests();
    } catch {
      // ignore
    } finally {
      setReqSending(false);
    }
  }

  // ── Sign modal ────────────────────────────────────────────────────────────

  function openSignModal(req: ConsentRequest) {
    setShowSignModal(req);
    setSignName("");
    setSignError(null);
  }

  async function handleSign() {
    if (!showSignModal) return;
    if (!signName.trim()) {
      setSignError("Introduceți numele complet pentru a semna.");
      return;
    }
    setSignSaving(true);
    setSignError(null);
    try {
      await signConsentRequest(showSignModal.id, signName.trim());
      setShowSignModal(null);
      loadRequests();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Eroare la semnare.";
      setSignError(msg);
    } finally {
      setSignSaving(false);
    }
  }

  async function handleDecline() {
    if (!showSignModal) return;
    setSignSaving(true);
    try {
      await declineConsentRequest(showSignModal.id);
      setShowSignModal(null);
      loadRequests();
    } catch {
      setSignError("Eroare la refuz.");
    } finally {
      setSignSaving(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (sessionStatus === "loading") {
    return (
      <AppShell pageTitle="Consimțământ">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  const filteredRequests =
    statusFilter === "all"
      ? requests
      : requests.filter((r) => r.status === statusFilter);

  return (
    <AppShell pageTitle="Consimțământ">
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <FileCheck className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Consimțământ</h1>
          </div>
          {tab === "templates" && (
            <button
              onClick={openNewTemplate}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Șablon nou
            </button>
          )}
          {tab === "requests" && (
            <button
              onClick={openRequestModal}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Send className="h-4 w-4" />
              Trimite cerere
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {(["templates", "requests", "sign"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
                tab === t
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t === "templates" && "Șabloane"}
              {t === "requests" && "Cereri"}
              {t === "sign" && "Semnare (preview)"}
            </button>
          ))}
        </div>

        {/* ── Tab: Șabloane ────────────────────────────────────────────────── */}
        {tab === "templates" && (
          <div>
            {templatesLoading && (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {templatesError && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-4 text-destructive">
                <AlertCircle className="h-4 w-4" />
                {templatesError}
              </div>
            )}
            {!templatesLoading && !templatesError && templates.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <FileCheck className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Niciun șablon creat încă.</p>
                <p className="text-xs mt-1">Creați primul șablon pentru a trimite cereri de consimțământ.</p>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {templates.map((tmpl) => (
                <div
                  key={tmpl.id}
                  className="rounded-xl border border-border bg-card p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-foreground text-sm line-clamp-2">
                        {tmpl.title}
                      </p>
                      {tmpl.category && (
                        <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {CATEGORY_LABELS[tmpl.category] ?? tmpl.category}
                        </span>
                      )}
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                        tmpl.isActive
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {tmpl.isActive ? "Activ" : "Inactiv"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-3">{tmpl.body}</p>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => openEditTemplate(tmpl)}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted transition-colors"
                      aria-label={`Editează șablon ${tmpl.title}`}
                    >
                      <Pencil className="h-3 w-3" />
                      Editează
                    </button>
                    <button
                      onClick={() => handleDeleteTemplate(tmpl.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-destructive/30 px-2 py-1 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                      aria-label={`Șterge șablon ${tmpl.title}`}
                    >
                      <Trash2 className="h-3 w-3" />
                      Șterge
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Tab: Cereri ──────────────────────────────────────────────────── */}
        {tab === "requests" && (
          <div className="space-y-4">
            {/* Filter chips */}
            <div className="flex gap-2 flex-wrap">
              {(["all", "pending", "signed", "declined"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    statusFilter === s
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {s === "all" && "Toate"}
                  {s === "pending" && "În așteptare"}
                  {s === "signed" && "Semnate"}
                  {s === "declined" && "Refuzate"}
                </button>
              ))}
            </div>

            {requestsLoading && (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {requestsError && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-4 text-destructive">
                <AlertCircle className="h-4 w-4" />
                {requestsError}
              </div>
            )}
            {!requestsLoading && !requestsError && filteredRequests.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <Send className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">
                  Nicio cerere
                  {statusFilter !== "all"
                    ? ` cu status „${STATUS_LABELS[statusFilter as RequestStatus] ?? statusFilter}"`
                    : ""}{" "}
                  încă.
                </p>
              </div>
            )}

            {filteredRequests.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Elev</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Tutore</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Șablon</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Categorie</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Trimis</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Semnat la</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredRequests.map((req) => (
                      <tr key={req.id} className="bg-card hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 text-foreground">{req.studentName ?? "—"}</td>
                        <td className="px-4 py-3 text-foreground">{req.guardianName ?? "—"}</td>
                        <td className="px-4 py-3 text-foreground">{req.templateTitle ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {req.templateCategory
                            ? (CATEGORY_LABELS[req.templateCategory] ?? req.templateCategory)
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={req.status} />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(req.sentAt)}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {req.signedAt ? formatDate(req.signedAt) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {req.status === "pending" && (
                            <button
                              onClick={() => openSignModal(req)}
                              className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/20 transition-colors"
                              aria-label="Simulare semnare"
                            >
                              <CheckCircle className="h-3 w-3" />
                              Semnare
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Semnare (preview) ────────────────────────────────────────── */}
        {tab === "sign" && (
          <div className="max-w-2xl mx-auto">
            <div className="rounded-xl border border-border bg-card p-6 space-y-4">
              <div className="flex items-center gap-2 text-primary">
                <FileCheck className="h-5 w-5" />
                <h2 className="text-lg font-semibold">Previzualizare formular semnare</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Aceasta este interfața care ar fi văzută de tutore la primirea unui link de semnare.
                Selectați o cerere din tab-ul „Cereri" și apăsați „Semnare" pentru a simula procesul.
              </p>
              <div className="rounded-lg bg-muted/40 border border-border p-4 space-y-3">
                <p className="text-sm font-medium text-foreground">Acord foto/video (exemplu)</p>
                <p className="text-sm text-muted-foreground">
                  Subsemnatul/a, în calitate de tutore/reprezentant legal al elevului, îmi exprim
                  acordul/dezacordul pentru utilizarea imaginii copilului în materialele foto/video
                  realizate în cadrul activităților școlare și extrașcolare, inclusiv pentru publicare
                  pe site-ul și rețelele sociale ale instituției.
                </p>
                <div className="border-t border-border pt-3 space-y-2">
                  <label
                    className="block text-sm font-medium text-foreground"
                    htmlFor="sign-preview-name"
                  >
                    Semnez ca (nume complet) <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="sign-preview-name"
                    type="text"
                    placeholder="ex. Ion Popescu"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <div className="flex gap-2 pt-1">
                    <button className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                      Semnez
                    </button>
                    <button className="flex-1 rounded-lg border border-destructive/30 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors">
                      Refuz
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal: Template form ──────────────────────────────────────────────── */}
      {showTemplateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editingTemplate ? "Editează șablon" : "Șablon nou"}
        >
          <div className="w-full max-w-lg rounded-2xl bg-card border border-border shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {editingTemplate ? "Editează șablon" : "Șablon nou"}
              </h2>
              <button
                onClick={() => setShowTemplateModal(false)}
                className="rounded-full p-1 hover:bg-muted transition-colors"
                aria-label="Închide"
              >
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label
                  className="block text-sm font-medium text-foreground mb-1"
                  htmlFor="tmpl-title"
                >
                  Titlu <span className="text-destructive">*</span>
                </label>
                <input
                  id="tmpl-title"
                  type="text"
                  placeholder="ex. Acord foto/video"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div>
                <label
                  className="block text-sm font-medium text-foreground mb-1"
                  htmlFor="tmpl-category"
                >
                  Categorie
                </label>
                <select
                  id="tmpl-category"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">— fără categorie —</option>
                  <option value="photo_video">Foto/Video</option>
                  <option value="field_trip">Excursie</option>
                  <option value="medical">Medical</option>
                  <option value="gdpr">GDPR</option>
                </select>
              </div>

              <div>
                <label
                  className="block text-sm font-medium text-foreground mb-1"
                  htmlFor="tmpl-body"
                >
                  Conținut formular <span className="text-destructive">*</span>
                </label>
                <textarea
                  id="tmpl-body"
                  rows={6}
                  placeholder="Textul formularului de consimțământ..."
                  value={formBody}
                  onChange={(e) => setFormBody(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowTemplateModal(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
              >
                Anulează
              </button>
              <button
                onClick={saveTemplate}
                disabled={formSaving || !formTitle.trim() || !formBody.trim()}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {formSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : editingTemplate ? (
                  "Salvează"
                ) : (
                  "Creează"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Request form ───────────────────────────────────────────────── */}
      {showRequestModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Trimite cerere de consimțământ"
        >
          <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Trimite cerere</h2>
              <button
                onClick={() => setShowRequestModal(false)}
                className="rounded-full p-1 hover:bg-muted transition-colors"
                aria-label="Închide"
              >
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label
                  className="block text-sm font-medium text-foreground mb-1"
                  htmlFor="req-template"
                >
                  Șablon <span className="text-destructive">*</span>
                </label>
                <select
                  id="req-template"
                  value={reqTemplateId}
                  onChange={(e) => setReqTemplateId(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">— selectați șablon —</option>
                  {templates
                    .filter((t) => t.isActive)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                        {t.category
                          ? ` (${CATEGORY_LABELS[t.category] ?? t.category})`
                          : ""}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label
                  className="block text-sm font-medium text-foreground mb-1"
                  htmlFor="req-student"
                >
                  Elev <span className="text-destructive">*</span>
                </label>
                <select
                  id="req-student"
                  value={reqStudentId}
                  onChange={(e) => setReqStudentId(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">— selectați elev —</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName}
                    </option>
                  ))}
                </select>
              </div>

              {reqStudentId && (
                <div>
                  <p className="text-sm font-medium text-foreground mb-2">
                    Tutori ({reqGuardians.length})
                    {reqGuardians.length === 0 && (
                      <span className="ml-1 text-muted-foreground font-normal">
                        — niciun tutore adăugat
                      </span>
                    )}
                  </p>
                  <div className="space-y-2">
                    {reqGuardians.map((g) => (
                      <label
                        key={g.id}
                        className="flex items-center gap-2 rounded-lg border border-border p-2 cursor-pointer hover:bg-muted/40 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={reqSelectedGuardianIds.has(g.id)}
                          onChange={() => toggleGuardian(g.id)}
                          className="h-4 w-4 accent-primary"
                        />
                        <span className="text-sm text-foreground">{g.fullName}</span>
                        {g.relationship && (
                          <span className="text-xs text-muted-foreground">
                            ({g.relationship})
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowRequestModal(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
              >
                Anulează
              </button>
              <button
                onClick={sendRequests}
                disabled={
                  reqSending ||
                  !reqStudentId ||
                  !reqTemplateId ||
                  reqSelectedGuardianIds.size === 0
                }
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {reqSending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Trimite"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Sign ───────────────────────────────────────────────────────── */}
      {showSignModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Semnare formular"
        >
          <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Semnare formular</h2>
              <button
                onClick={() => setShowSignModal(null)}
                className="rounded-full p-1 hover:bg-muted transition-colors"
                aria-label="Închide"
              >
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <div className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground space-y-1">
              <p>
                <span className="font-medium text-foreground">Elev:</span>{" "}
                {showSignModal.studentName ?? "—"}
              </p>
              <p>
                <span className="font-medium text-foreground">Tutore:</span>{" "}
                {showSignModal.guardianName ?? "—"}
              </p>
              <p>
                <span className="font-medium text-foreground">Formular:</span>{" "}
                {showSignModal.templateTitle ?? "—"}
              </p>
            </div>

            <div className="space-y-2">
              <label
                className="block text-sm font-medium text-foreground"
                htmlFor="sign-name"
              >
                Semnez ca (nume complet) <span className="text-destructive">*</span>
              </label>
              <input
                id="sign-name"
                type="text"
                placeholder="ex. Ion Popescu"
                value={signName}
                onChange={(e) => setSignName(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              {signError && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {signError}
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSign}
                disabled={signSaving}
                className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {signSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                ) : (
                  "Semnez"
                )}
              </button>
              <button
                onClick={handleDecline}
                disabled={signSaving}
                className="flex-1 rounded-lg border border-destructive/30 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
              >
                Refuz
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
