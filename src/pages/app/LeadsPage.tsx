import { useEffect, useState, useCallback } from "react";
import { Loader2, Plus, X, Phone, Mail, ArrowRight, CheckCircle2, UserPlus, MessageCircle } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  fetchPipeline,
  moveLeadStage,
  createLead,
  convertLead,
  listInteractions,
  addInteraction,
  type Lead,
  type LeadStage,
  type LeadInteraction,
} from "@/lib/api/leads";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

const STAGES: Array<{ id: LeadStage; label: string; color: string; pastel: string }> = [
  { id: "new", label: "Lead nou", color: "text-foreground", pastel: "pastel-sky" },
  { id: "contacted", label: "Contactat", color: "text-foreground", pastel: "pastel-lavender" },
  { id: "trial", label: "Trial / Demo", color: "text-foreground", pastel: "pastel-peach" },
  { id: "paid", label: "Client", color: "text-foreground", pastel: "pastel-mint" },
  { id: "lost", label: "Pierdut", color: "text-foreground", pastel: "pastel-rose" },
];

const SOURCE_LABEL: Record<string, string> = {
  webform: "Site web",
  manual: "Manual",
  facebook_ad: "Facebook",
  google_ads: "Google",
  referral: "Recomandare",
  phone_in: "Telefon",
  instagram: "Instagram",
  import: "Import",
  other: "Altul",
};

