/**
 * CRM-106/107/109/111/113/114/115/COMM-202 — Cartonaș detaliu lead /app/leads/:id
 * CRM-107: Task-uri + Fișiere
 * CRM-109: Email/WhatsApp/Sună + logare apel
 * CRM-111: Score badge, ConvertModal cu familie
 * CRM-113: Valoare deal + datorie (inline edit)
 * CRM-114: Companie + deal_name + contacte multiple (tab Contacte)
 * CRM-115: Tag-uri libere + câmpuri custom (tab Custom Fields)
 * COMM-202: Tab „Comunicare" cu log mesaje + buton „Mesaj nou" cu selectare template
 */
import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  Loader2, ArrowLeft, Pencil, Check, X, ChevronDown,
  Phone, Mail, Globe, Calendar, MessageCircle, UserPlus,
  AlertTriangle, CheckCircle2, Trash2, MoreVertical, ShieldOff,
  Clock, Paperclip, Upload, Download, FilePlus,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  getLead, updateLead, moveLeadStage,
  listInteractions, addInteraction, revokeConsent, deleteLead,
  listContacts, createContact, updateContact, deleteContact,
  listTags, addTag, removeTag,
  listFieldValues, upsertFieldValue, listCustomFields,
  getDedupBanner, matchCourses, convertLeadFromTrial,
  type Lead, type LeadInteraction, type LeadContact, type CustomField, type LeadFieldValue, type CourseMatch,
} from "@/lib/api/leads";
import { fetchPipelineStages, type PipelineStage } from "@/lib/api/pipeline";
import { listCourses, type Course } from "@/lib/api/lessons";
import { AssigneePicker, useAssigneeName } from "@/components/crm/AssigneePicker";
import {
  listTasks, createTask, updateTask, deleteTask,
  listAttachments, createAttachment, deleteAttachment,
  type LeadTask, type LeadAttachment,
} from "@/lib/api/tasks";
import { cn } from "@/lib/utils";
import { SendMessageModal, LogCallModal, type SendChannel } from "@/components/crm/CommModal";
import { ConvertModal } from "@/components/crm/ConvertModal";
import { scoreLead, type ScoreFactor } from "@/lib/api/leads";
import { CadencePanel } from "@/components/crm/CadencePanel";
import { UndoToast } from "@/components/crm/UndoToast";
import { crmDeleteLead } from "@/lib/api/audit";
// CRM-144: copy-to-clipboard button for phone / email
import { CopyButton } from "@/components/crm/CopyButton";
// CRM-145: score explainer with factors breakdown
import { ScoreExplain } from "@/components/crm/ScoreExplain";
// CRM-133: merge duplicate leads
import { MergeLeadModal } from "@/components/crm/MergeLeadModal";
// GAP-003: Trial lessons
import { getTrialLessons, listCourses, type Lesson, type Course } from "@/lib/api/lessons";

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

