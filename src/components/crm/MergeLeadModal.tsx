/**
 * CRM-133 — MergeLeadModal
 * Dialog for merging two leads.
 * User selects which lead to keep; the other is archived (stage=lost, lostReason="merged").
 * Interactions + tasks from the archived lead are copied to the kept one.
 */
import { useState } from "react";
import { Loader2, X, GitMerge, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { mergeLead, type Lead } from "@/lib/api/leads";

interface MergeLeadModalProps {
  currentLead: Lead;
  duplicateLead: Lead;
  onSuccess: (keptLead: Lead) => void;
  onCancel: () => void;
}

type KeepChoice = "current" | "duplicate";

export function MergeLeadModal({
  currentLead,
  duplicateLead,
  onSuccess,
  onCancel,
}: MergeLeadModalProps) {
  const [keepChoice, setKeepChoice] = useState<KeepChoice>("current");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const keptLead = keepChoice === "current" ? currentLead : duplicateLead;
  const archivedLead = keepChoice === "current" ? duplicateLead : currentLead;

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await mergeLead(currentLead.id, {
        mergeWithId: duplicateLead.id,
        keepId: keptLead.id,
      });
      onSuccess(result.keptLead);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la fuzionare");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Fuzionare leaduri"
    >
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2">
            <GitMerge className="h-4 w-4 text-primary" aria-hidden="true" />
            <h2 className="text-base font-bold">Fuzionare leaduri</h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md p-1 hover:bg-muted"
            aria-label="Închide"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            Selectează care lead să fie păstrat. Istoricul (note, apeluri, task-uri) din ambele
            leaduri va fi transferat la cel păstrat. Cel arhivat va fi marcat ca „Pierdut – Fuzionat".
          </p>

          {/* Selection */}
          <div className="space-y-2" role="radiogroup" aria-label="Selectează lead-ul de păstrat">
            {(["current", "duplicate"] as KeepChoice[]).map((choice) => {
              const lead = choice === "current" ? currentLead : duplicateLead;
              const isSelected = keepChoice === choice;
              return (
                <label
                  key={choice}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/40"
                  )}
                >
                  <input
                    type="radio"
                    name="keep_choice"
                    value={choice}
                    checked={isSelected}
                    onChange={() => setKeepChoice(choice)}
                    className="mt-0.5 h-4 w-4"
                    aria-label={choice === "current" ? "Păstrează lead-ul curent" : "Păstrează lead-ul duplicat"}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{lead.fullName}</p>
                    {lead.phone && (
                      <p className="text-xs text-muted-foreground">{lead.phone}</p>
                    )}
                    {lead.email && (
                      <p className="text-xs text-muted-foreground">{lead.email}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Stadiu: <span className="font-medium">{lead.stage}</span>
                      {lead.createdAt && (
                        <> · Creat: {new Date(lead.createdAt).toLocaleDateString("ro-RO")}</>
                      )}
                    </p>
                    {choice === "current" && (
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary mt-1">
                        curent
                      </span>
                    )}
                  </div>
                </label>
              );
            })}
          </div>

          {/* Summary */}
          <div className="rounded-lg bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground flex items-center gap-2">
            <span className="font-semibold text-foreground truncate max-w-[120px]">{archivedLead.fullName}</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="font-semibold text-foreground truncate max-w-[120px]">{keptLead.fullName}</span>
            <span className="ml-auto shrink-0">(istoricul se transferă)</span>
          </div>

          {error && (
            <p role="alert" className="text-xs text-destructive">{error}</p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
            >
              Anulează
            </button>
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <GitMerge className="h-4 w-4" />
              )}
              Confirmă fuzionarea
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
