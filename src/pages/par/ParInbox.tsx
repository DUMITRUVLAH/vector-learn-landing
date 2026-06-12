/**
 * PAR-108 — /app/par/inbox
 *
 * Approver inbox: lista de PAR-uri unde userul curent e aprobatorul pasului activ.
 * Acțiuni: Aprobă / Respinge / Solicită modificări (modal cu comentariu + semnătură).
 *
 * CORE: backlog/par/PAR-CORE.md §1, §6
 * Design system: Vector 365 tokens only, light + dark, WCAG AA
 */
import { useState, useEffect, useCallback } from "react";
import { CheckCircle, XCircle, MessageSquare, Loader2, Inbox, AlertCircle, RefreshCcw } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { ParStatusChip } from "@/components/par/ParStatusChip";
import { useRouter } from "@/router/HashRouter";
import {
  getParInbox,
  approvePar,
  rejectPar,
  requestParChanges,
  formatMDL,
  type ParInboxItem,
} from "@/lib/api/par";
import { cn } from "@/lib/utils";

// ─── Decision modal ───────────────────────────────────────────────────────────

type DecisionType = "approve" | "reject" | "request_changes";

interface DecisionModalProps {
  par: ParInboxItem;
  type: DecisionType;
  onClose: () => void;
  onSuccess: () => void;
}

const DECISION_CONFIG: Record<
  DecisionType,
  {
    title: string;
    label: string;
    commentRequired: boolean;
    commentLabel: string;
    showSignature: boolean;
    buttonClass: string;
    icon: React.ReactNode;
  }
> = {
  approve: {
    title: "Aprobă cererea",
    label: "Aprobă",
    commentRequired: false,
    commentLabel: "Comentariu opțional",
    showSignature: true,
    buttonClass: "bg-green-600 hover:bg-green-700 text-white",
    icon: <CheckCircle className="h-4 w-4" aria-hidden="true" />,
  },
  reject: {
    title: "Respinge cererea",
    label: "Respinge",
    commentRequired: true,
    commentLabel: "Motiv (obligatoriu)",
    showSignature: true,
    buttonClass: "bg-destructive hover:bg-destructive/90 text-destructive-foreground",
    icon: <XCircle className="h-4 w-4" aria-hidden="true" />,
  },
  request_changes: {
    title: "Solicită modificări",
    label: "Trimite înapoi",
    commentRequired: true,
    commentLabel: "Ce trebuie modificat (obligatoriu)",
    showSignature: false,
    buttonClass: "bg-orange-500 hover:bg-orange-600 text-white",
    icon: <MessageSquare className="h-4 w-4" aria-hidden="true" />,
  },
};

