/**
 * AI-A03 — Reply Draft Modal
 *
 * Human-in-the-loop: AI suggests a WhatsApp reply draft.
 * Staff member reviews, edits, then approves (sends) or dismisses.
 * AI draft is NEVER sent automatically.
 */
import { useState } from "react";
import { Sparkles, Check, X, Loader2, AlertTriangle } from "lucide-react";

interface ReplyDraftModalProps {
  leadId?: string;
  messageText: string;
  conversationHistory?: string[];
  onSend?: (draft: string) => void;
  onClose: () => void;
}

interface DraftResponse {
  draft: string;
  auditId: string;
  isStub: boolean;
}

export function ReplyDraftModal({
  leadId,
  messageText,
  conversationHistory,
  onSend,
  onClose,
}: ReplyDraftModalProps) {
  const [draft, setDraft] = useState("");
  const [auditId, setAuditId] = useState("");
  const [loading, setLoading] = useState(false);
  const [isStub, setIsStub] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);

    try {
      const resp = await fetch("/api/ai/reply-suggestion", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          leadId,
          messageText,
          conversationHistory,
        }),
      });

      if (!resp.ok) {
        const body = (await resp.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${resp.status}`);
      }

      const data = (await resp.json()) as DraftResponse;
      setDraft(data.draft);
      setAuditId(data.auditId);
      setIsStub(data.isStub);
      setGenerated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la generare");
    } finally {
      setGenerating(false);
    }
  };

  const handleSend = () => {
    if (onSend) onSend(draft);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sugestie răspuns AI"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl space-y-4 p-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            <h2 className="text-sm font-semibold">Sugestie răspuns AI</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 hover:bg-muted transition-colors"
            aria-label="Închide"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Original message */}
        <div className="rounded-md bg-muted p-3">
          <p className="text-xs font-medium text-muted-foreground mb-1">Mesajul primit:</p>
          <p className="text-sm">{messageText}</p>
        </div>

        {/* AI warning */}
        <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-900/20 p-3 border border-amber-200 dark:border-amber-800">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-xs text-amber-800 dark:text-amber-300">
            <strong>AI draft — verifică înainte de trimitere.</strong>{" "}
            Sugestia AI poate conține inexactități. Editează înainte de a trimite.
          </p>
        </div>

        {/* Generate button */}
        {!generated && (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            )}
            {generating ? "Se generează..." : "Generează sugestie"}
          </button>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">{error}</p>
        )}

        {/* Draft textarea */}
        {generated && (
          <>
            {isStub && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                AI nu este configurat — răspuns demonstrativ. Configurați AI_API_KEY pentru răspunsuri reale.
              </p>
            )}
            <div className="space-y-1">
              <label htmlFor="reply-draft" className="text-xs font-medium text-muted-foreground">
                Draft răspuns (editabil)
              </label>
              <textarea
                id="reply-draft"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                aria-label="Draft răspuns AI"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
                aria-label="Anulează fără trimitere"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                Anulează
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={!draft.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                aria-label="Trimite răspunsul aprobat"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                Trimite
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
