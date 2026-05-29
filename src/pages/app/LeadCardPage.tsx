/**
 * CRM-106 — Cartonaș detaliu lead /app/leads/:id
 * Layout 2 coloane: col stânga sticky (info+acțiuni), col dreapta tab-uri (Activitate/GDPR)
 * Inline edit, timeline cronologic invers, badge consent retras
 */
import { useEffect, useState, useCallback } from "react";
import {
  Loader2, ArrowLeft, Pencil, Check, X, ChevronDown,
  Phone, Mail, Globe, Calendar, MessageCircle, UserPlus,
  AlertTriangle, CheckCircle2, Trash2, MoreVertical, ShieldOff,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  getLead, updateLead, moveLeadStage, convertLead,
  listInteractions, addInteraction, revokeConsent, deleteLead,
  type Lead, type LeadInteraction,
} from "@/lib/api/leads";
import { fetchPipelineStages, type PipelineStage } from "@/lib/api/pipeline";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

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

type Tab = "activity" | "gdpr";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("activity");

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
  const [converting, setConverting] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);

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
      const [leadRes, stagesRes, interRes] = await Promise.all([
        getLead(leadId),
        fetchPipelineStages(),
        listInteractions(leadId),
      ]);
      setLead(leadRes);
      setStages(stagesRes.stages);
      setInteractions(interRes.items);
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

  // ─── Convert ─────────────────────────────────────────────────────────────
  const handleConvert = async () => {
    if (!lead) return;
    if (!confirm(`Convertești "${lead.fullName}" în student?`)) return;
    setConverting(true);
    try {
      await convertLead(lead.id);
      setToast({ kind: "success", message: "Convertit în student!" });
      void fetchAll();
    } catch (err) {
      setToast({ kind: "error", message: err instanceof ApiError && err.code === "already_converted" ? "Lead deja convertit" : "Nu pot converti" });
    } finally {
      setConverting(false);
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

  return (
    <AppShell
      pageTitle={lead.fullName}
      pageDescription={`${SOURCE_LABEL[lead.source] ?? lead.source} · ${currentStageLabel}`}
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

            {/* Score placeholder */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Scor lead</p>
              <span className="text-xs text-muted-foreground italic">Disponibil în CRM-111</span>
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
                <a
                  href={`tel:${lead.phone}`}
                  className={cn("flex items-center gap-1.5 text-sm font-medium text-primary hover:underline", consentRevoked && "pointer-events-none opacity-50")}
                  aria-disabled={consentRevoked}
                >
                  <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                  {lead.phone}
                </a>
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
                <a
                  href={`mailto:${lead.email}`}
                  className={cn("flex items-center gap-1.5 text-sm font-medium text-primary hover:underline", consentRevoked && "pointer-events-none opacity-50")}
                  aria-disabled={consentRevoked}
                >
                  <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                  {lead.email}
                </a>
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
          </section>

          {/* Action buttons */}
          {!lead.convertedToStudentId && lead.stage !== "lost" && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => void handleConvert()}
                disabled={converting || consentRevoked}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-success px-4 py-2.5 text-sm font-semibold text-success-foreground hover:bg-success/90 disabled:opacity-50"
              >
                {converting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
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
          <div role="tablist" className="flex gap-1 border-b border-border mb-4">
            {([["activity", "Activitate"], ["gdpr", "GDPR"]] as [Tab, string][]).map(([t, label]) => (
              <button
                key={t}
                role="tab"
                type="button"
                aria-selected={activeTab === t}
                onClick={() => setActiveTab(t)}
                className={cn(
                  "px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors",
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

function TimelineItem({ item }: { item: LeadInteraction }) {
  return (
    <li className="flex gap-3">
      <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
        <MessageCircle className="h-3 w-3 text-primary" aria-hidden="true" />
      </div>
      <div className="flex-1 rounded-lg border border-border bg-card p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-foreground capitalize">
            {INTERACTION_LABEL[item.type] ?? item.type}
          </span>
          <time className="text-[10px] text-muted-foreground" dateTime={item.occurredAt}>
            {new Date(item.occurredAt).toLocaleString("ro-RO")}
          </time>
        </div>
        {item.body && (
          <p className="text-sm text-foreground/80 whitespace-pre-wrap">{item.body}</p>
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
