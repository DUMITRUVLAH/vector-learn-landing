/**
 * CRM-106/CRM-107/CRM-109/CRM-111/CRM-113/CRM-114 — Cartonaș detaliu lead /app/leads/:id
 * Layout 2 coloane: col stânga sticky (info+acțiuni), col dreapta tab-uri
 * CRM-107: Tab Task-uri (CRUD + badge kanban), Tab Fișiere (upload/download)
 * CRM-109: Butoane Email/WhatsApp/Sună + logare apel + SendMessageModal + LogCallModal
 * CRM-111: Score badge hot/warm/cold, enhanced ConvertModal cu familie + plătitor
 * CRM-113: Valoare deal + datorie (editabile inline)
 * CRM-114: Companie + deal_name + contacte multiple (tab Contacte)
 */
import { useEffect, useState, useCallback, useRef } from "react";
import {
  Loader2, ArrowLeft, Pencil, Check, X, ChevronDown,
  Phone, Mail, Globe, Calendar, MessageCircle, UserPlus,
  AlertTriangle, CheckCircle2, Trash2, MoreVertical, ShieldOff,
  Clock, Paperclip, Upload, Download,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  getLead, updateLead, moveLeadStage,
  listInteractions, addInteraction, revokeConsent, deleteLead,
  listContacts, createContact, updateContact, deleteContact,
  type Lead, type LeadInteraction, type LeadContact,
} from "@/lib/api/leads";
import { fetchPipelineStages, type PipelineStage } from "@/lib/api/pipeline";
import {
  listTasks, createTask, updateTask, deleteTask,
  listAttachments, createAttachment, deleteAttachment,
  type LeadTask, type LeadAttachment,
} from "@/lib/api/tasks";
import { cn } from "@/lib/utils";
import { SendMessageModal, LogCallModal, type SendChannel } from "@/components/crm/CommModal";
import { ConvertModal, getScoreBadge, SCORE_BADGE_STYLES, SCORE_BADGE_LABELS } from "@/components/crm/ConvertModal";
import { scoreLead } from "@/lib/api/leads";

const SOURCE_LABEL: Record<string, string> = {
  webform: "Site web", manual: "Manual", facebook_ad: "Facebook",
  google_ads: "Google", referral: "Recomandare", phone_in: "Telefon",
  instagram: "Instagram", import: "Import", other: "Altul",
};

const LOST_REASON_PRESETS = [
  "Preț prea mare", "Concurență", "Nu mai e de interes",
  "S-a înscris în altă parte", "Lipsă timp", "Nu răspunde", "Altul",
];

const INTERACTION_LABEL: Record<string, string> = {
  note: "Notă", call: "Apel", email: "Email", whatsapp: "WhatsApp",
  sms: "SMS", meeting: "Întâlnire", stage_change: "Schimbare stadiu", system: "Sistem",
};

type Tab = "activity" | "tasks" | "files" | "gdpr" | "contacts";

// ─── Main Page ────────────────────────────────────────────────────────────────

interface LeadCardPageProps {
  leadId: string;
}

