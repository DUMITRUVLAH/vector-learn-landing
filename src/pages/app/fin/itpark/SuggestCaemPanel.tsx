/**
 * ITPARK-701: SuggestCaemPanel + ExtractInvoicePanel
 *
 * Two AI-powered panels for the ITPARK revenue lines workflow:
 *
 * 1. SuggestCaemPanel — given a service description, suggests the correct CAEM code.
 *    Surfaced in the RevenueLinesTable row edit form as a small "Sugestie AI" button.
 *    User clicks → sees suggestion with score/reason → can Apply or dismiss.
 *
 * 2. ExtractInvoicePanel — user pastes/types raw invoice text → AI proposes all line
 *    fields (client, amount, date, CAEM, description) → user confirms → line is added.
 *
 * AI constraints (ITPARK-CORE.md §6.1):
 *   - AI NEVER modifies amounts or eligibility thresholds directly
 *   - All suggestions are proposals: user must explicitly confirm
 *   - Graceful degrade: when AI off (isStub=true), shows message + allows manual entry
 *   - PII: client names are pseudonymized server-side before prompt
 */

import { useState, useCallback } from "react";
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  FileText,
} from "lucide-react";
import { suggestCaem, extractInvoice } from "@/lib/api/itparkAi";
import type { CaemSuggestion, InvoiceExtractionProposal } from "@/lib/api/itparkAi";
import { cn } from "@/lib/utils";

// ─── SuggestCaemPanel ─────────────────────────────────────────────────────────

interface SuggestCaemPanelProps {
  engagementId: string;
  description: string;
  currentCaem?: string;
  onApply: (code: string) => void;
}

/**
 * Small inline panel: "Sugestie AI" button → shows code/score/reason → Apply button.
 * Does NOT write to DB — calls onApply(code) which the parent uses to update the form.
 */
