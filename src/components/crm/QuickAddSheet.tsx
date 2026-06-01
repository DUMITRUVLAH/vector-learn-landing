/**
 * CRM-122 — Quick-add mobile (bottom sheet)
 * Quick-add lead in ≤3 taps: name + phone → Save.
 * Dedup live check on phone input (POST /api/leads/dedup-check).
 * Optimistic UI: toast + lead appears in list instantly.
 */
import { useState, useRef, useCallback } from "react";
import { X, AlertTriangle, ChevronDown, ChevronUp, Phone, Loader2 } from "lucide-react";
import { createLead, checkDuplicate, type DedupResult } from "@/lib/api/leads";
import { cn } from "@/lib/utils";

interface QuickAddSheetProps {
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}

type CallOutcome = "interested" | "not_interested" | "wrong_number" | "no_answer";

const OUTCOMES: { value: CallOutcome; label: string }[] = [
  { value: "interested", label: "Interesat" },
  { value: "not_interested", label: "Nu e interesat" },
  { value: "wrong_number", label: "Număr greșit" },
  { value: "no_answer", label: "Nu a răspuns" },
];

export function QuickAddSheet({ onClose, onSaved, onError }: QuickAddSheetProps) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [interestCourse, setInterestCourse] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dedupResult, setDedupResult] = useState<DedupResult["duplicate"] | null>(null);
  const [forceCreate, setForceCreate] = useState(false);

  const dedupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runDedup = useCallback(async (phoneVal: string) => {
    if (!phoneVal.trim()) { setDedupResult(null); return; }
    try {
      const r = await checkDuplicate({ phone: phoneVal });
      setDedupResult(r.duplicate);
    } catch {
      setDedupResult(null);
    }
  }, []);

  const handlePhoneChange = (v: string) => {
    setPhone(v);
    setForceCreate(false);
    setDedupResult(null);
    if (dedupTimerRef.current) clearTimeout(dedupTimerRef.current);
    dedupTimerRef.current = setTimeout(() => void runDedup(v), 500);
  };

  const canSubmit = fullName.trim().length >= 2 && (forceCreate || dedupResult === null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await createLead({
        fullName: fullName.trim(),
        phone: phone.trim() || null,
        interestCourse: interestCourse.trim() || null,
        source: "manual",
        notes: notes.trim() || null,
      });
      onSaved();
    } catch {
      onError("Nu pot salva lead-ul");
    } finally {
      setSubmitting(false);
    }
  };

  // Prevent background scroll on iOS
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Bottom sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Adaugă lead rapid"
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl border-t border-border bg-card shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        {/* Handle + header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border sticky top-0 bg-card z-10">
          <div className="mx-auto w-10 h-1 rounded-full bg-muted-foreground/30 absolute top-2 left-1/2 -translate-x-1/2" aria-hidden="true" />
          <h2 className="text-base font-bold mt-2">Adaugă lead rapid</h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-muted mt-1"
            aria-label="Închide"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Dedup banner */}
          {dedupResult && !forceCreate && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
              <div className="flex-1">
                <p className="font-semibold">Există deja: {dedupResult.fullName}</p>
                <div className="flex gap-3 mt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="text-xs font-semibold text-primary underline min-h-[44px] px-2"
                  >
                    Deschide
                  </button>
                  <button
                    type="button"
                    onClick={() => setForceCreate(true)}
                    className="text-xs text-muted-foreground hover:text-foreground min-h-[44px] px-2"
                  >
                    Creează oricum
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Required fields: name + phone */}
          <div>
            <label htmlFor="qa-name" className="block text-sm font-semibold mb-1.5">
              Nume complet <span className="text-destructive">*</span>
            </label>
            <input
              id="qa-name"
              type="text"
              required
              minLength={2}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="ex: Maria Popescu"
              className="w-full rounded-xl border border-input bg-background px-4 py-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              autoFocus
              aria-required="true"
            />
          </div>

          <div>
            <label htmlFor="qa-phone" className="block text-sm font-semibold mb-1.5">
              Telefon
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <input
                id="qa-phone"
                type="tel"
                value={phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                placeholder="+40 7XX XXX XXX"
                className="w-full rounded-xl border border-input bg-background pl-9 pr-4 py-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                inputMode="tel"
              />
            </div>
          </div>

          {/* More fields toggle */}
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground min-h-[44px]"
          >
            {showMore ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {showMore ? "Mai puțin" : "Mai multe câmpuri (curs, note)"}
          </button>

          {showMore && (
            <div className="space-y-3">
              <div>
                <label htmlFor="qa-course" className="block text-sm font-semibold mb-1.5">
                  Curs de interes
                </label>
                <input
                  id="qa-course"
                  type="text"
                  value={interestCourse}
                  onChange={(e) => setInterestCourse(e.target.value)}
                  placeholder="ex: Engleză B2"
                  className="w-full rounded-xl border border-input bg-background px-4 py-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div>
                <label htmlFor="qa-notes" className="block text-sm font-semibold mb-1.5">
                  Note
                </label>
                <textarea
                  id="qa-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Observații rapide..."
                  className="w-full rounded-xl border border-input bg-background px-4 py-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                />
              </div>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className={cn(
              "w-full rounded-xl px-6 py-4 text-base font-bold text-primary-foreground transition-colors",
              "min-h-[52px] bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {submitting ? (
              <Loader2 className="h-5 w-5 animate-spin mx-auto" />
            ) : (
              "Salvează lead"
            )}
          </button>
        </form>
      </div>
    </>
  );
}

// ─── Quick call log bottom sheet ──────────────────────────────────────────────

interface QuickCallLogSheetProps {
  leadId: string;
  leadName: string;
  onClose: () => void;
  onLogged: () => void;
  onError: (msg: string) => void;
}

export function QuickCallLogSheet({ leadId, leadName, onClose, onLogged, onError }: QuickCallLogSheetProps) {
  const [outcome, setOutcome] = useState<CallOutcome | "">("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!outcome || submitting) return;
    setSubmitting(true);
    try {
      const { logCall } = await import("@/lib/api/leads");
      await logCall(leadId, { outcome, note: note.trim() || null });
      onLogged();
    } catch {
      onError("Nu pot loga apelul");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Loghează apel pentru ${leadName}`}
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl border-t border-border bg-card shadow-2xl max-h-[80vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border sticky top-0 bg-card z-10">
          <div className="mx-auto w-10 h-1 rounded-full bg-muted-foreground/30 absolute top-2 left-1/2 -translate-x-1/2" aria-hidden="true" />
          <h2 className="text-base font-bold mt-2">Loghează apel: {leadName}</h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-muted mt-1"
            aria-label="Închide"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <p className="text-sm font-semibold mb-2">Rezultat apel</p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Rezultat apel">
              {OUTCOMES.map((o) => (
                <label
                  key={o.value}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-xl border p-3 cursor-pointer text-sm font-semibold transition-colors min-h-[52px]",
                    outcome === o.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted/40"
                  )}
                >
                  <input
                    type="radio"
                    name="call_outcome"
                    value={o.value}
                    checked={outcome === o.value}
                    onChange={() => setOutcome(o.value)}
                    className="sr-only"
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="cl-note" className="block text-sm font-semibold mb-1.5">
              Notă (opțional)
            </label>
            <textarea
              id="cl-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ex: Vrea să afle mai mult despre cursul de Engleză B2..."
              className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
          </div>
          <button
            type="submit"
            disabled={!outcome || submitting}
            className="w-full rounded-xl px-6 py-4 text-base font-bold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 min-h-[52px]"
          >
            {submitting ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : "Salvează apel"}
          </button>
        </form>
      </div>
    </>
  );
}
