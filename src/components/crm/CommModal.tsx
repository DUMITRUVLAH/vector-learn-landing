/**
 * CRM-109 — Communication modals for lead card
 * - SendMessageModal: compose email/WhatsApp/SMS with template + variable pre-fill
 * - LogCallModal: log phone call with outcome, duration, note
 */
import { useState, useEffect } from "react";
import {
  X, Loader2, Mail, MessageCircle, Phone, Send,
  AlertTriangle, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { listTemplates, type MessageTemplate } from "@/lib/api/templates";
import { sendMessage, logCall, type Lead, type LeadInteraction } from "@/lib/api/leads";
import { renderPreview } from "@/lib/api/templates";

// ─── SendMessageModal ─────────────────────────────────────────────────────────

export type SendChannel = "email" | "whatsapp" | "sms";

interface SendMessageModalProps {
  lead: Lead;
  defaultChannel?: SendChannel;
  onSuccess: (interaction: LeadInteraction) => void;
  onCancel: () => void;
}

const CHANNEL_ICONS: Record<SendChannel, React.ReactNode> = {
  email: <Mail className="h-4 w-4" aria-hidden="true" />,
  whatsapp: <MessageCircle className="h-4 w-4" aria-hidden="true" />,
  sms: <Phone className="h-4 w-4" aria-hidden="true" />,
};

const CHANNEL_LABEL: Record<SendChannel, string> = {
  email: "Email",
  whatsapp: "WhatsApp",
  sms: "SMS",
};

/** Build template variable context from a lead */
function buildContext(lead: Lead): Record<string, string> {
  return {
    first_name: lead.fullName.split(" ")[0] ?? lead.fullName,
    full_name: lead.fullName,
    phone: lead.phone ?? "",
    course: lead.interestCourse ?? "",
    center_name: "Vector Learn",
    trial_date: "",
  };
}

export function SendMessageModal({ lead, defaultChannel = "email", onSuccess, onCancel }: SendMessageModalProps) {
  const [channel, setChannel] = useState<SendChannel>(defaultChannel);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const context = buildContext(lead);

  useEffect(() => {
    setLoadingTemplates(true);
    listTemplates()
      .then(({ items }) => setTemplates(items))
      .catch(() => setTemplates([]))
      .finally(() => setLoadingTemplates(false));
  }, []);

  // Filter templates by current channel
  const filteredTemplates = templates.filter((t) => t.channel === channel);

  // When template is selected, pre-fill subject and body with lead variables rendered
  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) {
      setSubject("");
      setBody("");
      return;
    }
    const tmpl = templates.find((t) => t.id === templateId);
    if (!tmpl) return;
    setSubject(tmpl.subject ? renderPreview(tmpl.subject, context) : "");
    setBody(renderPreview(tmpl.body, context));
  };

  // When channel changes, reset template selection + body
  useEffect(() => {
    setSelectedTemplateId("");
    setSubject("");
    setBody("");
  }, [channel]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    setError(null);
    try {
      const interaction = await sendMessage(lead.id, {
        channel,
        templateId: selectedTemplateId || null,
        subject: subject || null,
        body: body.trim(),
      });
      onSuccess(interaction);
    } catch (err) {
      if (err instanceof Error && err.message.includes("consent_revoked")) {
        setError("Consimțământul a fost retras — trimiterea este blocată.");
      } else {
        setError("Nu am putut trimite mesajul. Încearcă din nou.");
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Trimite ${CHANNEL_LABEL[channel]}`}
    >
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card shadow-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="border-b border-border px-5 py-3.5 flex items-center justify-between sticky top-0 bg-card rounded-t-2xl">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" aria-hidden="true" />
            <h2 className="text-base font-bold">Trimite mesaj</h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Închide"
            className="rounded-md hover:bg-muted p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSend(e)} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Recipient info */}
            <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Destinatar: </span>
              <span className="font-semibold">{lead.fullName}</span>
              {lead.phone && channel !== "email" && (
                <span className="text-muted-foreground"> · {lead.phone}</span>
              )}
              {lead.email && channel === "email" && (
                <span className="text-muted-foreground"> · {lead.email}</span>
              )}
            </div>

            {/* Channel tabs */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                Canal
              </label>
              <div role="radiogroup" aria-label="Selectează canal" className="flex gap-2">
                {(["email", "whatsapp", "sms"] as SendChannel[]).map((ch) => (
                  <label
                    key={ch}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold cursor-pointer transition-colors",
                      channel === ch
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-muted/50"
                    )}
                  >
                    <input
                      type="radio"
                      name="channel"
                      value={ch}
                      checked={channel === ch}
                      onChange={() => setChannel(ch)}
                      className="sr-only"
                    />
                    {CHANNEL_ICONS[ch]}
                    {CHANNEL_LABEL[ch]}
                  </label>
                ))}
              </div>
            </div>

            {/* Template selector */}
            <div>
              <label htmlFor="comms-template-select" className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                Template
              </label>
              {loadingTemplates ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Se încarcă template-urile…
                </div>
              ) : (
                <div className="relative">
                  <select
                    id="comms-template-select"
                    value={selectedTemplateId}
                    onChange={(e) => handleTemplateSelect(e.target.value)}
                    className="w-full appearance-none rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm"
                    aria-label="Selectează template"
                  >
                    <option value="">— Fără template —</option>
                    {filteredTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                </div>
              )}
              {filteredTemplates.length === 0 && !loadingTemplates && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Niciun template {CHANNEL_LABEL[channel]}. Poți scrie direct mai jos.
                </p>
              )}
            </div>

            {/* Subject (email only) */}
            {channel === "email" && (
              <div>
                <label htmlFor="comms-subject" className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                  Subiect
                </label>
                <input
                  id="comms-subject"
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subiect email…"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  aria-label="Subiect email"
                />
              </div>
            )}

            {/* Body */}
            <div>
              <label htmlFor="comms-body" className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                Mesaj <span className="text-destructive">*</span>
              </label>
              <textarea
                id="comms-body"
                rows={6}
                required
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={
                  channel === "email"
                    ? "Scrie emailul…"
                    : channel === "whatsapp"
                    ? "Scrie mesajul WhatsApp…"
                    : "Scrie SMS-ul (max 160 caractere recomandat)…"
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                aria-label="Corpul mesajului"
              />
              {channel === "sms" && body.length > 0 && (
                <p className={cn("text-[10px] mt-0.5 text-right", body.length > 160 ? "text-amber-500" : "text-muted-foreground")}>
                  {body.length} caractere{body.length > 160 ? " (>1 SMS)" : ""}
                </p>
              )}
            </div>

            {/* Error */}
            {error && (
              <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border px-5 py-3.5 flex justify-end gap-2 bg-card rounded-b-2xl">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
            >
              Anulează
            </button>
            <button
              type="submit"
              disabled={sending || !body.trim()}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Se trimite…
                </>
              ) : (
                <>
                  {CHANNEL_ICONS[channel]} Trimite {CHANNEL_LABEL[channel]}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── LogCallModal ─────────────────────────────────────────────────────────────

export type CallOutcome = "interested" | "not_interested" | "wrong_number" | "no_answer";

interface LogCallModalProps {
  lead: Lead;
  onSuccess: (interaction: LeadInteraction) => void;
  onCancel: () => void;
}

const OUTCOME_OPTIONS: { value: CallOutcome; label: string; color: string }[] = [
  { value: "interested", label: "Interesat", color: "text-success border-success/40 bg-success/10" },
  { value: "not_interested", label: "Nu e interesat", color: "text-destructive border-destructive/40 bg-destructive/10" },
  { value: "wrong_number", label: "Număr greșit", color: "text-amber-600 border-amber-400/40 bg-amber-50 dark:bg-amber-900/20" },
  { value: "no_answer", label: "Nu a răspuns", color: "text-muted-foreground border-border bg-muted/30" },
];

export function LogCallModal({ lead, onSuccess, onCancel }: LogCallModalProps) {
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [durationMinutes, setDurationMinutes] = useState("");
  const [durationSeconds, setDurationSeconds] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalDurationSeconds =
    (parseInt(durationMinutes || "0", 10) * 60) +
    parseInt(durationSeconds || "0", 10);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!outcome) return;
    setSaving(true);
    setError(null);
    try {
      const interaction = await logCall(lead.id, {
        outcome,
        durationSeconds: totalDurationSeconds > 0 ? totalDurationSeconds : null,
        note: note.trim() || null,
      });
      onSuccess(interaction);
    } catch {
      setError("Nu am putut loga apelul. Încearcă din nou.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Logare apel"
    >
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="border-b border-border px-5 py-3.5 flex items-center justify-between sticky top-0 bg-card rounded-t-2xl">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" aria-hidden="true" />
            <h2 className="text-base font-bold">Logare apel</h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Închide"
            className="rounded-md hover:bg-muted p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)}>
          <div className="p-5 space-y-4">
            {/* Lead name */}
            <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Apel pentru: </span>
              <span className="font-semibold">{lead.fullName}</span>
              {lead.phone && (
                <span className="text-muted-foreground"> · {lead.phone}</span>
              )}
            </div>

            {/* Outcome */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Rezultat apel <span className="text-destructive">*</span>
              </p>
              <div role="radiogroup" aria-label="Rezultatul apelului" className="grid grid-cols-2 gap-2">
                {OUTCOME_OPTIONS.map(({ value, label, color }) => (
                  <label
                    key={value}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold cursor-pointer transition-colors",
                      outcome === value ? color : "border-border hover:bg-muted/50 text-foreground"
                    )}
                  >
                    <input
                      type="radio"
                      name="outcome"
                      value={value}
                      checked={outcome === value}
                      onChange={() => setOutcome(value)}
                      className="sr-only"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {/* Duration */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                Durată (opțional)
              </label>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(e.target.value)}
                    placeholder="0"
                    className="w-16 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-center"
                    aria-label="Minute"
                  />
                  <span className="text-xs text-muted-foreground">min</span>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={durationSeconds}
                    onChange={(e) => setDurationSeconds(e.target.value)}
                    placeholder="0"
                    className="w-16 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-center"
                    aria-label="Secunde"
                  />
                  <span className="text-xs text-muted-foreground">sec</span>
                </div>
                {totalDurationSeconds > 0 && (
                  <span className="text-xs text-muted-foreground">
                    = {Math.floor(totalDurationSeconds / 60)}m {totalDurationSeconds % 60}s
                  </span>
                )}
              </div>
            </div>

            {/* Note */}
            <div>
              <label htmlFor="call-note" className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                Notă (opțional)
              </label>
              <textarea
                id="call-note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="ex: Interesată de cursul de sâmbătă, vrea detalii despre preț…"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                aria-label="Notă apel"
              />
            </div>

            {/* Error */}
            {error && (
              <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border px-5 py-3.5 flex justify-end gap-2 bg-card rounded-b-2xl">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
            >
              Anulează
            </button>
            <button
              type="submit"
              disabled={saving || !outcome}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Se salvează…
                </>
              ) : (
                <>
                  <Phone className="h-4 w-4" aria-hidden="true" /> Salvează apel
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