export function LeadCardPage({ leadId }: LeadCardPageProps) {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const [lead, setLead] = useState<Lead | null>(null);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [interactions, setInteractions] = useState<LeadInteraction[]>([]);
  const [tasks, setTasks] = useState<LeadTask[]>([]);
  const [attachments, setAttachments] = useState<LeadAttachment[]>([]);
  /** CRM-114: contacts */
  const [contacts, setContacts] = useState<LeadContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("activity");

  // Task form
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDue, setNewTaskDue] = useState("");
  const [addingTask, setAddingTask] = useState(false);

  // File upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<Partial<Lead>>({});
  const [saving, setSaving] = useState(false);

  // Note compose
  const [noteBody, setNoteBody] = useState("");
  const [submittingNote, setSubmittingNote] = useState(false);

  // Modals
  const [lostReasonModal, setLostReasonModal] = useState(false);
  const [pendingStage, setPendingStage] = useState<string | null>(null);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  // CRM-109: Communication modals
  const [sendModal, setSendModal] = useState<{ open: boolean; channel: SendChannel }>({
    open: false,
    channel: "email",
  });
  const [logCallModal, setLogCallModal] = useState(false);

  // CRM-111: Enhanced convert modal
  const [convertModal, setConvertModal] = useState(false);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [leadRes, stagesRes, interRes, tasksRes, attRes, contactsRes] = await Promise.all([
        getLead(leadId),
        fetchPipelineStages(),
        listInteractions(leadId),
        listTasks(leadId),
        listAttachments(leadId),
        listContacts(leadId),
      ]);
      setLead(leadRes);
      setStages(stagesRes.stages);
      setInteractions(interRes.items);
      setTasks(tasksRes.items);
      setAttachments(attRes.items);
      setContacts(contactsRes.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  // ─── Edit helpers ─────────────────────────────────────────────────────────
  const startEdit = () => {
    if (!lead) return;
    setEditDraft({
      fullName: lead.fullName,
      phone: lead.phone,
      email: lead.email,
      interestCourse: lead.interestCourse,
      notes: lead.notes,
      valueCents: lead.valueCents,
      debtCents: lead.debtCents,
      company: lead.company,
      dealName: lead.dealName,
    });
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); setEditDraft({}); };

  const saveEdit = async () => {
    if (!lead) return;
    setSaving(true);
    try {
      const updated = await updateLead(lead.id, editDraft);
      setLead(updated);
      setEditing(false);
      setEditDraft({});
      setToast({ kind: "success", message: "Modificări salvate" });
    } catch {
      setToast({ kind: "error", message: "Nu pot salva" });
    } finally {
      setSaving(false);
    }
  };

  // ─── Stage change ─────────────────────────────────────────────────────────
  const handleStageChange = async (newStage: string) => {
    if (!lead || newStage === lead.stage) return;
    const targetStage = stages.find((s) => s.key === newStage);
    const isLostStage = targetStage?.isLost ?? newStage === "lost";
    if (isLostStage) {
      setPendingStage(newStage);
      setLostReasonModal(true);
      return;
    }
    try {
      const updated = await moveLeadStage(lead.id, newStage);
      setLead(updated);
      const freshInter = await listInteractions(lead.id);
      setInteractions(freshInter.items);
      setToast({ kind: "success", message: `Mutat la "${targetStage?.label ?? newStage}"` });
    } catch {
      setToast({ kind: "error", message: "Nu pot schimba stadiu" });
    }
  };

  const handleLostConfirm = async (reason: string) => {
    if (!lead || !pendingStage) return;
    setLostReasonModal(false);
    try {
      const updated = await moveLeadStage(lead.id, pendingStage, reason);
      setLead(updated);
      const freshInter = await listInteractions(lead.id);
      setInteractions(freshInter.items);
      setToast({ kind: "success", message: "Lead marcat ca pierdut" });
    } catch {
      setToast({ kind: "error", message: "Nu pot muta lead-ul" });
    } finally {
      setPendingStage(null);
    }
  };

  // ─── Note ─────────────────────────────────────────────────────────────────
  const addNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lead || !noteBody.trim()) return;
    setSubmittingNote(true);
    try {
      const created = await addInteraction(lead.id, { type: "note", body: noteBody });
      setInteractions((prev) => [created, ...prev]);
      setNoteBody("");
      setToast({ kind: "success", message: "Notă adăugată" });
    } catch {
      setToast({ kind: "error", message: "Nu pot adăuga nota" });
    } finally {
      setSubmittingNote(false);
    }
  };

  // ─── CRM-109: Communication handlers ─────────────────────────────────────
  const handleOpenSend = (channel: SendChannel) => {
    if (!lead) return;
    if (lead.consentRevokedAt) {
      setToast({ kind: "error", message: "Consimțământul a fost retras — trimitere blocată." });
      return;
    }
    setSendModal({ open: true, channel });
  };

  const handleOpenCall = () => {
    if (!lead) return;
    // Open tel: link first (native phone dialer)
    if (lead.phone) {
      window.location.href = `tel:${lead.phone}`;
    }
    // Show log-call modal regardless (user logs after call ends)
    setLogCallModal(true);
  };

  const handleSendSuccess = (interaction: import("@/lib/api/leads").LeadInteraction) => {
    setInteractions((prev) => [interaction, ...prev]);
    setSendModal({ open: false, channel: "email" });
    setToast({ kind: "success", message: "Mesaj trimis și logat în timeline!" });
  };

  const handleLogCallSuccess = (interaction: import("@/lib/api/leads").LeadInteraction) => {
    setInteractions((prev) => [interaction, ...prev]);
    setLogCallModal(false);
    setToast({ kind: "success", message: "Apel logat în timeline!" });
  };

  // ─── Convert (CRM-111: open modal instead of confirm) ────────────────────
  const handleConvert = () => {
    if (!lead) return;
    setConvertModal(true);
  };

  const handleConvertSuccess = async (result: { studentId: string; familyId: string | null }) => {
    setConvertModal(false);
    setToast({
      kind: "success",
      message: `Convertit în student!${result.familyId ? " Familie creată." : ""}`,
    });
    void fetchAll();
  };

  // ─── Revoke consent ───────────────────────────────────────────────────────
  const handleRevokeConsent = async () => {
    if (!lead) return;
    if (!confirm("Retragi consimțământul GDPR? Acțiunea nu poate fi anulată.")) return;
    setRevoking(true);
    try {
      const updated = await revokeConsent(lead.id);
      setLead(updated);
      void fetchAll();
      setToast({ kind: "success", message: "Consimțământ retras" });
    } catch {
      setToast({ kind: "error", message: "Eroare la revocare" });
    } finally {
      setRevoking(false);
      setShowActionsMenu(false);
    }
  };

  // ─── Tasks ────────────────────────────────────────────────────────────────
  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lead || !newTaskTitle.trim()) return;
    setAddingTask(true);
    try {
      const created = await createTask(lead.id, {
        title: newTaskTitle.trim(),
        dueAt: newTaskDue || null,
      });
      setTasks((prev) => [...prev, created]);
      setNewTaskTitle("");
      setNewTaskDue("");
      setToast({ kind: "success", message: "Task adăugat" });
    } catch {
      setToast({ kind: "error", message: "Nu pot adăuga task-ul" });
    } finally {
      setAddingTask(false);
    }
  };

  const handleCompleteTask = async (task: LeadTask) => {
    if (!lead) return;
    try {
      const updated = await updateTask(lead.id, task.id, { status: "done" });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
      // Refresh interactions to show system entry
      const freshInter = await listInteractions(lead.id);
      setInteractions(freshInter.items);
      setToast({ kind: "success", message: "Task finalizat" });
    } catch {
      setToast({ kind: "error", message: "Nu pot finaliza task-ul" });
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!lead) return;
    try {
      await deleteTask(lead.id, taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch {
      setToast({ kind: "error", message: "Nu pot șterge task-ul" });
    }
  };

  // ─── Files ────────────────────────────────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !lead) return;
    setUploadingFile(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target?.result as string;
      createAttachment(lead.id, {
        fileName: file.name,
        fileUrl: dataUrl,
        mime: file.type || "application/octet-stream",
        sizeBytes: file.size,
      })
        .then((created) => {
          setAttachments((prev) => [...prev, created]);
          setToast({ kind: "success", message: "Fișier adăugat" });
        })
        .catch(() => setToast({ kind: "error", message: "Nu pot adăuga fișierul" }))
        .finally(() => { setUploadingFile(false); if (fileInputRef.current) fileInputRef.current.value = ""; });
    };
    reader.onerror = () => { setUploadingFile(false); setToast({ kind: "error", message: "Nu pot citi fișierul" }); };
    reader.readAsDataURL(file);
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!lead) return;
    try {
      await deleteAttachment(lead.id, attachmentId);
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
      setToast({ kind: "success", message: "Fișier șters" });
    } catch {
      setToast({ kind: "error", message: "Nu pot șterge fișierul" });
    }
  };

  // ─── GDPR Delete ─────────────────────────────────────────────────────────
  const handleGdprDelete = async () => {
    if (!lead) return;
    const confirmed = confirm(`ATENȚIE: Ștergere GDPR pentru "${lead.fullName}".\n\nToate datele personale (telefon, email, note) vor fi șterse definitiv. Această acțiune NU poate fi anulată.\n\nContinui?`);
    if (!confirmed) return;
    const confirmed2 = confirm("Confirmi din nou ștergerea datelor personale?");
    if (!confirmed2) return;
    setDeleting(true);
    try {
      await deleteLead(lead.id);
      setToast({ kind: "success", message: "Date personale șterse (GDPR)" });
      setTimeout(() => navigate("/app/leads"), 1500);
    } catch {
      setToast({ kind: "error", message: "Nu pot șterge datele" });
    } finally {
      setDeleting(false);
      setShowActionsMenu(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <AppShell pageTitle="Lead…" pageDescription="">
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Se încarcă…
        </div>
      </AppShell>
    );
  }

  if (error || !lead) {
    return (
      <AppShell pageTitle="Lead" pageDescription="">
        <div className="py-24 text-center text-sm text-destructive">{error ?? "Lead negăsit"}</div>
      </AppShell>
    );
  }

  const consentRevoked = !!lead.consentRevokedAt;
  const currentStage = stages.find((s) => s.key === lead.stage);
  const currentStageLabel = currentStage?.label ?? lead.stage;
  const displayTitle = lead.dealName ?? lead.fullName;

  return (
    <AppShell
      pageTitle={displayTitle}
      pageDescription={[lead.company, `${SOURCE_LABEL[lead.source] ?? lead.source}`, currentStageLabel].filter(Boolean).join(" · ")}
      actions={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate("/app/leads")}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted"
            aria-label="Înapoi la pipeline"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Pipeline</span>
          </button>
          {!editing ? (
            <button
              type="button"
              onClick={startEdit}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted"
              aria-label="Editează lead"
            >
              <Pencil className="h-4 w-4" />
              <span className="hidden sm:inline">Editează</span>
            </button>
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={cancelEdit} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted" aria-label="Anulează editare">
                <X className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => void saveEdit()} disabled={saving} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50" aria-label="Salvează modificări">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                <span className="hidden sm:inline">Salvează</span>
              </button>
            </div>
          )}
          {/* Actions menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowActionsMenu((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted"
              aria-label="Acțiuni suplimentare"
              aria-haspopup="true"
              aria-expanded={showActionsMenu}
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {showActionsMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowActionsMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-40 w-48 rounded-xl border border-border bg-card shadow-lg py-1">
                  {!consentRevoked && (
                    <button
                      type="button"
                      onClick={() => void handleRevokeConsent()}
                      disabled={revoking}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-amber-600 dark:text-amber-400"
                    >
                      <ShieldOff className="h-4 w-4" />
                      Retrage consimțământul
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleGdprDelete()}
                    disabled={deleting}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-destructive"
                  >
                    {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Șterge (GDPR)
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      }
    >
      {/* Consent revoked banner */}
      {consentRevoked && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive font-semibold">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          Consimțământ retras {lead.consentRevokedAt ? `pe ${new Date(lead.consentRevokedAt).toLocaleDateString("ro-RO")}` : ""} — acțiunile outbound sunt dezactivate
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
        {/* ─── LEFT COLUMN ─────────────────────────────────────────────── */}
        <aside className="lg:sticky lg:top-4 lg:self-start space-y-4">
          {/* Stage selector */}
          <section className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Stadiu</p>
              {editing ? (
                <select
                  value={editDraft.stage ?? lead.stage}
                  onChange={(e) => void handleStageChange(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  aria-label="Schimbă stadiu"
                >
                  {stages.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              ) : (
                <div className="flex items-center gap-2">
                  <div className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", currentStage?.color ?? "bg-muted")}>
                    {currentStageLabel}
                  </div>
                  {stages.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {}} // stage change is via dropdown in edit mode
                      className="ml-auto"
                      aria-hidden="true"
                    >
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Score badge (CRM-111) */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Scor lead</p>
              {lead.score != null ? (
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold",
                    SCORE_BADGE_STYLES[getScoreBadge(lead.score)]
                  )}>
                    {SCORE_BADGE_LABELS[getScoreBadge(lead.score)]} {lead.score}
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (!lead) return;
                    void scoreLead(lead.id).then((res) => {
                      setLead((prev) => prev ? { ...prev, score: res.score } : prev);
                      setToast({ kind: "success", message: `Scor calculat: ${res.score} (${res.badge})` });
                    });
                  }}
                  className="text-xs text-primary hover:underline"
                >
                  Calculează scor
                </button>
              )}
            </div>

            {/* Assigned to */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Responsabil</p>
              {editing ? (
                <input
                  type="text"
                  value={editDraft.assignedTo ?? lead.assignedTo ?? ""}
                  onChange={(e) => setEditDraft((d) => ({ ...d, assignedTo: e.target.value || null }))}
                  placeholder="UUID responsabil (opțional)"
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs font-mono"
                  aria-label="Responsabil (UUID)"
                />
              ) : (
                <p className="text-sm text-muted-foreground">{lead.assignedTo ? `${lead.assignedTo.slice(0, 8)}…` : "Neasignat"}</p>
              )}
            </div>
          </section>

          {/* Contact info */}
          <section className="rounded-xl border border-border bg-card p-4 space-y-3">
            {/* Full name */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Nume complet</p>
              {editing ? (
                <input
                  type="text"
                  required
                  minLength={2}
                  value={editDraft.fullName ?? lead.fullName}
                  onChange={(e) => setEditDraft((d) => ({ ...d, fullName: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  aria-label="Nume complet"
                />
              ) : (
                <p className="font-semibold text-sm">{lead.fullName}</p>
              )}
            </div>

            {/* Phone */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Telefon</p>
              {editing ? (
                <input
                  type="tel"
                  value={editDraft.phone ?? lead.phone ?? ""}
                  onChange={(e) => setEditDraft((d) => ({ ...d, phone: e.target.value || null }))}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  aria-label="Telefon"
                />
              ) : lead.phone ? (
                <div className="flex items-center justify-between gap-2">
                  <a
                    href={`tel:${lead.phone}`}
                    className={cn("flex items-center gap-1.5 text-sm font-medium text-primary hover:underline", consentRevoked && "pointer-events-none opacity-50")}
                    aria-disabled={consentRevoked}
                  >
                    <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                    {lead.phone}
                  </a>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={handleOpenCall}
                      disabled={consentRevoked}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-semibold hover:bg-muted disabled:opacity-40"
                      aria-label="Sună lead"
                      title="Sună + Loghează apel"
                    >
                      <Phone className="h-3 w-3" aria-hidden="true" />
                      Sună
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenSend("whatsapp")}
                      disabled={consentRevoked}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-semibold hover:bg-muted disabled:opacity-40"
                      aria-label="Trimite WhatsApp"
                      title="Trimite WhatsApp"
                    >
                      <MessageCircle className="h-3 w-3" aria-hidden="true" />
                      WA
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
            </div>

            {/* Email */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Email</p>
              {editing ? (
                <input
                  type="email"
                  value={editDraft.email ?? lead.email ?? ""}
                  onChange={(e) => setEditDraft((d) => ({ ...d, email: e.target.value || null }))}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  aria-label="Email"
                />
              ) : lead.email ? (
                <div className="flex items-center justify-between gap-2">
                  <a
                    href={`mailto:${lead.email}`}
                    className={cn("flex items-center gap-1.5 text-sm font-medium text-primary hover:underline min-w-0 truncate", consentRevoked && "pointer-events-none opacity-50")}
                    aria-disabled={consentRevoked}
                  >
                    <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{lead.email}</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => handleOpenSend("email")}
                    disabled={consentRevoked}
                    className="shrink-0 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-semibold hover:bg-muted disabled:opacity-40"
                    aria-label="Trimite email"
                    title="Trimite email"
                  >
                    <Mail className="h-3 w-3" aria-hidden="true" />
                    Email
                  </button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
            </div>

            {/* Interest course */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Curs de interes</p>
              {editing ? (
                <input
                  type="text"
                  value={editDraft.interestCourse ?? lead.interestCourse ?? ""}
                  onChange={(e) => setEditDraft((d) => ({ ...d, interestCourse: e.target.value || null }))}
                  placeholder="ex: Engleză B2"
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  aria-label="Curs de interes"
                />
              ) : (
                <p className="text-sm">{lead.interestCourse ?? "—"}</p>
              )}
            </div>

            {/* Source */}
            <div className="flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <p className="text-xs text-muted-foreground">{SOURCE_LABEL[lead.source] ?? lead.source}</p>
            </div>

            {/* UTM */}
            {(lead.utmSource || lead.utmMedium || lead.utmCampaign) && (
              <div className="rounded-md bg-muted/40 px-2 py-1.5 text-[10px] text-muted-foreground leading-relaxed">
                UTM: {lead.utmSource ?? "—"} / {lead.utmMedium ?? "—"} / {lead.utmCampaign ?? "—"}
              </div>
            )}

            {/* Created at */}
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <p className="text-xs text-muted-foreground">
                Creat: {new Date(lead.createdAt).toLocaleDateString("ro-RO")}
              </p>
            </div>

            {/* CRM-114: Company + Deal name */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Companie</p>
              {editing ? (
                <input
                  type="text"
                  value={editDraft.company ?? lead.company ?? ""}
                  onChange={(e) => setEditDraft((d) => ({ ...d, company: e.target.value || null }))}
                  placeholder="ex: S.R.L. Acme"
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  aria-label="Companie"
                />
              ) : (
                <p className="text-sm">{lead.company ?? "—"}</p>
              )}
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Titlu deal</p>
              {editing ? (
                <input
                  type="text"
                  value={editDraft.dealName ?? lead.dealName ?? ""}
                  onChange={(e) => setEditDraft((d) => ({ ...d, dealName: e.target.value || null }))}
                  placeholder="ex: Managementul Clinicii (opțional)"
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  aria-label="Titlu deal (override full_name)"
                />
              ) : (
                <p className="text-sm text-muted-foreground">{lead.dealName ?? "—"}</p>
              )}
            </div>

            {/* Notes */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Note</p>
              {editing ? (
                <textarea
                  rows={3}
                  value={editDraft.notes ?? lead.notes ?? ""}
                  onChange={(e) => setEditDraft((d) => ({ ...d, notes: e.target.value || null }))}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm resize-none"
                  aria-label="Note interne"
                />
              ) : (
                <p className="text-sm text-muted-foreground">{lead.notes ?? "—"}</p>
              )}
            </div>

            {/* CRM-113: Deal value + debt */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Valoare deal (€)</p>
                {editing ? (
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editDraft.valueCents !== undefined ? ((editDraft.valueCents ?? 0) / 100).toFixed(2) : ((lead.valueCents ?? 0) / 100).toFixed(2)}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value.replace(",", "."));
                      setEditDraft((d) => ({ ...d, valueCents: isNaN(val) ? 0 : Math.round(val * 100) }));
                    }}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    aria-label="Valoare deal în euro"
                  />
                ) : (
                  <p className="text-sm font-bold">
                    {(lead.valueCents ?? 0) > 0
                      ? new Intl.NumberFormat("ro-RO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format((lead.valueCents ?? 0) / 100)
                      : "—"}
                  </p>
                )}
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Datorie (€)</p>
                {editing ? (
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editDraft.debtCents !== undefined ? ((editDraft.debtCents ?? 0) / 100).toFixed(2) : ((lead.debtCents ?? 0) / 100).toFixed(2)}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value.replace(",", "."));
                      setEditDraft((d) => ({ ...d, debtCents: isNaN(val) ? 0 : Math.round(val * 100) }));
                    }}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    aria-label="Datorie în euro"
                  />
                ) : (
                  <p className={cn("text-sm font-semibold", (lead.debtCents ?? 0) > 0 ? "text-destructive" : "text-muted-foreground")}>
                    {(lead.debtCents ?? 0) > 0
                      ? new Intl.NumberFormat("ro-RO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format((lead.debtCents ?? 0) / 100)
                      : "—"}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Action buttons */}
          {!lead.convertedToStudentId && lead.stage !== "lost" && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleConvert}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-success px-4 py-2.5 text-sm font-semibold text-success-foreground hover:bg-success/90 disabled:opacity-50"
              >
                <UserPlus className="h-4 w-4" />
                Convertește în Student
              </button>
              <button
                type="button"
                onClick={() => { setPendingStage("lost"); setLostReasonModal(true); }}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-destructive/40 px-4 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10"
              >
                <X className="h-4 w-4" />
                Marchează pierdut
              </button>
            </div>
          )}
          {lead.convertedToStudentId && (
            <div className="rounded-xl bg-success/10 border border-success/30 px-4 py-3 text-sm text-success flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Convertit la {lead.convertedAt ? new Date(lead.convertedAt).toLocaleDateString("ro-RO") : "—"}
            </div>
          )}
        </aside>

        {/* ─── RIGHT COLUMN ────────────────────────────────────────────── */}
        <main>
          {/* Tab bar */}
          <div role="tablist" className="flex gap-1 border-b border-border mb-4 overflow-x-auto">
            {([
              ["activity", "Activitate"],
              ["tasks", tasks.length > 0 ? `Task-uri (${tasks.filter((t) => t.status === "open").length})` : "Task-uri"],
              ["files", `Fișiere${attachments.length > 0 ? ` (${attachments.length})` : ""}`],
              ["contacts", `Contacte${contacts.length > 0 ? ` (${contacts.length})` : ""}`],
              ["gdpr", "GDPR"],
            ] as [Tab, string][]).map(([t, label]) => (
              <button
                key={t}
                role="tab"
                type="button"
                aria-selected={activeTab === t}
                onClick={() => setActiveTab(t)}
                className={cn(
                  "whitespace-nowrap px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors shrink-0",
                  activeTab === t
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === "activity" && (
            <div role="tabpanel" aria-label="Activitate">
              {/* Note compose */}
              <form onSubmit={(e) => void addNote(e)} className="mb-4 flex gap-2">
                <input
                  type="text"
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  placeholder="Adaugă o notă internă…"
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  aria-label="Notă internă"
                />
                <button
                  type="submit"
                  disabled={submittingNote || !noteBody.trim()}
                  className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {submittingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : "Adaugă"}
                </button>
              </form>

              {/* Timeline */}
              {interactions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Niciun istoric încă.</p>
              ) : (
                <ul className="space-y-3" aria-label="Timeline interacțiuni">
                  {interactions.map((item) => (
                    <TimelineItem key={item.id} item={item} />
                  ))}
                </ul>
              )}
            </div>
          )}

          {activeTab === "tasks" && (
            <div role="tabpanel" aria-label="Task-uri" className="space-y-4">
              {/* Add task form */}
              <form onSubmit={(e) => void handleAddTask(e)} className="rounded-xl border border-border bg-card p-4 space-y-3">
                <p className="text-sm font-semibold">Adaugă task</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    required
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="Titlu task (ex: Sună mâine la 10:00)"
                    className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    aria-label="Titlu task nou"
                  />
                  <input
                    type="datetime-local"
                    value={newTaskDue}
                    onChange={(e) => setNewTaskDue(e.target.value)}
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                    aria-label="Scadență task"
                  />
                  <button
                    type="submit"
                    disabled={addingTask || !newTaskTitle.trim()}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 whitespace-nowrap"
                  >
                    {addingTask ? <Loader2 className="h-4 w-4 animate-spin" /> : "+ Adaugă"}
                  </button>
                </div>
              </form>

              {/* Task list */}
              {tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Niciun task.</p>
              ) : (
                <ul className="space-y-2" aria-label="Lista task-uri">
                  {tasks.map((task) => {
                    const isOverdue = task.status === "open" && task.dueAt && new Date(task.dueAt) < new Date();
                    return (
                      <li
                        key={task.id}
                        className={cn(
                          "flex items-start gap-3 rounded-lg border bg-card p-3",
                          isOverdue ? "border-destructive/40 bg-destructive/5" : "border-border",
                          task.status === "done" && "opacity-60"
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => task.status === "open" && void handleCompleteTask(task)}
                          disabled={task.status !== "open"}
                          className={cn(
                            "mt-0.5 h-5 w-5 shrink-0 rounded border transition-colors",
                            task.status === "done"
                              ? "border-success bg-success flex items-center justify-center"
                              : "border-border hover:border-primary"
                          )}
                          aria-label={task.status === "done" ? "Task finalizat" : `Finalizează: ${task.title}`}
                        >
                          {task.status === "done" && <Check className="h-3 w-3 text-success-foreground" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-sm font-medium", task.status === "done" && "line-through")}>{task.title}</p>
                          {task.dueAt && (
                            <p className={cn("text-xs mt-0.5 flex items-center gap-1", isOverdue ? "text-destructive font-semibold" : "text-muted-foreground")}>
                              <Clock className="h-3 w-3" aria-hidden="true" />
                              {isOverdue ? "Întârziat · " : ""}
                              {new Date(task.dueAt).toLocaleString("ro-RO")}
                            </p>
                          )}
                          {task.completedAt && (
                            <p className="text-[10px] text-success mt-0.5">Finalizat: {new Date(task.completedAt).toLocaleDateString("ro-RO")}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleDeleteTask(task.id)}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={`Șterge task: ${task.title}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {activeTab === "files" && (
            <div role="tabpanel" aria-label="Fișiere" className="space-y-4">
              {/* Upload button */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                  aria-label="Încarcă fișier atașament"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingFile}
                  className="inline-flex items-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/20 px-4 py-3 text-sm font-semibold hover:bg-muted/40 disabled:opacity-50 w-full justify-center"
                >
                  {uploadingFile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {uploadingFile ? "Se încarcă…" : "Încarcă fișier"}
                </button>
              </div>

              {/* Attachment list */}
              {attachments.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Niciun fișier atașat.</p>
              ) : (
                <ul className="space-y-2" aria-label="Lista fișiere">
                  {attachments.map((att) => (
                    <li key={att.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                      <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{att.fileName}</p>
                        <p className="text-[10px] text-muted-foreground">{att.mime} · {formatBytes(att.sizeBytes)}</p>
                      </div>
                      <div className="flex gap-1.5">
                        <a
                          href={att.fileUrl}
                          download={att.fileName}
                          className="rounded-md border border-border p-1.5 hover:bg-muted"
                          aria-label={`Descarcă ${att.fileName}`}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                        <button
                          type="button"
                          onClick={() => void handleDeleteAttachment(att.id)}
                          className="rounded-md border border-border p-1.5 hover:bg-muted text-muted-foreground hover:text-destructive"
                          aria-label={`Șterge ${att.fileName}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* CRM-114: Contacts tab */}
          {activeTab === "contacts" && (
            <ContactsTab
              leadId={leadId}
              contacts={contacts}
              setContacts={setContacts}
            />
          )}

          {activeTab === "gdpr" && (
            <div role="tabpanel" aria-label="GDPR" className="space-y-4">
              <section className="rounded-xl border border-border bg-card p-4 space-y-3">
                <h3 className="text-sm font-bold">Consimțământ GDPR</h3>
                <div className="grid sm:grid-cols-2 gap-3 text-sm">
                  <DetailRow label="Data consimțământ" value={lead.consentAt ? new Date(lead.consentAt).toLocaleString("ro-RO") : "—"} />
                  <DetailRow label="IP la consimțământ" value={lead.ipAtConsent ?? "—"} />
                  <DetailRow label="Text consimțământ" value={lead.consentText ?? "—"} />
                  <DetailRow
                    label="Status"
                    value={consentRevoked
                      ? `Retras pe ${new Date(lead.consentRevokedAt!).toLocaleString("ro-RO")}`
                      : "Activ"}
                    className={consentRevoked ? "text-destructive font-semibold" : "text-success font-semibold"}
                  />
                </div>
                {!consentRevoked && (
                  <button
                    type="button"
                    onClick={() => void handleRevokeConsent()}
                    disabled={revoking}
                    className="inline-flex items-center gap-2 rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-sm font-semibold text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 disabled:opacity-50"
                  >
                    {revoking ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />}
                    Retrage consimțământul
                  </button>
                )}
              </section>
              <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-2">
                <h3 className="text-sm font-bold text-destructive">Ștergere date (GDPR Art. 17)</h3>
                <p className="text-xs text-muted-foreground">Anonimizează toate datele personale (telefon, email, note). Acțiunea este ireversibilă.</p>
                <button
                  type="button"
                  onClick={() => void handleGdprDelete()}
                  disabled={deleting}
                  className="inline-flex items-center gap-2 rounded-md bg-destructive px-3 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                >
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Șterge date personale
                </button>
              </section>
            </div>
          )}
        </main>
      </div>

      {/* Lost reason modal */}
      {lostReasonModal && (
        <LostReasonModal
          onConfirm={(r) => void handleLostConfirm(r)}
          onCancel={() => { setLostReasonModal(false); setPendingStage(null); }}
        />
      )}

      {/* CRM-109: Send message modal */}
      {sendModal.open && lead && (
        <SendMessageModal
          lead={lead}
          defaultChannel={sendModal.channel}
          onSuccess={handleSendSuccess}
          onCancel={() => setSendModal({ open: false, channel: "email" })}
        />
      )}

      {/* CRM-109: Log call modal */}
      {logCallModal && lead && (
        <LogCallModal
          lead={lead}
          onSuccess={handleLogCallSuccess}
          onCancel={() => setLogCallModal(false)}
        />
      )}

      {/* CRM-111: Enhanced convert modal */}
      {convertModal && lead && (
        <ConvertModal
          lead={lead}
          onSuccess={handleConvertSuccess}
          onCancel={() => setConvertModal(false)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "fixed bottom-4 right-4 z-50 rounded-lg border shadow-lg px-4 py-3 text-sm font-medium",
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

// ─── Timeline Item ────────────────────────────────────────────────────────────

const INTERACTION_ICON: Record<string, React.ReactNode> = {
  note: <MessageCircle className="h-3 w-3 text-primary" aria-hidden="true" />,
  call: <Phone className="h-3 w-3 text-primary" aria-hidden="true" />,
  email: <Mail className="h-3 w-3 text-primary" aria-hidden="true" />,
  whatsapp: <MessageCircle className="h-3 w-3 text-success" aria-hidden="true" />,
  sms: <Phone className="h-3 w-3 text-primary" aria-hidden="true" />,
  stage_change: <ChevronDown className="h-3 w-3 text-muted-foreground" aria-hidden="true" />,
  system: <AlertTriangle className="h-3 w-3 text-muted-foreground" aria-hidden="true" />,
};

function TimelineItem({ item }: { item: LeadInteraction }) {
  const meta = item.metadata;

  return (
    <li className="flex gap-3">
      <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
        {INTERACTION_ICON[item.type] ?? <MessageCircle className="h-3 w-3 text-primary" aria-hidden="true" />}
      </div>
      <div className="flex-1 rounded-lg border border-border bg-card p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-foreground capitalize">
            {INTERACTION_LABEL[item.type] ?? item.type}
            {item.direction === "outbound" && (
              <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">(ieșit)</span>
            )}
            {item.direction === "inbound" && (
              <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">(primit)</span>
            )}
          </span>
          <time className="text-[10px] text-muted-foreground" dateTime={item.occurredAt}>
            {new Date(item.occurredAt).toLocaleString("ro-RO")}
          </time>
        </div>
        {item.body && (
          <p className="text-sm text-foreground/80 whitespace-pre-wrap">{item.body}</p>
        )}
        {/* Metadata badges */}
        {meta && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {typeof meta.template_id === "string" && (
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                template
              </span>
            )}
            {typeof meta.duration_seconds === "number" && meta.duration_seconds > 0 && (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {Math.floor(meta.duration_seconds / 60)}m {meta.duration_seconds % 60}s
              </span>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

// ─── Lost Reason Modal ────────────────────────────────────────────────────────

function LostReasonModal({ onConfirm, onCancel }: { onConfirm: (r: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState("");
  const [custom, setCustom] = useState("");
  const effectiveReason = reason === "Altul" ? custom.trim() : reason;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Motiv pierdere">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card shadow-xl">
        <div className="border-b border-border px-5 py-3.5 flex items-center justify-between sticky top-0 bg-card">
          <h2 className="text-base font-bold">Motiv pierdere</h2>
          <button type="button" onClick={onCancel} aria-label="Închide" className="rounded-md hover:bg-muted p-1">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm text-muted-foreground">Câmp obligatoriu pentru a marca lead-ul pierdut.</p>
          <div className="grid grid-cols-1 gap-2" role="radiogroup" aria-label="Selectează motiv pierdere">
            {LOST_REASON_PRESETS.map((preset) => (
              <label
                key={preset}
                className={cn(
                  "flex items-center gap-2 rounded-lg border p-2.5 cursor-pointer text-sm transition-colors",
                  reason === preset ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border hover:bg-muted/40"
                )}
              >
                <input type="radio" name="lost_reason" value={preset} checked={reason === preset} onChange={() => setReason(preset)} className="sr-only" />
                {preset}
              </label>
            ))}
          </div>
          {reason === "Altul" && (
            <div>
              <label htmlFor="custom-reason-card" className="block text-sm font-semibold mb-1">Detalii</label>
              <input id="custom-reason-card" type="text" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Descrie motivul…" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" autoFocus />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onCancel} className="rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">Anulează</button>
            <button type="button" disabled={!effectiveReason} onClick={() => onConfirm(effectiveReason)} className="rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50">
              Marchează pierdut
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Row ───────────────────────────────────────────────────────────────

function DetailRow({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-md bg-muted/40 p-2.5">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">{label}</p>
      <p className={cn("text-sm font-medium", className)}>{value}</p>
    </div>
  );
}

// ─── Format bytes ─────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── CRM-114: ContactsTab ─────────────────────────────────────────────────────

interface ContactsTabProps {
  leadId: string;
  contacts: LeadContact[];
  setContacts: React.Dispatch<React.SetStateAction<LeadContact[]>>;
}

function ContactsTab({ leadId, contacts, setContacts }: ContactsTabProps) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPrimary, setNewPrimary] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSubmitting(true);
    try {
      const created = await createContact(leadId, {
        fullName: newName.trim(),
        role: newRole || null,
        phone: newPhone || null,
        email: newEmail || null,
        isPrimary: newPrimary,
      });
      // If new contact is primary, reset others
      setContacts((prev) =>
        newPrimary
          ? [...prev.map((c) => ({ ...c, isPrimary: 0 })), created]
          : [...prev, created]
      );
      setNewName(""); setNewRole(""); setNewPhone(""); setNewEmail(""); setNewPrimary(false);
      setAdding(false);
      setToast("Contact adăugat");
    } catch {
      setToast("Nu pot adăuga contactul");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetPrimary = async (contact: LeadContact) => {
    try {
      await updateContact(leadId, contact.id, { isPrimary: true });
      setContacts((prev) => prev.map((c) => ({ ...c, isPrimary: c.id === contact.id ? 1 : 0 })));
    } catch {
      setToast("Nu pot seta contactul primar");
    }
  };

  const handleDelete = async (contactId: string) => {
    try {
      await deleteContact(leadId, contactId);
      setContacts((prev) => prev.filter((c) => c.id !== contactId));
    } catch {
      setToast("Nu pot șterge contactul");
    }
  };

  return (
    <div role="tabpanel" aria-label="Contacte" className="space-y-4">
      {toast && (
        <div role="status" className="text-sm text-muted-foreground">{toast}</div>
      )}

      {contacts.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground py-6 text-center">Niciun contact adăugat.</p>
      )}

      {contacts.length > 0 && (
        <ul className="space-y-2" aria-label="Lista contacte">
          {contacts.map((c) => (
            <li key={c.id} className="flex items-start gap-3 rounded-xl border border-border bg-card p-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">{c.fullName}</p>
                  {c.isPrimary === 1 && (
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                      Primar
                    </span>
                  )}
                </div>
                {c.role && <p className="text-[11px] text-muted-foreground mt-0.5">{c.role}</p>}
                {c.phone && (
                  <a href={`tel:${c.phone}`} className="text-xs text-primary hover:underline flex items-center gap-1 mt-0.5">
                    <Phone className="h-3 w-3" aria-hidden="true" />
                    {c.phone}
                  </a>
                )}
                {c.email && (
                  <a href={`mailto:${c.email}`} className="text-xs text-primary hover:underline flex items-center gap-1 mt-0.5">
                    <Mail className="h-3 w-3" aria-hidden="true" />
                    {c.email}
                  </a>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                {c.isPrimary !== 1 && (
                  <button
                    type="button"
                    onClick={() => void handleSetPrimary(c)}
                    className="rounded-md border border-border px-2 py-1 text-[11px] font-semibold hover:bg-muted"
                    title="Setează ca primar"
                  >
                    Primar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleDelete(c.id)}
                  className="rounded-md border border-border p-1.5 hover:bg-muted text-muted-foreground hover:text-destructive"
                  aria-label={`Șterge contact ${c.fullName}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <form onSubmit={(e) => void handleAdd(e)} className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
          <p className="text-sm font-bold">Contact nou</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="nc-name" className="block text-[11px] font-semibold mb-1">Nume *</label>
              <input id="nc-name" type="text" required value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" aria-label="Nume contact" />
            </div>
            <div>
              <label htmlFor="nc-role" className="block text-[11px] font-semibold mb-1">Rol</label>
              <input id="nc-role" type="text" value={newRole} onChange={(e) => setNewRole(e.target.value)} placeholder="decident/plătitor/utilizator" className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" aria-label="Rolul contactului" />
            </div>
            <div>
              <label htmlFor="nc-phone" className="block text-[11px] font-semibold mb-1">Telefon</label>
              <input id="nc-phone" type="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" aria-label="Telefon contact" />
            </div>
            <div>
              <label htmlFor="nc-email" className="block text-[11px] font-semibold mb-1">Email</label>
              <input id="nc-email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" aria-label="Email contact" />
            </div>
          </div>
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={newPrimary}
              onChange={(e) => setNewPrimary(e.target.checked)}
              className="h-4 w-4"
              aria-label="Contact primar"
            />
            Contact primar
          </label>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setAdding(false)} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">Anulează</button>
            <button type="submit" disabled={submitting || !newName.trim()} className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Adaugă"}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-sm font-semibold hover:bg-muted/40 w-full justify-center"
        >
          <UserPlus className="h-4 w-4" />
          Adaugă contact
        </button>
      )}
    </div>
  );
}