export function LeadsPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();
  const [grouped, setGrouped] = useState<Record<LeadStage, Lead[]>>({
    new: [], contacted: [], trial: [], paid: [], lost: [],
  });
  const [counts, setCounts] = useState<Record<LeadStage, number>>({ new: 0, contacted: 0, trial: 0, paid: 0, lost: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [hoverStage, setHoverStage] = useState<LeadStage | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [openLead, setOpenLead] = useState<Lead | null>(null);
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
      const res = await fetchPipeline();
      setGrouped(res.grouped);
      setCounts(res.counts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const handleDrop = async (toStage: LeadStage) => {
    if (!draggedId) return;
    const allLeads = Object.values(grouped).flat();
    const lead = allLeads.find((l) => l.id === draggedId);
    setDraggedId(null);
    setHoverStage(null);
    if (!lead || lead.stage === toStage) return;
    try {
      const lostReason = toStage === "lost" ? prompt("Motiv pierdere (opțional):") ?? undefined : undefined;
      await moveLeadStage(lead.id, toStage, lostReason);
      setToast({ kind: "success", message: `Lead mutat la "${STAGES.find((s) => s.id === toStage)?.label}"` });
      void fetchAll();
    } catch {
      setToast({ kind: "error", message: "Nu pot muta lead-ul" });
    }
  };

  const totalLeads = Object.values(counts).reduce((s, c) => s + c, 0);

  return (
    <AppShell
      pageTitle="CRM — Leads"
      pageDescription={`${totalLeads} lead-uri active în pipeline · conversie: ${counts.paid > 0 ? Math.round((counts.paid / totalLeads) * 100) : 0}%`}
      actions={
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Adaugă lead
        </button>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Se încarcă pipeline-ul…
        </div>
      ) : error ? (
        <div className="py-16 text-center text-sm text-destructive">{error}</div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 min-h-[500px]">
          {STAGES.map((s) => {
            const leadsHere = grouped[s.id] ?? [];
            const isHover = hoverStage === s.id && draggedId !== null;
            return (
              <div
                key={s.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  setHoverStage(s.id);
                }}
                onDragLeave={() => setHoverStage(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  void handleDrop(s.id);
                }}
                className={cn(
                  "rounded-2xl bg-muted/40 p-3 flex flex-col gap-2 transition-colors",
                  isHover && "bg-primary/10 ring-2 ring-primary/40 ring-inset"
                )}
                aria-label={`Coloana ${s.label}`}
              >
                <div className={cn("rounded-lg p-3", s.pastel)}>
                  <div className="flex items-baseline justify-between">
                    <p className={cn("text-xs font-bold", s.color)}>{s.label}</p>
                    <span className="text-sm font-display font-bold tabular-nums">{leadsHere.length}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  {leadsHere.length === 0 ? (
                    <div className="flex items-center justify-center h-24 rounded-lg border border-dashed border-border text-[11px] text-muted-foreground">
                      Trage aici
                    </div>
                  ) : (
                    leadsHere.map((lead) => (
                      <button
                        key={lead.id}
                        type="button"
                        draggable
                        onDragStart={(e) => {
                          setDraggedId(lead.id);
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", lead.id);
                        }}
                        onDragEnd={() => {
                          setDraggedId(null);
                          setHoverStage(null);
                        }}
                        onClick={() => setOpenLead(lead)}
                        className={cn(
                          "text-left rounded-lg border border-border bg-card p-2.5 cursor-move shadow-sm transition-all",
                          "hover:shadow-md hover:-translate-y-0.5",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          draggedId === lead.id && "opacity-50"
                        )}
                      >
                        <p className="text-xs font-semibold truncate">{lead.fullName}</p>
                        {lead.interestCourse && (
                          <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                            {lead.interestCourse}
                          </p>
                        )}
                        <div className="flex items-center justify-between gap-2 mt-2">
                          <span className="text-[10px] text-muted-foreground">
                            {SOURCE_LABEL[lead.source] ?? lead.source}
                          </span>
                          <div className="flex gap-1.5 text-muted-foreground/60">
                            {lead.phone && <Phone className="h-2.5 w-2.5" aria-label="Are telefon" />}
                            {lead.email && <Mail className="h-2.5 w-2.5" aria-label="Are email" />}
                          </div>
                        </div>
                        {lead.convertedToStudentId && (
                          <div className="mt-1.5 text-[9px] font-bold text-success inline-flex items-center gap-1">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            Convertit
                          </div>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateLeadModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            setToast({ kind: "success", message: "Lead adăugat în pipeline" });
            void fetchAll();
          }}
          onError={(m) => setToast({ kind: "error", message: m })}
        />
      )}

      {openLead && (
        <LeadDetailModal
          lead={openLead}
          onClose={() => setOpenLead(null)}
          onChanged={() => {
            void fetchAll();
          }}
          onConverted={(studentId) => {
            setOpenLead(null);
            setToast({ kind: "success", message: "Lead convertit în student!" });
            void fetchAll();
            void studentId;
          }}
          onError={(m) => setToast({ kind: "error", message: m })}
        />
      )}

      {toast && (
        <div
          role="status"
          className={cn(
            "fixed bottom-4 right-4 z-50 rounded-lg border shadow-lg px-4 py-3 text-sm font-medium animate-fade-in",
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

function CreateLeadModal({
  onClose,
  onSaved,
  onError,
}: {
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [interestCourse, setInterestCourse] = useState("");
  const [source, setSource] = useState<"manual" | "facebook_ad" | "google_ads" | "referral" | "phone_in" | "instagram" | "other">("manual");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createLead({
        fullName,
        phone: phone || null,
        email: email || null,
        interestCourse: interestCourse || null,
        source,
        notes: notes || null,
      });
      onSaved();
    } catch (err) {
      onError(err instanceof ApiError ? `Eroare: ${err.code}` : "Nu pot salva lead-ul");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Adaugă lead nou" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <FormField id="l-name" label="Nume complet" required>
          <input
            id="l-name"
            type="text"
            required
            minLength={2}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="input-base"
          />
        </FormField>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField id="l-phone" label="Telefon">
            <input
              id="l-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="input-base"
              placeholder="+40 7XX XXX XXX"
            />
          </FormField>
          <FormField id="l-email" label="Email">
            <input
              id="l-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-base"
            />
          </FormField>
        </div>
        <FormField id="l-course" label="Curs de interes">
          <input
            id="l-course"
            type="text"
            value={interestCourse}
            onChange={(e) => setInterestCourse(e.target.value)}
            className="input-base"
            placeholder="ex: Engleză B2, Pian începători"
          />
        </FormField>
        <FormField id="l-source" label="Sursă">
          <select id="l-source" value={source} onChange={(e) => setSource(e.target.value as typeof source)} className="input-base">
            <option value="manual">Manual</option>
            <option value="facebook_ad">Facebook</option>
            <option value="google_ads">Google</option>
            <option value="instagram">Instagram</option>
            <option value="referral">Recomandare</option>
            <option value="phone_in">Telefon</option>
            <option value="other">Altul</option>
          </select>
        </FormField>
        <FormField id="l-notes" label="Note">
          <textarea
            id="l-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input-base resize-none"
          />
        </FormField>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted">
            Anulează
          </button>
          <button type="submit" disabled={submitting} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {submitting ? "Se salvează..." : "Adaugă"}
          </button>
        </div>
      </form>
      <style>{`
        .input-base { width: 100%; border-radius: 0.5rem; border: 1px solid hsl(var(--input)); background-color: hsl(var(--background)); padding: 0.5rem 0.75rem; font-size: 0.875rem; }
        .input-base:focus-visible { outline: none; box-shadow: 0 0 0 2px hsl(var(--ring)); }
      `}</style>
    </Modal>
  );
}

function LeadDetailModal({
  lead,
  onClose,
  onChanged,
  onConverted,
  onError,
}: {
  lead: Lead;
  onClose: () => void;
  onChanged: () => void;
  onConverted: (studentId: string) => void;
  onError: (m: string) => void;
}) {
  const [interactions, setInteractions] = useState<LeadInteraction[]>([]);
  const [loadingInter, setLoadingInter] = useState(true);
  const [noteBody, setNoteBody] = useState("");
  const [submittingNote, setSubmittingNote] = useState(false);
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoadingInter(true);
    listInteractions(lead.id)
      .then((r) => alive && setInteractions(r.items))
      .catch(() => alive && setInteractions([]))
      .finally(() => alive && setLoadingInter(false));
    return () => {
      alive = false;
    };
  }, [lead.id]);

  const addNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteBody.trim()) return;
    setSubmittingNote(true);
    try {
      const created = await addInteraction(lead.id, { type: "note", body: noteBody });
      setInteractions((prev) => [created, ...prev]);
      setNoteBody("");
    } catch {
      onError("Nu pot salva nota");
    } finally {
      setSubmittingNote(false);
    }
  };

  const handleConvert = async () => {
    if (!confirm(`Convertești "${lead.fullName}" în student? Va apărea în Elevi cu status "Activ".`)) return;
    setConverting(true);
    try {
      const res = await convertLead(lead.id);
      onConverted(res.student.id);
    } catch (err) {
      if (err instanceof ApiError && err.code === "already_converted") {
        onError("Lead-ul a fost deja convertit");
      } else {
        onError("Nu pot converti lead-ul");
      }
    } finally {
      setConverting(false);
    }
  };

  return (
    <Modal title={lead.fullName} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          {lead.phone && <DetailRow icon={Phone} label="Telefon" value={lead.phone} />}
          {lead.email && <DetailRow icon={Mail} label="Email" value={lead.email} />}
          {lead.interestCourse && <DetailRow icon={null} label="Curs" value={lead.interestCourse} />}
          <DetailRow icon={null} label="Sursă" value={SOURCE_LABEL[lead.source] ?? lead.source} />
        </div>

        {lead.utmSource && (
          <div className="rounded-md bg-muted p-2 text-[11px] text-muted-foreground">
            UTM: {lead.utmSource} / {lead.utmMedium ?? "—"} / {lead.utmCampaign ?? "—"}
          </div>
        )}

        {lead.notes && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Note inițiale</p>
            <p className="text-sm text-foreground/80">{lead.notes}</p>
          </div>
        )}

        {!lead.convertedToStudentId && lead.stage !== "lost" && (
          <button
            type="button"
            onClick={handleConvert}
            disabled={converting}
            className="inline-flex items-center justify-center gap-1.5 w-full rounded-md bg-success px-4 py-2.5 text-sm font-semibold text-success-foreground hover:bg-success/90 disabled:opacity-50"
          >
            {converting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Convertește în Student
            <ArrowRight className="h-4 w-4" />
          </button>
        )}

        {lead.convertedToStudentId && (
          <div className="rounded-md bg-success/10 border border-success/30 p-3 text-sm text-success flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Convertit în student la {lead.convertedAt ? new Date(lead.convertedAt).toLocaleDateString("ro-RO") : "—"}
          </div>
        )}

        <div className="border-t border-border pt-4">
          <p className="text-sm font-bold mb-3">Interacțiuni</p>

          <form onSubmit={addNote} className="mb-3 flex gap-2">
            <input
              type="text"
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="Adaugă o notă internă..."
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <button type="submit" disabled={submittingNote || !noteBody.trim()} className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              Adaugă
            </button>
          </form>

          {loadingInter ? (
            <div className="flex items-center text-muted-foreground text-sm py-4">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Se încarcă...
            </div>
          ) : interactions.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4">Niciun istoric încă.</p>
          ) : (
            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {interactions.map((i) => (
                <li key={i.id} className="rounded-md border border-border bg-card p-2.5 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="inline-flex items-center gap-1 font-semibold text-foreground capitalize">
                      <MessageCircle className="h-3 w-3 text-primary" />
                      {i.type.replace("_", " ")}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(i.occurredAt).toLocaleString("ro-RO")}
                    </span>
                  </div>
                  <p className="text-foreground/80 leading-relaxed">{i.body}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-[10px] text-muted-foreground pt-2 border-t border-border">
          Stadiu actual: <strong className="text-foreground">{STAGES.find((s) => s.id === lead.stage)?.label}</strong> ·
          Pentru a schimba stadiu, trage cardul între coloane.
        </p>
      </div>
      <ChangedSpy onMount={onChanged} />
    </Modal>
  );
}

function ChangedSpy({ onMount }: { onMount: () => void }) {
  useEffect(() => {
    onMount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function DetailRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }> | null; label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/40 p-2.5">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">{label}</p>
      <p className="font-medium inline-flex items-center gap-1.5">
        {Icon && <Icon className="h-3 w-3 text-muted-foreground" />}
        {value}
      </p>
    </div>
  );
}

function FormField({ id, label, required, children }: { id: string; label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold mb-1.5">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      {children}
    </div>
  );
}

function Modal({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("relative w-full rounded-2xl border border-border bg-card shadow-xl", wide ? "max-w-2xl" : "max-w-md")}>
        <div className="border-b border-border px-5 py-3.5 flex items-center justify-between">
          <h2 className="text-base font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Închide" className="rounded-md hover:bg-muted p-1">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