function DecisionModal({ par, type, onClose, onSuccess }: DecisionModalProps) {
  const config = DECISION_CONFIG[type];
  const [comment, setComment] = useState("");
  const [signatureName, setSignatureName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (config.commentRequired && !comment.trim()) {
      setError("Comentariul este obligatoriu.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (type === "approve") {
        await approvePar(par.id, {
          comment: comment || null,
          signatureName: signatureName || null,
        });
      } else if (type === "reject") {
        await rejectPar(par.id, {
          comment: comment.trim(),
          signatureName: signatureName || null,
        });
      } else {
        await requestParChanges(par.id, { comment: comment.trim() });
      }
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Eroare necunoscută";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-background border border-border rounded-lg w-full max-w-md shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 id="modal-title" className="font-semibold text-foreground">
            {config.title}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground rounded p-1 touch-target"
            aria-label="Închide"
          >
            <XCircle className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* PAR summary */}
        <div className="p-4 bg-muted/40 border-b border-border text-sm">
          <div className="font-medium text-foreground">{par.requestNo}</div>
          <div className="text-muted-foreground mt-1">
            {formatMDL(par.totalEstimatedCents)} · {par.my_step_label ?? "Aprobare"}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Comment */}
          <div>
            <label
              htmlFor="decision-comment"
              className="block text-sm font-medium text-foreground mb-1"
            >
              {config.commentLabel}
              {config.commentRequired && (
                <span className="text-destructive ml-1" aria-hidden="true">*</span>
              )}
            </label>
            <textarea
              id="decision-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              required={config.commentRequired}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm
                         placeholder:text-muted-foreground focus:outline-none focus:ring-2
                         focus:ring-ring resize-none"
              placeholder={
                type === "approve"
                  ? "Adaugă un comentariu opțional…"
                  : "Descrie ce trebuie modificat sau de ce respingi…"
              }
            />
          </div>

          {/* Signature name (approve + reject) */}
          {config.showSignature && (
            <div>
              <label
                htmlFor="signature-name"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Numele dvs. (apare pe formular)
              </label>
              <input
                id="signature-name"
                type="text"
                value={signatureName}
                onChange={(e) => setSignatureName(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm
                           placeholder:text-muted-foreground focus:outline-none focus:ring-2
                           focus:ring-ring"
                placeholder="Prenume Nume"
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm rounded-md border border-input bg-background
                         hover:bg-muted text-foreground touch-target"
            >
              Anulează
            </button>
            <button
              type="submit"
              disabled={submitting || (config.commentRequired && !comment.trim())}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-sm rounded-md font-medium touch-target",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                config.buttonClass
              )}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                config.icon
              )}
              {config.label}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Inbox card ───────────────────────────────────────────────────────────────

interface InboxCardProps {
  item: ParInboxItem;
  onAction: (par: ParInboxItem, type: DecisionType) => void;
}

function InboxCard({ item, onAction }: InboxCardProps) {
  const { navigate } = useRouter();
  const submittedDate = item.submittedAt
    ? new Date(item.submittedAt).toLocaleDateString("ro-MD", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

  return (
    <article className="bg-card border border-border rounded-lg p-4 space-y-3 hover:border-primary/30 transition-colors">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <button
            onClick={() => navigate(`/app/par/${item.id}`)}
            className="font-semibold text-foreground hover:text-primary text-sm focus:outline-none focus:underline"
          >
            {item.requestNo}
          </button>
          <div className="text-xs text-muted-foreground mt-0.5">
            Depus: {submittedDate}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {item.above_micro_threshold && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 font-medium">
              Sum mare
            </span>
          )}
          <ParStatusChip status={item.status} />
        </div>
      </div>

      {/* Amount + step */}
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{formatMDL(item.totalEstimatedCents)}</span>
        <span className="text-muted-foreground text-xs">
          Pasul meu: <span className="font-medium text-foreground">{item.my_step_label ?? "—"}</span>
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 pt-1" role="group" aria-label={`Acțiuni pentru ${item.requestNo}`}>
        <button
          onClick={() => onAction(item, "approve")}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md
                     bg-green-600 hover:bg-green-700 text-white font-medium touch-target"
          aria-label={`Aprobă ${item.requestNo}`}
        >
          <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
          Aprobă
        </button>
        <button
          onClick={() => onAction(item, "request_changes")}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md
                     bg-orange-500 hover:bg-orange-600 text-white font-medium touch-target"
          aria-label={`Solicită modificări la ${item.requestNo}`}
        >
          <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
          Modificări
        </button>
        <button
          onClick={() => onAction(item, "reject")}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md
                     border border-destructive text-destructive hover:bg-destructive/10
                     font-medium touch-target"
          aria-label={`Respinge ${item.requestNo}`}
        >
          <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
          Respinge
        </button>
      </div>
    </article>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ParInbox() {
  const { navigate } = useRouter();
  const [items, setItems] = useState<ParInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Decision modal state
  const [modalTarget, setModalTarget] = useState<{
    par: ParInboxItem;
    type: DecisionType;
  } | null>(null);

  const loadInbox = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getParInbox();
      setItems(data.inbox);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Eroare la încărcarea inboxului");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  const handleAction = (par: ParInboxItem, type: DecisionType) => {
    setModalTarget({ par, type });
  };

  const handleSuccess = async () => {
    setModalTarget(null);
    await loadInbox();
  };

  return (
    <AppShell pageTitle="Inbox aprobatori">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Inbox aprobatori</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Cereri PAR care așteaptă decizia dvs.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadInbox}
              disabled={loading}
              className="p-2 rounded-md border border-input hover:bg-muted text-muted-foreground touch-target"
              aria-label="Reîncarcă inbox"
            >
              <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden="true" />
            </button>
            <button
              onClick={() => navigate("/app/par")}
              className="px-3 py-2 text-sm rounded-md border border-input hover:bg-muted text-foreground touch-target"
            >
              Toate cererile
            </button>
          </div>
        </div>

        {/* Content */}
        {loading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" aria-hidden="true" />
            <span>Se încarcă…</span>
          </div>
        )}

        {!loading && error && (
          <div
            className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 text-destructive text-sm"
            role="alert"
          >
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <div>
              <p className="font-medium">Eroare la încărcare</p>
              <p>{error}</p>
            </div>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <Inbox className="h-12 w-12 opacity-40" aria-hidden="true" />
            <p className="text-sm">Nicio cerere în așteptare.</p>
            <p className="text-xs">Vei vedea cererile PAR care necesită decizia ta.</p>
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <>
            <p className="text-sm text-muted-foreground">
              {items.length} {items.length === 1 ? "cerere" : "cereri"} în așteptare
            </p>
            <div className="space-y-3">
              {items.map((item) => (
                <InboxCard key={item.id} item={item} onAction={handleAction} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Decision modal */}
      {modalTarget && (
        <DecisionModal
          par={modalTarget.par}
          type={modalTarget.type}
          onClose={() => setModalTarget(null)}
          onSuccess={handleSuccess}
        />
      )}
    </AppShell>
  );
}