type Tab = "activity" | "tasks" | "files" | "contacts" | "fields" | "comunicare" | "gdpr";

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
  /** CRM-115: tags */
  const [tags, setTags] = useState<string[]>([]);
  /** CRM-115: custom fields + values */
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [fieldValues, setFieldValues] = useState<LeadFieldValue[]>([]);
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
  // CRM-134: tenant members for @mention autocomplete
  const [tenantMembers, setTenantMembers] = useState<TenantMember[]>([]);

  // Modals
  const [lostReasonModal, setLostReasonModal] = useState(false);
  const [pendingStage, setPendingStage] = useState<string | null>(null);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  // CRM-127: Undo token after CRM delete
  const [undoToken, setUndoToken] = useState<{ token: string; expiresAt: string } | null>(null);

  // CRM-109: Communication modals
  const [sendModal, setSendModal] = useState<{ open: boolean; channel: SendChannel }>({
    open: false,
    channel: "email",
  });
  const [logCallModal, setLogCallModal] = useState(false);

  // CRM-111: Enhanced convert modal
  const [convertModal, setConvertModal] = useState(false);

  // GAP-002: Course matching panel
  const [matchPanel, setMatchPanel] = useState(false);
  const [matchResults, setMatchResults] = useState<CourseMatch[]>([]);
  const [matchLoading, setMatchLoading] = useState(false);

  // GAP-003: Trial lessons for this lead
  const [trialLessons, setTrialLessons] = useState<Lesson[]>([]);

  // GAP-004: Convert-trial modal
  const [convertTrialModal, setConvertTrialModal] = useState(false);
  const [convertTrialCourseId, setConvertTrialCourseId] = useState("");
  const [convertTrialPackage, setConvertTrialPackage] = useState(false);
  const [convertTrialLoading, setConvertTrialLoading] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);

  // CRM-145: score factors for explainer; auto-score if missing
  const [scoreFactors, setScoreFactors] = useState<ScoreFactor[]>([]);
  const [scoreLoading, setScoreLoading] = useState(false);

  const runScore = async (id: string) => {
    setScoreLoading(true);
    try {
      const res = await scoreLead(id);
      // Defensive: a malformed/empty response must never crash the card.
      // The auto-score effect fires on mount for many existing flows.
      if (res && typeof res.score === "number") {
        setLead((prev) => prev ? { ...prev, score: res.score } : prev);
        setScoreFactors(res.factors ?? []);
      }
    } catch { /* ignore — user can retry manually */ }
    finally { setScoreLoading(false); }
  };

  // CRM-133: Duplicate detection banner
  const [duplicates, setDuplicates] = useState<Lead[]>([]);
  const [mergeModal, setMergeModal] = useState<{ open: boolean; duplicate: Lead | null }>({
    open: false, duplicate: null,
  });

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
      const [leadRes, stagesRes, interRes, tasksRes, attRes, contactsRes, tagsRes, fieldValuesRes, membersRes] = await Promise.all([
        getLead(leadId),
        fetchPipelineStages(),
        listInteractions(leadId),
        listTasks(leadId),
        listAttachments(leadId),
        listContacts(leadId),
        listTags(leadId),
        listFieldValues(leadId),
        getTenantMembers().catch(() => ({ members: [] })),
      ]);
      setLead(leadRes);
      setStages(stagesRes.stages);
      setInteractions(interRes.items);
      setTasks(tasksRes.items);
      setAttachments(attRes.items);
      setContacts(contactsRes.items);
      setTags(tagsRes.tags);
      setCustomFields(fieldValuesRes.fields);
      setFieldValues(fieldValuesRes.values);
      setTenantMembers(membersRes.members);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  // GAP-003: Load trial lessons for this lead
  useEffect(() => {
    getTrialLessons(leadId)
      .then((res) => setTrialLessons(res.items))
      .catch(() => setTrialLessons([]));
  }, [leadId]);

  // CRM-145: auto-score once when lead loads with no score (never loops)
  const autoScoreFiredRef = useRef(false);
  useEffect(() => {
    if (!lead || lead.score != null || autoScoreFiredRef.current) return;
    autoScoreFiredRef.current = true;
    void runScore(lead.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead]);

  // CRM-133: Check for duplicates after lead is loaded
  useEffect(() => {
    if (!lead || (!lead.phone && !lead.email)) return;
    // Defensive: wrap in Promise.resolve so a malformed/empty response never crashes the card.
    Promise.resolve(getDedupBanner({ phone: lead.phone, email: lead.email, excludeId: lead.id }))
      .then((res) => setDuplicates(res?.duplicates ?? []))
      .catch(() => {
        // Fail silently — banner doesn't appear on error (AC9)
        setDuplicates([]);
      });
  }, [lead?.id, lead?.phone, lead?.email]); // eslint-disable-line react-hooks/exhaustive-deps

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
      preferredDays: (lead as unknown as Record<string, unknown>).preferredDays as number[] | null ?? null,
      preferredTimeStart: (lead as unknown as Record<string, unknown>).preferredTimeStart as string | null ?? null,
      preferredTimeEnd: (lead as unknown as Record<string, unknown>).preferredTimeEnd as string | null ?? null,
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

  // CRM-133: Merge lead success
  const handleMergeSuccess = (keptLead: Lead) => {
    setMergeModal({ open: false, duplicate: null });
    setDuplicates([]);
    setLead(keptLead);
    setToast({ kind: "success", message: "Leaduri fuzionate. Istoricul a fost transferat." });
    void fetchAll();
  };

  // ─── GAP-002: Match courses ────────────────────────────────────────────────
  const handleFindCourse = async () => {
    if (!lead) return;
    setMatchPanel(true);
    setMatchLoading(true);
    try {
      const res = await matchCourses(lead.id);
      setMatchResults(res.matches);
    } catch {
      setMatchResults([]);
    } finally {
      setMatchLoading(false);
    }
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

  // GAP-004: Convert-trial submit
  const handleConvertTrialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lead || !convertTrialCourseId) return;
    setConvertTrialLoading(true);
    try {
      const res = await convertLeadFromTrial(lead.id, {
        courseId: convertTrialCourseId,
        createPackage: convertTrialPackage,
      });
      setConvertTrialModal(false);
      setToast({
        kind: "success",
        message: `Convertit! Student înrolat în ${res.enrolledLessons} lecții.${res.packageCreated ? " Pachet creat." : ""}`,
      });
      void fetchAll();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Eroare la conversie";
      setToast({ kind: "error", message: msg });
    } finally {
      setConvertTrialLoading(false);
    }
  };

  // GAP-004: Load courses when modal opens
  const handleOpenConvertTrialModal = () => {
    setConvertTrialModal(true);
    if (courses.length === 0) {
      listCourses()
        .then((res) => setCourses(res.items))
        .catch(() => setCourses([]));
    }
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

  // ─── CRM-127: CRM Delete (with undo) ─────────────────────────────────────
  const handleCrmDelete = async () => {
    if (!lead) return;
    if (!confirm(`Ştergi lead-ul "${lead.fullName}" din CRM? Poți anula în 30 secunde.`)) return;
    setDeleting(true);
    try {
      const res = await crmDeleteLead(lead.id);
      setUndoToken({ token: res.undoToken, expiresAt: res.expiresAt });
      setTimeout(() => navigate("/app/leads"), 500);
    } catch {
      setToast({ kind: "error", message: "Nu pot șterge lead-ul" });
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
          {/* CONTRACT-501: Generate contract button */}
          <button
            type="button"
            onClick={() => {
              const params = new URLSearchParams();
              if (lead.fullName) params.set("name", lead.fullName);
              if (lead.interestCourse) params.set("course", lead.interestCourse);
              if (lead.valueCents) params.set("valueCents", String(lead.valueCents));
              params.set("leadId", lead.id);
              navigate(`/app/contracts?${params.toString()}`);
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            aria-label="Generează contract din lead"
          >
            <FilePlus className="h-4 w-4" />
            <span className="hidden sm:inline">Contract</span>
          </button>
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
                  {/* CRM-127: CRM delete with undo */}
                  <button
                    type="button"
                    onClick={() => void handleCrmDelete()}
                    disabled={deleting}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-muted-foreground"
                  >
                    {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Şterge din CRM
                  </button>
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

      {/* CRM-133: Duplicate detection banner */}
      {duplicates.length > 0 && duplicates[0] && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-400/50 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-300"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <span className="font-semibold">Posibil duplicat:</span>
          <span>{duplicates[0].fullName}</span>
          <span className="text-amber-600 dark:text-amber-400">·</span>
          <span>{duplicates[0].stage}</span>
          {duplicates[0].createdAt && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              · {new Date(duplicates[0].createdAt).toLocaleDateString("ro-RO")}
            </span>
          )}
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={() => navigate(`/app/leads/${duplicates[0]!.id}`)}
              className="rounded-md border border-amber-400/60 bg-amber-100 dark:bg-amber-900/30 px-3 py-1 text-xs font-semibold hover:bg-amber-200 dark:hover:bg-amber-900/50 text-amber-800 dark:text-amber-200"
              aria-label={`Vezi cartonașul lead-ului duplicat ${duplicates[0].fullName}`}
            >
              Vezi cartonașul
            </button>
            <button
              type="button"
              onClick={() => setMergeModal({ open: true, duplicate: duplicates[0]! })}
              className="rounded-md bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700"
              aria-label="Fuzionează cu lead-ul duplicat"
            >
              Fuzionează
            </button>
          </div>
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

            {/* Score badge (CRM-111, CRM-145: auto-score + explainer) */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Scor lead</p>
              {lead.score != null ? (
                <ScoreExplain
                  score={lead.score}
                  factors={scoreFactors}
                  recalculating={scoreLoading}
                  onRecalculate={() => void runScore(lead.id)}
                />
              ) : scoreLoading ? (
                <p className="text-xs text-muted-foreground">Se calculează...</p>
              ) : (
                <button
                  type="button"
                  onClick={() => void runScore(lead.id)}
                  className="text-xs text-primary hover:underline"
                >
                  Calculează scor
                </button>
              )}
            </div>

            {/* Assigned to — CRM-137: AssigneePicker replaces UUID text input */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Responsabil</p>
              {editing ? (
                <AssigneePicker
                  id="lead-assignee"
                  value={editDraft.assignedTo ?? lead.assignedTo}
                  onChange={(userId) => setEditDraft((d) => ({ ...d, assignedTo: userId }))}
                  ariaLabel="Responsabil"
                  className="w-full"
                />
              ) : (
                <AssigneeDisplay assignedTo={lead.assignedTo} />
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
                  <div className="flex gap-1 items-center">
                    {/* CRM-144: copy phone to clipboard */}
                    <CopyButton value={lead.phone} ariaLabel="Copiază telefonul" />
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
                  <div className="flex gap-1 items-center shrink-0">
                    {/* CRM-144: copy email to clipboard */}
                    <CopyButton value={lead.email} ariaLabel="Copiază email-ul" />
                    <button
                      type="button"
                      onClick={() => handleOpenSend("email")}
                      disabled={consentRevoked}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-semibold hover:bg-muted disabled:opacity-40"
                      aria-label="Trimite email"
                      title="Trimite email"
                    >
                      <Mail className="h-3 w-3" aria-hidden="true" />
                      Email
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
            </div>

            {/* INTEG-101: Curs de interes — selector din lista de cursuri reale */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Curs (din catalog)</p>
              {editing ? (
                <select
                  value={editDraft.courseId ?? ""}
                  onChange={(e) => setEditDraft((d) => ({ ...d, courseId: e.target.value || null }))}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Curs de interes (catalog)"
                >
                  <option value="">— Neselectat —</option>
                  {courseOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              ) : (
                <p className="text-sm">{lead.courseName ?? (lead.courseId ? lead.courseId.slice(0, 8) + "…" : "—")}</p>
              )}
            </div>

            {/* Interest course — text fallback / notes */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Alte mențiuni curs</p>
              {editing ? (
                <input
                  type="text"
                  value={editDraft.interestCourse ?? lead.interestCourse ?? ""}
                  onChange={(e) => setEditDraft((d) => ({ ...d, interestCourse: e.target.value || null }))}
                  placeholder="ex: Engleză B2 (notițe libere)"
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  aria-label="Alte mențiuni curs"
                />
              ) : (
                <p className="text-sm text-muted-foreground">{lead.interestCourse ?? "—"}</p>
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
                <input type="text" value={editDraft.company ?? lead.company ?? ""} onChange={(e) => setEditDraft((d) => ({ ...d, company: e.target.value || null }))} placeholder="ex: S.R.L. Acme" className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" aria-label="Companie" />
              ) : (
                <p className="text-sm">{lead.company ?? "—"}</p>
              )}
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Titlu deal</p>
              {editing ? (
                <input type="text" value={editDraft.dealName ?? lead.dealName ?? ""} onChange={(e) => setEditDraft((d) => ({ ...d, dealName: e.target.value || null }))} placeholder="opțional, override full_name" className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" aria-label="Titlu deal" />
              ) : (
                <p className="text-sm text-muted-foreground">{lead.dealName ?? "—"}</p>
              )}
            </div>

            {/* GAP-001: Slot preferat orar */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Disponibilitate preferată</p>
              {editing ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1" role="group" aria-label="Zile preferate">
                    {[
                      { label: "L", full: "Luni", val: 1 },
                      { label: "M", full: "Marți", val: 2 },
                      { label: "Mi", full: "Miercuri", val: 3 },
                      { label: "J", full: "Joi", val: 4 },
                      { label: "V", full: "Vineri", val: 5 },
                      { label: "S", full: "Sâmbătă", val: 6 },
                      { label: "D", full: "Duminică", val: 7 },
                    ].map(({ label, full, val }) => {
                      const days = (editDraft.preferredDays as number[] | null | undefined) ?? [];
                      const active = days.includes(val);
                      return (
                        <button
                          key={val}
                          type="button"
                          aria-label={full}
                          aria-pressed={active}
                          onClick={() => {
                            const cur = (editDraft.preferredDays as number[] | null | undefined) ?? [];
                            const next = active ? cur.filter((d) => d !== val) : [...cur, val].sort((a, b) => a - b);
                            setEditDraft((d) => ({ ...d, preferredDays: next.length > 0 ? next : null }));
                          }}
                          className={cn(
                            "h-7 w-7 rounded-full text-xs font-medium border transition-colors",
                            active
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background text-muted-foreground border-input hover:border-primary"
                          )}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-2 items-center">
                    <label className="text-xs text-muted-foreground w-12 shrink-0">De la:</label>
                    <input
                      type="time"
                      value={(editDraft.preferredTimeStart as string | null | undefined) ?? ""}
                      onChange={(e) => setEditDraft((d) => ({ ...d, preferredTimeStart: e.target.value || null }))}
                      className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                      aria-label="Ora de start preferată"
                    />
                    <label className="text-xs text-muted-foreground w-12 shrink-0">Până la:</label>
                    <input
                      type="time"
                      value={(editDraft.preferredTimeEnd as string | null | undefined) ?? ""}
                      onChange={(e) => setEditDraft((d) => ({ ...d, preferredTimeEnd: e.target.value || null }))}
                      className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                      aria-label="Ora de sfârșit preferată"
                    />
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  {(() => {
                    const days = (lead as unknown as Record<string, unknown>).preferredDays as number[] | null;
                    const start = (lead as unknown as Record<string, unknown>).preferredTimeStart as string | null;
                    const end = (lead as unknown as Record<string, unknown>).preferredTimeEnd as string | null;
                    const dayNames = ["", "Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă", "Duminică"];
                    const hasDays = days && days.length > 0;
                    const hasTime = start || end;
                    if (!hasDays && !hasTime) return "—";
                    return (
                      <>
                        {hasDays && <span>{days!.map((d) => dayNames[d]).join(", ")}</span>}
                        {hasDays && hasTime && <span className="mx-1">·</span>}
                        {hasTime && <span>{start ?? "—"}–{end ?? "—"}</span>}
                      </>
                    );
                  })()}
                </div>
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

            {/* CRM-113: Value + debt */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Valoare deal (€)</p>
                {editing ? (
                  <input type="number" min="0" step="0.01" value={editDraft.valueCents !== undefined ? ((editDraft.valueCents ?? 0) / 100).toFixed(2) : ((lead.valueCents ?? 0) / 100).toFixed(2)} onChange={(e) => { const v = parseFloat(e.target.value.replace(",", ".")); setEditDraft((d) => ({ ...d, valueCents: isNaN(v) ? 0 : Math.round(v * 100) })); }} className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" aria-label="Valoare deal în euro" />
                ) : (
                  <p className="text-sm font-bold">{(lead.valueCents ?? 0) > 0 ? new Intl.NumberFormat("ro-RO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format((lead.valueCents ?? 0) / 100) : "—"}</p>
                )}
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Datorie (€)</p>
                {editing ? (
                  <input type="number" min="0" step="0.01" value={editDraft.debtCents !== undefined ? ((editDraft.debtCents ?? 0) / 100).toFixed(2) : ((lead.debtCents ?? 0) / 100).toFixed(2)} onChange={(e) => { const v = parseFloat(e.target.value.replace(",", ".")); setEditDraft((d) => ({ ...d, debtCents: isNaN(v) ? 0 : Math.round(v * 100) })); }} className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" aria-label="Datorie în euro" />
                ) : (
                  <p className={cn("text-sm font-semibold", (lead.debtCents ?? 0) > 0 ? "text-destructive" : "text-muted-foreground")}>{(lead.debtCents ?? 0) > 0 ? new Intl.NumberFormat("ro-RO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format((lead.debtCents ?? 0) / 100) : "—"}</p>
                )}
              </div>
            </div>

            {/* CRM-115: Tags */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Tag-uri</p>
              <TagsInline
                leadId={leadId}
                tags={tags}
                setTags={setTags}
              />
            </div>
          </section>

          {/* Action buttons */}
          {!lead.convertedToStudentId && lead.stage !== "lost" && (
            <div className="space-y-2">
              {/* GAP-002: Find matching course */}
              <button
                type="button"
                onClick={handleFindCourse}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-primary/40 px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/10"
              >
                <Calendar className="h-4 w-4" />
                Găsește grupă
              </button>
              {/* GAP-004: Convert-from-trial button — visible only when lead has at least one trial lesson */}
              {trialLessons.length > 0 && (
                <button
                  type="button"
                  onClick={handleOpenConvertTrialModal}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-success px-4 py-2.5 text-sm font-semibold text-success-foreground hover:bg-success/90"
                >
                  <UserPlus className="h-4 w-4" />
                  Convertește din Trial
                </button>
              )}
              <button
                type="button"
                onClick={handleConvert}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-success/60 px-4 py-2.5 text-sm font-semibold text-success hover:bg-success/10 disabled:opacity-50"
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

          {/* GAP-002: Match panel */}
          {matchPanel && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Grupe compatibile</p>
                <button
                  type="button"
                  onClick={() => setMatchPanel(false)}
                  aria-label="Închide panoul de potrivire"
                  className="rounded-md hover:bg-muted p-1"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {matchLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Se caută grupe...
                </div>
              ) : matchResults.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nu s-au găsit grupe compatibile. Adaugă curs de interes și disponibilitate preferată pe lead.</p>
              ) : (
                <ul className="space-y-2">
                  {matchResults.map((m) => (
                    <li key={m.courseId} className="rounded-lg border border-border bg-background p-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold truncate">{m.courseName}</p>
                        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                          Scor {m.compatibilityScore}
                        </span>
                      </div>
                      {m.level && <p className="text-xs text-muted-foreground">Nivel: {m.level}</p>}
                      {m.teacherName && <p className="text-xs text-muted-foreground">Profesor: {m.teacherName}</p>}
                      {m.nextSlot && (
                        <p className="text-xs text-muted-foreground">
                          Următor slot: {new Date(m.nextSlot).toLocaleDateString("ro-RO", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      )}
                      {m.vacancies !== null && (
                        <p className={cn("text-xs font-medium", m.vacancies > 0 ? "text-success" : "text-warning")}>
                          {m.vacancies > 0 ? `${m.vacancies} locuri libere` : "Grupă plină"}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {/* GAP-003: Trial lessons section */}
          {(trialLessons.length > 0 || lead.stage === "trial") && (
            <section className="rounded-xl border border-border bg-card p-4 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Lecții Trial ({trialLessons.length})
              </p>
              {trialLessons.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nicio lecție trial programată.</p>
              ) : (
                <ul className="space-y-2">
                  {trialLessons.map((l) => (
                    <li key={l.id} className="rounded-lg border border-border bg-background p-2.5 text-xs space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold truncate">{l.courseName}</p>
                        <span className={cn(
                          "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold",
                          l.trialResult === "interested" ? "bg-success/15 text-success"
                            : l.trialResult === "not_interested" ? "bg-destructive/15 text-destructive"
                            : l.trialResult === "no_show" ? "bg-muted text-muted-foreground"
                            : "bg-warning/15 text-warning"
                        )}>
                          {l.trialResult === "interested" ? "Interesat"
                            : l.trialResult === "not_interested" ? "Neinteresat"
                            : l.trialResult === "no_show" ? "Neprezent"
                            : "În așteptare"}
                        </span>
                      </div>
                      <p className="text-muted-foreground">{l.teacherName} · {new Date(l.scheduledAt).toLocaleDateString("ro-RO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* CRM-148: converted block → link to student */}
          {lead.convertedToStudentId && (
            <div className="rounded-xl bg-success/10 border border-success/30 px-4 py-3 text-sm text-success flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Convertit la {lead.convertedAt ? new Date(lead.convertedAt).toLocaleDateString("ro-RO") : "—"}
              </span>
              <button
                type="button"
                onClick={() => navigate(`/app/students/${lead.convertedToStudentId}`)}
                className="text-success underline underline-offset-2 font-semibold hover:opacity-80 whitespace-nowrap min-h-[44px] flex items-center"
                aria-label="Vezi fișa studentului"
              >
                Vezi studentul →
              </button>
            </div>
          )}

          {/* CRM-126: Cadence panel */}
          <section className="rounded-xl border border-border bg-card p-4 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Follow-up Cadences
            </p>
            <CadencePanel leadId={leadId} />
          </section>
        </aside>

        {/* ─── RIGHT COLUMN ────────────────────────────────────────────── */}
        <main>
          {/* Tab bar */}
          <div role="tablist" className="flex gap-1 border-b border-border mb-4 overflow-x-auto">
            {([
              ["activity", "Activitate"],
              ["tasks", taskTabLabel],
              ["files", `Fișiere${attachments.length > 0 ? ` (${attachments.length})` : ""}`],
              ["contacts", `Contacte${contacts.length > 0 ? ` (${contacts.length})` : ""}`],
              ["fields", `Câmpuri${fieldValues.length > 0 ? ` (${fieldValues.length})` : ""}`],
              ["comunicare", `Comunicare${commMessages.length > 0 ? ` (${commMessages.length})` : ""}`],
              ["gdpr", "GDPR"],
            ] as [Tab, React.ReactNode][]).map(([t, label]) => (
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
              <form onSubmit={(e) => void addNote(e)} className="mb-4">
                <MentionTextarea
                  id="note-input"
                  value={noteBody}
                  onChange={setNoteBody}
                  members={tenantMembers}
                  placeholder="Adaugă o notă internă… (@ pentru a menționa un coleg)"
                  disabled={submittingNote}
                  rows={2}
                  className="mb-2"
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={submittingNote || !noteBody.trim()}
                    className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {submittingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : "Adaugă"}
                  </button>
                </div>
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
            <ContactsTab leadId={leadId} contacts={contacts} setContacts={setContacts} />
          )}

          {/* CRM-115: Custom fields tab */}
          {activeTab === "fields" && (
            <FieldsTab
              leadId={leadId}
              customFields={customFields}
              fieldValues={fieldValues}
              setFieldValues={setFieldValues}
            />
          )}

          {/* COMM-202: Comunicare tab */}
          {activeTab === "comunicare" && lead && (
            <ComunicareTab
              lead={lead}
              messages={commMessages}
              consentRevoked={consentRevoked}
              onNewMessage={() => setComposeModal(true)}
              onMessageSent={(msg) => setCommMessages((prev) => [msg, ...prev])}
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

      {/* GAP-004: Convert-from-trial modal */}
      {convertTrialModal && lead && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Convertire din trial"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div className="absolute inset-0 bg-black/50" onClick={() => setConvertTrialModal(false)} />
          <div className="relative w-full max-w-md rounded-2xl bg-card border border-border p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Convertește din Trial</h2>
              <button
                type="button"
                onClick={() => setConvertTrialModal(false)}
                aria-label="Închide"
                className="rounded-md p-1 hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              Lead-ul va fi convertit în student activ și înrolat în lecțiile viitoare ale grupei selectate.
            </p>
            <form onSubmit={handleConvertTrialSubmit} className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="trial-course-select" className="text-sm font-medium">
                  Grupă / Curs
                </label>
                <select
                  id="trial-course-select"
                  value={convertTrialCourseId}
                  onChange={(e) => setConvertTrialCourseId(e.target.value)}
                  required
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Selectează grupa...</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.level ? ` (${c.level})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={convertTrialPackage}
                  onChange={(e) => setConvertTrialPackage(e.target.checked)}
                  className="h-4 w-4 rounded"
                />
                <span className="text-sm">Creează pachet de 10 lecții la conversie</span>
              </label>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setConvertTrialModal(false)}
                  className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted"
                >
                  Anulează
                </button>
                <button
                  type="submit"
                  disabled={!convertTrialCourseId || convertTrialLoading}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-success px-4 py-2.5 text-sm font-semibold text-success-foreground hover:bg-success/90 disabled:opacity-50"
                >
                  {convertTrialLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  Convertește
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CRM-133: Merge lead modal */}
      {mergeModal.open && mergeModal.duplicate && lead && (
        <MergeLeadModal
          currentLead={lead}
          duplicateLead={mergeModal.duplicate}
          onSuccess={handleMergeSuccess}
          onCancel={() => setMergeModal({ open: false, duplicate: null })}
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
      {/* CRM-127: Undo toast */}
      {undoToken && (
        <UndoToast
          undoToken={undoToken.token}
          expiresAt={undoToken.expiresAt}
          message="Lead şters"
          onUndo={() => {
            setUndoToken(null);
            navigate("/app/leads");
          }}
          onDismiss={() => setUndoToken(null)}
        />
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

/** CRM-134: Renders note body with @mentions highlighted. */
function renderBodyWithMentions(body: string): React.ReactNode {
  const parts = body.split(/(@[A-Za-zÀ-ž]+(?: [A-Za-zÀ-ž]+)*)/g);
  return parts.map((part, i) =>
    part.startsWith("@") ? (
      <span key={i} className="text-primary font-semibold">
        {part}
      </span>
    ) : (
      part
    )
  );
}

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
          <p className="text-sm text-foreground/80 whitespace-pre-wrap">
            {renderBodyWithMentions(item.body)}
          </p>
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

// ─── CRM-115: TagsInline ──────────────────────────────────────────────────────

interface TagsInlineProps {
  leadId: string;
  tags: string[];
  setTags: React.Dispatch<React.SetStateAction<string[]>>;
}

function TagsInline({ leadId, tags, setTags }: TagsInlineProps) {
  const [newTag, setNewTag] = useState("");
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    const t = newTag.trim().toLowerCase();
    if (!t || tags.includes(t)) { setNewTag(""); return; }
    setAdding(true);
    try {
      await addTag(leadId, t);
      setTags((prev) => [...prev, t]);
      setNewTag("");
    } catch {
      // ignore
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (tag: string) => {
    try {
      await removeTag(leadId, tag);
      setTags((prev) => prev.filter((t) => t !== tag));
    } catch {
      // ignore
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.length === 0 && <p className="text-xs text-muted-foreground">Niciun tag.</p>}
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary"
          >
            {tag}
            <button
              type="button"
              onClick={() => void handleRemove(tag)}
              className="hover:text-destructive ml-0.5"
              aria-label={`Șterge tag ${tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input
          type="text"
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleAdd(); } }}
          placeholder="adaugă tag..."
          className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs"
          aria-label="Tag nou"
        />
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={adding || !newTag.trim()}
          className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          +
        </button>
      </div>
    </div>
  );
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

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSubmitting(true);
    try {
      const created = await createContact(leadId, { fullName: newName.trim(), role: newRole || null, phone: newPhone || null, email: newEmail || null, isPrimary: newPrimary });
      setContacts((prev) => newPrimary ? [...prev.map((c) => ({ ...c, isPrimary: 0 })), created] : [...prev, created]);
      setNewName(""); setNewRole(""); setNewPhone(""); setNewEmail(""); setNewPrimary(false); setAdding(false);
    } catch { /* ignore */ } finally { setSubmitting(false); }
  };

  const handleSetPrimary = async (contact: LeadContact) => {
    try {
      await updateContact(leadId, contact.id, { isPrimary: true });
      setContacts((prev) => prev.map((c) => ({ ...c, isPrimary: c.id === contact.id ? 1 : 0 })));
    } catch { /* ignore */ }
  };

  const handleDelete = async (contactId: string) => {
    try {
      await deleteContact(leadId, contactId);
      setContacts((prev) => prev.filter((c) => c.id !== contactId));
    } catch { /* ignore */ }
  };

  return (
    <div role="tabpanel" aria-label="Contacte" className="space-y-4">
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
                  {c.isPrimary === 1 && <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">Primar</span>}
                </div>
                {c.role && <p className="text-[11px] text-muted-foreground mt-0.5">{c.role}</p>}
                {c.phone && <a href={`tel:${c.phone}`} className="text-xs text-primary hover:underline flex items-center gap-1 mt-0.5"><Phone className="h-3 w-3" aria-hidden="true" />{c.phone}</a>}
                {c.email && <a href={`mailto:${c.email}`} className="text-xs text-primary hover:underline flex items-center gap-1 mt-0.5"><Mail className="h-3 w-3" aria-hidden="true" />{c.email}</a>}
              </div>
              <div className="flex gap-1 shrink-0">
                {c.isPrimary !== 1 && (
                  <button type="button" onClick={() => void handleSetPrimary(c)} className="rounded-md border border-border px-2 py-1 text-[11px] font-semibold hover:bg-muted">Primar</button>
                )}
                <button type="button" onClick={() => void handleDelete(c.id)} className="rounded-md border border-border p-1.5 hover:bg-muted text-muted-foreground hover:text-destructive" aria-label={`Șterge contact ${c.fullName}`}>
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
            <div><label htmlFor="nc-name" className="block text-[11px] font-semibold mb-1">Nume *</label><input id="nc-name" type="text" required value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" aria-label="Nume contact" /></div>
            <div><label htmlFor="nc-role" className="block text-[11px] font-semibold mb-1">Rol</label><input id="nc-role" type="text" value={newRole} onChange={(e) => setNewRole(e.target.value)} placeholder="decident/plătitor" className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" aria-label="Rol contact" /></div>
            <div><label htmlFor="nc-phone" className="block text-[11px] font-semibold mb-1">Telefon</label><input id="nc-phone" type="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" aria-label="Telefon contact" /></div>
            <div><label htmlFor="nc-email" className="block text-[11px] font-semibold mb-1">Email</label><input id="nc-email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" aria-label="Email contact" /></div>
          </div>
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={newPrimary} onChange={(e) => setNewPrimary(e.target.checked)} className="h-4 w-4" aria-label="Contact primar" />Contact primar</label>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setAdding(false)} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">Anulează</button>
            <button type="submit" disabled={submitting || !newName.trim()} className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Adaugă"}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-sm font-semibold hover:bg-muted/40 w-full justify-center">
          <UserPlus className="h-4 w-4" />
          Adaugă contact
        </button>
      )}
    </div>
  );
}

// ─── COMM-202: ComunicareTab ──────────────────────────────────────────────────

const STATUS_BADGE: Record<CommMessage["status"], string> = {
  queued: "bg-muted text-muted-foreground",
  sent: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  delivered: "bg-success/10 text-success",
  failed: "bg-destructive/10 text-destructive",
};

const STATUS_LABEL: Record<CommMessage["status"], string> = {
  queued: "În așteptare",
  sent: "Trimis",
  delivered: "Livrat",
  failed: "Eșuat",
};

const CHANNEL_LABEL: Record<CommMessage["channel"], string> = {
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
};

interface ComunicareTabProps {
  lead: Lead;
  messages: CommMessage[];
  consentRevoked: boolean;
  onNewMessage: () => void;
  onMessageSent: (msg: CommMessage) => void;
}

function ComunicareTab({ messages, consentRevoked, onNewMessage }: ComunicareTabProps) {
  return (
    <div role="tabpanel" aria-label="Comunicare" className="space-y-4">
      {/* Header row with action */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-muted-foreground">
          {messages.length === 0 ? "Niciun mesaj trimis." : `${messages.length} mesaj${messages.length !== 1 ? "e" : ""}`}
        </p>
        <button
          type="button"
          onClick={onNewMessage}
          disabled={consentRevoked}
          title={consentRevoked ? "Consimțământ retras — trimitere blocată" : "Trimite mesaj nou"}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Mail className="h-4 w-4" aria-hidden="true" />
          Mesaj nou
        </button>
      </div>

      {/* Consent revoked warning */}
      {consentRevoked && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          Consimțământ retras — trimitere nouă blocată (GDPR).
        </div>
      )}

      {/* Message list */}
      {messages.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-muted-foreground">Niciun mesaj trimis încă.</p>
          <p className="text-xs text-muted-foreground mt-1">Apasă „Mesaj nou" pentru a trimite primul mesaj.</p>
        </div>
      ) : (
        <ul className="space-y-2" aria-label="Lista mesaje">
          {messages.map((msg) => (
            <li
              key={msg.id}
              className="rounded-lg border border-border bg-card p-3 space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    {CHANNEL_LABEL[msg.channel]}
                  </span>
                  <span className="text-[10px] text-muted-foreground">→ {msg.toAddress}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold", STATUS_BADGE[msg.status])}>
                    {STATUS_LABEL[msg.status]}
                  </span>
                  <time className="text-[10px] text-muted-foreground whitespace-nowrap" dateTime={msg.createdAt}>
                    {new Date(msg.createdAt).toLocaleString("ro-RO")}
                  </time>
                </div>
              </div>
              {msg.subject && (
                <p className="text-xs font-semibold text-foreground/80">{msg.subject}</p>
              )}
              <p className="text-sm text-foreground/70 line-clamp-3 whitespace-pre-wrap">{msg.body}</p>
              {msg.errorMessage && (
                <p className="text-xs text-destructive">{msg.errorMessage}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── COMM-202: ComposeMessageModal ────────────────────────────────────────────

interface ComposeMessageModalProps {
  lead: Lead;
  onSuccess: (msg: CommMessage) => void;
  onCancel: () => void;
}

function ComposeMessageModal({ lead, onSuccess, onCancel }: ComposeMessageModalProps) {
  const [channel, setChannel] = useState<MessageChannel>("email");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [to, setTo] = useState(channel === "email" ? lead.email ?? "" : lead.phone ?? "");
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Build lead context for variable fill
  const leadContext: Record<string, string> = {
    first_name: lead.fullName.split(" ")[0] ?? lead.fullName,
    full_name: lead.fullName,
    phone: lead.phone ?? "",
    email: lead.email ?? "",
    course: lead.interestCourse ?? "",
    center_name: "Vector Learn",
  };

  useEffect(() => {
    void listTemplates()
      .then((res) => setTemplates(res.items))
      .catch(() => setTemplates([]))
      .finally(() => setLoadingTemplates(false));
  }, []);

  // Update "to" when channel changes
  useEffect(() => {
    setTo(channel === "email" ? lead.email ?? "" : lead.phone ?? "");
    setSelectedTemplateId("");
    setBody("");
    setSubject("");
  }, [channel, lead.email, lead.phone]);

  const filteredTemplates = templates.filter((t) => t.channel === channel);

  const handleTemplateSelect = (id: string) => {
    setSelectedTemplateId(id);
    if (!id) { setBody(""); setSubject(""); return; }
    const tmpl = templates.find((t) => t.id === id);
    if (!tmpl) return;
    // Fill variables from lead context
    const filled = tmpl.body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => leadContext[key] ?? `{{${key}}}`);
    setBody(filled);
    if (tmpl.subject) {
      const filledSubject = tmpl.subject.replace(/\{\{(\w+)\}\}/g, (_, key: string) => leadContext[key] ?? `{{${key}}}`);
      setSubject(filledSubject);
    } else {
      setSubject("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!to.trim() || !body.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await sendMessage({
        channel,
        to_address: to.trim(),
        body: body.trim(),
        subject: subject.trim() || null,
        template_id: selectedTemplateId || null,
        lead_id: lead.id,
      });
      onSuccess(res.message);
    } catch (err) {
      if (err instanceof Error && err.message === "consent_revoked") {
        setError("Consimțământul a fost retras. Trimiterea este blocată (GDPR).");
      } else {
        setError("Eroare la trimitere. Încearcă din nou.");
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Compune mesaj nou">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="border-b border-border px-5 py-3.5 flex items-center justify-between sticky top-0 bg-card rounded-t-2xl">
          <h2 className="text-base font-bold">Mesaj nou</h2>
          <button type="button" onClick={onCancel} aria-label="Închide" className="rounded-md hover:bg-muted p-1">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-4">
          {/* Channel selector */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Canal</p>
            <div className="flex gap-2" role="group" aria-label="Selectează canal">
              {(["email", "sms", "whatsapp"] as MessageChannel[]).map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => setChannel(ch)}
                  aria-pressed={channel === ch}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors min-h-[44px]",
                    channel === ch
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted text-muted-foreground"
                  )}
                >
                  {ch === "email" ? "Email" : ch === "sms" ? "SMS" : "WhatsApp"}
                </button>
              ))}
            </div>
          </div>

          {/* Template selector */}
          <div>
            <label htmlFor="template-select" className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
              Template (opțional)
            </label>
            {loadingTemplates ? (
              <p className="text-xs text-muted-foreground">Se încarcă template-uri…</p>
            ) : (
              <select
                id="template-select"
                value={selectedTemplateId}
                onChange={(e) => handleTemplateSelect(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                aria-label="Selectează template"
              >
                <option value="">— fără template —</option>
                {filteredTemplates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
                {filteredTemplates.length === 0 && (
                  <option disabled>Niciun template pentru {channel}</option>
                )}
              </select>
            )}
          </div>

          {/* To */}
          <div>
            <label htmlFor="compose-to" className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
              Destinatar
            </label>
            <input
              id="compose-to"
              type={channel === "email" ? "email" : "tel"}
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              aria-label="Adresă destinatar"
              placeholder={channel === "email" ? "email@exemplu.ro" : "+40 771 234 567"}
            />
          </div>

          {/* Subject (email only) */}
          {channel === "email" && (
            <div>
              <label htmlFor="compose-subject" className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                Subiect
              </label>
              <input
                id="compose-subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                aria-label="Subiect email"
                placeholder="Subiect email…"
              />
            </div>
          )}

          {/* Body */}
          <div>
            <label htmlFor="compose-body" className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
              Mesaj
            </label>
            <textarea
              id="compose-body"
              required
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
              aria-label="Textul mesajului"
              placeholder="Scrie mesajul…"
            />
          </div>

          {/* Error */}
          {error && (
            <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-muted min-h-[44px]"
            >
              Anulează
            </button>
            <button
              type="submit"
              disabled={sending || !to.trim() || !body.trim()}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 min-h-[44px]"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" aria-hidden="true" />}
              Trimite
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── CRM-115: FieldsTab ───────────────────────────────────────────────────────

interface FieldsTabProps {
  leadId: string;
  customFields: CustomField[];
  fieldValues: LeadFieldValue[];
  setFieldValues: React.Dispatch<React.SetStateAction<LeadFieldValue[]>>;
}

function FieldsTab({ leadId, customFields, fieldValues, setFieldValues }: FieldsTabProps) {
  const getVal = (fieldId: string) => fieldValues.find((v) => v.fieldId === fieldId)?.value ?? "";

  const handleChange = async (fieldId: string, value: string) => {
    try {
      const updated = await upsertFieldValue(leadId, { fieldId, value: value || null });
      setFieldValues((prev) => {
        const idx = prev.findIndex((v) => v.fieldId === fieldId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = updated;
          return next;
        }
        return [...prev, updated];
      });
    } catch { /* ignore */ }
  };

  if (customFields.length === 0) {
    return (
      <div role="tabpanel" aria-label="Câmpuri custom" className="py-8 text-center">
        <p className="text-sm text-muted-foreground">Niciun câmp custom configurat.</p>
        <p className="text-xs text-muted-foreground mt-1">Adaugă câmpuri din <span className="font-semibold">Settings → CRM → Câmpuri</span>.</p>
      </div>
    );
  }

  return (
    <div role="tabpanel" aria-label="Câmpuri custom" className="space-y-4">
      {customFields.map((field) => (
        <div key={field.id}>
          <label htmlFor={`cf-${field.id}`} className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{field.label}</label>
          {field.type === "select" && field.options ? (
            <select
              id={`cf-${field.id}`}
              value={getVal(field.id)}
              onChange={(e) => void handleChange(field.id, e.target.value)}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              aria-label={field.label}
            >
              <option value="">— selectează —</option>
              {field.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          ) : field.type === "number" ? (
            <input
              id={`cf-${field.id}`}
              type="number"
              value={getVal(field.id)}
              onChange={(e) => void handleChange(field.id, e.target.value)}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              aria-label={field.label}
            />
          ) : (
            <input
              id={`cf-${field.id}`}
              type="text"
              value={getVal(field.id)}
              onChange={(e) => void handleChange(field.id, e.target.value)}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              aria-label={field.label}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// CRM-137: Inline helper — reads name from team cache, falls back gracefully.
function AssigneeDisplay({ assignedTo }: { assignedTo: string | null | undefined }) {
  const name = useAssigneeName(assignedTo);
  return <p className="text-sm text-muted-foreground">{name}</p>;
}