export function SuggestCaemPanel({
  engagementId,
  description,
  currentCaem,
  onApply,
}: SuggestCaemPanelProps) {
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<CaemSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const getSuggestion = useCallback(async () => {
    if (!description || description.length < 3) {
      setError("Introduceți minim 3 caractere în câmpul Descriere.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await suggestCaem({ description, currentCaem, engagementId });
      setSuggestion(result);
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare AI");
    } finally {
      setLoading(false);
    }
  }, [description, currentCaem, engagementId]);

  const scoreColor =
    !suggestion ? "" :
    suggestion.score >= 80 ? "text-green-700 dark:text-green-400" :
    suggestion.score >= 60 ? "text-yellow-700 dark:text-yellow-400" :
    "text-muted-foreground";

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={getSuggestion}
        disabled={loading}
        aria-busy={loading}
        aria-label="Obțineți sugestie AI pentru codul CAEM"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
          "border border-border bg-background hover:bg-muted",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "min-h-[32px]" // touch target ≥ 32px (icon-only row context; full 44px in dialog)
        )}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        )}
        Sugestie AI
      </button>

      {error && (
        <p className="mt-1 text-xs text-destructive" role="alert">{error}</p>
      )}

      {suggestion && open && (
        <div
          className={cn(
            "mt-2 rounded-lg border p-3 space-y-2",
            suggestion.isStub
              ? "border-border bg-muted/30"
              : "border-primary/20 bg-primary/5"
          )}
          role="region"
          aria-label="Sugestie AI pentru cod CAEM"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
              <span className="text-sm font-medium text-foreground">
                Cod CAEM sugerat:{" "}
                <span className="font-mono font-bold">{suggestion.code}</span>
              </span>
              <span className={cn("text-xs font-medium", scoreColor)}>
                ({suggestion.score}%)
              </span>
              {suggestion.isStub && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  {suggestion.source === "stub" ? "AI off" : "determinist"}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Închide sugestia AI"
              className="text-muted-foreground hover:text-foreground transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded"
            >
              <XCircle className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <p className="text-xs text-muted-foreground">{suggestion.reason}</p>

          {suggestion.score < 60 && !suggestion.isStub && (
            <p className="text-xs text-yellow-700 dark:text-yellow-400">
              Scor scăzut — verificați codul CAEM manual.
            </p>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onApply(suggestion.code);
                setOpen(false);
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors min-h-[32px]",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              )}
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              Aplică {suggestion.code}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors min-h-[32px]",
                "border border-border bg-background hover:bg-muted",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              )}
            >
              Respinge
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ExtractInvoicePanel ──────────────────────────────────────────────────────

interface ExtractInvoicePanelProps {
  engagementId: string;
  onConfirm: (proposal: InvoiceExtractionProposal) => void;
}

/**
 * Collapsible panel: "Extrage din factură (AI)".
 * User pastes invoice text → AI proposes all line fields → user reviews → Confirm.
 * Confirm calls onConfirm(proposal) — parent wires it to the Add Line form.
 * AI NEVER creates the line directly.
 */
export function ExtractInvoicePanel({ engagementId, onConfirm }: ExtractInvoicePanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [invoiceText, setInvoiceText] = useState("");
  const [loading, setLoading] = useState(false);
  const [proposal, setProposal] = useState<InvoiceExtractionProposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stubMessage, setStubMessage] = useState<string | null>(null);

  const handleExtract = useCallback(async () => {
    if (invoiceText.trim().length < 10) {
      setError("Introduceți cel puțin 10 caractere din textul facturii.");
      return;
    }
    setLoading(true);
    setError(null);
    setStubMessage(null);
    try {
      const result = await extractInvoice({ invoiceText, engagementId });
      setProposal(result.proposal);
      if (result.isStub && result.message) {
        setStubMessage(result.message);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare AI");
    } finally {
      setLoading(false);
    }
  }, [invoiceText, engagementId]);

  function handleConfirm() {
    if (proposal) {
      onConfirm(proposal);
      setProposal(null);
      setInvoiceText("");
      setExpanded(false);
    }
  }

  function handleReset() {
    setProposal(null);
    setError(null);
    setStubMessage(null);
  }

  const fmtMDL = (cents: number) =>
    (cents / 100).toLocaleString("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="rounded-lg border border-border bg-muted/20 overflow-hidden">
      {/* Header toggle */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-controls="extract-invoice-panel-body"
        className={cn(
          "w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm font-medium text-foreground",
          "hover:bg-muted/50 transition-colors",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
          "min-h-[44px]"
        )}
      >
        <span className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
          Extrage din factură (AI)
        </span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        )}
      </button>

      {/* Expandable body */}
      {expanded && (
        <div id="extract-invoice-panel-body" className="px-4 pb-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Lipiți textul copiat din factură (sau scrieți informațiile cheie). AI propune câmpurile — confirmați înainte de salvare.
          </p>

          {!proposal && (
            <>
              <textarea
                id="invoice-text-input"
                value={invoiceText}
                onChange={(e) => setInvoiceText(e.target.value)}
                placeholder="Exemplu: Factura nr. EBC000276766 din 27.10.2025. Client: TechCorp SRL. Servicii software personalizate. Total: 97.850,00 MDL. ..."
                rows={4}
                className={cn(
                  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm",
                  "placeholder:text-muted-foreground resize-none",
                  "focus:outline-none focus:ring-2 focus:ring-primary",
                  "dark:bg-background dark:text-foreground"
                )}
                aria-label="Text factură pentru extragere AI"
              />

              {error && <p className="text-xs text-destructive" role="alert">{error}</p>}

              <button
                type="button"
                onClick={handleExtract}
                disabled={loading || invoiceText.trim().length < 10}
                aria-busy={loading}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors min-h-[44px]",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
                  loading || invoiceText.trim().length < 10
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                )}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                )}
                Extrage câmpurile
              </button>
            </>
          )}

          {/* Proposal preview */}
          {proposal && (
            <div
              className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2"
              role="region"
              aria-label="Propunere extrasă de AI"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                <p className="text-sm font-medium text-foreground">Propunere AI — verificați înainte de confirmare</p>
              </div>

              {stubMessage && (
                <p className="text-xs text-muted-foreground">{stubMessage}</p>
              )}

              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Client</dt>
                <dd className="font-medium text-foreground truncate">{proposal.clientName || "—"}</dd>

                <dt className="text-muted-foreground">Sumă MDL</dt>
                <dd className="font-medium text-foreground font-mono">
                  {proposal.amountCents > 0 ? fmtMDL(proposal.amountCents) : "—"}
                </dd>

                <dt className="text-muted-foreground">Data</dt>
                <dd className="font-medium text-foreground">{proposal.invoiceDate || "—"}</dd>

                <dt className="text-muted-foreground">Cod CAEM</dt>
                <dd className="font-medium text-foreground font-mono">{proposal.caemCode || "—"}</dd>

                <dt className="text-muted-foreground">Descriere serviciu</dt>
                <dd className="font-medium text-foreground truncate">{proposal.serviceDescription || "—"}</dd>

                <dt className="text-muted-foreground">Referință document</dt>
                <dd className="font-medium text-foreground truncate">{proposal.documentRefs || "—"}</dd>
              </dl>

              <p className="text-xs text-muted-foreground italic">
                Sumele și eligibilitatea sunt calculate deterministic la confirmarea liniei — AI nu le modifică.
              </p>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleConfirm}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium min-h-[32px]",
                    "bg-primary text-primary-foreground hover:bg-primary/90 transition-colors",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  )}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Confirm — adaugă linia
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium min-h-[32px]",
                    "border border-border bg-background hover:bg-muted transition-colors",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  )}
                >
                  Resetează
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
