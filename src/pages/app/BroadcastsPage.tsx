/**
 * COMM-204 — Pagina /app/broadcasts
 * Trimitere mesaj în masă cu segmentare (leads sau elevi) + preview count.
 */
import { useEffect, useState, useCallback } from "react";
import { Loader2, Send, Users, AlertTriangle } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  createBroadcast,
  listBroadcasts,
  previewCount,
  type Broadcast,
} from "@/lib/api/broadcasts";
import type { MessageChannel } from "@/lib/api/messages";
import { listTemplates, type MessageTemplate } from "@/lib/api/templates";
import { cn } from "@/lib/utils";

// ─── Status labels ────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<Broadcast["status"], string> = {
  draft: "Ciornă",
  sending: "Se trimite…",
  done: "Trimis",
  failed: "Eșuat",
};

const STATUS_BADGE: Record<Broadcast["status"], string> = {
  draft: "bg-muted text-muted-foreground",
  sending: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  done: "bg-success/10 text-success",
  failed: "bg-destructive/10 text-destructive",
};

// ─── Main page ────────────────────────────────────────────────────────────────

export function BroadcastsPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [bcRes, tmplRes] = await Promise.all([
        listBroadcasts(),
        listTemplates(),
      ]);
      setBroadcasts(bcRes.items);
      setTemplates(tmplRes.items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const handleBroadcastSent = (result: { broadcastId: string; totalRecipients: number; consentSkipped: number; queued: number }) => {
    setShowForm(false);
    void fetchData();
    console.warn(`[Broadcast] ID=${result.broadcastId} total=${result.totalRecipients} queued=${result.queued} skipped=${result.consentSkipped}`);
  };

  return (
    <AppShell
      pageTitle="Campanii"
      pageDescription="Trimite mesaje în masă către segmente de leads sau elevi"
      actions={
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 min-h-[44px]"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          Campanie nouă
        </button>
      }
    >
      {showForm && (
        <BroadcastForm
          templates={templates}
          onSuccess={handleBroadcastSent}
          onCancel={() => setShowForm(false)}
        />
      )}

      {!showForm && (
        <>
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Se încarcă…
            </div>
          ) : broadcasts.length === 0 ? (
            <div className="py-16 text-center">
              <Users className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">Nicio campanie trimisă încă.</p>
              <p className="text-xs text-muted-foreground mt-1">Apasă „Campanie nouă" pentru a trimite primul mesaj în masă.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {broadcasts.map((bc) => (
                <div
                  key={bc.id}
                  className="rounded-xl border border-border bg-card p-4 space-y-2"
                  data-testid={`bc-${bc.id}`}
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="font-semibold text-sm">{bc.name}</p>
                    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold", STATUS_BADGE[bc.status])}>
                      {STATUS_LABEL[bc.status]}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>Canal: <span className="font-semibold text-foreground capitalize">{bc.channel}</span></span>
                    <span>Destinatari: <span className="font-semibold text-foreground">{bc.totalRecipients}</span></span>
                    <span>Trimiși: <span className="font-semibold text-foreground">{bc.queued}</span></span>
                    {bc.consentSkipped > 0 && (
                      <span className="text-amber-600 dark:text-amber-400">
                        Săriti (GDPR): {bc.consentSkipped}
                      </span>
                    )}
                    {bc.sentAt && (
                      <span>{new Date(bc.sentAt).toLocaleString("ro-RO")}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}

// ─── BroadcastForm ────────────────────────────────────────────────────────────

interface BroadcastFormProps {
  templates: MessageTemplate[];
  onSuccess: (result: { broadcastId: string; totalRecipients: number; consentSkipped: number; queued: number }) => void;
  onCancel: () => void;
}

function BroadcastForm({ templates, onSuccess, onCancel }: BroadcastFormProps) {
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<MessageChannel>("email");
  const [segType, setSegType] = useState<"leads" | "students">("leads");
  const [statusFilter, setStatusFilter] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const [preview, setPreview] = useState<{ count: number; sample: string[] } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredTemplates = templates.filter((t) => t.channel === channel);

  const handleTemplateSelect = (id: string) => {
    setTemplateId(id);
    if (!id) return;
    const tmpl = templates.find((t) => t.id === id);
    if (tmpl) {
      setBody(tmpl.body);
      if (tmpl.subject) setSubject(tmpl.subject);
    }
  };

  const refreshPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const res = await previewCount({
        type: segType,
        status_filter: statusFilter || undefined,
        course_filter: courseFilter || undefined,
        tag_filter: tagFilter || undefined,
        channel,
      });
      setPreview(res);
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [segType, statusFilter, courseFilter, tagFilter, channel]);

  // Debounced preview refresh
  useEffect(() => {
    const t = setTimeout(() => { void refreshPreview(); }, 600);
    return () => clearTimeout(t);
  }, [refreshPreview]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !body.trim()) return;
    setSending(true);
    setError(null);
    try {
      const result = await createBroadcast({
        name: name.trim(),
        channel,
        segment: {
          type: segType,
          status_filter: statusFilter || null,
          course_filter: courseFilter || null,
          tag_filter: tagFilter || null,
        },
        template_id: templateId || null,
        body: body.trim(),
        subject: subject.trim() || null,
      });
      onSuccess(result);
    } catch {
      setError("Eroare la trimitere. Încearcă din nou.");
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6 rounded-xl border border-border bg-card p-6 mb-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Campanie nouă</h2>
        <button type="button" onClick={onCancel} className="text-sm text-muted-foreground hover:text-foreground">
          Anulează
        </button>
      </div>

      {/* Name */}
      <div>
        <label htmlFor="bc-name" className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
          Nume campanie *
        </label>
        <input
          id="bc-name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          aria-label="Nume campanie"
          placeholder="ex: Anunț septembrie 2026"
        />
      </div>

      {/* Channel */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Canal *</p>
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

      {/* Segment */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Segment destinatari</p>

        <div className="flex gap-2" role="group" aria-label="Tip segment">
          {(["leads", "students"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setSegType(t)}
              aria-pressed={segType === t}
              className={cn(
                "flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors min-h-[44px]",
                segType === t
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:bg-muted text-muted-foreground"
              )}
            >
              {t === "leads" ? "Lead-uri" : "Elevi"}
            </button>
          ))}
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="seg-status" className="block text-[11px] font-semibold mb-1">
              Status {segType === "leads" ? "lead" : "elev"} (opțional)
            </label>
            <input
              id="seg-status"
              type="text"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              placeholder={segType === "leads" ? "new, contacted…" : "active, trial…"}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              aria-label="Filtru status"
            />
          </div>
          <div>
            <label htmlFor="seg-course" className="block text-[11px] font-semibold mb-1">
              Curs (opțional)
            </label>
            <input
              id="seg-course"
              type="text"
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              placeholder="ex: Engleză"
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              aria-label="Filtru curs"
            />
          </div>
          {segType === "leads" && (
            <div>
              <label htmlFor="seg-tag" className="block text-[11px] font-semibold mb-1">
                Tag (opțional)
              </label>
              <input
                id="seg-tag"
                type="text"
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                placeholder="ex: vip"
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                aria-label="Filtru tag"
              />
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="rounded-lg bg-muted/30 px-3 py-2 flex items-center gap-2" aria-live="polite">
          {previewLoading ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /><span className="text-xs text-muted-foreground">Se calculează…</span></>
          ) : preview ? (
            <div className="text-xs">
              <span className="font-bold text-foreground">{preview.count}</span>
              <span className="text-muted-foreground"> destinatar{preview.count !== 1 ? "i" : ""}</span>
              {preview.sample.length > 0 && (
                <span className="text-muted-foreground ml-1">— {preview.sample.join(", ")}{preview.count > 5 ? "…" : ""}</span>
              )}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>
      </div>

      {/* Template */}
      <div>
        <label htmlFor="bc-template" className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
          Template (opțional)
        </label>
        <select
          id="bc-template"
          value={templateId}
          onChange={(e) => handleTemplateSelect(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          aria-label="Selectează template"
        >
          <option value="">— fără template —</option>
          {filteredTemplates.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {/* Subject (email only) */}
      {channel === "email" && (
        <div>
          <label htmlFor="bc-subject" className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
            Subiect
          </label>
          <input
            id="bc-subject"
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
        <label htmlFor="bc-body" className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
          Mesaj *
        </label>
        <textarea
          id="bc-body"
          required
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
          aria-label="Textul mesajului"
          placeholder="Scrie mesajul campaniei…"
        />
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {/* Submit */}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted min-h-[44px]"
        >
          Anulează
        </button>
        <button
          type="submit"
          disabled={sending || !name.trim() || !body.trim() || (preview?.count ?? 0) === 0}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 min-h-[44px]"
        >
          {sending ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Se trimite…</>
          ) : (
            <><Send className="h-4 w-4" aria-hidden="true" />Trimite acum</>
          )}
        </button>
      </div>
    </form>
  );
}
