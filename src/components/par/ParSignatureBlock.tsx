/**
 * PAR-118: ParSignatureBlock — renders a single signer's block (sections 14–15)
 * Shows: role label + decision badge + name + title + date + comment (if any).
 *
 * Design: Vector 365, light+dark, WCAG AA.
 */
import { CheckCircle2, XCircle, AlertCircle, Clock, User } from "lucide-react";
import type { ParApproval } from "@/lib/api/par";

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ro-MD", { day: "2-digit", month: "short", year: "numeric" });
}

function DecisionBadge({ decision }: { decision: ParApproval["decision"] }) {
  if (decision === "approved")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
        Aprobat
      </span>
    );
  if (decision === "rejected")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
        <XCircle className="h-3.5 w-3.5" aria-hidden />
        Respins
      </span>
    );
  if (decision === "changes_requested")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
        <AlertCircle className="h-3.5 w-3.5" aria-hidden />
        Modificări cerute
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
      <Clock className="h-3.5 w-3.5" aria-hidden />
      În așteptare
    </span>
  );
}

interface Props {
  approval: ParApproval;
  sectionLabel?: string; // e.g. "14. Solicitant" or "15. Aprobator"
  isLocked?: boolean;
}

export function ParSignatureBlock({ approval, sectionLabel, isLocked }: Props) {
  return (
    <div
      className={[
        "flex items-start gap-3 p-3 rounded-md border border-border",
        isLocked ? "bg-muted/10 opacity-60" : "bg-muted/30",
      ].join(" ")}
      aria-label={sectionLabel ?? `Pas ${approval.step}`}
    >
      <User className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" aria-hidden />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {sectionLabel && (
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {sectionLabel}
            </span>
          )}
          <DecisionBadge decision={approval.decision} />
          {isLocked && (
            <span className="text-xs text-muted-foreground">(blocat)</span>
          )}
        </div>
        {/* Numele și funcția, nu ce s-a nimerit în caseta de semnătură.
            `signature_name` e o singură casetă completată de om, iar la trimitere primea (până pe
            2026-09-10) funcția solicitantului — de unde „Jurist / Jurist" în locul unei persoane.
            Contul știe cine e omul; instantaneul cererii / profilul PAR știu ce funcție avea.
            Niciodată `approverUserId` ca rezervă: acolo apărea un UUID brut.
            Pasul 0 nu e semnat de nimeni manual (îl scrie trimiterea), deci numele din cont are
            întâietate; pe pașii de aprobare, semnătura tastată e cea care contează — poate fi
            altcineva decât titularul rândului, prin delegare. */}
        {(() => {
          const resolved = approval.approverName ?? null;
          const signed =
            approval.step === 0 ? resolved ?? approval.signatureName : approval.signatureName ?? resolved;
          const title = approval.signatureTitle ?? approval.approverTitle ?? null;
          return (
            <>
              <p className="mt-0.5 text-sm font-medium text-foreground">
                {signed ?? (approval.decision === "pending" ? "În așteptarea semnăturii" : "—")}
              </p>
              {title && title !== signed && (
                <p className="text-xs text-muted-foreground">{title}</p>
              )}
            </>
          );
        })()}
        {approval.decidedAt && (
          <p className="text-xs text-muted-foreground">{fmtDate(approval.decidedAt)}</p>
        )}
        {approval.comment && (
          <p className="text-sm text-foreground mt-1 pl-2 border-l-2 border-warning/60 italic">
            {approval.comment}
          </p>
        )}
      </div>
    </div>
  );
}
